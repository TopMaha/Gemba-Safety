import type { Db } from './types';
import { buildAreas, buildManagers, buildSuperusers } from './roster';
import { SAFETY_THEMES, buildChecklist, buildPermissions, buildRoles } from './safetySeed';

/**
 * ข้อมูลตั้งต้นตอนเปิดแอปครั้งแรก — ทะเบียนผู้ใช้/พื้นที่/หมวด/เช็คลิสต์/บทบาทเท่านั้น
 *
 * ไม่มีแผน ไม่มีบันทึกการเดิน ไม่มีประวัติใด ๆ ทั้งสิ้น ระบบเริ่มจากศูนย์จริง
 * ทะเบียนผู้ใช้และพื้นที่อยู่ใน src/lib/roster.ts ซึ่งสร้างจากฐานข้อมูล PSIF
 */

export function buildSeedDb(): Db {
  return {
    _version: 1,
    managers: buildManagers(new Date().toISOString()),
    superusers: buildSuperusers(),
    areas: buildAreas(),
    walk_themes: SAFETY_THEMES,
    gemba_plans: [],
    gemba_walk_records: [],
    change_history: [],
    weekly_focus: [],
    login_history: [],

    // ── สิทธิ์ผู้ใช้งาน ──
    // roles/permissions มีค่าตั้งต้นให้ครบ ส่วน user_roles ตั้งใจเว้นว่าง
    // ระหว่างที่ยังว่าง ทุกคนที่ล็อกอินได้จะได้บทบาทตาม default_role_code
    roles: buildRoles(),
    permissions: buildPermissions(),
    user_roles: [],

    // ── งานความปลอดภัย ──
    safety_checklist_items: buildChecklist(),
    walk_checklist_results: [],
    safety_findings: [],
    finding_events: [],
    notifications: [],

    app_settings: {
      weekly_target: 1,
      recent_visit_days: 7,
      company_name: 'TENNECO',
      plant_name: 'TENNECO',
      default_role_code: 'inspector',
      due_days_low: 30,
      due_days_medium: 14,
      due_days_high: 3,
      due_days_critical: 1,
      require_after_photo: true,
    },
  };
}
