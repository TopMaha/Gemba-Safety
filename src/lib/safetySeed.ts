import type { Permission, Role, SafetyChecklistItem, Severity, WalkTheme } from './types';

/**
 * ── ข้อมูลตั้งต้นของงานความปลอดภัย (สำเนาในเครื่อง) ──────────────────────
 *
 * ⚠️ ไฟล์นี้ต้องตรงกับ worker/seed-safety.sql เสมอ — id เดียวกันทุกแถว
 *    ถ้าแก้ที่ไฟล์หนึ่งต้องแก้อีกไฟล์ด้วย ไม่งั้นเครื่องที่ยังไม่ได้ซิงก์จะเห็น
 *    ข้อตรวจคนละชุดกับเซิร์ฟเวอร์ แล้วผลตรวจจะอ้าง item_id ที่เซิร์ฟเวอร์ไม่รู้จัก
 *
 *    ข้อมูลชุดนี้เป็นแค่ค่าตั้งต้นสำหรับเปิดแอปครั้งแรกตอนยังไม่มีเน็ต
 *    เมื่อซิงก์สำเร็จ ข้อมูลจากเซิร์ฟเวอร์จะทับทั้งหมด (ดู src/lib/sync.ts)
 */

/** หมวดตรวจความปลอดภัย 12 หมวด — ตรงกับ walk_themes ใน worker/seed.sql */
export const SAFETY_THEMES: WalkTheme[] = [
  { id: 'th_01', theme_name: '01-อุปกรณ์ป้องกันส่วนบุคคล (PPE)', theme_name_en: '01-Personal Protective Equipment', is_active: true },
  { id: 'th_02', theme_name: '02-การ์ดเครื่องจักรและจุดหนีบ', theme_name_en: '02-Machine Guarding', is_active: true },
  { id: 'th_03', theme_name: '03-ระบบไฟฟ้า', theme_name_en: '03-Electrical Safety', is_active: true },
  { id: 'th_04', theme_name: '04-สารเคมีและ SDS', theme_name_en: '04-Chemical & SDS', is_active: true },
  { id: 'th_05', theme_name: '05-อัคคีภัยและทางหนีไฟ', theme_name_en: '05-Fire & Emergency Egress', is_active: true },
  { id: 'th_06', theme_name: '06-รถยก/MHE และการจราจร', theme_name_en: '06-Forklift & Traffic', is_active: true },
  { id: 'th_07', theme_name: '07-การล็อกและแขวนป้าย (LOTO)', theme_name_en: '07-Lockout / Tagout', is_active: true },
  { id: 'th_08', theme_name: '08-ที่สูงและที่อับอากาศ', theme_name_en: '08-Work at Height & Confined Space', is_active: true },
  { id: 'th_09', theme_name: '09-5ส และความเป็นระเบียบ', theme_name_en: '09-5S & Housekeeping', is_active: true },
  { id: 'th_10', theme_name: '10-การยศาสตร์และการยกเคลื่อนย้าย', theme_name_en: '10-Ergonomics & Manual Handling', is_active: true },
  { id: 'th_11', theme_name: '11-พฤติกรรมความปลอดภัย (BBS)', theme_name_en: '11-Behaviour Based Safety', is_active: true },
  { id: 'th_12', theme_name: '12-สิ่งแวดล้อมและของเสีย', theme_name_en: '12-Environment & Waste', is_active: true },
];

/** [id, theme_id, item_code, คำถาม, question_en, ความรุนแรงตั้งต้น] */
type ItemRow = [string, string, string, string, string, Severity];

