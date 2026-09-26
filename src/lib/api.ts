import { mutate, query } from './db';
import { ONLINE_MODE } from './config';
import { ApiError, apiGet, apiPost } from './net';
import { enqueue, type QueueKind } from './queue';
import { refreshPending, syncNow } from './sync';
import { endAdminSession, getAdminSession, startAdminSession } from './session';
import { nowStamp, todayISO, type ISODate } from './time';
import { normalizeCode, uid } from './utils';
import { dueDateFor, newFindingNo } from './safety';
import type {
  Area,
  AppNotification,
  AppSettings,
  ChangeHistory,
  FindingEvent,
  FindingEventType,
  GembaPlan,
  LoginHistory,
  Manager,
  Permission,
  Role,
  SafetyChecklistItem,
  SafetyFinding,
  Severity,
  Superuser,
  UserRole,
  WalkChecklistResult,
  WalkRecord,
  WalkTheme,
  WeeklyFocus,
} from './types';

/**
 * ── ชั้นข้อมูลของโดเมน ──────────────────────────────────────
 * ทุกฟังก์ชันเขียนลง "สำเนาในเครื่อง" ก่อนเสมอ แล้วค่อยใส่คิวรอซิงก์
 * ผู้ใช้จึงบันทึกงานได้ทันทีแม้เน็ตไม่ถึง ซึ่งเป็นเรื่องปกติในโรงงาน
 * ส่วนการส่งขึ้นเซิร์ฟเวอร์เป็นหน้าที่ของ src/lib/sync.ts
 *
 * ชื่อฟังก์ชันและชนิดข้อมูลคงเดิมทุกตัว หน้าจอจึงไม่ต้องแก้อะไรเลย
 */

/**
 * ใส่งานเข้าคิวรอซิงก์ แล้วลองส่งทันทีถ้าออนไลน์อยู่
 *
 * ⚠️ ห้ามโยนข้อผิดพลาดออกไปเด็ดขาด
 * ข้อมูลถูกเขียนลงสำเนาในเครื่องเรียบร้อยแล้วก่อนถึงบรรทัดนี้
 * ถ้าปล่อยให้ล้ม ผู้ใช้จะเห็นว่า "บันทึกไม่สำเร็จ" ทั้งที่งานถูกเก็บไว้แล้ว
 * แล้วจะกดบันทึกซ้ำจนเกิดข้อมูลซ้ำ — แย่กว่าการซิงก์ช้าไปหนึ่งรอบ
 */
async function queueWrite(kind: QueueKind, localId: string, payload: unknown) {
  if (!ONLINE_MODE) return; // โหมดในเครื่องล้วน ไม่ต้องซิงก์
  try {
    await enqueue({ kind, localId, payload });
    await refreshPending();
    void syncNow();
  } catch (e) {
    // เข้าคิวไม่ได้ (เช่น IndexedDB ถูกปิดหรือพื้นที่เต็ม)
    // งานยังอยู่ในเครื่องครบ รอบซิงก์ถัดไปจะดึงของจากเซิร์ฟเวอร์มาเทียบเอง
    console.warn('ใส่คิวรอซิงก์ไม่สำเร็จ — ข้อมูลถูกบันทึกในเครื่องแล้ว', kind, localId, e);
  }
}

/** ── การเข้าสู่ระบบ ─────────────────────────────────────── */

export type LoginError = 'not_found' | 'inactive' | 'no_access';

export async function loginManager(code: string): Promise<{ manager?: Manager; error?: LoginError }> {
  // ตรวจกับสำเนาในเครื่อง เพื่อให้เข้าระบบได้แม้เน็ตไม่ถึง
  // แล้วแจ้งเซิร์ฟเวอร์แบบไม่รอผล ประวัติการเข้าระบบฝั่งเซิร์ฟเวอร์จะได้ครบ
  //
  // สำเนาในเครื่องถูกทับด้วยข้อมูลจากเซิร์ฟเวอร์ทุกรอบซิงก์ การถอนสิทธิ์จึงมีผลตามมา
  // ภายในรอบซิงก์ถัดไป และ useSessionGuard จะเตะออกจากระบบให้ทันทีที่รู้
  if (ONLINE_MODE) void apiPost('/api/auth/login', { code: code.trim() }).catch(() => {});
  const wanted = normalizeCode(code);
  return mutate((db) => {
    const m = db.managers.find((x) => normalizeCode(x.manager_code) === wanted);
    const granted = Boolean(m) && m!.is_active && m!.can_login;
    const log: LoginHistory = {
      id: uid('log'),
      actor_id: m?.id ?? '-',
      actor_name: m?.full_name ?? code,
      role: 'manager',
      at: nowStamp(),
      result: granted ? 'success' : 'failed',
    };
    db.login_history.unshift(log);
    if (!m) return { error: 'not_found' as const };
    if (!m.is_active) return { error: 'inactive' as const };
    if (!m.can_login) return { error: 'no_access' as const };
    return { manager: m };
  });
}

export type AdminLoginError = 'wrong_code' | 'offline';

/** คำตอบจาก POST /api/auth/admin เมื่อรหัสถูก */
interface AdminLoginPayload extends Superuser {
  token: string;
  expires_at: string;
}

