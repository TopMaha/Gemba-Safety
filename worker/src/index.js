/**
 * Gemba Walk — Cloudflare Worker API
 *
 * ใช้ Hono เป็น router เพราะมี ~30 เส้นทางพร้อม path param, preflight และ middleware
 * ถ้าเขียน routing เองจะกลายเป็น regex ยาวเหยียดที่พังง่ายเวลาเพิ่มเส้นทาง
 * Hono กินพื้นที่ราว 14 kB ไม่มี dependency ต่อ และเป็นตัวมาตรฐานของ Workers
 *
 * กติกาที่ยึดทั้งไฟล์
 *   - ตอบ JSON รูปแบบเดียวเสมอ  { ok: true, data } / { ok: false, error }
 *   - ใช้ prepared statement + bind() ทุกที่ ห้ามต่อสตริงค่าลง SQL เด็ดขาด
 *   - ตรวจ input ให้ครบก่อนแตะฐานข้อมูล ผิดตรงไหนบอกชื่อฟิลด์นั้น
 *   - การเขียนที่แตะหลายตารางใช้ batch() เพื่อให้สำเร็จหรือล้มเหลวพร้อมกัน
 *   - ตัวเลขสรุปทุกตัวคำนวณที่นี่ ไม่รับจาก client
 */

import { Hono } from 'hono';

import {
  BadInput, bool, fail, hhmm, int, isoDate, normalizeCode, normalizedSql, nowStamp, ok,
  oneOf, qDate, qInt, readJson, str, strArray, todayBangkok, uid,
} from './lib/http.js';
import {
  FOCUS_SELECT, PLAN_SELECT, RECORD_SELECT,
  mapArea, mapChange, mapFocus, mapLogin, mapManager, mapPlan, mapRecord, mapSettings, mapTheme,
} from './lib/rows.js';
import { createAdminSession, readAdminSession, revokeAdminSession } from './lib/admin.js';
import { diffStmts, entryStmt } from './lib/audit.js';
import { buildCsv, buildSummary } from './lib/dashboard.js';
import { registerSafetyRoutes } from './lib/safety.js';

const app = new Hono();

/**
 * id ที่ client สร้างไว้ก่อน (โหมด offline) — ถ้าส่งมาให้ใช้ค่านั้น
 * เพื่อให้ id ในเครื่องกับบนเซิร์ฟเวอร์ตรงกัน เส้นทางอย่าง /walk/:planId จึงไม่พัง
 * และการส่งซ้ำจากคิวจะชนคีย์ซ้ำ ซึ่งเราถือว่า "ซิงก์ไปแล้ว" ไม่ใช่ข้อผิดพลาด
 */
function clientId(b, prefix) {
  if (b.id === undefined || b.id === null || b.id === '') return uid(prefix);
  if (typeof b.id !== 'string' || !/^[A-Za-z0-9_-]{1,60}$/.test(b.id)) {
    throw new BadInput('id', 'ต้องเป็นตัวอักษร ตัวเลข ขีดกลาง หรือขีดล่าง ไม่เกิน 60 ตัว');
  }
  return b.id;
}

/** สร้างซ้ำด้วย id เดิม = คิวส่งซ้ำ ให้ถือว่าสำเร็จและคืนของเดิมกลับไป */
function isDuplicate(e) {
  return String(e?.message ?? e).includes('UNIQUE');
}

/* ══════════════════════════════════════════════════════════════════════════
   CORS — อนุญาตเฉพาะ origin ที่ระบุใน env เท่านั้น
   ALLOWED_ORIGIN ใส่ได้หลายค่าโดยคั่นด้วยจุลภาค
   ══════════════════════════════════════════════════════════════════════════ */

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGIN ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

