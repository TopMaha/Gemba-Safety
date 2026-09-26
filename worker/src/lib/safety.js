/**
 * GEMBA SAFETY — เส้นทาง API ของงานความปลอดภัย
 *
 * แยกออกจาก index.js เพราะเป็นโดเมนใหม่ทั้งก้อน (ใบแจ้งปัญหา · เช็คลิสต์ · สิทธิ์)
 * และจะโตต่อไปอีก ถ้ายัดรวมไฟล์เดียวจะกลายเป็นไฟล์สองพันบรรทัดที่อ่านไม่ไหว
 *
 * กติกาเดียวกับ index.js ทุกข้อ
 *   - ตอบ JSON รูปแบบเดียว { ok, data } / { ok, error }
 *   - prepared statement + bind() ทุกที่ ห้ามต่อสตริงลง SQL
 *   - การเขียนที่แตะหลายตารางใช้ batch() ให้สำเร็จหรือล้มเหลวพร้อมกัน
 *   - ตัวเลขสรุปคำนวณที่นี่ ไม่รับจาก client
 */

import {
  BadInput, bool, fail, int, isoDate, nowStamp, ok, oneOf, qDate, qInt, readJson, str, strArray, todayBangkok, uid,
} from './http.js';
import { FINDING_SELECT, mapChecklistItem, mapFinding, mapFindingEvent, mapNotification, mapRole, mapUserRole } from './rows.js';
import { entryStmt, diffStmts } from './audit.js';

/** สถานะที่ถือว่า "ยังไม่จบ" — ใช้ทั้งหน้ารายการและตัวนับบนแดชบอร์ด */
const OPEN_STATUSES = ['open', 'assigned', 'in_progress', 'fixed'];

const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'assigned', 'in_progress', 'fixed', 'closed', 'cancelled'];

/** วันครบกำหนดตั้งต้นตามระดับความรุนแรง — ยิ่งรุนแรงยิ่งต้องแก้เร็ว */
const DUE_COLUMN = {
  low: 'due_days_low',
  medium: 'due_days_medium',
  high: 'due_days_high',
  critical: 'due_days_critical',
};