/**
 * เข้าโหมดผู้ดูแลระบบ
 *
 * ต่างจากการล็อกอินของผู้ใช้ทั่วไปตรงที่ "ต้องออนไลน์" เพราะโทเคนที่เป็นด่านจริง
 * ออกได้จากเซิร์ฟเวอร์เท่านั้น ถ้ายอมให้เข้าแบบออฟไลน์ก็จะกลับไปเป็นด่านปลอม
 * แบบเดิมที่ตั้งค่าใน localStorage เองได้ — และงานแอดมินไม่ใช่งานหน้างานที่ต้อง
 * ทำกลางโรงงานตอนเน็ตไม่ถึงอยู่แล้ว
 */
export async function loginAdmin(code: string): Promise<{ admin?: Superuser; error?: AdminLoginError }> {
  const wanted = normalizeCode(code);

  // โหมดในเครื่องล้วน (ยังไม่ได้ตั้ง VITE_API_URL) — ไม่มีเซิร์ฟเวอร์ให้ถาม
  if (!ONLINE_MODE) {
    const su = await mutate((db) => {
      const found = db.superusers.find((s) => normalizeCode(s.admin_code) === wanted) ?? null;
      db.login_history.unshift(adminLogEntry(found));
      return found;
    });
    if (!su) return { error: 'wrong_code' };
    startAdminSession({ admin_id: su.id, full_name: su.full_name, token: 'local', expires_at: FAR_FUTURE });
    return { admin: su };
  }

  let payload: AdminLoginPayload | null;
  try {
    payload = await apiPost<AdminLoginPayload | null>('/api/auth/admin', { code: code.trim() });
  } catch (e) {
    if ((e as ApiError).isOffline) return { error: 'offline' };
    throw e;
  }

  await mutate((db) => {
    db.login_history.unshift(adminLogEntry(payload));
  });

  if (!payload) return { error: 'wrong_code' };

  startAdminSession({
    admin_id: payload.id,
    full_name: payload.full_name,
    token: payload.token,
    expires_at: payload.expires_at,
  });
  return { admin: { id: payload.id, admin_code: payload.admin_code, full_name: payload.full_name } };
}

/** ออกจากโหมดผู้ดูแล — บอกเซิร์ฟเวอร์ให้ลบเซสชันทิ้งด้วย ไม่ปล่อยค้างจนหมดอายุ */
export async function logoutAdmin(): Promise<void> {
  if (ONLINE_MODE && getAdminSession()?.token) {
    await apiPost('/api/auth/admin/logout').catch(() => {});
  }
  endAdminSession();
}

/**
 * ถามเซิร์ฟเวอร์ว่าโทเคนที่ถืออยู่ยังใช้ได้ไหม
 *
 * คืน false เฉพาะตอนที่เซิร์ฟเวอร์ปฏิเสธจริง ๆ เท่านั้น
 * ต่อเน็ตไม่ได้ให้ถือว่ายังใช้ได้ ไม่งั้นแค่สัญญาณหลุดก็เด้งแอดมินออกทั้งที่ยังมีสิทธิ์
 */
export async function verifyAdminSession(): Promise<boolean> {
  if (!ONLINE_MODE || !getAdminSession()) return true;
  try {
    await apiGet('/api/auth/admin/session');
    return true;
  } catch (e) {
    const err = e as ApiError;
    if (err.isOffline || err.status >= 500) return true;
    endAdminSession();
    return false;
  }
}

/** วันหมดอายุของเซสชันโหมดในเครื่อง — ไม่มีเซิร์ฟเวอร์ให้หมดอายุกับใคร */
const FAR_FUTURE = '9999-12-31T00:00:00.000Z';

function adminLogEntry(su: { id: string; full_name: string } | null): LoginHistory {
  return {
    id: uid('log'),
    actor_id: su?.id ?? '-',
    actor_name: su?.full_name ?? 'admin',
    role: 'admin',
    at: nowStamp(),
    result: su ? 'success' : 'failed',
  };
}

export async function getLoginHistory(): Promise<LoginHistory[]> {
  return query((db) => db.login_history.slice(0, 100));
}

/** ── ข้อมูลหลัก ─────────────────────────────────────────── */

export async function getManagers(): Promise<Manager[]> {
  return query((db) => [...db.managers].sort((a, b) => a.manager_code.localeCompare(b.manager_code)));
}

export async function getManager(id: string): Promise<Manager | undefined> {
  return query((db) => db.managers.find((m) => m.id === id));
}

export async function saveManager(input: Partial<Manager> & { id?: string }, actor: string): Promise<Manager> {
  const saved = await mutate((db) => {
    if (input.id) {
      const idx = db.managers.findIndex((m) => m.id === input.id);
      const before = db.managers[idx];
      const next = { ...before, ...input } as Manager;
      db.managers[idx] = next;
      logDiff(db.change_history, 'managers', next.id, before, next, actor);
      return next;
    }
    const created: Manager = {
      id: uid('mgr'),
      manager_code: input.manager_code ?? '',
      full_name: input.full_name ?? '',
      full_name_en: input.full_name_en,
      department: input.department ?? '',
      position: input.position,
      avatar_url: input.avatar_url ?? null,
      is_active: input.is_active ?? true,
      dashboard_enabled: input.dashboard_enabled ?? true,
      // คนที่เพิ่มใหม่ยังล็อกอินไม่ได้จนกว่าจะเปิดสิทธิ์ให้ — ตรงกับฝั่ง Worker
      can_login: input.can_login ?? false,
      created_at: nowStamp(),
    };
    db.managers.push(created);
    db.change_history.unshift(entry('managers', created.id, 'create', null, created.full_name, actor));
    return created;
  });

  await queueWrite('manager.save', input.id ?? `new:${saved.id}`, {
    id: saved.id,
    manager_code: saved.manager_code,
    full_name: saved.full_name,
    full_name_en: saved.full_name_en,
    department: saved.department,
    position: saved.position,
    avatar_url: saved.avatar_url,
    is_active: saved.is_active,
    dashboard_enabled: saved.dashboard_enabled,
    can_login: saved.can_login,
  });
  return saved;
}