app.use('*', async (c, next) => {
  const origin = c.req.header('Origin');
  const list = allowedOrigins(c.env);
  const allow = origin && list.includes(origin);

  // ตอบ preflight ให้จบตรงนี้ ไม่ต้องวิ่งต่อไปที่ route
  if (c.req.method === 'OPTIONS') {
    if (!allow) return c.body(null, 403);
    return c.body(null, 204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-User-Code, X-Admin-Token',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    });
  }

  await next();

  if (allow) {
    c.res.headers.set('Access-Control-Allow-Origin', origin);
    c.res.headers.set('Vary', 'Origin');
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   Auth — โรงงานภายใน ใช้โทเคนร่วมเส้นเดียว ไม่ต้องถึงขั้น OAuth
   X-Auth-Token  เทียบกับ secret ใน env
   X-User-Code   บอกว่าใครเป็นคนทำ ใช้ผูกชื่อลง change_history
   ══════════════════════════════════════════════════════════════════════════ */

/** เทียบสตริงแบบใช้เวลาคงที่ กันการเดาโทเคนจากเวลาตอบกลับ */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/health') return next();

  const expected = c.env.AUTH_TOKEN;
  if (!expected) {
    return fail(c, 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า AUTH_TOKEN — รัน wrangler secret put AUTH_TOKEN ก่อน', 500);
  }
  if (!safeEqual(c.req.header('X-Auth-Token') ?? '', expected)) {
    return fail(c, 'ไม่ได้รับอนุญาต — โทเคนไม่ถูกต้องหรือไม่ได้ส่งมา', 401);
  }

  // ผูกผู้ใช้จากรหัสพนักงาน (ถ้าส่งมา) ไว้ใช้เป็นชื่อผู้แก้ไขในประวัติ
  // ต้องมีสิทธิ์เข้าใช้งานอยู่จริง ไม่งั้นรหัสที่ถูกถอนสิทธิ์ไปแล้วจะยังลงชื่อในประวัติได้
  const code = c.req.header('X-User-Code');
  if (code) {
    const m = await c.env.DB.prepare(
      `SELECT id, full_name FROM managers
        WHERE ${normalizedSql('manager_code')} = ? AND is_active = 1 AND can_login = 1`,
    )
      .bind(normalizeCode(code))
      .first();
    if (m) c.set('actor', { id: m.id, name: m.full_name });
  }
  return next();
});

/** ชื่อผู้ทำรายการ — รหัสพนักงานมาก่อน ถัดมาคือชื่อผู้ดูแลที่ถือเซสชันอยู่ */
const actorName = (c) => c.get('actor')?.name ?? c.get('admin')?.admin_name ?? 'ผู้ดูแลระบบ';

/* ══════════════════════════════════════════════════════════════════════════
   ด่านผู้ดูแลระบบ — งานที่แก้ "กติกาของระบบ" ต้องมีเซสชันแอดมินเท่านั้น

   ทะเบียนผู้ใช้ · พื้นที่ · หัวข้อ · ประกาศ · ตั้งค่าระบบ ล้วนเป็นของที่แก้แล้ว
   กระทบทุกคน โดยเฉพาะ can_login ที่เป็นตัวตัดสินว่าใครเข้าระบบได้
   ถ้าปล่อยให้ยิงได้ด้วยโทเคนรวมที่ฝังในไฟล์ JS การกำหนดสิทธิ์ก็ไม่มีความหมาย

   ส่วนแผนและบันทึกการเดินไม่อยู่ในด่านนี้ เพราะเป็นงานประจำวันของผู้ใช้ทั่วไป
   ══════════════════════════════════════════════════════════════════════════ */

async function adminGuard(c, next) {
  // อ่านอย่างเดียวไม่ต้องเป็นแอดมิน หน้าจอทั่วไปต้องใช้รายชื่อ/พื้นที่/หัวข้อด้วย
  if (c.req.method === 'GET') return next();

  const s = await readAdminSession(c);
  if (!s) {
    return fail(c, 'ต้องเข้าสู่ระบบผู้ดูแลก่อน หรือเซสชันหมดอายุแล้ว กรุณาเข้าใหม่ที่หน้า /admin', 403);
  }
  c.set('admin', s);
  return next();
}

// ต้องประกาศก่อนตัว route ทั้งหมด Hono จึงจะเรียก middleware นี้ก่อนถึงตัวจัดการ
for (const path of [
  '/api/managers', '/api/managers/*',
  '/api/areas', '/api/areas/*',
  '/api/themes', '/api/themes/*',
  '/api/focus', '/api/focus/*',
  '/api/settings',
  // ── งานความปลอดภัย: แม่แบบเช็คลิสต์และทะเบียนสิทธิ์ ──
  // ใบแจ้งปัญหา (/api/findings) ไม่อยู่ในด่านนี้ เพราะเป็นงานประจำวันของผู้ใช้ทั่วไป
  '/api/checklist', '/api/checklist/*',
  '/api/roles', '/api/roles/*',
  '/api/user-roles', '/api/user-roles/*',
]) {
  app.use(path, adminGuard);
}

/* ══════════════════════════════════════════════════════════════════════════
   ตัวจับข้อผิดพลาดกลาง
   ══════════════════════════════════════════════════════════════════════════ */

app.onError((err, c) => {
  if (err instanceof BadInput) return fail(c, err.message, 400);

  // แปลข้อความจากฐานข้อมูลให้เป็นภาษาที่ผู้ใช้เข้าใจ
  const msg = String(err?.message ?? err);
  if (msg.includes('FOREIGN KEY')) {
    return fail(c, 'อ้างถึงข้อมูลที่ไม่มีอยู่จริง หรือมีข้อมูลอื่นผูกอยู่จนลบไม่ได้', 409);
  }
  if (msg.includes('UNIQUE')) return fail(c, 'มีข้อมูลนี้อยู่แล้ว (รหัสซ้ำ)', 409);
  if (msg.includes('CHECK constraint')) return fail(c, 'ค่าที่ส่งมาไม่อยู่ในชุดที่ระบบอนุญาต', 400);

  console.error('unhandled', msg);
  return fail(c, 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์', 500);
});

app.notFound((c) => fail(c, `ไม่พบเส้นทาง ${c.req.method} ${c.req.path}`, 404));

/* ══════════════════════════════════════════════════════════════════════════
   สุขภาพระบบ (ไม่ต้องใช้โทเคน)
   ══════════════════════════════════════════════════════════════════════════ */

app.get('/api/health', async (c) => {
  let db = 'ok';
  try {
    await c.env.DB.prepare('SELECT 1').first();
  } catch {
    db = 'error';
  }
  return ok(c, { status: 'ok', db, time: nowStamp(), today_bangkok: todayBangkok() });
});

/* ══════════════════════════════════════════════════════════════════════════
   เข้าสู่ระบบ
   ══════════════════════════════════════════════════════════════════════════ */

app.post('/api/auth/login', async (c) => {
  const body = await readJson(c);
  const code = str(body, 'code', { max: 40 });

  const m = await c.env.DB.prepare(`SELECT * FROM managers WHERE ${normalizedSql('manager_code')} = ?`)
    .bind(normalizeCode(code))
    .first();

  // เข้าได้ต้องครบสามอย่าง: มีรหัสนี้จริง · ยังเป็นพนักงานอยู่ · ได้รับสิทธิ์ใช้แอป
  const granted = Boolean(m) && m.is_active === 1 && m.can_login === 1;

  await c.env.DB.prepare(
    `INSERT INTO login_history (id, actor_id, actor_name, role, at, result) VALUES (?, ?, ?, 'manager', ?, ?)`,
  )
    .bind(uid('log'), m?.id ?? '-', m?.full_name ?? code, nowStamp(), granted ? 'success' : 'failed')
    .run();

  if (!m) return ok(c, { error: 'not_found' });
  if (m.is_active !== 1) return ok(c, { error: 'inactive' });
  if (m.can_login !== 1) return ok(c, { error: 'no_access' });
  return ok(c, { manager: mapManager(m) });
});

app.post('/api/auth/admin', async (c) => {
  const body = await readJson(c);
  const code = str(body, 'code', { max: 40 });

  const su = await c.env.DB.prepare(`SELECT * FROM superusers WHERE ${normalizedSql('admin_code')} = ?`)
    .bind(normalizeCode(code))
    .first();

  await c.env.DB.prepare(
    `INSERT INTO login_history (id, actor_id, actor_name, role, at, result) VALUES (?, ?, ?, 'admin', ?, ?)`,
  )
    .bind(uid('log'), su?.id ?? '-', su?.full_name ?? 'admin', nowStamp(), su ? 'success' : 'failed')
    .run();

  if (!su) return ok(c, null);

  // โทเคนนี้คือด่านจริง หน้าเว็บเก็บไว้แนบมากับทุกคำสั่งที่เป็นงานแอดมิน
  const session = await createAdminSession(c.env.DB, su);
  return ok(c, {
    id: su.id,
    admin_code: su.admin_code,
    full_name: su.full_name,
    token: session.token,
    expires_at: session.expires_at,
  });
});

/** ตรวจว่าโทเคนที่ถืออยู่ยังใช้ได้ — หน้าเว็บเรียกตอนเปิดหน้าตั้งค่า */
app.get('/api/auth/admin/session', async (c) => {
  const s = await readAdminSession(c);
  if (!s) return fail(c, 'เซสชันผู้ดูแลหมดอายุหรือไม่ถูกต้อง', 403);
  return ok(c, { admin_id: s.admin_id, full_name: s.admin_name, expires_at: s.expires_at });
});

/** ออกจากโหมดผู้ดูแล — ลบเซสชันทิ้งทันที ไม่ปล่อยให้ค้างจนหมดอายุเอง */
app.post('/api/auth/admin/logout', async (c) => {
  await revokeAdminSession(c);
  return ok(c, { ok: true });
});

app.get('/api/login-history', async (c) => {
  const limit = qInt(c, 'limit', 100, { min: 1, max: 500 });
  const { results } = await c.env.DB.prepare(`SELECT * FROM login_history ORDER BY at DESC LIMIT ?`)
    .bind(limit)
    .all();
  return ok(c, results.map(mapLogin));
});

/* ══════════════════════════════════════════════════════════════════════════
   ผู้จัดการ
   ══════════════════════════════════════════════════════════════════════════ */

app.get('/api/managers', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM managers ORDER BY manager_code`).all();
  return ok(c, results.map(mapManager));
});

app.get('/api/managers/:id', async (c) => {
  const m = await c.env.DB.prepare(`SELECT * FROM managers WHERE id = ?`).bind(c.req.param('id')).first();
  return m ? ok(c, mapManager(m)) : fail(c, 'ไม่พบผู้จัดการรายนี้', 404);
});

app.post('/api/managers', async (c) => {
  const b = await readJson(c);
  const row = {
    id: uid('mgr'),
    manager_code: str(b, 'manager_code', { max: 40 }),
    full_name: str(b, 'full_name', { max: 200 }),
    full_name_en: str(b, 'full_name_en', { required: false, max: 200, fallback: null }),
    department: str(b, 'department', { required: false, max: 100 }),
    position: str(b, 'position', { required: false, max: 100, fallback: null }),
    avatar_url: str(b, 'avatar_url', { required: false, max: 1000, fallback: null }),
    is_active: bool(b, 'is_active', { fallback: true }) ? 1 : 0,
    dashboard_enabled: bool(b, 'dashboard_enabled', { fallback: true }) ? 1 : 0,
    // คนที่เพิ่มใหม่ยังล็อกอินไม่ได้จนกว่าผู้ดูแลระบบจะเปิดสิทธิ์ให้
    can_login: bool(b, 'can_login', { fallback: false }) ? 1 : 0,
    created_at: nowStamp(),
  };

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO managers (id, manager_code, full_name, full_name_en, department, position,
                             avatar_url, is_active, dashboard_enabled, can_login, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      row.id, row.manager_code, row.full_name, row.full_name_en, row.department,
      row.position, row.avatar_url, row.is_active, row.dashboard_enabled, row.can_login, row.created_at,
    ),
    entryStmt(c.env.DB, {
      table: 'managers', recordId: row.id, action: 'create',
      newV: row.full_name, actor: actorName(c),
    }),
  ]);

  const saved = await c.env.DB.prepare(`SELECT * FROM managers WHERE id = ?`).bind(row.id).first();
  return ok(c, mapManager(saved), 201);
});

app.put('/api/managers/:id', async (c) => {
  const id = c.req.param('id');
  const b = await readJson(c);
  const before = await c.env.DB.prepare(`SELECT * FROM managers WHERE id = ?`).bind(id).first();
  if (!before) return fail(c, 'ไม่พบผู้จัดการรายนี้', 404);

  const next = {
    manager_code: 'manager_code' in b ? str(b, 'manager_code', { max: 40 }) : before.manager_code,
    full_name: 'full_name' in b ? str(b, 'full_name', { max: 200 }) : before.full_name,
    full_name_en: 'full_name_en' in b ? str(b, 'full_name_en', { required: false, max: 200, fallback: null }) : before.full_name_en,
    department: 'department' in b ? str(b, 'department', { required: false, max: 100 }) : before.department,
    position: 'position' in b ? str(b, 'position', { required: false, max: 100, fallback: null }) : before.position,
    avatar_url: 'avatar_url' in b ? str(b, 'avatar_url', { required: false, max: 1000, fallback: null }) : before.avatar_url,
    is_active: 'is_active' in b ? (bool(b, 'is_active') ? 1 : 0) : before.is_active,
    dashboard_enabled: 'dashboard_enabled' in b ? (bool(b, 'dashboard_enabled') ? 1 : 0) : before.dashboard_enabled,
    can_login: 'can_login' in b ? (bool(b, 'can_login') ? 1 : 0) : before.can_login,
  };

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE managers SET manager_code = ?, full_name = ?, full_name_en = ?, department = ?,
                           position = ?, avatar_url = ?, is_active = ?, dashboard_enabled = ?,
                           can_login = ?
        WHERE id = ?`,
    ).bind(
      next.manager_code, next.full_name, next.full_name_en, next.department,
      next.position, next.avatar_url, next.is_active, next.dashboard_enabled, next.can_login, id,
    ),
    ...diffStmts(c.env.DB, { table: 'managers', recordId: id, before, after: next, actor: actorName(c) }),
  ]);

  const saved = await c.env.DB.prepare(`SELECT * FROM managers WHERE id = ?`).bind(id).first();
  return ok(c, mapManager(saved));
});