function addDays(isoDay, days) {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * เลขที่ใบแจ้งที่ฝั่งเครื่องสร้างมา — ถ้าไม่ส่งมาให้สร้างที่นี่
 *
 * รูปแบบ SF-YYYYMMDD-XXXX โดย XXXX เป็นตัวสุ่ม ไม่ใช่เลขวิ่งต่อเนื่อง
 * เพราะใบแจ้งถูกเปิดตอนออฟไลน์กลางโรงงานได้ ถ้าใช้เลขวิ่งจะชนกันเมื่อหลายคน
 * เปิดใบพร้อมกันแล้วค่อยซิงก์ทีหลัง — คีย์ UNIQUE จะปฏิเสธและงานหาย
 */
function makeFindingNo(b) {
  const given = b.finding_no;
  if (given === undefined || given === null || given === '') {
    const rand = Math.random().toString(36).toUpperCase().slice(2, 6);
    return `SF-${todayBangkok().replace(/-/g, '')}-${rand}`;
  }
  if (typeof given !== 'string' || !/^[A-Za-z0-9-]{1,40}$/.test(given)) {
    throw new BadInput('finding_no', 'ต้องเป็นตัวอักษร ตัวเลข หรือขีดกลาง ไม่เกิน 40 ตัว');
  }
  return given;
}

/** อ่านค่าตั้งของงานความปลอดภัย (แถวเดียวเสมอ) */
async function readSettings(db) {
  const s = await db
    .prepare(
      `SELECT default_role_code, due_days_low, due_days_medium, due_days_high,
              due_days_critical, require_after_photo
         FROM app_settings WHERE id = 1`,
    )
    .first();
  // ฐานข้อมูลที่ยังไม่ได้ seed — ใช้ค่าเดียวกับที่ตั้งไว้ใน schema.sql
  return (
    s ?? {
      default_role_code: 'inspector',
      due_days_low: 30,
      due_days_medium: 14,
      due_days_high: 3,
      due_days_critical: 1,
      require_after_photo: 1,
    }
  );
}

/** คำสั่งใส่รูปของใบแจ้ง (ล้างของเดิมเฉพาะ phase ที่ส่งมา แล้วใส่ชุดใหม่) */
function photoStmts(db, findingId, phase, keys, actor) {
  const at = nowStamp();
  const stmts = [
    db.prepare(`DELETE FROM finding_photos WHERE finding_id = ? AND phase = ?`).bind(findingId, phase),
  ];
  keys.forEach((key, i) => {
    stmts.push(
      db
        .prepare(
          `INSERT INTO finding_photos (id, finding_id, photo_key, phase, uploaded_by, uploaded_at, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(uid('fp'), findingId, key, phase, actor, at, i),
    );
  });
  return stmts;
}

/** คำสั่งใส่เหตุการณ์ลงไทม์ไลน์ */
function eventStmt(db, findingId, type, actorId, actorName, note = '') {
  return db
    .prepare(
      `INSERT INTO finding_events (id, finding_id, event_type, actor_id, actor_name, note, at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(uid('fe'), findingId, type, actorId ?? '', actorName ?? '', note ?? '', nowStamp());
}

/** คำสั่งแจ้งเตือนเข้ากล่องงานของผู้รับผิดชอบ (ข้ามคนที่เป็นผู้ทำรายการเอง) */
function notifyStmts(db, ids, { findingId, kind, title, body, exceptId }) {
  const at = nowStamp();
  return ids
    .filter((id) => id && id !== exceptId)
    // คนเดียวถูกใส่เป็นทั้งผู้จัดการและหัวหน้างานได้ ต้องกันแจ้งซ้ำ
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .map((id) =>
      db
        .prepare(
          `INSERT INTO notifications (id, manager_id, finding_id, kind, title, body, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(uid('nt'), id, findingId, kind, title, body ?? '', at),
    );
}

export function registerSafetyRoutes(app, { actorName, clientId, isDuplicate }) {
  /** ผู้ทำรายการ — ฝั่งเครื่องส่ง actor_id มาด้วยได้ เพราะงานอาจถูกทำตอนออฟไลน์
   *  แล้วค่อยซิงก์ขึ้นทีหลังในจังหวะที่คนที่ล็อกอินอยู่เป็นคนละคน */
  const actorOf = (c, b = {}) => ({
    id: (typeof b.actor_id === 'string' && b.actor_id) || c.get('actor')?.id || null,
    name: (typeof b.actor_name === 'string' && b.actor_name) || actorName(c),
  });

  /* ══════════════════════════════════════════════════════════════════════
     สิทธิ์ผู้ใช้งาน (RBAC)

     ทุกเส้นทางในกลุ่มนี้ที่ไม่ใช่ GET ถูกครอบด้วย adminGuard ใน index.js แล้ว
     ══════════════════════════════════════════════════════════════════════ */

  app.get('/api/permissions', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM permissions ORDER BY sort_order, perm_code`,
    ).all();
    return ok(c, results);
  });

  /** บทบาททั้งหมด พร้อมรายการสิทธิ์ของแต่ละบทบาท */
  app.get('/api/roles', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT r.*,
              (SELECT group_concat(rp.perm_code, char(1))
                 FROM role_permissions rp WHERE rp.role_id = r.id) AS perm_codes
         FROM roles r ORDER BY r.sort_order, r.role_code`,
    ).all();
    return ok(c, results.map(mapRole));
  });

  /** เปลี่ยนชุดสิทธิ์ของบทบาท — ส่งมาทั้งชุด ระบบล้างของเดิมแล้วใส่ใหม่ */
  app.put('/api/roles/:id/permissions', async (c) => {
    const id = c.req.param('id');
    const b = await readJson(c);
    const codes = strArray(b, 'perm_codes', { maxItems: 100, maxLen: 60 });

    const role = await c.env.DB.prepare(`SELECT id, role_code FROM roles WHERE id = ?`).bind(id).first();
    if (!role) return fail(c, 'ไม่พบบทบาทนี้', 404);
    // ผู้ดูแลระบบต้องทำได้ทุกอย่างเสมอ ไม่งั้นถอนสิทธิ์ตัวเองจนไม่มีใครแก้กลับได้
    if (role.role_code === 'admin') {
      return fail(c, 'บทบาทผู้ดูแลระบบถือทุกสิทธิ์เสมอ แก้ไขไม่ได้', 400);
    }

    const db = c.env.DB;
    await db.batch([
      db.prepare(`DELETE FROM role_permissions WHERE role_id = ?`).bind(id),
      ...codes.map((code) =>
        db.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, perm_code) VALUES (?, ?)`).bind(id, code),
      ),
      entryStmt(db, {
        table: 'roles',
        recordId: id,
        action: 'update',
        field: 'permissions',
        newV: codes.join(', '),
        actor: actorName(c),
      }),
    ]);

    const row = await db
      .prepare(
        `SELECT r.*, (SELECT group_concat(rp.perm_code, char(1))
                        FROM role_permissions rp WHERE rp.role_id = r.id) AS perm_codes
           FROM roles r WHERE r.id = ?`,
      )
      .bind(id)
      .first();
    return ok(c, mapRole(row));
  });

  /** ทะเบียนสิทธิ์รายคน — ตารางที่ตั้งใจเว้นว่างไว้ให้กรอกทีหลัง */
  app.get('/api/user-roles', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT ur.*, r.role_code, m.full_name, m.manager_code
         FROM user_roles ur
         JOIN roles r    ON r.id = ur.role_id
         JOIN managers m ON m.id = ur.manager_id
        ORDER BY m.manager_code, r.sort_order`,
    ).all();
    return ok(c, results.map(mapUserRole));
  });

  app.post('/api/user-roles', async (c) => {
    const b = await readJson(c);
    const id = clientId(b, 'ur');
    const managerId = str(b, 'manager_id', { max: 60 });
    const roleId = str(b, 'role_id', { max: 60 });
    // '*' = ทั้งโรงงาน · ใส่ id พื้นที่เพื่อจำกัดขอบเขต
    const scope = str(b, 'scope_area_id', { required: false, fallback: '*', max: 60 }) || '*';

    try {
      await c.env.DB.prepare(
        `INSERT INTO user_roles (id, manager_id, role_id, scope_area_id, granted_by, granted_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(id, managerId, roleId, scope, actorName(c), nowStamp())
        .run();
    } catch (e) {
      // ให้บทบาทซ้ำของเดิม = คิวส่งซ้ำหรือกดสองครั้ง ถือว่าสำเร็จ
      if (!isDuplicate(e)) throw e;
    }

    const row = await c.env.DB.prepare(
      `SELECT ur.*, r.role_code, m.full_name, m.manager_code
         FROM user_roles ur
         JOIN roles r    ON r.id = ur.role_id
         JOIN managers m ON m.id = ur.manager_id
        WHERE ur.manager_id = ? AND ur.role_id = ? AND ur.scope_area_id = ?`,
    )
      .bind(managerId, roleId, scope)
      .first();
    return ok(c, row ? mapUserRole(row) : null, 201);
  });

  app.delete('/api/user-roles/:id', async (c) => {
    const id = c.req.param('id');
    const res = await c.env.DB.prepare(`DELETE FROM user_roles WHERE id = ?`).bind(id).run();
    // ลบของที่ไม่มีอยู่แล้วถือว่าสำเร็จ (คิวส่งซ้ำ) แต่บอกไปด้วยว่าไม่ได้ลบอะไร
    return ok(c, { id, deleted: res.meta?.changes ?? 0 });
  });

  /* ══════════════════════════════════════════════════════════════════════
     เช็คลิสต์ความปลอดภัย
     ══════════════════════════════════════════════════════════════════════ */

  app.get('/api/checklist', async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM safety_checklist_items ORDER BY theme_id, sort_order`,
    ).all();
    return ok(c, results.map(mapChecklistItem));
  });

  app.post('/api/checklist', async (c) => {
    const b = await readJson(c);
    const row = {
      id: clientId(b, 'ck'),
      theme_id: str(b, 'theme_id', { max: 60 }),
      item_code: str(b, 'item_code', { required: false, max: 30 }),
      question: str(b, 'question', { max: 500 }),
      question_en: str(b, 'question_en', { required: false, max: 500 }),
      default_severity: oneOf(b, 'default_severity', SEVERITIES, { required: false, fallback: 'medium' }),
      sort_order: int(b, 'sort_order', { required: false, fallback: 999, min: 0, max: 9999 }),
      is_active: bool(b, 'is_active', { fallback: true }) ? 1 : 0,
    };

    try {
      await c.env.DB.prepare(
        `INSERT INTO safety_checklist_items
           (id, theme_id, item_code, question, question_en, default_severity, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          row.id, row.theme_id, row.item_code, row.question, row.question_en,
          row.default_severity, row.sort_order, row.is_active,
        )
        .run();
    } catch (e) {
      if (!isDuplicate(e)) throw e;
    }
    return ok(c, mapChecklistItem(row), 201);
  });

  app.put('/api/checklist/:id', async (c) => {
    const id = c.req.param('id');
    const b = await readJson(c);
    const before = await c.env.DB.prepare(`SELECT * FROM safety_checklist_items WHERE id = ?`).bind(id).first();
    if (!before) return fail(c, 'ไม่พบข้อตรวจนี้', 404);

    const next = {
      theme_id: 'theme_id' in b ? str(b, 'theme_id', { max: 60 }) : before.theme_id,
      item_code: 'item_code' in b ? str(b, 'item_code', { required: false, max: 30 }) : before.item_code,
      question: 'question' in b ? str(b, 'question', { max: 500 }) : before.question,
      question_en: 'question_en' in b ? str(b, 'question_en', { required: false, max: 500 }) : before.question_en,
      default_severity:
        'default_severity' in b
          ? oneOf(b, 'default_severity', SEVERITIES)
          : before.default_severity,
      sort_order: 'sort_order' in b ? int(b, 'sort_order', { min: 0, max: 9999 }) : before.sort_order,
      is_active: 'is_active' in b ? (bool(b, 'is_active') ? 1 : 0) : before.is_active,
    };

    const db = c.env.DB;
    await db.batch([
      db
        .prepare(
          `UPDATE safety_checklist_items
              SET theme_id = ?, item_code = ?, question = ?, question_en = ?,
                  default_severity = ?, sort_order = ?, is_active = ?
            WHERE id = ?`,
        )
        .bind(
          next.theme_id, next.item_code, next.question, next.question_en,
          next.default_severity, next.sort_order, next.is_active, id,
        ),
      ...diffStmts(db, {
        table: 'safety_checklist_items',
        recordId: id,
        before,
        after: next,
        actor: actorName(c),
      }),
    ]);

    return ok(c, mapChecklistItem({ id, ...next }));
  });

  /** ผลตรวจรายข้อของการเดินหนึ่งครั้ง — หน้าประวัติใช้แสดงว่าข้อไหนไม่ผ่าน */
  app.get('/api/checklist-results', async (c) => {
    const recordId = c.req.query('record_id');
    const limit = qInt(c, 'limit', 2000, { min: 1, max: 5000 });
    const { results } = recordId
      ? await c.env.DB.prepare(`SELECT * FROM walk_checklist_results WHERE record_id = ?`).bind(recordId).all()
      : await c.env.DB.prepare(`SELECT * FROM walk_checklist_results LIMIT ?`).bind(limit).all();
    return ok(c, results);
  });

  /* ══════════════════════════════════════════════════════════════════════
     ใบแจ้งปัญหาความปลอดภัย
     ══════════════════════════════════════════════════════════════════════ */

  app.get('/api/findings', async (c) => {
    const where = [];
    const binds = [];

    const from = qDate(c, 'from');
    const to = qDate(c, 'to');
    if (from) { where.push('substr(f.reported_at, 1, 10) >= ?'); binds.push(from); }
    if (to) { where.push('substr(f.reported_at, 1, 10) <= ?'); binds.push(to); }

    const status = c.req.query('status');
    if (status === 'open_only') {
      where.push(`f.status IN (${OPEN_STATUSES.map(() => '?').join(', ')})`);
      binds.push(...OPEN_STATUSES);
    } else if (status) {
      if (!STATUSES.includes(status)) throw new BadInput('status', `ต้องเป็นค่าใดค่าหนึ่งใน ${STATUSES.join(', ')}`);
      where.push('f.status = ?');
      binds.push(status);
    }

    const severity = c.req.query('severity');
    if (severity) {
      if (!SEVERITIES.includes(severity)) {
        throw new BadInput('severity', `ต้องเป็นค่าใดค่าหนึ่งใน ${SEVERITIES.join(', ')}`);
      }
      where.push('f.severity = ?');
      binds.push(severity);
    }

    const areaId = c.req.query('area_id');
    if (areaId) { where.push('f.area_id = ?'); binds.push(areaId); }

    // "งานของฉัน" — เป็นผู้จัดการหรือหัวหน้างานที่ถูกมอบหมายก็ถือว่าใช่
    const assignee = c.req.query('assignee_id');
    if (assignee) {
      where.push('(f.assigned_manager_id = ? OR f.assigned_supervisor_id = ?)');
      binds.push(assignee, assignee);
    }

    const reporter = c.req.query('reported_by');
    if (reporter) { where.push('f.reported_by = ?'); binds.push(reporter); }

    const limit = qInt(c, 'limit', 500, { min: 1, max: 5000 });
    const offset = qInt(c, 'offset', 0, { min: 0, max: 100000 });

    const sql = `${FINDING_SELECT}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY f.reported_at DESC
      LIMIT ? OFFSET ?`;

    const { results } = await c.env.DB.prepare(sql).bind(...binds, limit, offset).all();
    return ok(c, results.map(mapFinding));
  });

  /** รายละเอียดใบเดียว + ไทม์ไลน์ */
  app.get('/api/findings/:id', async (c) => {
    const id = c.req.param('id');
    const row = await c.env.DB.prepare(`${FINDING_SELECT} WHERE f.id = ?`).bind(id).first();
    if (!row) return fail(c, 'ไม่พบใบแจ้งนี้', 404);

    const { results: events } = await c.env.DB.prepare(
      `SELECT * FROM finding_events WHERE finding_id = ? ORDER BY at`,
    )
      .bind(id)
      .all();

    return ok(c, { ...mapFinding(row), events: events.map(mapFindingEvent) });
  });

  /** ไทม์ไลน์ทั้งระบบ — ฝั่งเครื่องดึงไปเก็บไว้เพื่อให้เปิดดูตอนออฟไลน์ได้ */
  app.get('/api/finding-events', async (c) => {
    const findingId = c.req.query('finding_id');
    const limit = qInt(c, 'limit', 3000, { min: 1, max: 10000 });
    const { results } = findingId
      ? await c.env.DB.prepare(`SELECT * FROM finding_events WHERE finding_id = ? ORDER BY at`)
          .bind(findingId)
          .all()
      : await c.env.DB.prepare(`SELECT * FROM finding_events ORDER BY at DESC LIMIT ?`).bind(limit).all();
    return ok(c, results.map(mapFindingEvent));
  });

  app.post('/api/findings', async (c) => {
    const b = await readJson(c);
    const db = c.env.DB;
    const settings = await readSettings(db);
    const actor = actorOf(c, b);

    const id = clientId(b, 'sf');
    const severity = oneOf(b, 'severity', SEVERITIES, { required: false, fallback: 'medium' });
    const reportedAt = str(b, 'reported_at', { required: false, max: 40 }) || nowStamp();
    const row = {
      id,
      finding_no: makeFindingNo(b),
      record_id: str(b, 'record_id', { required: false, max: 60 }) || null,
      area_id: str(b, 'area_id', { max: 60 }),
      theme_id: str(b, 'theme_id', { required: false, max: 60 }) || null,
      checklist_item_id: str(b, 'checklist_item_id', { required: false, max: 60 }) || null,
      title: str(b, 'title', { max: 300 }),
      description: str(b, 'description', { required: false, max: 4000 }),
      severity,
      reported_by: str(b, 'reported_by', { max: 60 }),
      reported_at: reportedAt,
      // ไม่ระบุวันครบกำหนดมา = คิดจากระดับความรุนแรงตามค่าตั้งของระบบ
      due_date:
        isoDate(b, 'due_date', { required: false }) ??
        addDays(reportedAt.slice(0, 10), settings[DUE_COLUMN[severity]]),
      immediate_action: str(b, 'immediate_action', { required: false, max: 2000 }),
      assigned_manager_id: str(b, 'assigned_manager_id', { required: false, max: 60 }) || null,
      assigned_supervisor_id: str(b, 'assigned_supervisor_id', { required: false, max: 60 }) || null,
    };

    const assigned = Boolean(row.assigned_manager_id || row.assigned_supervisor_id);
    const status = assigned ? 'assigned' : 'open';
    const now = nowStamp();
    const photos = strArray(b, 'before_photos', { maxItems: 20, maxLen: 300 });

    const stmts = [
      db
        .prepare(
          `INSERT INTO safety_findings
             (id, finding_no, record_id, area_id, theme_id, checklist_item_id,
              title, description, severity, status, reported_by, reported_at, due_date,
              immediate_action, assigned_manager_id, assigned_supervisor_id, assigned_at, assigned_by,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          row.id, row.finding_no, row.record_id, row.area_id, row.theme_id, row.checklist_item_id,
          row.title, row.description, row.severity, status, row.reported_by, row.reported_at, row.due_date,
          row.immediate_action, row.assigned_manager_id, row.assigned_supervisor_id,
          assigned ? now : null, assigned ? actor.name : '', now, now,
        ),
      ...photoStmts(db, row.id, 'before', photos, actor.name),
      eventStmt(db, row.id, 'created', actor.id, actor.name, row.title),
    ];

    if (assigned) {
      stmts.push(eventStmt(db, row.id, 'assigned', actor.id, actor.name, str(b, 'note', { required: false, max: 1000 })));
      stmts.push(
        ...notifyStmts(db, [row.assigned_manager_id, row.assigned_supervisor_id], {
          findingId: row.id,
          kind: 'assigned',
          title: `งานแก้ไขใหม่ ${row.finding_no}`,
          body: row.title,
          exceptId: actor.id,
        }),
      );
    }

    // ผลตรวจข้อที่ไม่ผ่าน ผูกกลับมาที่ใบแจ้งนี้ เพื่อให้กดจากเช็คลิสต์มาดูใบได้
    if (row.record_id && row.checklist_item_id) {
      stmts.push(
        db
          .prepare(`UPDATE walk_checklist_results SET finding_id = ? WHERE record_id = ? AND item_id = ?`)
          .bind(row.id, row.record_id, row.checklist_item_id),
      );
    }

    try {
      await db.batch(stmts);
    } catch (e) {
      // คิวส่งซ้ำ (เน็ตกะพริบ) — ถือว่าซิงก์ไปแล้ว คืนของเดิมกลับไป
      if (!isDuplicate(e)) throw e;
    }

    const saved = await db.prepare(`${FINDING_SELECT} WHERE f.id = ?`).bind(row.id).first();
    return ok(c, mapFinding(saved), 201);
  });

  /** แก้รายละเอียดใบแจ้ง (ไม่ใช่การเปลี่ยนสถานะ — สถานะเปลี่ยนผ่านเส้นทาง action) */
  app.put('/api/findings/:id', async (c) => {
    const id = c.req.param('id');
    const b = await readJson(c);
    const db = c.env.DB;
    const before = await db.prepare(`SELECT * FROM safety_findings WHERE id = ?`).bind(id).first();
    if (!before) return fail(c, 'ไม่พบใบแจ้งนี้', 404);

    const actor = actorOf(c, b);
    const next = {
      area_id: 'area_id' in b ? str(b, 'area_id', { max: 60 }) : before.area_id,
      theme_id: 'theme_id' in b ? str(b, 'theme_id', { required: false, max: 60 }) || null : before.theme_id,
      title: 'title' in b ? str(b, 'title', { max: 300 }) : before.title,
      description: 'description' in b ? str(b, 'description', { required: false, max: 4000 }) : before.description,
      severity: 'severity' in b ? oneOf(b, 'severity', SEVERITIES) : before.severity,
      due_date: 'due_date' in b ? isoDate(b, 'due_date') : before.due_date,
      immediate_action:
        'immediate_action' in b ? str(b, 'immediate_action', { required: false, max: 2000 }) : before.immediate_action,
    };

    const stmts = [
      db
        .prepare(
          `UPDATE safety_findings
              SET area_id = ?, theme_id = ?, title = ?, description = ?, severity = ?,
                  due_date = ?, immediate_action = ?, updated_at = ?
            WHERE id = ?`,
        )
        .bind(
          next.area_id, next.theme_id, next.title, next.description, next.severity,
          next.due_date, next.immediate_action, nowStamp(), id,
        ),
      ...diffStmts(db, { table: 'safety_findings', recordId: id, before, after: next, actor: actor.name }),
    ];

    if ('before_photos' in b) {
      stmts.push(...photoStmts(db, id, 'before', strArray(b, 'before_photos', { maxItems: 20, maxLen: 300 }), actor.name));
    }
    if (next.severity !== before.severity) {
      stmts.push(eventStmt(db, id, 'severity_changed', actor.id, actor.name, `${before.severity} → ${next.severity}`));
    } else if (next.due_date !== before.due_date) {
      stmts.push(eventStmt(db, id, 'due_changed', actor.id, actor.name, `${before.due_date} → ${next.due_date}`));
    } else {
      stmts.push(eventStmt(db, id, 'updated', actor.id, actor.name, ''));
    }

    await db.batch(stmts);
    const saved = await db.prepare(`${FINDING_SELECT} WHERE f.id = ?`).bind(id).first();
    return ok(c, mapFinding(saved));
  });

  /* ── การเปลี่ยนสถานะ ──────────────────────────────────────────────────
     ทุกจังหวะของวงจรงานยิงมาที่เส้นทางเดียวกัน ต่างกันที่ :action
     รวมไว้ที่เดียวเพื่อให้กติกา "สถานะไหนไปสถานะไหนได้" อ่านจบในหน้าจอเดียว */

  /** สถานะต้นทางที่อนุญาตให้ทำ action นั้นได้ */
  const ALLOWED_FROM = {
    assign: ['open', 'assigned', 'in_progress', 'fixed'],
    start: ['open', 'assigned'],
    fix: ['open', 'assigned', 'in_progress'],
    verify: ['fixed'],
    reject: ['fixed'],
    cancel: ['open', 'assigned', 'in_progress', 'fixed'],
    reopen: ['closed', 'cancelled'],
    comment: STATUSES,
  };

  app.post('/api/findings/:id/:action', async (c) => {
    const id = c.req.param('id');
    const action = c.req.param('action');
    if (!(action in ALLOWED_FROM)) return fail(c, `ไม่รู้จักคำสั่ง "${action}"`, 404);

    const b = await readJson(c);
    const db = c.env.DB;
    const f = await db.prepare(`SELECT * FROM safety_findings WHERE id = ?`).bind(id).first();
    if (!f) return fail(c, 'ไม่พบใบแจ้งนี้', 404);

    if (!ALLOWED_FROM[action].includes(f.status)) {
      return fail(c, `ใบแจ้งอยู่ในสถานะ "${f.status}" จึงทำคำสั่ง "${action}" ไม่ได้`, 409);
    }

    const actor = actorOf(c, b);
    const note = str(b, 'note', { required: false, max: 2000 });
    const now = nowStamp();
    const stmts = [];
    let status = f.status;

    switch (action) {
      case 'assign': {
        const managerId = str(b, 'assigned_manager_id', { required: false, max: 60 }) || null;
        const supervisorId = str(b, 'assigned_supervisor_id', { required: false, max: 60 }) || null;
        if (!managerId && !supervisorId) {
          throw new BadInput('assigned_manager_id', 'ต้องระบุผู้จัดการหรือหัวหน้างานอย่างน้อยหนึ่งคน');
        }
        const dueDate = isoDate(b, 'due_date', { required: false }) ?? f.due_date;
        // มอบหมายซ้ำระหว่างที่งานเดินอยู่แล้ว ไม่ต้องถอยสถานะกลับ
        status = f.status === 'open' ? 'assigned' : f.status;
        const isReassign = Boolean(f.assigned_manager_id || f.assigned_supervisor_id);

        stmts.push(
          db
            .prepare(
              `UPDATE safety_findings
                  SET assigned_manager_id = ?, assigned_supervisor_id = ?, assigned_at = ?,
                      assigned_by = ?, due_date = ?, status = ?, updated_at = ?
                WHERE id = ?`,
            )
            .bind(managerId, supervisorId, now, actor.name, dueDate, status, now, id),
          eventStmt(db, id, isReassign ? 'reassigned' : 'assigned', actor.id, actor.name, note),
          ...notifyStmts(db, [managerId, supervisorId], {
            findingId: id,
            kind: 'assigned',
            title: `งานแก้ไข ${f.finding_no} ครบกำหนด ${dueDate}`,
            body: f.title,
            exceptId: actor.id,
          }),
        );
        break;
      }

      case 'start': {
        status = 'in_progress';
        stmts.push(
          db.prepare(`UPDATE safety_findings SET status = ?, updated_at = ? WHERE id = ?`).bind(status, now, id),
          eventStmt(db, id, 'started', actor.id, actor.name, note),
        );
        break;
      }

      case 'fix': {
        const settings = await readSettings(db);
        const photos = strArray(b, 'after_photos', { maxItems: 20, maxLen: 300 });
        // หลักฐานปิดงานคือรูปหลังแก้ ถ้าไม่บังคับก็ปิดงานได้ด้วยคำพูดล้วน
        if (settings.require_after_photo === 1 && photos.length === 0) {
          return fail(c, 'ต้องแนบรูปหลังแก้ไขอย่างน้อย 1 รูป', 400);
        }
        const actionTaken = str(b, 'action_taken', { max: 4000 });
        const rootCause = str(b, 'root_cause', { required: false, max: 2000 });
        status = 'fixed';

        stmts.push(
          db
            .prepare(
              `UPDATE safety_findings
                  SET status = ?, action_taken = ?, root_cause = ?, fixed_by = ?, fixed_at = ?, updated_at = ?
                WHERE id = ?`,
            )
            .bind(status, actionTaken, rootCause, actor.id, now, now, id),
          ...photoStmts(db, id, 'after', photos, actor.name),
          eventStmt(db, id, 'fixed', actor.id, actor.name, note || actionTaken),
          ...notifyStmts(db, [f.reported_by], {
            findingId: id,
            kind: 'fixed',
            title: `${f.finding_no} แก้ไขแล้ว รอตรวจรับ`,
            body: actionTaken,
            exceptId: actor.id,
          }),
        );
        break;
      }

      case 'verify': {
        status = 'closed';
        stmts.push(
          db
            .prepare(
              `UPDATE safety_findings
                  SET status = ?, verified_by = ?, verified_at = ?, verify_note = ?, closed_at = ?, updated_at = ?
                WHERE id = ?`,
            )
            .bind(status, actor.id, now, note, now, now, id),
          eventStmt(db, id, 'verified', actor.id, actor.name, note),
          eventStmt(db, id, 'closed', actor.id, actor.name, ''),
          ...notifyStmts(db, [f.assigned_manager_id, f.assigned_supervisor_id, f.fixed_by], {
            findingId: id,
            kind: 'closed',
            title: `${f.finding_no} ตรวจรับผ่าน ปิดงานแล้ว`,
            body: note,
            exceptId: actor.id,
          }),
        );
        break;
      }

      case 'reject': {
        if (!note) throw new BadInput('note', 'ตีกลับต้องระบุเหตุผลให้ผู้แก้ไขรู้ว่าต้องทำอะไรเพิ่ม');
        status = 'in_progress';
        stmts.push(
          db
            .prepare(`UPDATE safety_findings SET status = ?, updated_at = ? WHERE id = ?`)
            .bind(status, now, id),
          eventStmt(db, id, 'rejected', actor.id, actor.name, note),
          ...notifyStmts(db, [f.assigned_manager_id, f.assigned_supervisor_id, f.fixed_by], {
            findingId: id,
            kind: 'rejected',
            title: `${f.finding_no} ตรวจรับไม่ผ่าน ต้องแก้เพิ่ม`,
            body: note,
            exceptId: actor.id,
          }),
        );
        break;
      }

      case 'cancel': {
        if (!note) throw new BadInput('note', 'ยกเลิกใบแจ้งต้องระบุเหตุผล');
        status = 'cancelled';
        stmts.push(
          db
            .prepare(`UPDATE safety_findings SET status = ?, closed_at = ?, updated_at = ? WHERE id = ?`)
            .bind(status, now, now, id),
          eventStmt(db, id, 'cancelled', actor.id, actor.name, note),
        );
        break;
      }

      case 'reopen': {
        if (!note) throw new BadInput('note', 'เปิดใบเดิมอีกครั้งต้องระบุเหตุผล');
        status = f.assigned_manager_id || f.assigned_supervisor_id ? 'in_progress' : 'open';
        stmts.push(
          db
            .prepare(
              `UPDATE safety_findings
                  SET status = ?, closed_at = NULL, verified_by = NULL, verified_at = NULL,
                      verify_note = '', updated_at = ?
                WHERE id = ?`,
            )
            .bind(status, now, id),
          eventStmt(db, id, 'reopened', actor.id, actor.name, note),
          ...notifyStmts(db, [f.assigned_manager_id, f.assigned_supervisor_id], {
            findingId: id,
            kind: 'reopened',
            title: `${f.finding_no} ถูกเปิดใหม่`,
            body: note,
            exceptId: actor.id,
          }),
        );
        break;
      }

      case 'comment': {
        if (!note) throw new BadInput('note', 'ต้องพิมพ์ข้อความก่อน');
        stmts.push(eventStmt(db, id, 'comment', actor.id, actor.name, note));
        break;
      }
    }

    await db.batch(stmts);
    const saved = await db.prepare(`${FINDING_SELECT} WHERE f.id = ?`).bind(id).first();
    return ok(c, mapFinding(saved));
  });

  /* ══════════════════════════════════════════════════════════════════════
     กล่องแจ้งเตือน
     ══════════════════════════════════════════════════════════════════════ */

  app.get('/api/notifications', async (c) => {
    const managerId = c.req.query('manager_id');
    const limit = qInt(c, 'limit', 200, { min: 1, max: 1000 });
    const { results } = managerId
      ? await c.env.DB.prepare(
          `SELECT * FROM notifications WHERE manager_id = ? ORDER BY created_at DESC LIMIT ?`,
        )
          .bind(managerId, limit)
          .all()
      : await c.env.DB.prepare(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?`).bind(limit).all();
    return ok(c, results.map(mapNotification));
  });

  /** ทำเครื่องหมายว่าอ่านแล้ว — ส่ง ids มาเป็นชุด หรือส่ง manager_id เพื่ออ่านทั้งกล่อง */
  app.post('/api/notifications/read', async (c) => {
    const b = await readJson(c);
    const ids = strArray(b, 'ids', { maxItems: 200, maxLen: 60 });
    const managerId = str(b, 'manager_id', { required: false, max: 60 });
    const now = nowStamp();
    const db = c.env.DB;

    if (ids.length > 0) {
      await db.batch(
        ids.map((id) => db.prepare(`UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL`).bind(now, id)),
      );
    } else if (managerId) {
      await db
        .prepare(`UPDATE notifications SET read_at = ? WHERE manager_id = ? AND read_at IS NULL`)
        .bind(now, managerId)
        .run();
    } else {
      throw new BadInput('ids', 'ต้องระบุ ids หรือ manager_id อย่างใดอย่างหนึ่ง');
    }
    return ok(c, { read_at: now });
  });

  /* ══════════════════════════════════════════════════════════════════════
     สรุปตัวเลขงานความปลอดภัย — คำนวณที่นี่เท่านั้น
     ══════════════════════════════════════════════════════════════════════ */

  app.get('/api/safety/summary', async (c) => {
    const to = qDate(c, 'to') ?? todayBangkok();
    const from = qDate(c, 'from') ?? addDays(to, -30);
    if (from > to) throw new BadInput('from', 'ต้องไม่มาหลัง to');
    const today = todayBangkok();
    const db = c.env.DB;

    const [totals, bySeverity, byStatus, byArea, byTheme, closing] = await Promise.all([
      db
        .prepare(
          `SELECT COUNT(*) AS found,
                  SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed,
                  SUM(CASE WHEN status IN ('open','assigned','in_progress','fixed') THEN 1 ELSE 0 END) AS open_now,
                  SUM(CASE WHEN status IN ('open','assigned','in_progress','fixed') AND due_date < ?
                           THEN 1 ELSE 0 END) AS overdue,
                  SUM(CASE WHEN status = 'fixed' THEN 1 ELSE 0 END) AS waiting_verify
             FROM safety_findings
            WHERE substr(reported_at, 1, 10) BETWEEN ? AND ?`,
        )
        .bind(today, from, to)
        .first(),

      db
        .prepare(
          `SELECT severity, COUNT(*) AS n
             FROM safety_findings
            WHERE substr(reported_at, 1, 10) BETWEEN ? AND ?
            GROUP BY severity`,
        )
        .bind(from, to)
        .all()
        .then((r) => r.results),

      db
        .prepare(
          `SELECT status, COUNT(*) AS n
             FROM safety_findings
            WHERE substr(reported_at, 1, 10) BETWEEN ? AND ?
            GROUP BY status`,
        )
        .bind(from, to)
        .all()
        .then((r) => r.results),

      db
        .prepare(
          `SELECT a.id AS area_id, a.area_name, a.area_name_en,
                  COUNT(*) AS found,
                  SUM(CASE WHEN f.status IN ('open','assigned','in_progress','fixed') THEN 1 ELSE 0 END) AS open_now
             FROM safety_findings f
             JOIN areas a ON a.id = f.area_id
            WHERE substr(f.reported_at, 1, 10) BETWEEN ? AND ?
            GROUP BY a.id
            ORDER BY found DESC
            LIMIT 20`,
        )
        .bind(from, to)
        .all()
        .then((r) => r.results),

      db
        .prepare(
          `SELECT t.id AS theme_id, t.theme_name, t.theme_name_en, COUNT(*) AS found
             FROM safety_findings f
             JOIN walk_themes t ON t.id = f.theme_id
            WHERE substr(f.reported_at, 1, 10) BETWEEN ? AND ?
            GROUP BY t.id
            ORDER BY found DESC`,
        )
        .bind(from, to)
        .all()
        .then((r) => r.results),

      // ปิดงานทันกำหนดไหม + ใช้เวลากี่วัน — นับจากใบที่ปิดในช่วงที่ถาม
      db
        .prepare(
          `SELECT COUNT(*) AS closed,
                  SUM(CASE WHEN substr(closed_at, 1, 10) <= due_date THEN 1 ELSE 0 END) AS on_time,
                  AVG(julianday(substr(closed_at, 1, 10)) - julianday(substr(reported_at, 1, 10))) AS avg_days
             FROM safety_findings
            WHERE status = 'closed' AND substr(closed_at, 1, 10) BETWEEN ? AND ?`,
        )
        .bind(from, to)
        .first(),
    ]);

    const found = totals?.found ?? 0;
    const closedInRange = closing?.closed ?? 0;

    return ok(c, {
      range: { from, to },
      totals: {
        found,
        closed: totals?.closed ?? 0,
        open: totals?.open_now ?? 0,
        overdue: totals?.overdue ?? 0,
        waiting_verify: totals?.waiting_verify ?? 0,
        // อัตราปิดงาน = ปิดแล้ว ÷ ที่พบทั้งหมดในช่วง (ปัดลงตามแบบเดียวกับหน้าอื่น)
        close_rate: found > 0 ? Math.floor(((totals?.closed ?? 0) / found) * 100) : 0,
      },
      closing: {
        closed: closedInRange,
        on_time: closing?.on_time ?? 0,
        on_time_rate: closedInRange > 0 ? Math.floor(((closing?.on_time ?? 0) / closedInRange) * 100) : 0,
        avg_days: closing?.avg_days === null || closing?.avg_days === undefined
          ? null
          : Math.round(closing.avg_days * 10) / 10,
      },
      by_severity: bySeverity,
      by_status: byStatus,
      by_area: byArea,
      by_theme: byTheme,
    });
  });

  /** ส่งออกใบแจ้งเป็น CSV — คอลัมน์ตรงกับที่ฝ่ายความปลอดภัยใช้ทำรายงานประจำเดือน */
  app.get('/api/export/findings.csv', async (c) => {
    const to = qDate(c, 'to') ?? todayBangkok();
    const from = qDate(c, 'from') ?? addDays(to, -30);
    if (from > to) throw new BadInput('from', 'ต้องไม่มาหลัง to');

    const { results } = await c.env.DB.prepare(
      `SELECT f.finding_no, f.reported_at, f.due_date, f.status, f.severity,
              a.area_name, t.theme_name, f.title, f.description, f.immediate_action,
              rep.full_name  AS reporter,
              mgr.full_name  AS manager,
              sup.full_name  AS supervisor,
              f.root_cause, f.action_taken, f.fixed_at, f.closed_at,
              ver.full_name  AS verifier,
              (SELECT COUNT(*) FROM finding_photos p WHERE p.finding_id = f.id AND p.phase = 'after') AS after_photos
         FROM safety_findings f
         JOIN areas a         ON a.id = f.area_id
         LEFT JOIN walk_themes t ON t.id = f.theme_id
         LEFT JOIN managers rep  ON rep.id = f.reported_by
         LEFT JOIN managers mgr  ON mgr.id = f.assigned_manager_id
         LEFT JOIN managers sup  ON sup.id = f.assigned_supervisor_id
         LEFT JOIN managers ver  ON ver.id = f.verified_by
        WHERE substr(f.reported_at, 1, 10) BETWEEN ? AND ?
        ORDER BY f.reported_at DESC`,
    )
      .bind(from, to)
      .all();

    const header = [
      'เลขที่ใบแจ้ง', 'วันที่พบ', 'ครบกำหนด', 'สถานะ', 'ความรุนแรง', 'พื้นที่', 'หมวด',
      'หัวข้อปัญหา', 'รายละเอียด', 'การแก้ไขเบื้องต้น', 'ผู้แจ้ง', 'ผู้จัดการที่รับผิดชอบ',
      'หัวหน้างานที่รับผิดชอบ', 'สาเหตุราก', 'การแก้ไข', 'วันที่แก้เสร็จ', 'วันที่ปิดงาน',
      'ผู้ตรวจรับ', 'จำนวนรูปหลังแก้',
    ];

    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [header.join(',')];
    for (const r of results) {
      lines.push(
        [
          r.finding_no, r.reported_at, r.due_date, r.status, r.severity, r.area_name, r.theme_name,
          r.title, r.description, r.immediate_action, r.reporter, r.manager, r.supervisor,
          r.root_cause, r.action_taken, r.fixed_at, r.closed_at, r.verifier, r.after_photos,
        ]
          .map(esc)
          .join(','),
      );
    }

    // BOM นำหน้าเพื่อให้ Excel บนวินโดวส์อ่านภาษาไทยออกโดยไม่ต้องตั้งค่าอะไร
    return c.body(`﻿${lines.join('\n')}`, 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="safety-findings-${from}-${to}.csv"`,
    });
  });
}