export async function getAreas(): Promise<Area[]> {
  return query((db) => db.areas);
}

export async function saveArea(input: Partial<Area> & { id?: string }, actor: string): Promise<Area> {
  const saved = await mutate((db) => {
    if (input.id) {
      const idx = db.areas.findIndex((a) => a.id === input.id);
      const before = db.areas[idx];
      const next = { ...before, ...input } as Area;
      db.areas[idx] = next;
      logDiff(db.change_history, 'areas', next.id, before, next, actor);
      return next;
    }
    const created: Area = {
      id: uid('ar'),
      area_name: input.area_name ?? '',
      area_name_en: input.area_name_en,
      parent_id: input.parent_id ?? null,
      department: input.department ?? '',
      is_active: input.is_active ?? true,
    };
    db.areas.push(created);
    db.change_history.unshift(entry('areas', created.id, 'create', null, created.area_name, actor));
    return created;
  });

  await queueWrite('area.save', input.id ?? `new:${saved.id}`, {
    id: saved.id,
    area_name: saved.area_name,
    area_name_en: saved.area_name_en,
    parent_id: saved.parent_id,
    department: saved.department,
    is_active: saved.is_active,
  });
  return saved;
}

export async function getThemes(): Promise<WalkTheme[]> {
  return query((db) => db.walk_themes);
}

export async function saveTheme(input: Partial<WalkTheme> & { id?: string }, actor: string): Promise<WalkTheme> {
  const saved = await mutate((db) => {
    if (input.id) {
      const idx = db.walk_themes.findIndex((t) => t.id === input.id);
      const before = db.walk_themes[idx];
      const next = { ...before, ...input } as WalkTheme;
      db.walk_themes[idx] = next;
      logDiff(db.change_history, 'walk_themes', next.id, before, next, actor);
      return next;
    }
    const created: WalkTheme = {
      id: uid('th'),
      theme_name: input.theme_name ?? '',
      theme_name_en: input.theme_name_en,
      is_active: input.is_active ?? true,
    };
    db.walk_themes.push(created);
    db.change_history.unshift(entry('walk_themes', created.id, 'create', null, created.theme_name, actor));
    return created;
  });

  await queueWrite('theme.save', input.id ?? `new:${saved.id}`, {
    id: saved.id,
    theme_name: saved.theme_name,
    theme_name_en: saved.theme_name_en,
    is_active: saved.is_active,
  });
  return saved;
}

export async function getSettings(): Promise<AppSettings> {
  return query((db) => db.app_settings);
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const saved = await mutate((db) => {
    db.app_settings = { ...db.app_settings, ...patch };
    return db.app_settings;
  });

  await queueWrite('settings.save', 'settings', patch);
  return saved;
}

/** ── แผนการเดิน ─────────────────────────────────────────── */

export async function getPlans(): Promise<GembaPlan[]> {
  return query((db) => db.gemba_plans);
}

export type PlanInput = {
  manager_id: string;
  plan_date: ISODate;
  plan_time: string;
  area_id: string;
  theme_ids: string[];
  note?: string;
};

export async function createPlan(input: PlanInput, actor: string): Promise<GembaPlan> {
  const created = await mutate((db) => {
    const created: GembaPlan = {
      id: uid('plan'),
      manager_id: input.manager_id,
      plan_date: input.plan_date,
      plan_time: input.plan_time,
      area_id: input.area_id,
      theme_ids: input.theme_ids.slice(0, 3),
      theme_id: input.theme_ids[0] ?? null,
      note: input.note ?? '',
      status: 'planned',
      created_at: nowStamp(),
    };
    db.gemba_plans.push(created);
    db.change_history.unshift(entry('gemba_plans', created.id, 'create', null, created.plan_date, actor));
    return created;
  });

  // ส่ง id ที่สร้างในเครื่องไปด้วย เพื่อให้ id สองฝั่งตรงกันหลังซิงก์
  await queueWrite('plan.create', created.id, {
    id: created.id,
    manager_id: created.manager_id,
    plan_date: created.plan_date,
    plan_time: created.plan_time,
    area_id: created.area_id,
    theme_ids: created.theme_ids,
    note: created.note,
  });
  return created;
}

