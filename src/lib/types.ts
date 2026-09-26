import type { ISODate } from './time';

/**
 * ทะเบียนพนักงาน — ไม่ใช่ทุกคนที่ล็อกอินได้ (ดู can_login)
 * คนที่ล็อกอินไม่ได้ยังต้องอยู่ในทะเบียน เพราะถูกเลือกเป็น "ผู้ร่วมเดิน" ได้
 */
export interface Manager {
  id: string;
  manager_code: string;
  full_name: string;
  full_name_en?: string;
  department: string;
  position?: string;
  avatar_url?: string | null;
  /** ยังเป็นพนักงานอยู่ไหม — ลาออกแล้วปิด */
  is_active: boolean;
  /** เห็นภาพรวมทั้งโรงงาน หรือเห็นแค่ของตัวเอง */
  dashboard_enabled: boolean;
  /** ได้รับสิทธิ์เข้าใช้แอปหรือไม่ — ผู้ดูแลระบบกำหนดเป็นรายคน */
  can_login: boolean;
  created_at: string;
}

export interface Superuser {
  id: string;
  admin_code: string;
  full_name: string;
}

export interface Area {
  id: string;
  area_name: string;
  area_name_en?: string;
  parent_id: string | null;
  department: string;
  is_active: boolean;
}

export interface WalkTheme {
  id: string;
  theme_name: string;
  theme_name_en?: string;
  color?: string;
  is_active: boolean;
}

export type PlanStatus = 'planned' | 'completed' | 'cancelled';

export interface GembaPlan {
  id: string;
  manager_id: string;
  plan_date: ISODate;
  plan_time: string; // HH:mm
  area_id: string;
  /** หัวข้อที่ใช้งานจริง (สูงสุด 3) */
  theme_ids: string[];
  /** ค่าเดียว คงไว้เพื่อความเข้ากันได้กับโค้ดเดิม */
  theme_id: string | null;
  note?: string;
  status: PlanStatus;
  created_at: string;
}

export interface WalkRecord {
  id: string;
  plan_id: string | null; // null = Ad-hoc
  manager_id: string;
  actual_date: ISODate;
  actual_time: string;
  actual_area_id: string;
  /** สำหรับ Ad-hoc ที่ไม่มีแผน — เก็บหัวข้อไว้ในเรคคอร์ดเอง */
  theme_ids: string[];
  observation: string;
  has_issue: boolean;
  issue_summary?: string;
  photo_urls: string[];
  participant_names: string[];
  ci_required: boolean;
  ci_ticket_no?: string;
  ci_ticket_link?: string;
  completed_at: string;
}

export type ChangeAction = 'create' | 'update' | 'delete';

export interface ChangeHistory {
  id: string;
  table_name: string;
  record_id: string;
  action_type: ChangeAction;
  field?: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string;
  changed_at: string;
}

export interface WeeklyFocus {
  id: string;
  week_start: ISODate;
  week_end: ISODate;
  theme_ids: string[];
  message_th: string;
  message_en: string;
  is_active: boolean;
}

export interface LoginHistory {
  id: string;
  actor_id: string;
  actor_name: string;
  role: 'manager' | 'admin';
  at: string;
  result: 'success' | 'failed';
}

export interface AppSettings {
  /** จำนวนครั้งขั้นต่ำที่ทุกคนต้องเดินต่อสัปดาห์ */
  weekly_target: number;
  /** เตือนเมื่อพื้นที่ถูกเดินภายในกี่วัน */
  recent_visit_days: number;
  company_name: string;
  plant_name: string;

  /**
   * บทบาทที่ให้อัตโนมัติกับคนที่ยังไม่ถูกใส่ไว้ในทะเบียนสิทธิ์ (user_roles)
   * ตั้งเป็น 'viewer' เมื่อกรอกทะเบียนครบแล้ว ระบบจะกลายเป็นปิดโดยปริยาย
   */
  default_role_code: string;
  /** จำนวนวันที่ให้แก้ไข นับจากวันที่พบ — แยกตามระดับความรุนแรง */
  due_days_low: number;
  due_days_medium: number;
  due_days_high: number;
  due_days_critical: number;
  /** บังคับแนบรูปหลังแก้ไขก่อนส่งตรวจรับ */
  require_after_photo: boolean;
}

export interface Db {
  managers: Manager[];
  /** สิทธิ์ผู้ใช้งาน — ดู src/lib/permissions.ts สำหรับวิธีคิดสิทธิ์รวม */
  roles: Role[];
  permissions: Permission[];
  user_roles: UserRole[];
  /** งานความปลอดภัย */
  safety_checklist_items: SafetyChecklistItem[];
  walk_checklist_results: WalkChecklistResult[];
  safety_findings: SafetyFinding[];
  finding_events: FindingEvent[];
  notifications: AppNotification[];
  superusers: Superuser[];
  areas: Area[];
  walk_themes: WalkTheme[];
  gemba_plans: GembaPlan[];
  gemba_walk_records: WalkRecord[];
  change_history: ChangeHistory[];
  weekly_focus: WeeklyFocus[];
  login_history: LoginHistory[];
  app_settings: AppSettings;
  _version: number;
}