/* ══════════════════════════════════════════════════════════════════════════
   พื้นที่
   ══════════════════════════════════════════════════════════════════════════ */

app.get('/api/areas', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM areas ORDER BY id`).all();
  return ok(c, results.map(mapArea));
});

app.post('/api/areas', async (c) => {
  const b = await readJson(c);
  const row = {
    id: uid('ar'),
    area_name: str(b, 'area_name', { max: 200 }),
    area_name_en: str(b, 'area_name_en', { required: false, max: 200, fallback: null }),
    parent_id: str(b, 'parent_id', { required: false, max: 60, fallback: null }),
    department: str(b, 'department', { required: false, max: 100 }),
    is_active: bool(b, 'is_active', { fallback: true }) ? 1 : 0,
  };

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO areas (id, area_name, area_name_en, parent_id, department, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(row.id, row.area_name, row.area_name_en, row.parent_id, row.department, row.is_active),
    entryStmt(c.env.DB, {
      table: 'areas', recordId: row.id, action: 'create', newV: row.area_name, actor: actorName(c),
    }),
  ]);

  const saved = await c.env.DB.prepare(`SELECT * FROM areas WHERE id = ?`).bind(row.id).first();
  return ok(c, mapArea(saved), 201);
});

app.put('/api/areas/:id', async (c) => {
  const id = c.req.param('id');
  const b = await readJson(c);
  const before = await c.env.DB.prepare(`SELECT * FROM areas WHERE id = ?`).bind(id).first();
  if (!before) return fail(c, 'ไม่พบพื้นที่นี้', 404);

  const next = {
    area_name: 'area_name' in b ? str(b, 'area_name', { max: 200 }) : before.area_name,
    area_name_en: 'area_name_en' in b ? str(b, 'area_name_en', { required: false, max: 200, fallback: null }) : before.area_name_en,
    parent_id: 'parent_id' in b ? str(b, 'parent_id', { required: false, max: 60, fallback: null }) : before.parent_id,
    department: 'department' in b ? str(b, 'department', { required: false, max: 100 }) : before.department,
    is_active: 'is_active' in b ? (bool(b, 'is_active') ? 1 : 0) : before.is_active,
  };

  if (next.parent_id === id) return fail(c, 'พื้นที่เป็นแม่ของตัวเองไม่ได้', 400);

  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE areas SET area_name = ?, area_name_en = ?, parent_id = ?, department = ?, is_active = ?
        WHERE id = ?`,
    ).bind(next.area_name, next.area_name_en, next.parent_id, next.department, next.is_active, id),
    ...diffStmts(c.env.DB, { table: 'areas', recordId: id, before, after: next, actor: actorName(c) }),
  ]);

  const saved = await c.env.DB.prepare(`SELECT * FROM areas WHERE id = ?`).bind(id).first();
  return ok(c, mapArea(saved));
});