export async function updatePlan(id: string, patch: Partial<GembaPlan>, actor: string): Promise<GembaPlan> {
  const next = await mutate((db) => {
    const idx = db.gemba_plans.findIndex((p) => p.id === id);
    const before = db.gemba_plans[idx];
    const next: GembaPlan = { ...before, ...patch };
    if (patch.theme_ids) {
      next.theme_ids = patch.theme_ids.slice(0, 3);
      next.theme_id = next.theme_ids[0] ?? null;
    }
    db.gemba_plans[idx] = next;
    logDiff(db.change_history, 'gemba_plans', id, before, next, actor);
    return next;
  });

  await queueWrite('plan.update', id, {
    manager_id: next.manager_id,
    plan_date: next.plan_date,
    plan_time: next.plan_time,
    area_id: next.area_id,
    theme_ids: next.theme_ids,
    note: next.note,
    status: next.status,
  });
  return next;
}

export async function cancelPlan(id: string, actor: string) {
  return updatePlan(id, { status: 'cancelled' }, actor);
}

/** ── บันทึกการเดิน ──────────────────────────────────────── */

export async function getRecords(): Promise<WalkRecord[]> {
  return query((db) => db.gemba_walk_records);
}

export type ChecklistAnswer = Pick<WalkChecklistResult, 'item_id' | 'result' | 'note'>;

export type RecordInput = {
  plan_id: string | null;
  /** ผลตรวจรายข้อของเช็คลิสต์ความปลอดภัย */
  checklist_results?: ChecklistAnswer[];
  manager_id: string;
  actual_date: ISODate;
  actual_time: string;
  actual_area_id: string;
  theme_ids: string[];
  observation: string;
  has_issue: boolean;
  issue_summary?: string;
  photo_urls: string[];
  participant_names: string[];
  ci_required?: boolean;
  ci_ticket_no?: string;
  ci_ticket_link?: string;
};

export async function createRecord(input: RecordInput, actor: string): Promise<WalkRecord> {
  const created = await mutate((db) => {
    const created: WalkRecord = {
      id: uid('rec'),
      plan_id: input.plan_id,
      manager_id: input.manager_id,
      actual_date: input.actual_date,
      actual_time: input.actual_time,
      actual_area_id: input.actual_area_id,
      theme_ids: input.theme_ids,
      observation: input.observation,
      has_issue: input.has_issue,
      issue_summary: input.issue_summary ?? '',
      photo_urls: input.photo_urls,
      participant_names: input.participant_names,
      ci_required: input.ci_required ?? false,
      ci_ticket_no: input.ci_ticket_no ?? '',
      ci_ticket_link: input.ci_ticket_link ?? '',
      completed_at: nowStamp(),
    };
    db.gemba_walk_records.push(created);

    // ผลตรวจเช็คลิสต์เก็บแยกตาราง เพราะต้องค้นย้อนกลับได้ว่า "ข้อนี้ตกที่ไหนบ้าง"
    for (const ans of input.checklist_results ?? []) {
      db.walk_checklist_results = db.walk_checklist_results.filter(
        (r) => !(r.record_id === created.id && r.item_id === ans.item_id),
      );
      db.walk_checklist_results.push({
        record_id: created.id,
        item_id: ans.item_id,
        result: ans.result,
        note: ans.note ?? '',
        finding_id: null,
      });
    }

    if (input.plan_id) {
      const p = db.gemba_plans.find((x) => x.id === input.plan_id);
      if (p) p.status = 'completed';
    }
    db.change_history.unshift(entry('gemba_walk_records', created.id, 'create', null, created.actual_date, actor));
    return created;
  });

  // รูปยังเป็นคีย์ local: อยู่ ตัวซิงก์จะอัปโหลดขึ้น R2 แล้วสลับคีย์ให้เอง
  await queueWrite('record.create', created.id, {
    id: created.id,
    plan_id: created.plan_id,
    manager_id: created.manager_id,
    actual_date: created.actual_date,
    actual_time: created.actual_time,
    actual_area_id: created.actual_area_id,
    theme_ids: created.theme_ids,
    observation: created.observation,
    has_issue: created.has_issue,
    issue_summary: created.issue_summary,
    photo_urls: created.photo_urls,
    participant_names: created.participant_names,
    checklist_results: input.checklist_results ?? [],
    ci_required: created.ci_required,
    ci_ticket_no: created.ci_ticket_no,
    ci_ticket_link: created.ci_ticket_link,
  });
  return created;
}

export async function updateRecord(id: string, patch: Partial<WalkRecord>, actor: string): Promise<WalkRecord> {
  const next = await mutate((db) => {
    const idx = db.gemba_walk_records.findIndex((r) => r.id === id);
    const before = db.gemba_walk_records[idx];
    const next: WalkRecord = { ...before, ...patch };
    db.gemba_walk_records[idx] = next;
    logDiff(db.change_history, 'gemba_walk_records', id, before, next, actor);

    // แก้หัวข้อการเดินย้อนหลัง = แก้ที่แผนด้วย เพื่อให้รายงานตรงกัน
    if (patch.theme_ids && before.plan_id) {
      const p = db.gemba_plans.find((x) => x.id === before.plan_id);
      if (p) {
        const pb = { ...p };
        p.theme_ids = patch.theme_ids.slice(0, 3);
        p.theme_id = p.theme_ids[0] ?? null;
        logDiff(db.change_history, 'gemba_plans', p.id, pb, p, actor);
      }
    }
    return next;
  });

  // ส่งเฉพาะฟิลด์ที่ผู้ใช้แก้จริง เพื่อไม่ให้ทับค่าที่คนอื่นเพิ่งแก้บนเซิร์ฟเวอร์
  const body: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) body[key] = (next as unknown as Record<string, unknown>)[key];
  await queueWrite('record.update', id, body);
  return next;
}

