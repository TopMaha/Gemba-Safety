import { GEMBA_TOPICS, buildGembaChecklist } from './gembaTopics';
import type { Permission, Role, SafetyChecklistItem, WalkTheme } from './types';

/**
 * ── ข้อมูลตั้งต้นของงานความปลอดภัย (สำเนาในเครื่อง) ──────────────────────
 *
 * ⚠️ ไฟล์นี้ต้องตรงกับ worker/seed-safety.sql และ worker/seed-gemba-topics.sql เสมอ — id เดียวกันทุกแถว
 *    ถ้าแก้ที่ไฟล์หนึ่งต้องแก้อีกไฟล์ด้วย ไม่งั้นเครื่องที่ยังไม่ได้ซิงก์จะเห็น
 *    ข้อตรวจคนละชุดกับเซิร์ฟเวอร์ แล้วผลตรวจจะอ้าง item_id ที่เซิร์ฟเวอร์ไม่รู้จัก
 *
 *    ข้อมูลชุดนี้เป็นแค่ค่าตั้งต้นสำหรับเปิดแอปครั้งแรกตอนยังไม่มีเน็ต
 *    เมื่อซิงก์สำเร็จ ข้อมูลจากเซิร์ฟเวอร์จะทับทั้งหมด (ดู src/lib/sync.ts)
 */

/**
 * หัวข้อ GEMBA WALK 13 หมวด — หนึ่งหมวดคือเอกสาร Excel หนึ่งไฟล์ในโฟลเดอร์ "รายการที่ต้องตรวจสอบ"
 * ข้อมูลจริงอยู่ใน ./gembaTopics.ts (ตรงกับ worker/seed-gemba-topics.sql)
 */
export const SAFETY_THEMES: WalkTheme[] = GEMBA_TOPICS;

/** ข้อตรวจ 151 ข้อของทั้ง 13 หมวด (คำถามทางเทคนิค + คำถามความผูกพันของพนักงาน) */
export function buildChecklist(): SafetyChecklistItem[] {
  return buildGembaChecklist();
}

/** [perm_code, กลุ่ม, ชื่อไทย, ชื่ออังกฤษ] */
const PERMS: [string, Permission['perm_group'], string, string][] = [
  ['walk.plan', 'walk', 'วางแผนการเดินตรวจ', 'Create walk plans'],
  ['walk.record', 'walk', 'บันทึกผลการเดินตรวจ', 'Record walks'],
  ['finding.create', 'finding', 'เปิดใบแจ้งปัญหา', 'Report findings'],
  ['finding.edit', 'finding', 'แก้ไขรายละเอียดใบแจ้ง', 'Edit findings'],
  ['finding.assign', 'finding', 'มอบหมายผู้รับผิดชอบ', 'Assign findings'],
  ['finding.fix', 'finding', 'บันทึกการแก้ไข + แนบรูปหลังแก้', 'Submit corrective action'],
  ['finding.verify', 'finding', 'ตรวจรับและปิดงาน', 'Verify & close'],
  ['finding.cancel', 'finding', 'ยกเลิกใบแจ้ง', 'Cancel findings'],
  ['finding.comment', 'finding', 'แสดงความเห็นในใบแจ้ง', 'Comment on findings'],
  ['finding.view_all', 'finding', 'เห็นใบแจ้งของทุกพื้นที่', 'View all findings'],
  ['dashboard.view', 'view', 'ดูแดชบอร์ดภาพรวม', 'View dashboard'],
  ['report.view', 'view', 'ดูรายงาน', 'View reports'],
  ['report.export', 'view', 'ส่งออกรายงาน CSV', 'Export CSV'],
  ['admin.master', 'admin', 'จัดการพื้นที่ · หมวด · เช็คลิสต์', 'Manage master data'],
  ['admin.users', 'admin', 'จัดการทะเบียนผู้ใช้', 'Manage users'],
  ['admin.roles', 'admin', 'กำหนดสิทธิ์ผู้ใช้งาน', 'Manage roles'],
  ['admin.settings', 'admin', 'ตั้งค่าระบบ', 'System settings'],
];

export function buildPermissions(): Permission[] {
  return PERMS.map(([perm_code, perm_group, perm_name, perm_name_en], i) => ({
    perm_code,
    perm_group,
    perm_name,
    perm_name_en,
    sort_order: (i + 1) * 10,
  }));
}

const ALL_PERMS = PERMS.map(([code]) => code);

const SAFETY_PERMS = [
  'walk.plan', 'walk.record',
  'finding.create', 'finding.edit', 'finding.assign', 'finding.fix',
  'finding.verify', 'finding.cancel', 'finding.comment', 'finding.view_all',
  'dashboard.view', 'report.view', 'report.export', 'admin.master',
];

const MANAGER_PERMS = [
  'walk.plan', 'walk.record',
  'finding.create', 'finding.edit', 'finding.assign', 'finding.fix',
  'finding.comment', 'finding.view_all',
  'dashboard.view', 'report.view', 'report.export',
];

const SUPERVISOR_PERMS = ['walk.record', 'finding.create', 'finding.fix', 'finding.comment', 'dashboard.view'];

const INSPECTOR_PERMS = ['walk.plan', 'walk.record', 'finding.create', 'finding.comment', 'dashboard.view'];

export function buildRoles(): Role[] {
  return [
    {
      id: 'role_admin', role_code: 'admin', role_name: 'ผู้ดูแลระบบ', role_name_en: 'Administrator',
      description: 'ทำได้ทุกอย่าง รวมถึงกำหนดสิทธิ์ให้คนอื่น',
      is_system: true, sort_order: 10, perm_codes: ALL_PERMS,
    },
    {
      id: 'role_safety', role_code: 'safety', role_name: 'เจ้าหน้าที่ความปลอดภัย (จป.)', role_name_en: 'Safety Officer',
      description: 'ตรวจ · มอบหมาย · ตรวจรับปิดงาน และดูได้ทุกพื้นที่',
      is_system: true, sort_order: 20, perm_codes: SAFETY_PERMS,
    },
    {
      id: 'role_manager', role_code: 'manager', role_name: 'ผู้จัดการ', role_name_en: 'Manager',
      description: 'รับงานที่ถูกมอบหมาย มอบหมายต่อให้หัวหน้างาน และเห็นใบแจ้งทุกพื้นที่',
      is_system: true, sort_order: 30, perm_codes: MANAGER_PERMS,
    },
    {
      id: 'role_supervisor', role_code: 'supervisor', role_name: 'หัวหน้างาน', role_name_en: 'Supervisor',
      description: 'รับงานที่ถูกมอบหมาย ลงมือแก้ไข และแนบรูปหลังแก้',
      is_system: true, sort_order: 40, perm_codes: SUPERVISOR_PERMS,
    },
    {
      id: 'role_inspector', role_code: 'inspector', role_name: 'ผู้เดินตรวจ', role_name_en: 'Inspector',
      description: 'วางแผน เดินตรวจ และเปิดใบแจ้งปัญหา — บทบาทตั้งต้นของผู้ใช้ทั่วไป',
      is_system: true, sort_order: 50, perm_codes: INSPECTOR_PERMS,
    },
    {
      id: 'role_viewer', role_code: 'viewer', role_name: 'ผู้ดูอย่างเดียว', role_name_en: 'Viewer',
      description: 'ดูแดชบอร์ดและรายงานได้ แต่แก้ไขอะไรไม่ได้',
      is_system: true, sort_order: 60, perm_codes: ['dashboard.view', 'report.view'],
    },
  ];
}
