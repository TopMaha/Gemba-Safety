/**
 * แปลงแถวจาก D1 ให้เป็นรูปร่างเดียวกับ src/lib/types.ts ของ frontend
 *
 * ที่ต้องแปลงมี 2 เรื่อง
 *   1. boolean — SQLite เก็บเป็น 0/1 แต่ frontend คาดหวัง true/false
 *   2. อาร์เรย์ — เก็บแยกในตารางลูก ต้องประกอบกลับเป็นอาร์เรย์
 *
 * ⚠️ กติกาสำคัญ: group_concat ต้องมี ORDER BY sort_order เสมอ
 * ไม่งั้นลำดับหัวข้อจะสลับ แล้ว theme_ids[0] (หัวข้อหลักที่หน้าจอใช้) จะเพี้ยน
 */

/** แยกผลของ group_concat กลับเป็นอาร์เรย์ (คืนอาร์เรย์ว่างเมื่อไม่มีสมาชิก) */
function splitList(v) {
  if (v === null || v === undefined || v === '') return [];
  return String(v).split(SEP).filter((s) => s !== '');
}

/**
 * ตัวคั่นที่ใช้ใน group_concat — ใช้ 0x01 แทนจุลภาค
 * เพราะชื่อผู้ร่วมเดินมีจุลภาคปนได้ ถ้าใช้ ',' จะแยกผิด
 */
const SEP = '\u0001';

export const toBool = (v) => v === 1 || v === true;

export function mapManager(r) {
  return {
    id: r.id,
    manager_code: r.manager_code,
    full_name: r.full_name,
    full_name_en: r.full_name_en ?? undefined,
    department: r.department,
    position: r.position ?? undefined,
    avatar_url: r.avatar_url ?? null,
    is_active: toBool(r.is_active),
    dashboard_enabled: toBool(r.dashboard_enabled),
    can_login: toBool(r.can_login),
    created_at: r.created_at,
  };
}

export function mapArea(r) {
  return {
    id: r.id,
    area_name: r.area_name,
    area_name_en: r.area_name_en ?? undefined,
    parent_id: r.parent_id ?? null,
    department: r.department,
    is_active: toBool(r.is_active),
  };
}

export function mapTheme(r) {
  return {
    id: r.id,
    theme_name: r.theme_name,
    theme_name_en: r.theme_name_en ?? undefined,
    is_active: toBool(r.is_active),
  };
}

export function mapPlan(r) {
  const theme_ids = splitList(r.theme_ids);
  return {
    id: r.id,
    manager_id: r.manager_id,
    plan_date: r.plan_date,
    plan_time: r.plan_time,
    area_id: r.area_id,
    theme_ids,
    // frontend ยังมีฟิลด์นี้ในชนิดข้อมูล แต่ไม่มีหน้าจอไหนอ่าน
    // จึงคำนวณตอนส่งออกแทนการเก็บซ้ำในฐานข้อมูล (กันหลุด sync)
    theme_id: theme_ids[0] ?? null,
    note: r.note ?? '',
    status: r.status,
    created_at: r.created_at,
  };
}

export function mapRecord(r) {
  return {
    id: r.id,
    plan_id: r.plan_id ?? null,
    manager_id: r.manager_id,
    actual_date: r.actual_date,
    actual_time: r.actual_time,
    actual_area_id: r.actual_area_id,
    theme_ids: splitList(r.theme_ids),
    observation: r.observation ?? '',
    has_issue: toBool(r.has_issue),
    issue_summary: r.issue_summary ?? '',
    photo_urls: splitList(r.photo_urls),
    participant_names: splitList(r.participant_names),
    ci_required: toBool(r.ci_required),
    ci_ticket_no: r.ci_ticket_no ?? '',
    ci_ticket_link: r.ci_ticket_link ?? '',
    completed_at: r.completed_at,
  };
}

export function mapFocus(r) {
  return {
    id: r.id,
    week_start: r.week_start,
    week_end: r.week_end,
    theme_ids: splitList(r.theme_ids),
    message_th: r.message_th ?? '',
    message_en: r.message_en ?? '',
    is_active: toBool(r.is_active),
  };
}

export function mapChange(r) {
  return {
    id: r.id,
    table_name: r.table_name,
    record_id: r.record_id,
    action_type: r.action_type,
    field: r.field ?? undefined,
    old_value: r.old_value ?? null,
    new_value: r.new_value ?? null,
    changed_by: r.changed_by,
    changed_at: r.changed_at,
  };
}

export function mapLogin(r) {
  return {
    id: r.id,
    actor_id: r.actor_id,
    actor_name: r.actor_name,
    role: r.role,
    at: r.at,
    result: r.result,
  };
}

export function mapSettings(r) {
  return {
    weekly_target: r.weekly_target,
    recent_visit_days: r.recent_visit_days,
    company_name: r.company_name,
    plant_name: r.plant_name,
    default_role_code: r.default_role_code ?? 'inspector',
    due_days_low: r.due_days_low ?? 30,
    due_days_medium: r.due_days_medium ?? 14,
    due_days_high: r.due_days_high ?? 3,
    due_days_critical: r.due_days_critical ?? 1,
    require_after_photo: toBool(r.require_after_photo ?? 1),
  };
}