/** ── Audit trail ────────────────────────────────────────── */

export async function getChangeHistory(recordId?: string): Promise<ChangeHistory[]> {
  return query((db) =>
    recordId ? db.change_history.filter((c) => c.record_id === recordId) : db.change_history.slice(0, 300),
  );
}

function entry(
  table: string,
  recordId: string,
  action: ChangeHistory['action_type'],
  oldV: string | null,
  newV: string | null,
  actor: string,
  field?: string,
): ChangeHistory {
  return {
    id: uid('ch'),
    table_name: table,
    record_id: recordId,
    action_type: action,
    field,
    old_value: oldV,
    new_value: newV,
    changed_by: actor,
    changed_at: nowStamp(),
  };
}

const IGNORED_FIELDS = new Set(['id', 'created_at', 'completed_at']);

function logDiff(sink: ChangeHistory[], table: string, id: string, before: any, after: any, actor: string) {
  for (const key of Object.keys(after)) {
    if (IGNORED_FIELDS.has(key)) continue;
    const a = normalize(before?.[key]);
    const b = normalize(after[key]);
    if (a === b) continue;
    sink.unshift(entry(table, id, 'update', a, b, actor, key));
  }
}

function normalize(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

/** ── ประกาศประจำสัปดาห์ ─────────────────────────────────── */

export async function getWeeklyFocusList(): Promise<WeeklyFocus[]> {
  return query((db) => [...db.weekly_focus].sort((a, b) => b.week_start.localeCompare(a.week_start)));
}

export async function getActiveFocus(date: ISODate = todayISO()): Promise<WeeklyFocus | null> {
  return query(
    (db) =>
      db.weekly_focus.find((f) => f.is_active && f.week_start <= date && date <= f.week_end) ?? null,
  );
}

export async function saveWeeklyFocus(input: Partial<WeeklyFocus> & { id?: string }): Promise<WeeklyFocus> {
  const saved = await mutate((db) => {
    if (input.id) {
      const idx = db.weekly_focus.findIndex((f) => f.id === input.id);
      db.weekly_focus[idx] = { ...db.weekly_focus[idx], ...input } as WeeklyFocus;
      return db.weekly_focus[idx];
    }
    const created: WeeklyFocus = {
      id: uid('wf'),
      week_start: input.week_start!,
      week_end: input.week_end!,
      theme_ids: input.theme_ids ?? [],
      message_th: input.message_th ?? '',
      message_en: input.message_en ?? '',
      is_active: input.is_active ?? true,
    };
    db.weekly_focus.push(created);
    return created;
  });

  await queueWrite('focus.save', input.id ?? `new:${saved.id}`, {
    id: saved.id,
    week_start: saved.week_start,
    week_end: saved.week_end,
    theme_ids: saved.theme_ids,
    message_th: saved.message_th,
    message_en: saved.message_en,
    is_active: saved.is_active,
  });
  return saved;
}

/* ══════════════════════════════════════════════════════════════════════════
   งานความปลอดภัย — ใบแจ้งปัญหา · เช็คลิสต์ · สิทธิ์ผู้ใช้งาน

   ทุกฟังก์ชันเขียนลงสำเนาในเครื่องก่อนแล้วค่อยเข้าคิว เหมือนส่วนอื่นของไฟล์นี้
   ตรรกะการเปลี่ยนสถานะถูกเขียนซ้ำที่นี่โดยตั้งใจ ให้ตรงกับ worker/src/lib/safety.js
   เพราะผู้ใช้ต้องกดรับงาน/ปิดงานได้กลางโรงงานที่สัญญาณไม่ถึง แล้วค่อยซิงก์ทีหลัง
   เมื่อซิงก์แล้ว ผลจากเซิร์ฟเวอร์เป็นตัวจริงเสมอ (pull ทับสำเนาในเครื่อง)
   ══════════════════════════════════════════════════════════════════════════ */

/** ผู้ทำรายการ — ใบแจ้งต้องรู้ทั้ง id (ไว้ผูกคน) และชื่อ (ไว้แสดงในไทม์ไลน์) */
export interface Actor {
  id: string | null;
  name: string;
}

/* ── เช็คลิสต์ ─────────────────────────────────────────────────────────── */

export async function getChecklist(): Promise<SafetyChecklistItem[]> {
  return query((db) =>
    [...db.safety_checklist_items].sort(
      (a, b) => a.theme_id.localeCompare(b.theme_id) || a.sort_order - b.sort_order,
    ),
  );
}

export async function getChecklistResults(recordId?: string): Promise<WalkChecklistResult[]> {
  return query((db) =>
    recordId ? db.walk_checklist_results.filter((r) => r.record_id === recordId) : db.walk_checklist_results,
  );
}

export async function saveChecklistItem(
  input: Partial<SafetyChecklistItem> & { id?: string },
  actor: string,
): Promise<SafetyChecklistItem> {
  const saved = await mutate((db) => {
    if (input.id) {
      const idx = db.safety_checklist_items.findIndex((i) => i.id === input.id);
      const before = db.safety_checklist_items[idx];
      const next = { ...before, ...input } as SafetyChecklistItem;
      db.safety_checklist_items[idx] = next;
      logDiff(db.change_history, 'safety_checklist_items', next.id, before, next, actor);
      return next;
    }
    const created: SafetyChecklistItem = {
      id: uid('ck'),
      theme_id: input.theme_id ?? '',
      item_code: input.item_code ?? '',
      question: input.question ?? '',
      question_en: input.question_en,
      default_severity: input.default_severity ?? 'medium',
      sort_order: input.sort_order ?? 999,
      is_active: input.is_active ?? true,
    };
    db.safety_checklist_items.push(created);
    db.change_history.unshift(entry('safety_checklist_items', created.id, 'create', null, created.question, actor));
    return created;
  });

  await queueWrite('checklist.save', input.id ?? `new:${saved.id}`, { ...saved });
  return saved;
}

/* ── สิทธิ์ผู้ใช้งาน ────────────────────────────────────────────────────── */

export async function getRoles(): Promise<Role[]> {
  return query((db) => [...db.roles].sort((a, b) => a.sort_order - b.sort_order));
}

export async function getPermissions(): Promise<Permission[]> {
  return query((db) => [...db.permissions].sort((a, b) => a.sort_order - b.sort_order));
}

export async function getUserRoles(): Promise<UserRole[]> {
  return query((db) => db.user_roles);
}

/** เปลี่ยนชุดสิทธิ์ของบทบาท — ส่งมาทั้งชุด ไม่ใช่ทีละสิทธิ์ */
export async function setRolePermissions(roleId: string, permCodes: string[], actor: string): Promise<Role> {
  const saved = await mutate((db) => {
    const idx = db.roles.findIndex((r) => r.id === roleId);
    const before = db.roles[idx];
    const next: Role = { ...before, perm_codes: [...new Set(permCodes)] };
    db.roles[idx] = next;
    db.change_history.unshift(
      entry('roles', roleId, 'update', before.perm_codes.join(', '), next.perm_codes.join(', '), actor, 'permissions'),
    );
    return next;
  });

  await queueWrite('role.perms', roleId, { perm_codes: saved.perm_codes });
  return saved;
}

export async function addUserRole(
  input: { manager_id: string; role_id: string; scope_area_id?: string },
  actor: string,
): Promise<UserRole> {
  const created = await mutate((db) => {
    const role = db.roles.find((r) => r.id === input.role_id);
    const manager = db.managers.find((m) => m.id === input.manager_id);
    const scope = input.scope_area_id || '*';

    // ให้บทบาทเดิมซ้ำในขอบเขตเดิม = ไม่ต้องทำอะไร คืนแถวเดิมกลับไป
    const exist = db.user_roles.find(
      (ur) => ur.manager_id === input.manager_id && ur.role_id === input.role_id && ur.scope_area_id === scope,
    );
    if (exist) return exist;

    const row: UserRole = {
      id: uid('ur'),
      manager_id: input.manager_id,
      role_id: input.role_id,
      role_code: role?.role_code ?? '',
      scope_area_id: scope,
      granted_by: actor,
      granted_at: nowStamp(),
      full_name: manager?.full_name ?? '',
      manager_code: manager?.manager_code ?? '',
    };
    db.user_roles.push(row);
    db.change_history.unshift(
      entry('user_roles', row.id, 'create', null, `${manager?.full_name ?? ''} → ${role?.role_name ?? ''}`, actor),
    );
    return row;
  });

  await queueWrite('userRole.add', created.id, {
    id: created.id,
    manager_id: created.manager_id,
    role_id: created.role_id,
    scope_area_id: created.scope_area_id,
  });
  return created;
}

export async function removeUserRole(id: string, actor: string): Promise<void> {
  await mutate((db) => {
    const row = db.user_roles.find((ur) => ur.id === id);
    db.user_roles = db.user_roles.filter((ur) => ur.id !== id);
    if (row) {
      db.change_history.unshift(entry('user_roles', id, 'delete', row.full_name ?? row.manager_id, null, actor));
    }
  });
  await queueWrite('userRole.remove', id, {});
}

/* ── ใบแจ้งปัญหา ───────────────────────────────────────────────────────── */

export async function getFindings(): Promise<SafetyFinding[]> {
  return query((db) => db.safety_findings);
}

export async function getFinding(id: string): Promise<SafetyFinding | undefined> {
  return query((db) => db.safety_findings.find((f) => f.id === id));
}

export async function getFindingEvents(findingId?: string): Promise<FindingEvent[]> {
  return query((db) => {
    const rows = findingId ? db.finding_events.filter((e) => e.finding_id === findingId) : db.finding_events;
    return [...rows].sort((a, b) => a.at.localeCompare(b.at));
  });
}

export type FindingInput = {
  record_id?: string | null;
  area_id: string;
  theme_id?: string | null;
  checklist_item_id?: string | null;
  title: string;
  description?: string;
  severity: Severity;
  due_date?: ISODate;
  immediate_action?: string;
  before_photos: string[];
  assigned_manager_id?: string | null;
  assigned_supervisor_id?: string | null;
};

export async function createFinding(input: FindingInput, actor: Actor): Promise<SafetyFinding> {
  const created = await mutate((db) => {
    const now = nowStamp();
    const assigned = Boolean(input.assigned_manager_id || input.assigned_supervisor_id);
    const f: SafetyFinding = {
      id: uid('sf'),
      finding_no: newFindingNo(),
      record_id: input.record_id ?? null,
      area_id: input.area_id,
      theme_id: input.theme_id ?? null,
      checklist_item_id: input.checklist_item_id ?? null,
      title: input.title,
      description: input.description ?? '',
      severity: input.severity,
      status: assigned ? 'assigned' : 'open',
      reported_by: actor.id ?? '',
      reported_at: now,
      due_date: input.due_date ?? dueDateFor(input.severity, db.app_settings),
      immediate_action: input.immediate_action ?? '',
      assigned_manager_id: input.assigned_manager_id ?? null,
      assigned_supervisor_id: input.assigned_supervisor_id ?? null,
      assigned_at: assigned ? now : null,
      assigned_by: assigned ? actor.name : '',
      root_cause: '',
      action_taken: '',
      fixed_by: null,
      fixed_at: null,
      verified_by: null,
      verified_at: null,
      verify_note: '',
      closed_at: null,
      created_at: now,
      updated_at: now,
      before_photos: input.before_photos,
      after_photos: [],
    };
    db.safety_findings.unshift(f);
    db.finding_events.push(event(f.id, 'created', actor, f.title));
    if (assigned) {
      db.finding_events.push(event(f.id, 'assigned', actor, ''));
      notify(db, [f.assigned_manager_id, f.assigned_supervisor_id], actor, {
        finding_id: f.id,
        kind: 'assigned',
        title: `งานแก้ไขใหม่ ${f.finding_no}`,
        body: f.title,
      });
    }

    // ผูกใบแจ้งกลับไปที่ข้อตรวจที่ไม่ผ่าน เพื่อให้กดจากเช็คลิสต์มาดูใบได้
    if (f.record_id && f.checklist_item_id) {
      const r = db.walk_checklist_results.find(
        (x) => x.record_id === f.record_id && x.item_id === f.checklist_item_id,
      );
      if (r) r.finding_id = f.id;
    }
    return f;
  });

  await queueWrite('finding.create', created.id, {
    id: created.id,
    finding_no: created.finding_no,
    record_id: created.record_id,
    area_id: created.area_id,
    theme_id: created.theme_id,
    checklist_item_id: created.checklist_item_id,
    title: created.title,
    description: created.description,
    severity: created.severity,
    reported_by: created.reported_by,
    reported_at: created.reported_at,
    due_date: created.due_date,
    immediate_action: created.immediate_action,
    before_photos: created.before_photos,
    assigned_manager_id: created.assigned_manager_id,
    assigned_supervisor_id: created.assigned_supervisor_id,
    actor_id: actor.id,
    actor_name: actor.name,
  });
  return created;
}

export async function updateFinding(
  id: string,
  patch: Partial<SafetyFinding>,
  actor: Actor,
): Promise<SafetyFinding> {
  const next = await mutate((db) => {
    const idx = db.safety_findings.findIndex((f) => f.id === id);
    const before = db.safety_findings[idx];
    const updated: SafetyFinding = { ...before, ...patch, updated_at: nowStamp() };
    db.safety_findings[idx] = updated;
    logDiff(db.change_history, 'safety_findings', id, before, updated, actor.name);

    if (patch.severity && patch.severity !== before.severity) {
      db.finding_events.push(event(id, 'severity_changed', actor, `${before.severity} → ${patch.severity}`));
    } else if (patch.due_date && patch.due_date !== before.due_date) {
      db.finding_events.push(event(id, 'due_changed', actor, `${before.due_date} → ${patch.due_date}`));
    } else {
      db.finding_events.push(event(id, 'updated', actor, ''));
    }
    return updated;
  });

  const body: Record<string, unknown> = { actor_id: actor.id, actor_name: actor.name };
  for (const key of Object.keys(patch)) body[key] = (next as unknown as Record<string, unknown>)[key];
  await queueWrite('finding.update', id, body);
  return next;
}

/** จังหวะต่าง ๆ ของวงจรงาน — ชื่อตรงกับเส้นทาง POST /api/findings/:id/:action */
export type FindingAction =
  | 'assign' | 'start' | 'fix' | 'verify' | 'reject' | 'cancel' | 'reopen' | 'comment';

export interface FindingActionInput {
  note?: string;
  /** assign */
  assigned_manager_id?: string | null;
  assigned_supervisor_id?: string | null;
  due_date?: ISODate;
  /** fix */
  action_taken?: string;
  root_cause?: string;
  after_photos?: string[];
}

export async function actOnFinding(
  id: string,
  action: FindingAction,
  input: FindingActionInput,
  actor: Actor,
): Promise<SafetyFinding> {
  const next = await mutate((db) => {
    const idx = db.safety_findings.findIndex((f) => f.id === id);
    const before = db.safety_findings[idx];
    const now = nowStamp();
    const f: SafetyFinding = { ...before, updated_at: now };
    const note = input.note ?? '';

    switch (action) {
      case 'assign': {
        const reassign = Boolean(before.assigned_manager_id || before.assigned_supervisor_id);
        f.assigned_manager_id = input.assigned_manager_id ?? null;
        f.assigned_supervisor_id = input.assigned_supervisor_id ?? null;
        f.assigned_at = now;
        f.assigned_by = actor.name;
        if (input.due_date) f.due_date = input.due_date;
        // มอบหมายซ้ำระหว่างที่งานเดินอยู่แล้ว ไม่ต้องถอยสถานะกลับ
        f.status = before.status === 'open' ? 'assigned' : before.status;
        db.finding_events.push(event(id, reassign ? 'reassigned' : 'assigned', actor, note));
        notify(db, [f.assigned_manager_id, f.assigned_supervisor_id], actor, {
          finding_id: id,
          kind: 'assigned',
          title: `งานแก้ไข ${f.finding_no} ครบกำหนด ${f.due_date}`,
          body: f.title,
        });
        break;
      }
      case 'start':
        f.status = 'in_progress';
        db.finding_events.push(event(id, 'started', actor, note));
        break;
      case 'fix':
        f.status = 'fixed';
        f.action_taken = input.action_taken ?? '';
        f.root_cause = input.root_cause ?? f.root_cause;
        f.after_photos = input.after_photos ?? [];
        f.fixed_by = actor.id;
        f.fixed_at = now;
        db.finding_events.push(event(id, 'fixed', actor, note || f.action_taken));
        notify(db, [f.reported_by], actor, {
          finding_id: id,
          kind: 'fixed',
          title: `${f.finding_no} แก้ไขแล้ว รอตรวจรับ`,
          body: f.action_taken,
        });
        break;
      case 'verify':
        f.status = 'closed';
        f.verified_by = actor.id;
        f.verified_at = now;
        f.verify_note = note;
        f.closed_at = now;
        db.finding_events.push(event(id, 'verified', actor, note));
        db.finding_events.push(event(id, 'closed', actor, ''));
        notify(db, [f.assigned_manager_id, f.assigned_supervisor_id, f.fixed_by], actor, {
          finding_id: id,
          kind: 'closed',
          title: `${f.finding_no} ตรวจรับผ่าน ปิดงานแล้ว`,
          body: note,
        });
        break;
      case 'reject':
        f.status = 'in_progress';
        db.finding_events.push(event(id, 'rejected', actor, note));
        notify(db, [f.assigned_manager_id, f.assigned_supervisor_id, f.fixed_by], actor, {
          finding_id: id,
          kind: 'rejected',
          title: `${f.finding_no} ตรวจรับไม่ผ่าน ต้องแก้เพิ่ม`,
          body: note,
        });
        break;
      case 'cancel':
        f.status = 'cancelled';
        f.closed_at = now;
        db.finding_events.push(event(id, 'cancelled', actor, note));
        break;
      case 'reopen':
        f.status = f.assigned_manager_id || f.assigned_supervisor_id ? 'in_progress' : 'open';
        f.closed_at = null;
        f.verified_by = null;
        f.verified_at = null;
        f.verify_note = '';
        db.finding_events.push(event(id, 'reopened', actor, note));
        break;
      case 'comment':
        db.finding_events.push(event(id, 'comment', actor, note));
        break;
    }

    db.safety_findings[idx] = f;
    return f;
  });

  await queueWrite('finding.action', `${id}:${action}:${uid('a')}`, {
    finding_id: id,
    action,
    ...input,
    actor_id: actor.id,
    actor_name: actor.name,
  });
  return next;
}

/* ── กล่องแจ้งเตือน ────────────────────────────────────────────────────── */

export async function getNotifications(managerId?: string): Promise<AppNotification[]> {
  return query((db) => {
    const rows = managerId ? db.notifications.filter((n) => n.manager_id === managerId) : db.notifications;
    return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100);
  });
}