/* ══════════════════════════════════════════════════════════════════════════
   สิทธิ์ผู้ใช้งาน (RBAC)

   สามชั้นตามแบบมาตรฐาน: permission → role → user
   ตาราง user_roles ตั้งใจเว้นว่างไว้ให้กรอกทีหลังที่หน้า /admin/roles
   ระหว่างที่ยังว่าง ทุกคนที่ล็อกอินได้จะได้บทบาทตาม settings.default_role_code
   ══════════════════════════════════════════════════════════════════════════ */

/** รหัสสิทธิ์ที่ระบบรู้จัก — ตรงกับตาราง permissions ใน worker/seed-safety.sql */
export type PermCode =
  | 'walk.plan' | 'walk.record'
  | 'finding.create' | 'finding.edit' | 'finding.assign' | 'finding.fix'
  | 'finding.verify' | 'finding.cancel' | 'finding.comment' | 'finding.view_all'
  | 'dashboard.view' | 'report.view' | 'report.export'
  | 'admin.master' | 'admin.users' | 'admin.roles' | 'admin.settings';

export interface Permission {
  perm_code: string;
  perm_group: 'walk' | 'finding' | 'view' | 'admin' | string;
  perm_name: string;
  perm_name_en?: string;
  sort_order: number;
}

export interface Role {
  id: string;
  role_code: string;
  role_name: string;
  role_name_en?: string;
  description: string;
  /** บทบาทของระบบ ห้ามลบ */
  is_system: boolean;
  sort_order: number;
  perm_codes: string[];
}

export interface UserRole {
  id: string;
  manager_id: string;
  role_id: string;
  role_code: string;
  /** '*' = ทั้งโรงงาน · ใส่ id พื้นที่เพื่อจำกัดขอบเขต */
  scope_area_id: string;
  granted_by: string;
  granted_at: string;
  /** แถมมาจาก API เพื่อให้หน้าทะเบียนแสดงชื่อได้โดยไม่ต้อง join เอง */
  full_name?: string;
  manager_code?: string;
}

/* ══════════════════════════════════════════════════════════════════════════
   งานความปลอดภัย
   ══════════════════════════════════════════════════════════════════════════ */

/** ระดับความรุนแรง — กำหนดวันครบกำหนดแก้ไขและสีของป้าย */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

/**
 * สถานะของใบแจ้งปัญหา
 *   open → assigned → in_progress → fixed → closed
 *   ตรวจรับไม่ผ่าน (reject) = ถอยกลับไป in_progress
 */
export type FindingStatus = 'open' | 'assigned' | 'in_progress' | 'fixed' | 'closed' | 'cancelled';

export type ChecklistResultValue = 'pass' | 'fail' | 'na';

/** ข้อตรวจในแม่แบบเช็คลิสต์ — ผูกกับหมวดความปลอดภัย (walk_themes) */
export interface SafetyChecklistItem {
  id: string;
  theme_id: string;
  item_code: string;
  question: string;
  question_en?: string;
  /** ความรุนแรงตั้งต้นเมื่อข้อนี้ไม่ผ่าน */
  default_severity: Severity;
  sort_order: number;
  is_active: boolean;
}

/** ผลตรวจรายข้อของการเดินหนึ่งครั้ง */
export interface WalkChecklistResult {
  record_id: string;
  item_id: string;
  result: ChecklistResultValue;
  note: string;
  /** ใบแจ้งที่เปิดจากข้อนี้ (ถ้ามี) */
  finding_id?: string | null;
}

export interface SafetyFinding {
  id: string;
  /** เลขที่ใบแจ้ง เช่น SF-20260906-A3F1 */
  finding_no: string;
  /** การเดินที่พบปัญหานี้ — null = แจ้งตรงโดยไม่ได้มาจากการเดิน */
  record_id: string | null;
  area_id: string;
  theme_id: string | null;
  checklist_item_id: string | null;

  title: string;
  description: string;
  severity: Severity;
  status: FindingStatus;

  reported_by: string;
  reported_at: string;
  due_date: ISODate;
  /** สิ่งที่ทำทันทีหน้างานเพื่อกันอันตรายเฉพาะหน้า */
  immediate_action: string;

  assigned_manager_id: string | null;
  assigned_supervisor_id: string | null;
  assigned_at: string | null;
  assigned_by: string;

  root_cause: string;
  action_taken: string;
  fixed_by: string | null;
  fixed_at: string | null;

  verified_by: string | null;
  verified_at: string | null;
  verify_note: string;
  closed_at: string | null;

  created_at: string;
  updated_at: string;

  /** รูปตอนพบปัญหา */
  before_photos: string[];
  /** รูปหลังแก้ไข — หลักฐานปิดงาน */
  after_photos: string[];
}

export type FindingEventType =
  | 'created' | 'assigned' | 'reassigned' | 'started' | 'fixed'
  | 'rejected' | 'verified' | 'closed' | 'cancelled' | 'reopened'
  | 'comment' | 'due_changed' | 'severity_changed' | 'updated';

export interface FindingEvent {
  id: string;
  finding_id: string;
  event_type: FindingEventType;
  actor_id: string;
  actor_name: string;
  note: string;
  at: string;
}

/**
 * กล่องงานของผู้รับผิดชอบ
 * ชื่อขึ้นต้นด้วย App เพราะ Notification เป็นชื่อที่ DOM ใช้อยู่แล้ว
 */
export interface AppNotification {
  id: string;
  manager_id: string;
  finding_id: string | null;
  kind: 'assigned' | 'fixed' | 'rejected' | 'closed' | 'reopened' | string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
}