/* ══════════════════════════════════════════════════════════════════════════
   หัวข้อการเดิน
   ══════════════════════════════════════════════════════════════════════════ */

app.get('/api/themes', async (c) => {
  const activeOnly = c.req.query('active') === '1';
  const sql = activeOnly
    ? `SELECT * FROM walk_themes WHERE is_active = 1 ORDER BY id`
    : `SELECT * FROM walk_themes ORDER BY id`;
  const { results } = await c.env.DB.prepare(sql).all();
  return ok(c, results.map(mapTheme));
});

app.post('/api/themes', async (c) => {
  const b = await readJson(c);
  const row = {
    id: uid('th'),
    theme_name: str(b, 'theme_name', { max: 200 }),
    theme_name_en: str(b, 'theme_name_en', { required: false, max: 200, fallback: null }),
    is_active: bool(b, 'is_active', { fallback: true }) ? 1 : 0,
  };

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO walk_themes (id, theme_name, theme_name_en, is_active) VALUES (?, ?, ?, ?)`,
    ).bind(row.id, row.theme_name, row.theme_name_en, row.is_active),
    entryStmt(c.env.DB, {
      table: 'walk_themes', recordId: row.id, action: 'create', newV: row.theme_name, actor: actorName(c),
    }),
  ]);

  const saved = await c.env.DB.prepare(`SELECT * FROM walk_themes WHERE id = ?`).bind(row.id).first();
  return ok(c, mapTheme(saved), 201);
});

app.put('/api/themes/:id', async (c) => {
  const id = c.req.param('id');
  const b = await readJson(c);
  const before = await c.env.DB.prepare(`SELECT * FROM walk_themes WHERE id = ?`).bind(id).first();
  if (!before) return fail(c, 'ไม่พบหัวข้อนี้', 404);

  const next = {
    theme_name: 'theme_name' in b ? str(b, 'theme_name', { max: 200 }) : before.theme_name,
    theme_name_en: 'theme_name_en' in b ? str(b, 'theme_name_en', { required: false, max: 200, fallback: null }) : before.theme_name_en,
    is_active: 'is_active' in b ? (bool(b, 'is_active') ? 1 : 0) : before.is_active,
  };

  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE walk_themes SET theme_name = ?, theme_name_en = ?, is_active = ? WHERE id = ?`)
      .bind(next.theme_name, next.theme_name_en, next.is_active, id),
    ...diffStmts(c.env.DB, { table: 'walk_themes', recordId: id, before, after: next, actor: actorName(c) }),
  ]);

  const saved = await c.env.DB.prepare(`SELECT * FROM walk_themes WHERE id = ?`).bind(id).first();
  return ok(c, mapTheme(saved));
});

/* ══════════════════════════════════════════════════════════════════════════
   ตั้งค่าระบบ
   ══════════════════════════════════════════════════════════════════════════ */

app.get('/api/settings', async (c) => {
  const s = await c.env.DB.prepare(`SELECT * FROM app_settings WHERE id = 1`).first();
  if (!s) return fail(c, 'ยังไม่มีข้อมูลตั้งค่า — รัน seed.sql ก่อน', 404);
  return ok(c, mapSettings(s));
});

app.put('/api/settings', async (c) => {
  const b = await readJson(c);
  const before = await c.env.DB.prepare(`SELECT * FROM app_settings WHERE id = 1`).first();
  if (!before) return fail(c, 'ยังไม่มีข้อมูลตั้งค่า — รัน seed.sql ก่อน', 404);

  const next = {
    weekly_target: 'weekly_target' in b ? int(b, 'weekly_target', { min: 0, max: 50 }) : before.weekly_target,
    recent_visit_days: 'recent_visit_days' in b ? int(b, 'recent_visit_days', { min: 0, max: 365 }) : before.recent_visit_days,
    company_name: 'company_name' in b ? str(b, 'company_name', { required: false, max: 200 }) : before.company_name,
    plant_name: 'plant_name' in b ? str(b, 'plant_name', { required: false, max: 200 }) : before.plant_name,
    // ── ค่าตั้งของงานความปลอดภัย ──
    default_role_code:
      'default_role_code' in b ? str(b, 'default_role_code', { max: 40 }) : before.default_role_code,
    due_days_low: 'due_days_low' in b ? int(b, 'due_days_low', { min: 1, max: 365 }) : before.due_days_low,
    due_days_medium: 'due_days_medium' in b ? int(b, 'due_days_medium', { min: 1, max: 365 }) : before.due_days_medium,
    due_days_high: 'due_days_high' in b ? int(b, 'due_days_high', { min: 1, max: 365 }) : before.due_days_high,
    due_days_critical:
      'due_days_critical' in b ? int(b, 'due_days_critical', { min: 1, max: 365 }) : before.due_days_critical,
    require_after_photo:
      'require_after_photo' in b ? (bool(b, 'require_after_photo') ? 1 : 0) : before.require_after_photo,
  };

  // บทบาทตั้งต้นต้องมีอยู่จริง ไม่งั้นคนที่ยังไม่ถูกใส่ทะเบียนสิทธิ์จะไร้สิทธิ์ทั้งหมด
  if (next.default_role_code !== before.default_role_code) {
    const role = await c.env.DB.prepare(`SELECT 1 FROM roles WHERE role_code = ?`)
      .bind(next.default_role_code)
      .first();
    if (!role) return fail(c, `ไม่มีบทบาทรหัส "${next.default_role_code}" ในระบบ`, 400);
  }

  await c.env.DB.prepare(
    `UPDATE app_settings
        SET weekly_target = ?, recent_visit_days = ?, company_name = ?, plant_name = ?,
            default_role_code = ?, due_days_low = ?, due_days_medium = ?, due_days_high = ?,
            due_days_critical = ?, require_after_photo = ?
      WHERE id = 1`,
  )
    .bind(
      next.weekly_target, next.recent_visit_days, next.company_name, next.plant_name,
      next.default_role_code, next.due_days_low, next.due_days_medium, next.due_days_high,
      next.due_days_critical, next.require_after_photo,
    )
    .run();

  return ok(c, mapSettings({ ...before, ...next }));
});

/* ══════════════════════════════════════════════════════════════════════════
   แผนการเดิน
   ══════════════════════════════════════════════════════════════════════════ */