export async function markNotificationsRead(managerId: string): Promise<void> {
  const at = nowStamp();
  await mutate((db) => {
    for (const n of db.notifications) {
      if (n.manager_id === managerId && !n.read_at) n.read_at = at;
    }
  });
  await queueWrite('notify.read', managerId, { manager_id: managerId });
}

/* ── ตัวช่วยภายใน ─────────────────────────────────────────────────────── */

function event(findingId: string, type: FindingEventType, actor: Actor, note: string): FindingEvent {
  return {
    id: uid('fe'),
    finding_id: findingId,
    event_type: type,
    actor_id: actor.id ?? '',
    actor_name: actor.name,
    note,
    at: nowStamp(),
  };
}

/** ใส่งานเข้ากล่องของผู้รับผิดชอบ — ข้ามคนที่เป็นผู้ทำรายการเอง และกันแจ้งซ้ำคนเดียวกัน */
function notify(
  db: { notifications: AppNotification[] },
  ids: (string | null | undefined)[],
  actor: Actor,
  payload: { finding_id: string; kind: AppNotification['kind']; title: string; body: string },
) {
  const at = nowStamp();
  const targets = [...new Set(ids.filter((id): id is string => Boolean(id) && id !== actor.id))];
  for (const managerId of targets) {
    db.notifications.unshift({
      id: uid('nt'),
      manager_id: managerId,
      finding_id: payload.finding_id,
      kind: payload.kind,
      title: payload.title,
      body: payload.body,
      created_at: at,
      read_at: null,
    });
  }
}