const ITEMS: ItemRow[] = [
  ['ck_ppe_1', 'th_01', 'PPE-01', 'พนักงานสวมอุปกรณ์ป้องกันครบตามป้ายกำหนดของพื้นที่', 'PPE worn as required by area signage', 'high'],
  ['ck_ppe_2', 'th_01', 'PPE-02', 'อุปกรณ์ป้องกันอยู่ในสภาพใช้งานได้ ไม่ชำรุด', 'PPE in serviceable condition', 'medium'],
  ['ck_ppe_3', 'th_01', 'PPE-03', 'มีอุปกรณ์สำรองพร้อมจ่าย และจุดจ่ายมีป้ายชัดเจน', 'Spare PPE available at marked point', 'low'],
  ['ck_ppe_4', 'th_01', 'PPE-04', 'ผู้มาเยือน/ผู้รับเหมาในพื้นที่สวม PPE ครบเช่นกัน', 'Visitors and contractors comply', 'high'],

  ['ck_grd_1', 'th_02', 'GRD-01', 'การ์ดครอบจุดหมุน จุดหนีบ และสายพานครบทุกจุด', 'Guards fitted on all nip and rotating points', 'critical'],
  ['ck_grd_2', 'th_02', 'GRD-02', 'สวิตช์ฉุกเฉิน (E-Stop) กดถึงง่าย ไม่มีของวางบัง', 'E-Stop reachable and unobstructed', 'critical'],
  ['ck_grd_3', 'th_02', 'GRD-03', 'ม่านแสง/สวิตช์ประตูนิรภัยทำงานปกติ มีบันทึกทดสอบ', 'Light curtains and interlocks tested', 'high'],
  ['ck_grd_4', 'th_02', 'GRD-04', 'ไม่พบการถอดหรือดัดแปลงอุปกรณ์นิรภัยของเครื่อง', 'No bypassed safety devices', 'critical'],

  ['ck_ele_1', 'th_03', 'ELE-01', 'ตู้ควบคุมไฟฟ้าปิดสนิท มีป้ายเตือน และล็อกเรียบร้อย', 'Panels closed, labelled and locked', 'high'],
  ['ck_ele_2', 'th_03', 'ELE-02', 'ไม่มีสายไฟชำรุด สายเปลือย หรือต่อพ่วงเกินพิกัด', 'No damaged or overloaded wiring', 'high'],
  ['ck_ele_3', 'th_03', 'ELE-03', 'มีสายดินและอุปกรณ์ตัดไฟรั่วครบตามจุดที่กำหนด', 'Earthing and RCD in place', 'high'],
  ['ck_ele_4', 'th_03', 'ELE-04', 'พื้นที่หน้าตู้ไฟโล่งตามระยะที่กำหนด ไม่มีของวางกีดขวาง', 'Clearance in front of panels kept', 'medium'],

  ['ck_chm_1', 'th_04', 'CHM-01', 'ภาชนะบรรจุสารเคมีมีฉลากและสัญลักษณ์ GHS ครบถ้วน', 'Containers labelled with GHS symbols', 'high'],
  ['ck_chm_2', 'th_04', 'CHM-02', 'มีเอกสารข้อมูลความปลอดภัย (SDS) ที่จุดใช้งาน', 'SDS available at point of use', 'medium'],
  ['ck_chm_3', 'th_04', 'CHM-03', 'มีถาดรองรับการรั่วไหล และชุดเก็บกวาดสารเคมีพร้อมใช้', 'Secondary containment and spill kit ready', 'high'],
  ['ck_chm_4', 'th_04', 'CHM-04', 'เก็บสารเคมีแยกประเภทตามความเข้ากันไม่ได้ ไม่วางปนกัน', 'Incompatible chemicals segregated', 'high'],

  ['ck_fir_1', 'th_05', 'FIR-01', 'ถังดับเพลิงอยู่ครบตามจุด ไม่มีของบัง และไม่หมดอายุ', 'Extinguishers in place, clear, in date', 'high'],
  ['ck_fir_2', 'th_05', 'FIR-02', 'ทางหนีไฟและประตูฉุกเฉินโล่ง เปิดออกได้ทันที', 'Escape routes and exits clear', 'critical'],
  ['ck_fir_3', 'th_05', 'FIR-03', 'ป้ายทางออกฉุกเฉินและไฟส่องสว่างสำรองติดสว่างปกติ', 'Exit signs and emergency lights working', 'high'],
  ['ck_fir_4', 'th_05', 'FIR-04', 'หัวสปริงเกลอร์และสัญญาณแจ้งเหตุไม่ถูกบัง/ดัดแปลง', 'Sprinklers and alarms unobstructed', 'high'],

  ['ck_mhe_1', 'th_06', 'MHE-01', 'ผู้ขับรถยกมีใบอนุญาตและคาดเข็มขัดนิรภัยขณะขับ', 'Licensed operator, seatbelt worn', 'critical'],
  ['ck_mhe_2', 'th_06', 'MHE-02', 'มีการตรวจเช็ครถยกก่อนใช้งานประจำวัน และบันทึกครบ', 'Daily pre-use inspection recorded', 'medium'],
  ['ck_mhe_3', 'th_06', 'MHE-03', 'เส้นทางเดินคนกับทางวิ่งรถแยกกันชัดเจน เส้นตีชัด', 'Pedestrian and vehicle routes segregated', 'high'],
  ['ck_mhe_4', 'th_06', 'MHE-04', 'ความเร็วและการใช้แตรตรงตามกฎ ไม่ยกของบังสายตา', 'Speed, horn and load height rules followed', 'high'],

  ['ck_lot_1', 'th_07', 'LOT-01', 'งานซ่อมบำรุงมีการล็อกและแขวนป้ายครบทุกแหล่งพลังงาน', 'All energy sources locked and tagged', 'critical'],
  ['ck_lot_2', 'th_07', 'LOT-02', 'กุญแจล็อกเป็นของผู้ปฏิบัติงานแต่ละคน ไม่ใช้ร่วมกัน', 'Personal locks used, not shared', 'high'],
  ['ck_lot_3', 'th_07', 'LOT-03', 'มีการทดสอบว่าพลังงานถูกตัดจริงก่อนเริ่มงาน', 'Zero-energy verified before work', 'critical'],
  ['ck_lot_4', 'th_07', 'LOT-04', 'ป้ายระบุชื่อผู้ล็อก วันเวลา และเหตุผลชัดเจน', 'Tag shows owner, time and reason', 'medium'],

  ['ck_hgt_1', 'th_08', 'HGT-01', 'งานที่สูงเกิน 2 เมตรมีใบอนุญาตทำงานและผู้ควบคุม', 'Work-at-height permit and supervisor', 'critical'],
  ['ck_hgt_2', 'th_08', 'HGT-02', 'สวมสายรัดนิรภัยและเกี่ยวจุดยึดที่รับน้ำหนักได้จริง', 'Harness clipped to rated anchor', 'critical'],
  ['ck_hgt_3', 'th_08', 'HGT-03', 'บันได/นั่งร้านอยู่ในสภาพดี ตั้งมั่นคง และมีป้ายตรวจสอบ', 'Ladders and scaffolds inspected and stable', 'high'],
  ['ck_hgt_4', 'th_08', 'HGT-04', 'ที่อับอากาศมีการวัดก๊าซ ระบายอากาศ และผู้เฝ้าระวัง', 'Confined space gas-tested with attendant', 'critical'],

  ['ck_5s_1', 'th_09', '5S-01', 'ทางเดินและพื้นที่ทำงานโล่ง ไม่มีของวางกีดขวาง', 'Walkways and work areas clear', 'medium'],
  ['ck_5s_2', 'th_09', '5S-02', 'พื้นแห้ง ไม่มีคราบน้ำมันหรือจุดลื่นสะดุด', 'Floors dry, no slip or trip hazards', 'high'],
  ['ck_5s_3', 'th_09', '5S-03', 'ของทุกชิ้นมีที่เก็บชัดเจน วางในเส้นที่กำหนด', 'Items stored in marked locations', 'low'],
  ['ck_5s_4', 'th_09', '5S-04', 'ถังขยะ/ถังของเสียมีฝาปิดและไม่ล้น', 'Waste bins covered and not overflowing', 'low'],

  ['ck_erg_1', 'th_10', 'ERG-01', 'ท่าทางการยกของถูกวิธี ไม่ก้มบิดตัวขณะยกของหนัก', 'Correct manual handling posture', 'medium'],
  ['ck_erg_2', 'th_10', 'ERG-02', 'มีอุปกรณ์ช่วยยกสำหรับของหนักเกินเกณฑ์ และใช้งานจริง', 'Lifting aids provided and used', 'medium'],
  ['ck_erg_3', 'th_10', 'ERG-03', 'ความสูงโต๊ะงานและระยะเอื้อมเหมาะกับผู้ปฏิบัติงาน', 'Workstation height and reach suitable', 'low'],
  ['ck_erg_4', 'th_10', 'ERG-04', 'งานท่าซ้ำ ๆ มีการสลับหน้าที่หรือพักตามรอบที่กำหนด', 'Job rotation or breaks for repetitive work', 'low'],

  ['ck_bbs_1', 'th_11', 'BBS-01', 'พนักงานทำงานตามขั้นตอนมาตรฐาน ไม่ลัดขั้นตอน', 'Work follows standard procedure', 'high'],
  ['ck_bbs_2', 'th_11', 'BBS-02', 'มีการหยุดงานเมื่อพบสภาพไม่ปลอดภัย และแจ้งหัวหน้า', 'Stop-work authority used when unsafe', 'high'],
  ['ck_bbs_3', 'th_11', 'BBS-03', 'พนักงานรู้จุดรวมพลและขั้นตอนเมื่อเกิดเหตุฉุกเฉิน', 'Staff know assembly point and drill', 'medium'],
  ['ck_bbs_4', 'th_11', 'BBS-04', 'อบรมความปลอดภัยของงานที่ทำอยู่ยังไม่หมดอายุ', 'Safety training current for the task', 'medium'],

  ['ck_env_1', 'th_12', 'ENV-01', 'แยกของเสียตามประเภทถูกต้อง ของเสียอันตรายเก็บในจุดที่กำหนด', 'Waste segregated, hazardous waste stored correctly', 'medium'],
  ['ck_env_2', 'th_12', 'ENV-02', 'ไม่มีการรั่วไหลลงพื้นหรือลงท่อระบายน้ำ', 'No leaks to floor or drains', 'high'],
  ['ck_env_3', 'th_12', 'ENV-03', 'ระบบระบายอากาศและดูดฝุ่นทำงานปกติที่จุดที่ต้องมี', 'Ventilation and dust extraction working', 'medium'],
  ['ck_env_4', 'th_12', 'ENV-04', 'ระดับเสียงและแสงสว่างในพื้นที่อยู่ในเกณฑ์', 'Noise and lighting within limits', 'low'],
];

export function buildChecklist(): SafetyChecklistItem[] {
  const perTheme = new Map<string, number>();
  return ITEMS.map(([id, theme_id, item_code, question, question_en, default_severity]) => {
    const n = (perTheme.get(theme_id) ?? 0) + 1;
    perTheme.set(theme_id, n);
    return {
      id,
      theme_id,
      item_code,
      question,
      question_en,
      default_severity,
      sort_order: n * 10,
      is_active: true,
    };
  });
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