/* ── โดเมนความปลอดภัย ─────────────────────────────────────────────────── */

export function mapChecklistItem(r) {
  return {
    id: r.id,
    theme_id: r.theme_id,
    item_code: r.item_code ?? '',
    question: r.question,
    question_en: r.question_en ?? undefined,
    default_severity: r.default_severity ?? 'medium',
    sort_order: r.sort_order ?? 0,
    is_active: toBool(r.is_active),
  };
}

export function mapFinding(r) {
  return {
    id: r.id,
    finding_no: r.finding_no,
    record_id: r.record_id ?? null,
    area_id: r.area_id,
    theme_id: r.theme_id ?? null,
    checklist_item_id: r.checklist_item_id ?? null,
    title: r.title,
    description: r.description ?? '',
    severity: r.severity,
    status: r.status,
    reported_by: r.reported_by,
    reported_at: r.reported_at,
    due_date: r.due_date,
    immediate_action: r.immediate_action ?? '',
    assigned_manager_id: r.assigned_manager_id ?? null,
    assigned_supervisor_id: r.assigned_supervisor_id ?? null,
    assigned_at: r.assigned_at ?? null,
    assigned_by: r.assigned_by ?? '',
    root_cause: r.root_cause ?? '',
    action_taken: r.action_taken ?? '',
    fixed_by: r.fixed_by ?? null,
    fixed_at: r.fixed_at ?? null,
    verified_by: r.verified_by ?? null,
    verified_at: r.verified_at ?? null,
    verify_note: r.verify_note ?? '',
    closed_at: r.closed_at ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
    before_photos: splitList(r.before_photos),
    after_photos: splitList(r.after_photos),
  };
}

export function mapFindingEvent(r) {
  return {
    id: r.id,
    finding_id: r.finding_id,
    event_type: r.event_type,
    actor_id: r.actor_id ?? '',
    actor_name: r.actor_name ?? '',
    note: r.note ?? '',
    at: r.at,
  };
}

export function mapNotification(r) {
  return {
    id: r.id,
    manager_id: r.manager_id,
    finding_id: r.finding_id ?? null,
    kind: r.kind ?? 'assigned',
    title: r.title,
    body: r.body ?? '',
    created_at: r.created_at,
    read_at: r.read_at ?? null,
  };
}

export function mapRole(r) {
  return {
    id: r.id,
    role_code: r.role_code,
    role_name: r.role_name,
    role_name_en: r.role_name_en ?? undefined,
    description: r.description ?? '',
    is_system: toBool(r.is_system),
    sort_order: r.sort_order ?? 0,
    perm_codes: splitList(r.perm_codes),
  };
}

export function mapUserRole(r) {
  return {
    id: r.id,
    manager_id: r.manager_id,
    role_id: r.role_id,
    role_code: r.role_code ?? '',
    scope_area_id: r.scope_area_id ?? '*',
    granted_by: r.granted_by ?? '',
    granted_at: r.granted_at,
    // แถมชื่อคนมาด้วยเพื่อให้หน้าทะเบียนสิทธิ์แสดงได้โดยไม่ต้อง join ฝั่งหน้าจอ
    full_name: r.full_name ?? '',
    manager_code: r.manager_code ?? '',
  };
}

/* ── ชิ้นส่วน SQL ที่ใช้ซ้ำ ────────────────────────────────────────────── */

/** แผน + หัวข้อที่ประกอบกลับแล้ว (เรียงตาม sort_order) */
export const PLAN_SELECT = `
  SELECT p.*,
         (SELECT group_concat(pt.theme_id, char(1) ORDER BY pt.sort_order)
            FROM plan_themes pt WHERE pt.plan_id = p.id) AS theme_ids
    FROM gemba_plans p`;

/** บันทึกการเดิน + หัวข้อ + รูป + ผู้ร่วมเดิน */
export const RECORD_SELECT = `
  SELECT r.*,
         (SELECT group_concat(rt.theme_id, char(1) ORDER BY rt.sort_order)
            FROM record_themes rt WHERE rt.record_id = r.id) AS theme_ids,
         (SELECT group_concat(rp.photo_key, char(1) ORDER BY rp.sort_order)
            FROM record_photos rp WHERE rp.record_id = r.id) AS photo_urls,
         (SELECT group_concat(pa.participant_name, char(1) ORDER BY pa.sort_order)
            FROM record_participants pa WHERE pa.record_id = r.id) AS participant_names
    FROM gemba_walk_records r`;

export const FOCUS_SELECT = `
  SELECT f.*,
         (SELECT group_concat(ft.theme_id, char(1))
            FROM focus_themes ft WHERE ft.focus_id = f.id) AS theme_ids
    FROM weekly_focus f`;

/** ใบแจ้งปัญหา + รูปก่อนแก้/หลังแก้ที่ประกอบกลับแล้ว */
export const FINDING_SELECT = `
  SELECT f.*,
         (SELECT group_concat(p.photo_key, char(1) ORDER BY p.sort_order)
            FROM finding_photos p WHERE p.finding_id = f.id AND p.phase = 'before') AS before_photos,
         (SELECT group_concat(p.photo_key, char(1) ORDER BY p.sort_order)
            FROM finding_photos p WHERE p.finding_id = f.id AND p.phase = 'after') AS after_photos
    FROM safety_findings f`;