app.get('/api/plans', async (c) => {
  const where = [];
  const binds = [];

  const from = qDate(c, 'from');
  const to = qDate(c, 'to');
  if (from) { where.push('p.plan_date >= ?'); binds.push(from); }
  if (to) { where.push('p.plan_date <= ?'); binds.push(to); }

  const managerId = c.req.query('manager_id');
  if (managerId) { where.push('p.manager_id = ?'); binds.push(managerId); }

  const areaId = c.req.query('area_id');
  if (areaId) { where.push('p.area_id = ?'); binds.push(areaId); }

  const status = c.req.query('status');
  if (status) {
    if (!['planned', 'completed', 'cancelled'].includes(status)) {
      throw new BadInput('status', 'ต้องเป็น planned, completed หรือ cancelled');
    }
    where.push('p.status = ?');
    binds.push(status);
  }

  const limit = qInt(c, 'limit', 1000, { min: 1, max: 5000 });
  const offset = qInt(c, 'offset', 0, { min: 0, max: 1000000 });

  const sql =
    PLAN_SELECT +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY p.plan_date DESC, p.plan_time DESC LIMIT ? OFFSET ?`;

  const { results } = await c.env.DB.prepare(sql).bind(...binds, limit, offset).all();
  return ok(c, results.map(mapPlan));
});

app.post('/api/plans', async (c) => {
  const b = await readJson(c);
  const input = {
    id: clientId(b, 'plan'),
    manager_id: str(b, 'manager_id', { max: 60 }),
    plan_date: isoDate(b, 'plan_date'),
    plan_time: hhmm(b, 'plan_time'),
    area_id: str(b, 'area_id', { max: 60 }),
    theme_ids: strArray(b, 'theme_ids', { required: true, maxItems: 3, maxLen: 60 }),
    note: str(b, 'note', { required: false, max: 2000 }),
    created_at: nowStamp(),
  };

  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO gemba_plans (id, manager_id, plan_date, plan_time, area_id, note, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'planned', ?)`,
    ).bind(input.id, input.manager_id, input.plan_date, input.plan_time, input.area_id, input.note, input.created_at),
    ...input.theme_ids.map((tid, i) =>
      c.env.DB.prepare(`INSERT INTO plan_themes (plan_id, theme_id, sort_order) VALUES (?, ?, ?)`)
        .bind(input.id, tid, i),
    ),
    entryStmt(c.env.DB, {
      table: 'gemba_plans', recordId: input.id, action: 'create', newV: input.plan_date, actor: actorName(c),
    }),
  ];

  try {
    await c.env.DB.batch(stmts);
  } catch (e) {
    // คิวออฟไลน์ส่งซ้ำด้วย id เดิม — ของอยู่ครบแล้ว ไม่ใช่ข้อผิดพลาด
    if (!isDuplicate(e)) throw e;
  }

  const saved = await c.env.DB.prepare(`${PLAN_SELECT} WHERE p.id = ?`).bind(input.id).first();
  return ok(c, mapPlan(saved), 201);
});

app.put('/api/plans/:id', async (c) => {
  const id = c.req.param('id');
  const b = await readJson(c);
  const before = await c.env.DB.prepare(`${PLAN_SELECT} WHERE p.id = ?`).bind(id).first();
  if (!before) return fail(c, 'ไม่พบแผนนี้', 404);

  const beforeMapped = mapPlan(before);
  const next = {
    manager_id: 'manager_id' in b ? str(b, 'manager_id', { max: 60 }) : beforeMapped.manager_id,
    plan_date: 'plan_date' in b ? isoDate(b, 'plan_date') : beforeMapped.plan_date,
    plan_time: 'plan_time' in b ? hhmm(b, 'plan_time') : beforeMapped.plan_time,
    area_id: 'area_id' in b ? str(b, 'area_id', { max: 60 }) : beforeMapped.area_id,
    note: 'note' in b ? str(b, 'note', { required: false, max: 2000 }) : beforeMapped.note,
    status: 'status' in b ? oneOf(b, 'status', ['planned', 'completed', 'cancelled']) : beforeMapped.status,
    theme_ids: 'theme_ids' in b
      ? strArray(b, 'theme_ids', { required: true, maxItems: 3, maxLen: 60 })
      : beforeMapped.theme_ids,
  };

  const stmts = [
    c.env.DB.prepare(
      `UPDATE gemba_plans SET manager_id = ?, plan_date = ?, plan_time = ?, area_id = ?, note = ?, status = ?
        WHERE id = ?`,
    ).bind(next.manager_id, next.plan_date, next.plan_time, next.area_id, next.note, next.status, id),
  ];

  // แก้หัวข้อ = ลบของเดิมทิ้งแล้วใส่ใหม่ทั้งชุด ง่ายและได้ลำดับที่ถูกต้องเสมอ
  if ('theme_ids' in b) {
    stmts.push(c.env.DB.prepare(`DELETE FROM plan_themes WHERE plan_id = ?`).bind(id));
    next.theme_ids.forEach((tid, i) => {
      stmts.push(
        c.env.DB.prepare(`INSERT INTO plan_themes (plan_id, theme_id, sort_order) VALUES (?, ?, ?)`)
          .bind(id, tid, i),
      );
    });
  }

  stmts.push(
    ...diffStmts(c.env.DB, {
      table: 'gemba_plans', recordId: id, before: beforeMapped, after: next, actor: actorName(c),
    }),
  );

  await c.env.DB.batch(stmts);

  const saved = await c.env.DB.prepare(`${PLAN_SELECT} WHERE p.id = ?`).bind(id).first();
  return ok(c, mapPlan(saved));
});

app.delete('/api/plans/:id', async (c) => {
  const id = c.req.param('id');
  const p = await c.env.DB.prepare(`SELECT status FROM gemba_plans WHERE id = ?`).bind(id).first();
  if (!p) return fail(c, 'ไม่พบแผนนี้', 404);
  if (p.status !== 'planned') {
    return fail(c, 'ลบได้เฉพาะแผนที่ยังไม่ได้เดิน — แผนที่เดินแล้วหรือยกเลิกแล้วให้เก็บไว้เป็นหลักฐาน', 409);
  }

  await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM gemba_plans WHERE id = ?`).bind(id),
    entryStmt(c.env.DB, {
      table: 'gemba_plans', recordId: id, action: 'delete', oldV: id, actor: actorName(c),
    }),
  ]);

  return ok(c, { id, deleted: true });
});

/* ══════════════════════════════════════════════════════════════════════════
   บันทึกการเดิน
   ══════════════════════════════════════════════════════════════════════════ */

app.get('/api/records', async (c) => {
  const where = [];
  const binds = [];

  const from = qDate(c, 'from');
  const to = qDate(c, 'to');
  if (from) { where.push('r.actual_date >= ?'); binds.push(from); }
  if (to) { where.push('r.actual_date <= ?'); binds.push(to); }

  const managerId = c.req.query('manager_id');
  if (managerId) { where.push('r.manager_id = ?'); binds.push(managerId); }

  const areaId = c.req.query('area_id');
  if (areaId) { where.push('r.actual_area_id = ?'); binds.push(areaId); }

  const hasIssue = c.req.query('has_issue');
  if (hasIssue === '1' || hasIssue === '0') { where.push('r.has_issue = ?'); binds.push(Number(hasIssue)); }

  const limit = qInt(c, 'limit', 1000, { min: 1, max: 5000 });
  const offset = qInt(c, 'offset', 0, { min: 0, max: 1000000 });

  const sql =
    RECORD_SELECT +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    ` ORDER BY r.actual_date DESC, r.actual_time DESC LIMIT ? OFFSET ?`;

  const { results } = await c.env.DB.prepare(sql).bind(...binds, limit, offset).all();
  return ok(c, results.map(mapRecord));
});

app.get('/api/records/:id', async (c) => {
  const id = c.req.param('id');
  const r = await c.env.DB.prepare(`${RECORD_SELECT} WHERE r.id = ?`).bind(id).first();
  if (!r) return fail(c, 'ไม่พบบันทึกนี้', 404);

  const { results: history } = await c.env.DB.prepare(
    `SELECT * FROM change_history WHERE record_id = ? ORDER BY changed_at DESC`,
  ).bind(id).all();

  return ok(c, { ...mapRecord(r), change_history: history.map(mapChange) });
});

/** อ่านและตรวจ payload ของบันทึกการเดิน ใช้ร่วมกันทั้งตอนสร้างและตอนแก้ */
/**
 * ผลตรวจรายข้อของเช็คลิสต์ความปลอดภัย
 * รูปแบบที่รับ: [{ item_id, result: 'pass' | 'fail' | 'na', note }]
 */
function readChecklistResults(b) {
  const v = b.checklist_results;
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new BadInput('checklist_results', 'ต้องเป็นอาร์เรย์');
  if (v.length > 200) throw new BadInput('checklist_results', 'เกิน 200 รายการ');

  const seen = new Set();
  const out = [];
  for (const row of v) {
    if (row === null || typeof row !== 'object') {
      throw new BadInput('checklist_results', 'สมาชิกทุกตัวต้องเป็นอ็อบเจกต์');
    }
    const itemId = str(row, 'item_id', { max: 60 });
    // ข้อเดียวติ๊กได้ผลเดียว ส่งซ้ำมาให้ยึดตัวแรก
    if (seen.has(itemId)) continue;
    seen.add(itemId);
    out.push({
      item_id: itemId,
      result: oneOf(row, 'result', ['pass', 'fail', 'na']),
      note: str(row, 'note', { required: false, max: 1000 }),
    });
  }
  return out;
}

function readRecordInput(b, base = null) {
  const has = (k) => k in b;
  const pick = (k, fn, fallbackKey = k) => (has(k) || !base ? fn() : base[fallbackKey]);

  return {
    plan_id: pick('plan_id', () => str(b, 'plan_id', { required: false, max: 60, fallback: null })),
    manager_id: pick('manager_id', () => str(b, 'manager_id', { max: 60 })),
    actual_date: pick('actual_date', () => isoDate(b, 'actual_date')),
    actual_time: pick('actual_time', () => hhmm(b, 'actual_time')),
    actual_area_id: pick('actual_area_id', () => str(b, 'actual_area_id', { max: 60 })),
    observation: pick('observation', () => str(b, 'observation', { required: false, max: 5000 })),
    has_issue: pick('has_issue', () => bool(b, 'has_issue')),
    issue_summary: pick('issue_summary', () => str(b, 'issue_summary', { required: false, max: 2000 })),
    ci_required: pick('ci_required', () => bool(b, 'ci_required')),
    ci_ticket_no: pick('ci_ticket_no', () => str(b, 'ci_ticket_no', { required: false, max: 100 })),
    ci_ticket_link: pick('ci_ticket_link', () => str(b, 'ci_ticket_link', { required: false, max: 1000 })),
    theme_ids: pick('theme_ids', () => strArray(b, 'theme_ids', { required: true, maxItems: 3, maxLen: 60 })),
    checklist_results: 'checklist_results' in b ? readChecklistResults(b) : [],
    photo_urls: pick('photo_urls', () => strArray(b, 'photo_urls', { maxItems: 20, maxLen: 300 })),
    participant_names: pick('participant_names', () => strArray(b, 'participant_names', { maxItems: 30, maxLen: 200 })),
  };
}

/** คำสั่งเขียนตารางลูกของบันทึก (หัวข้อ/รูป/ผู้ร่วมเดิน) */
function childStmts(db, recordId, input) {
  return [
    ...input.theme_ids.map((tid, i) =>
      db.prepare(`INSERT INTO record_themes (record_id, theme_id, sort_order) VALUES (?, ?, ?)`)
        .bind(recordId, tid, i),
    ),
    ...input.photo_urls.map((key, i) =>
      db.prepare(`INSERT INTO record_photos (id, record_id, photo_key, sort_order) VALUES (?, ?, ?, ?)`)
        .bind(uid('ph'), recordId, key, i),
    ),
    ...input.participant_names.map((name, i) =>
      db.prepare(`INSERT INTO record_participants (id, record_id, participant_name, sort_order) VALUES (?, ?, ?, ?)`)
        .bind(uid('rp'), recordId, name, i),
    ),
    ...checklistStmts(db, recordId, input.checklist_results),
  ];
}

/**
 * ผลตรวจเช็คลิสต์ — ใช้ upsert ไม่ใช่ลบทิ้งแล้วใส่ใหม่
 * เพราะแถวนี้อาจถูกผูก finding_id ไว้แล้วจากใบแจ้งที่เปิดจากข้อนั้น
 * ถ้าลบทิ้งความเชื่อมโยงกลับไปหาใบแจ้งจะขาด
 */
function checklistStmts(db, recordId, results) {
  return (results ?? []).map((r) =>
    db
      .prepare(
        `INSERT INTO walk_checklist_results (record_id, item_id, result, note)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (record_id, item_id) DO UPDATE SET result = excluded.result, note = excluded.note`,
      )
      .bind(recordId, r.item_id, r.result, r.note),
  );
}

app.post('/api/records', async (c) => {
  const b = await readJson(c);
  const input = readRecordInput(b);
  const id = clientId(b, 'rec');
  const actor = actorName(c);

  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO gemba_walk_records
         (id, plan_id, manager_id, actual_date, actual_time, actual_area_id, observation,
          has_issue, issue_summary, ci_required, ci_ticket_no, ci_ticket_link, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id, input.plan_id, input.manager_id, input.actual_date, input.actual_time, input.actual_area_id,
      input.observation, input.has_issue ? 1 : 0, input.issue_summary,
      input.ci_required ? 1 : 0, input.ci_ticket_no, input.ci_ticket_link, nowStamp(),
    ),
    ...childStmts(c.env.DB, id, input),
    entryStmt(c.env.DB, {
      table: 'gemba_walk_records', recordId: id, action: 'create', newV: input.actual_date, actor,
    }),
  ];

  // เดินตามแผนแล้ว ให้ปิดสถานะแผนเป็น completed ในชุดเดียวกัน
  if (input.plan_id) {
    stmts.push(
      c.env.DB.prepare(`UPDATE gemba_plans SET status = 'completed' WHERE id = ?`).bind(input.plan_id),
    );
  }

  try {
    await c.env.DB.batch(stmts);
  } catch (e) {
    if (!isDuplicate(e)) throw e;
  }

  const saved = await c.env.DB.prepare(`${RECORD_SELECT} WHERE r.id = ?`).bind(id).first();
  return ok(c, mapRecord(saved), 201);
});

app.put('/api/records/:id', async (c) => {
  const id = c.req.param('id');
  const b = await readJson(c);
  const beforeRow = await c.env.DB.prepare(`${RECORD_SELECT} WHERE r.id = ?`).bind(id).first();
  if (!beforeRow) return fail(c, 'ไม่พบบันทึกนี้', 404);

  const before = mapRecord(beforeRow);
  const input = readRecordInput(b, before);
  const actor = actorName(c);

  const stmts = [
    c.env.DB.prepare(
      `UPDATE gemba_walk_records
          SET manager_id = ?, actual_date = ?, actual_time = ?, actual_area_id = ?, observation = ?,
              has_issue = ?, issue_summary = ?, ci_required = ?, ci_ticket_no = ?, ci_ticket_link = ?
        WHERE id = ?`,
    ).bind(
      input.manager_id, input.actual_date, input.actual_time, input.actual_area_id, input.observation,
      input.has_issue ? 1 : 0, input.issue_summary,
      input.ci_required ? 1 : 0, input.ci_ticket_no, input.ci_ticket_link, id,
    ),
  ];

  // ตารางลูก: เขียนทับทั้งชุดเฉพาะเมื่อผู้เรียกส่งฟิลด์นั้นมาจริง
  if ('theme_ids' in b) {
    stmts.push(c.env.DB.prepare(`DELETE FROM record_themes WHERE record_id = ?`).bind(id));
    input.theme_ids.forEach((tid, i) =>
      stmts.push(
        c.env.DB.prepare(`INSERT INTO record_themes (record_id, theme_id, sort_order) VALUES (?, ?, ?)`)
          .bind(id, tid, i),
      ),
    );
  }
  if ('photo_urls' in b) {
    stmts.push(c.env.DB.prepare(`DELETE FROM record_photos WHERE record_id = ?`).bind(id));
    input.photo_urls.forEach((key, i) =>
      stmts.push(
        c.env.DB.prepare(`INSERT INTO record_photos (id, record_id, photo_key, sort_order) VALUES (?, ?, ?, ?)`)
          .bind(uid('ph'), id, key, i),
      ),
    );
  }
  if ('checklist_results' in b) {
    stmts.push(...checklistStmts(c.env.DB, id, input.checklist_results));
  }
  if ('participant_names' in b) {
    stmts.push(c.env.DB.prepare(`DELETE FROM record_participants WHERE record_id = ?`).bind(id));
    input.participant_names.forEach((name, i) =>
      stmts.push(
        c.env.DB.prepare(`INSERT INTO record_participants (id, record_id, participant_name, sort_order) VALUES (?, ?, ?, ?)`)
          .bind(uid('rp'), id, name, i),
      ),
    );
  }

  stmts.push(
    ...diffStmts(c.env.DB, {
      table: 'gemba_walk_records', recordId: id, before, after: input, actor,
    }),
  );

  // แก้หัวข้อย้อนหลังของการเดินที่ผูกแผน ต้องอัปเดตที่แผนด้วย เพื่อให้รายงานตรงกัน
  // (ตรงกับพฤติกรรมเดิมใน updateRecord() ของ src/lib/api.ts)
  if ('theme_ids' in b && before.plan_id) {
    stmts.push(c.env.DB.prepare(`DELETE FROM plan_themes WHERE plan_id = ?`).bind(before.plan_id));
    input.theme_ids.forEach((tid, i) =>
      stmts.push(
        c.env.DB.prepare(`INSERT INTO plan_themes (plan_id, theme_id, sort_order) VALUES (?, ?, ?)`)
          .bind(before.plan_id, tid, i),
      ),
    );
    stmts.push(
      entryStmt(c.env.DB, {
        table: 'gemba_plans', recordId: before.plan_id, action: 'update', field: 'theme_ids',
        oldV: before.theme_ids.join(', '), newV: input.theme_ids.join(', '), actor,
      }),
    );
  }

  await c.env.DB.batch(stmts);

  const saved = await c.env.DB.prepare(`${RECORD_SELECT} WHERE r.id = ?`).bind(id).first();
  return ok(c, mapRecord(saved));
});

/* ══════════════════════════════════════════════════════════════════════════
   ประเด็นที่พบ + ร่องรอยการแก้ไข
   ══════════════════════════════════════════════════════════════════════════ */

/** ประเด็นที่ยังไม่ได้เปิดใบงานแก้ไข — เรียงจากเก่าสุดก่อน เพราะค้างนานสุด */
app.get('/api/issues/open', async (c) => {
  const limit = qInt(c, 'limit', 100, { min: 1, max: 500 });
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.actual_date, r.issue_summary, r.ci_required, r.ci_ticket_no,
            m.full_name AS manager_name, a.area_name
       FROM gemba_walk_records r
       JOIN managers m ON m.id = r.manager_id
       JOIN areas a ON a.id = r.actual_area_id
      WHERE r.has_issue = 1 AND (r.ci_ticket_no IS NULL OR r.ci_ticket_no = '')
      ORDER BY r.actual_date ASC
      LIMIT ?`,
  ).bind(limit).all();

  return ok(c, results.map((r) => ({
    record_id: r.id,
    actual_date: r.actual_date,
    issue_summary: r.issue_summary,
    ci_required: r.ci_required === 1,
    manager_name: r.manager_name,
    area_name: r.area_name,
    days_open: Math.max(
      0,
      Math.round((Date.parse(`${todayBangkok()}T00:00:00Z`) - Date.parse(`${r.actual_date}T00:00:00Z`)) / 86400000),
    ),
  })));
});

app.get('/api/change-history', async (c) => {
  const recordId = c.req.query('record_id');
  const limit = qInt(c, 'limit', 300, { min: 1, max: 1000 });

  const { results } = recordId
    ? await c.env.DB.prepare(
        `SELECT * FROM change_history WHERE record_id = ? ORDER BY changed_at DESC LIMIT ?`,
      ).bind(recordId, limit).all()
    : await c.env.DB.prepare(`SELECT * FROM change_history ORDER BY changed_at DESC LIMIT ?`)
        .bind(limit).all();

  return ok(c, results.map(mapChange));
});

/* ══════════════════════════════════════════════════════════════════════════
   ประกาศประจำสัปดาห์
   ══════════════════════════════════════════════════════════════════════════ */

app.get('/api/focus', async (c) => {
  const date = qDate(c, 'date') ?? todayBangkok();
  const f = await c.env.DB.prepare(
    `${FOCUS_SELECT} WHERE f.is_active = 1 AND f.week_start <= ? AND ? <= f.week_end LIMIT 1`,
  ).bind(date, date).first();
  return ok(c, f ? mapFocus(f) : null);
});

app.get('/api/focus/list', async (c) => {
  const { results } = await c.env.DB.prepare(`${FOCUS_SELECT} ORDER BY f.week_start DESC`).all();
  return ok(c, results.map(mapFocus));
});

app.post('/api/focus', async (c) => {
  const b = await readJson(c);
  const row = {
    id: uid('wf'),
    week_start: isoDate(b, 'week_start'),
    week_end: isoDate(b, 'week_end'),
    message_th: str(b, 'message_th', { required: false, max: 2000 }),
    message_en: str(b, 'message_en', { required: false, max: 2000 }),
    is_active: bool(b, 'is_active', { fallback: true }) ? 1 : 0,
    theme_ids: strArray(b, 'theme_ids', { maxItems: 8, maxLen: 60 }),
  };
  if (row.week_end < row.week_start) return fail(c, 'วันสิ้นสุดต้องไม่มาก่อนวันเริ่มต้น', 400);

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO weekly_focus (id, week_start, week_end, message_th, message_en, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(row.id, row.week_start, row.week_end, row.message_th, row.message_en, row.is_active),
    ...row.theme_ids.map((tid) =>
      c.env.DB.prepare(`INSERT INTO focus_themes (focus_id, theme_id) VALUES (?, ?)`).bind(row.id, tid),
    ),
  ]);

  const saved = await c.env.DB.prepare(`${FOCUS_SELECT} WHERE f.id = ?`).bind(row.id).first();
  return ok(c, mapFocus(saved), 201);
});

app.put('/api/focus/:id', async (c) => {
  const id = c.req.param('id');
  const b = await readJson(c);
  const beforeRow = await c.env.DB.prepare(`${FOCUS_SELECT} WHERE f.id = ?`).bind(id).first();
  if (!beforeRow) return fail(c, 'ไม่พบประกาศนี้', 404);

  const before = mapFocus(beforeRow);
  const next = {
    week_start: 'week_start' in b ? isoDate(b, 'week_start') : before.week_start,
    week_end: 'week_end' in b ? isoDate(b, 'week_end') : before.week_end,
    message_th: 'message_th' in b ? str(b, 'message_th', { required: false, max: 2000 }) : before.message_th,
    message_en: 'message_en' in b ? str(b, 'message_en', { required: false, max: 2000 }) : before.message_en,
    is_active: 'is_active' in b ? (bool(b, 'is_active') ? 1 : 0) : (before.is_active ? 1 : 0),
    theme_ids: 'theme_ids' in b ? strArray(b, 'theme_ids', { maxItems: 8, maxLen: 60 }) : before.theme_ids,
  };
  if (next.week_end < next.week_start) return fail(c, 'วันสิ้นสุดต้องไม่มาก่อนวันเริ่มต้น', 400);

  const stmts = [
    c.env.DB.prepare(
      `UPDATE weekly_focus SET week_start = ?, week_end = ?, message_th = ?, message_en = ?, is_active = ?
        WHERE id = ?`,
    ).bind(next.week_start, next.week_end, next.message_th, next.message_en, next.is_active, id),
  ];
  if ('theme_ids' in b) {
    stmts.push(c.env.DB.prepare(`DELETE FROM focus_themes WHERE focus_id = ?`).bind(id));
    next.theme_ids.forEach((tid) =>
      stmts.push(c.env.DB.prepare(`INSERT INTO focus_themes (focus_id, theme_id) VALUES (?, ?)`).bind(id, tid)),
    );
  }

  await c.env.DB.batch(stmts);

  const saved = await c.env.DB.prepare(`${FOCUS_SELECT} WHERE f.id = ?`).bind(id).first();
  return ok(c, mapFocus(saved));
});

/* ══════════════════════════════════════════════════════════════════════════
   รูปหน้างาน (R2)
   ══════════════════════════════════════════════════════════════════════════ */

const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

app.post('/api/uploads', async (c) => {
  const contentType = (c.req.header('Content-Type') ?? '').split(';')[0].trim();

  let blob;
  let type;

  if (contentType === 'multipart/form-data') {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') return fail(c, 'ไม่พบไฟล์ในฟิลด์ "file"', 400);
    blob = file;
    type = file.type;
  } else {
    // ส่ง blob ดิบมาตรง ๆ ก็ได้ (frontend บีบอัดเป็น JPEG อยู่แล้ว)
    blob = await c.req.blob();
    type = contentType;
  }

  if (!ALLOWED_IMAGE.has(type)) {
    return fail(c, `ชนิดไฟล์ "${type || 'ไม่ระบุ'}" ไม่รองรับ — ต้องเป็น JPEG, PNG หรือ WebP`, 400);
  }
  if (blob.size === 0) return fail(c, 'ไฟล์ว่างเปล่า', 400);
  if (blob.size > MAX_PHOTO_BYTES) {
    return fail(c, `ไฟล์ใหญ่เกิน ${MAX_PHOTO_BYTES / 1024 / 1024} MB`, 413);
  }

  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  // จัดเก็บแยกตามวัน เพื่อให้ไล่ดู/ล้างของเก่าใน R2 ได้ง่าย
  const key = `${todayBangkok()}/${uid('ph')}.${ext}`;

  await c.env.PHOTOS.put(key, blob.stream(), { httpMetadata: { contentType: type } });

  return ok(c, { key, size: blob.size, content_type: type }, 201);
});

app.get('/api/uploads/:key{.+}', async (c) => {
  const key = c.req.param('key');
  const obj = await c.env.PHOTOS.get(key);
  if (!obj) return fail(c, 'ไม่พบรูปนี้', 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=31536000, immutable',
      ETag: obj.httpEtag,
    },
  });
});

app.delete('/api/uploads/:key{.+}', async (c) => {
  const key = c.req.param('key');
  const stillUsed = await c.env.DB.prepare(
    `SELECT 1 FROM record_photos  WHERE photo_key = ?
      UNION ALL
      SELECT 1 FROM finding_photos WHERE photo_key = ?
      LIMIT 1`,
  )
    .bind(key, key)
    .first();
  if (stillUsed) return fail(c, 'ลบไม่ได้ — รูปนี้ยังถูกใช้อยู่ในบันทึกการเดินหรือใบแจ้งปัญหา', 409);

  await c.env.PHOTOS.delete(key);
  return ok(c, { key, deleted: true });
});

/* ══════════════════════════════════════════════════════════════════════════
   แดชบอร์ด + ส่งออก
   ══════════════════════════════════════════════════════════════════════════ */

/** ช่วงวันที่เริ่มต้น: ย้อนหลัง 30 วันถึงวันนี้ */
function dateRange(c) {
  const to = qDate(c, 'to') ?? todayBangkok();
  const from = qDate(c, 'from') ?? new Date(Date.parse(`${to}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  if (from > to) throw new BadInput('from', 'ต้องไม่มาหลัง to');
  return { from, to };
}

app.get('/api/dashboard/summary', async (c) => {
  const { from, to } = dateRange(c);
  return ok(c, await buildSummary(c.env.DB, from, to));
});

app.get('/api/export/csv', async (c) => {
  const { from, to } = dateRange(c);
  const csv = await buildCsv(c.env.DB, from, to);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv;charset=utf-8',
      'Content-Disposition': `attachment; filename="gemba-walk-${from}-to-${to}.csv"`,
    },
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   งานความปลอดภัย — ใบแจ้งปัญหา · เช็คลิสต์ · สิทธิ์ผู้ใช้งาน (worker/src/lib/safety.js)
   ส่งตัวช่วยที่ใช้ร่วมกันเข้าไป เพื่อให้กติกา id / ผู้ทำรายการ / คิวส่งซ้ำ เป็นชุดเดียวกัน
   ══════════════════════════════════════════════════════════════════════════ */

registerSafetyRoutes(app, { actorName, clientId, isDuplicate });

export default app;
