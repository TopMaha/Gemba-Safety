-- ============================================================================
--  GEMBA SAFETY — ข้อมูลตั้งต้นส่วนความปลอดภัยและสิทธิ์ผู้ใช้งาน
--  รันด้วย: wrangler d1 execute gemba-safety --remote --file=./seed-safety.sql
--
--  รันหลัง seed.sql เสมอ เพราะข้อตรวจอ้างถึงหมวดใน walk_themes
--  ทุกคำสั่งเป็น INSERT OR IGNORE จึงรันซ้ำได้ ไม่ทับของที่แก้ไปแล้วในแอป
--
--  ⚠️ ตาราง user_roles (ใครเป็นบทบาทไหน) ตั้งใจเว้นว่างไว้
--     ให้ไปกรอกทีหลังที่หน้า /admin/roles หรือใส่ด้วย SQL ตามตัวอย่างท้ายไฟล์
--     ระหว่างที่ยังว่าง ทุกคนที่ล็อกอินได้จะได้บทบาทตาม app_settings.default_role_code
-- ============================================================================


-- ── รายการสิทธิ์ทั้งหมดในระบบ ────────────────────────────────────────────
-- เพิ่มแถวที่นี่เมื่อมีฟีเจอร์ใหม่ แล้วผูกเข้ากับบทบาทที่ role_permissions
INSERT OR IGNORE INTO permissions (perm_code, perm_group, perm_name, perm_name_en, sort_order) VALUES
  ('walk.plan',        'walk',    'วางแผนการเดินตรวจ',              'Create walk plans',        10),
  ('walk.record',      'walk',    'บันทึกผลการเดินตรวจ',            'Record walks',             20),

  ('finding.create',   'finding', 'เปิดใบแจ้งปัญหา',                 'Report findings',          30),
  ('finding.edit',     'finding', 'แก้ไขรายละเอียดใบแจ้ง',           'Edit findings',            40),
  ('finding.assign',   'finding', 'มอบหมายผู้รับผิดชอบ',             'Assign findings',          50),
  ('finding.fix',      'finding', 'บันทึกการแก้ไข + แนบรูปหลังแก้',  'Submit corrective action', 60),
  ('finding.verify',   'finding', 'ตรวจรับและปิดงาน',                'Verify & close',           70),
  ('finding.cancel',   'finding', 'ยกเลิกใบแจ้ง',                    'Cancel findings',          80),
  ('finding.comment',  'finding', 'แสดงความเห็นในใบแจ้ง',            'Comment on findings',      90),
  ('finding.view_all', 'finding', 'เห็นใบแจ้งของทุกพื้นที่',          'View all findings',       100),

  ('dashboard.view',   'view',    'ดูแดชบอร์ดภาพรวม',                'View dashboard',          110),
  ('report.view',      'view',    'ดูรายงาน',                        'View reports',            120),
  ('report.export',    'view',    'ส่งออกรายงาน CSV',                'Export CSV',              130),

  ('admin.master',     'admin',   'จัดการพื้นที่ · หมวด · เช็คลิสต์', 'Manage master data',      140),
  ('admin.users',      'admin',   'จัดการทะเบียนผู้ใช้',             'Manage users',            150),
  ('admin.roles',      'admin',   'กำหนดสิทธิ์ผู้ใช้งาน',             'Manage roles',            160),
  ('admin.settings',   'admin',   'ตั้งค่าระบบ',                     'System settings',         170);


-- ── บทบาท ───────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO roles (id, role_code, role_name, role_name_en, description, is_system, sort_order) VALUES
  ('role_admin',      'admin',      'ผู้ดูแลระบบ',        'Administrator',
   'ทำได้ทุกอย่าง รวมถึงกำหนดสิทธิ์ให้คนอื่น', 1, 10),
  ('role_safety',     'safety',     'เจ้าหน้าที่ความปลอดภัย (จป.)', 'Safety Officer',
   'ตรวจ · มอบหมาย · ตรวจรับปิดงาน และดูได้ทุกพื้นที่', 1, 20),
  ('role_manager',    'manager',    'ผู้จัดการ',          'Manager',
   'รับงานที่ถูกมอบหมาย มอบหมายต่อให้หัวหน้างาน และเห็นใบแจ้งทุกพื้นที่', 1, 30),
  ('role_supervisor', 'supervisor', 'หัวหน้างาน',         'Supervisor',
   'รับงานที่ถูกมอบหมาย ลงมือแก้ไข และแนบรูปหลังแก้', 1, 40),
  ('role_inspector',  'inspector',  'ผู้เดินตรวจ',        'Inspector',
   'วางแผน เดินตรวจ และเปิดใบแจ้งปัญหา — บทบาทตั้งต้นของผู้ใช้ทั่วไป', 1, 50),
  ('role_viewer',     'viewer',     'ผู้ดูอย่างเดียว',    'Viewer',
   'ดูแดชบอร์ดและรายงานได้ แต่แก้ไขอะไรไม่ได้', 1, 60);


-- ── บทบาทไหนทำอะไรได้ ───────────────────────────────────────────────────
-- ผู้ดูแลระบบ = ทุกสิทธิ์ (เขียนแบบ SELECT เพื่อไม่ต้องไล่พิมพ์ทีละบรรทัด)
INSERT OR IGNORE INTO role_permissions (role_id, perm_code)
  SELECT 'role_admin', perm_code FROM permissions;

INSERT OR IGNORE INTO role_permissions (role_id, perm_code) VALUES
  -- จป. — ทำงานความปลอดภัยได้ครบวงจร และดูแลข้อมูลหลักของงานตรวจ
  ('role_safety', 'walk.plan'), ('role_safety', 'walk.record'),
  ('role_safety', 'finding.create'), ('role_safety', 'finding.edit'),
  ('role_safety', 'finding.assign'), ('role_safety', 'finding.fix'),
  ('role_safety', 'finding.verify'), ('role_safety', 'finding.cancel'),
  ('role_safety', 'finding.comment'), ('role_safety', 'finding.view_all'),
  ('role_safety', 'dashboard.view'), ('role_safety', 'report.view'),
  ('role_safety', 'report.export'), ('role_safety', 'admin.master'),

  -- ผู้จัดการ — รับงาน มอบหมายต่อ แก้ไข และเห็นภาพรวมทั้งโรงงาน
  ('role_manager', 'walk.plan'), ('role_manager', 'walk.record'),
  ('role_manager', 'finding.create'), ('role_manager', 'finding.edit'),
  ('role_manager', 'finding.assign'), ('role_manager', 'finding.fix'),
  ('role_manager', 'finding.comment'), ('role_manager', 'finding.view_all'),
  ('role_manager', 'dashboard.view'), ('role_manager', 'report.view'),
  ('role_manager', 'report.export'),

  -- หัวหน้างาน — ลงมือแก้และรายงานผล
  ('role_supervisor', 'walk.record'),
  ('role_supervisor', 'finding.create'), ('role_supervisor', 'finding.fix'),
  ('role_supervisor', 'finding.comment'), ('role_supervisor', 'dashboard.view'),

  -- ผู้เดินตรวจ (บทบาทตั้งต้น) — เดินตรวจและเปิดใบแจ้ง
  ('role_inspector', 'walk.plan'), ('role_inspector', 'walk.record'),
  ('role_inspector', 'finding.create'), ('role_inspector', 'finding.comment'),
  ('role_inspector', 'dashboard.view'),

  -- ผู้ดูอย่างเดียว
  ('role_viewer', 'dashboard.view'), ('role_viewer', 'report.view');


-- ── ข้อตรวจของแต่ละหมวด ─────────────────────────────────────────────────
-- default_severity คือระดับความรุนแรงตั้งต้นเมื่อข้อนั้น "ไม่ผ่าน"
-- ข้อที่ทำให้คนบาดเจ็บสาหัสได้ทันที (ไฟฟ้า · การ์ด · LOTO · ที่สูง) ตั้งไว้สูงกว่า
INSERT OR IGNORE INTO safety_checklist_items
  (id, theme_id, item_code, question, question_en, default_severity, sort_order, is_active) VALUES
  -- 1. PPE
  ('ck_ppe_1', 'th_01', 'PPE-01', 'พนักงานสวมอุปกรณ์ป้องกันครบตามป้ายกำหนดของพื้นที่', 'PPE worn as required by area signage', 'high', 10, 1),
  ('ck_ppe_2', 'th_01', 'PPE-02', 'อุปกรณ์ป้องกันอยู่ในสภาพใช้งานได้ ไม่ชำรุด', 'PPE in serviceable condition', 'medium', 20, 1),
  ('ck_ppe_3', 'th_01', 'PPE-03', 'มีอุปกรณ์สำรองพร้อมจ่าย และจุดจ่ายมีป้ายชัดเจน', 'Spare PPE available at marked point', 'low', 30, 1),
  ('ck_ppe_4', 'th_01', 'PPE-04', 'ผู้มาเยือน/ผู้รับเหมาในพื้นที่สวม PPE ครบเช่นกัน', 'Visitors and contractors comply', 'high', 40, 1),

  -- 2. การ์ดเครื่องจักร
  ('ck_grd_1', 'th_02', 'GRD-01', 'การ์ดครอบจุดหมุน จุดหนีบ และสายพานครบทุกจุด', 'Guards fitted on all nip and rotating points', 'critical', 10, 1),
  ('ck_grd_2', 'th_02', 'GRD-02', 'สวิตช์ฉุกเฉิน (E-Stop) กดถึงง่าย ไม่มีของวางบัง', 'E-Stop reachable and unobstructed', 'critical', 20, 1),
  ('ck_grd_3', 'th_02', 'GRD-03', 'ม่านแสง/สวิตช์ประตูนิรภัยทำงานปกติ มีบันทึกทดสอบ', 'Light curtains and interlocks tested', 'high', 30, 1),
  ('ck_grd_4', 'th_02', 'GRD-04', 'ไม่พบการถอดหรือดัดแปลงอุปกรณ์นิรภัยของเครื่อง', 'No bypassed safety devices', 'critical', 40, 1),

  -- 3. ไฟฟ้า
  ('ck_ele_1', 'th_03', 'ELE-01', 'ตู้ควบคุมไฟฟ้าปิดสนิท มีป้ายเตือน และล็อกเรียบร้อย', 'Panels closed, labelled and locked', 'high', 10, 1),
  ('ck_ele_2', 'th_03', 'ELE-02', 'ไม่มีสายไฟชำรุด สายเปลือย หรือต่อพ่วงเกินพิกัด', 'No damaged or overloaded wiring', 'high', 20, 1),
  ('ck_ele_3', 'th_03', 'ELE-03', 'มีสายดินและอุปกรณ์ตัดไฟรั่วครบตามจุดที่กำหนด', 'Earthing and RCD in place', 'high', 30, 1),
  ('ck_ele_4', 'th_03', 'ELE-04', 'พื้นที่หน้าตู้ไฟโล่งตามระยะที่กำหนด ไม่มีของวางกีดขวาง', 'Clearance in front of panels kept', 'medium', 40, 1),

  -- 4. สารเคมี
  ('ck_chm_1', 'th_04', 'CHM-01', 'ภาชนะบรรจุสารเคมีมีฉลากและสัญลักษณ์ GHS ครบถ้วน', 'Containers labelled with GHS symbols', 'high', 10, 1),
  ('ck_chm_2', 'th_04', 'CHM-02', 'มีเอกสารข้อมูลความปลอดภัย (SDS) ที่จุดใช้งาน', 'SDS available at point of use', 'medium', 20, 1),
  ('ck_chm_3', 'th_04', 'CHM-03', 'มีถาดรองรับการรั่วไหล และชุดเก็บกวาดสารเคมีพร้อมใช้', 'Secondary containment and spill kit ready', 'high', 30, 1),
  ('ck_chm_4', 'th_04', 'CHM-04', 'เก็บสารเคมีแยกประเภทตามความเข้ากันไม่ได้ ไม่วางปนกัน', 'Incompatible chemicals segregated', 'high', 40, 1),

  -- 5. อัคคีภัยและทางหนีไฟ
  ('ck_fir_1', 'th_05', 'FIR-01', 'ถังดับเพลิงอยู่ครบตามจุด ไม่มีของบัง และไม่หมดอายุ', 'Extinguishers in place, clear, in date', 'high', 10, 1),
  ('ck_fir_2', 'th_05', 'FIR-02', 'ทางหนีไฟและประตูฉุกเฉินโล่ง เปิดออกได้ทันที', 'Escape routes and exits clear', 'critical', 20, 1),
  ('ck_fir_3', 'th_05', 'FIR-03', 'ป้ายทางออกฉุกเฉินและไฟส่องสว่างสำรองติดสว่างปกติ', 'Exit signs and emergency lights working', 'high', 30, 1),
  ('ck_fir_4', 'th_05', 'FIR-04', 'หัวสปริงเกลอร์และสัญญาณแจ้งเหตุไม่ถูกบัง/ดัดแปลง', 'Sprinklers and alarms unobstructed', 'high', 40, 1),

  -- 6. รถยกและการจราจร
  ('ck_mhe_1', 'th_06', 'MHE-01', 'ผู้ขับรถยกมีใบอนุญาตและคาดเข็มขัดนิรภัยขณะขับ', 'Licensed operator, seatbelt worn', 'critical', 10, 1),
  ('ck_mhe_2', 'th_06', 'MHE-02', 'มีการตรวจเช็ครถยกก่อนใช้งานประจำวัน และบันทึกครบ', 'Daily pre-use inspection recorded', 'medium', 20, 1),
  ('ck_mhe_3', 'th_06', 'MHE-03', 'เส้นทางเดินคนกับทางวิ่งรถแยกกันชัดเจน เส้นตีชัด', 'Pedestrian and vehicle routes segregated', 'high', 30, 1),
  ('ck_mhe_4', 'th_06', 'MHE-04', 'ความเร็วและการใช้แตรตรงตามกฎ ไม่ยกของบังสายตา', 'Speed, horn and load height rules followed', 'high', 40, 1),

  -- 7. LOTO
  ('ck_lot_1', 'th_07', 'LOT-01', 'งานซ่อมบำรุงมีการล็อกและแขวนป้ายครบทุกแหล่งพลังงาน', 'All energy sources locked and tagged', 'critical', 10, 1),
  ('ck_lot_2', 'th_07', 'LOT-02', 'กุญแจล็อกเป็นของผู้ปฏิบัติงานแต่ละคน ไม่ใช้ร่วมกัน', 'Personal locks used, not shared', 'high', 20, 1),
  ('ck_lot_3', 'th_07', 'LOT-03', 'มีการทดสอบว่าพลังงานถูกตัดจริงก่อนเริ่มงาน', 'Zero-energy verified before work', 'critical', 30, 1),
  ('ck_lot_4', 'th_07', 'LOT-04', 'ป้ายระบุชื่อผู้ล็อก วันเวลา และเหตุผลชัดเจน', 'Tag shows owner, time and reason', 'medium', 40, 1),

  -- 8. ที่สูงและที่อับอากาศ
  ('ck_hgt_1', 'th_08', 'HGT-01', 'งานที่สูงเกิน 2 เมตรมีใบอนุญาตทำงานและผู้ควบคุม', 'Work-at-height permit and supervisor', 'critical', 10, 1),
  ('ck_hgt_2', 'th_08', 'HGT-02', 'สวมสายรัดนิรภัยและเกี่ยวจุดยึดที่รับน้ำหนักได้จริง', 'Harness clipped to rated anchor', 'critical', 20, 1),
  ('ck_hgt_3', 'th_08', 'HGT-03', 'บันได/นั่งร้านอยู่ในสภาพดี ตั้งมั่นคง และมีป้ายตรวจสอบ', 'Ladders and scaffolds inspected and stable', 'high', 30, 1),
  ('ck_hgt_4', 'th_08', 'HGT-04', 'ที่อับอากาศมีการวัดก๊าซ ระบายอากาศ และผู้เฝ้าระวัง', 'Confined space gas-tested with attendant', 'critical', 40, 1),

  -- 9. 5ส และความเป็นระเบียบ
  ('ck_5s_1', 'th_09', '5S-01', 'ทางเดินและพื้นที่ทำงานโล่ง ไม่มีของวางกีดขวาง', 'Walkways and work areas clear', 'medium', 10, 1),
  ('ck_5s_2', 'th_09', '5S-02', 'พื้นแห้ง ไม่มีคราบน้ำมันหรือจุดลื่นสะดุด', 'Floors dry, no slip or trip hazards', 'high', 20, 1),
  ('ck_5s_3', 'th_09', '5S-03', 'ของทุกชิ้นมีที่เก็บชัดเจน วางในเส้นที่กำหนด', 'Items stored in marked locations', 'low', 30, 1),
  ('ck_5s_4', 'th_09', '5S-04', 'ถังขยะ/ถังของเสียมีฝาปิดและไม่ล้น', 'Waste bins covered and not overflowing', 'low', 40, 1),

  -- 10. การยศาสตร์
  ('ck_erg_1', 'th_10', 'ERG-01', 'ท่าทางการยกของถูกวิธี ไม่ก้มบิดตัวขณะยกของหนัก', 'Correct manual handling posture', 'medium', 10, 1),
  ('ck_erg_2', 'th_10', 'ERG-02', 'มีอุปกรณ์ช่วยยกสำหรับของหนักเกินเกณฑ์ และใช้งานจริง', 'Lifting aids provided and used', 'medium', 20, 1),
  ('ck_erg_3', 'th_10', 'ERG-03', 'ความสูงโต๊ะงานและระยะเอื้อมเหมาะกับผู้ปฏิบัติงาน', 'Workstation height and reach suitable', 'low', 30, 1),
  ('ck_erg_4', 'th_10', 'ERG-04', 'งานท่าซ้ำ ๆ มีการสลับหน้าที่หรือพักตามรอบที่กำหนด', 'Job rotation or breaks for repetitive work', 'low', 40, 1),

  -- 11. พฤติกรรมความปลอดภัย
  ('ck_bbs_1', 'th_11', 'BBS-01', 'พนักงานทำงานตามขั้นตอนมาตรฐาน ไม่ลัดขั้นตอน', 'Work follows standard procedure', 'high', 10, 1),
  ('ck_bbs_2', 'th_11', 'BBS-02', 'มีการหยุดงานเมื่อพบสภาพไม่ปลอดภัย และแจ้งหัวหน้า', 'Stop-work authority used when unsafe', 'high', 20, 1),
  ('ck_bbs_3', 'th_11', 'BBS-03', 'พนักงานรู้จุดรวมพลและขั้นตอนเมื่อเกิดเหตุฉุกเฉิน', 'Staff know assembly point and drill', 'medium', 30, 1),
  ('ck_bbs_4', 'th_11', 'BBS-04', 'อบรมความปลอดภัยของงานที่ทำอยู่ยังไม่หมดอายุ', 'Safety training current for the task', 'medium', 40, 1),

  -- 12. สิ่งแวดล้อม
  ('ck_env_1', 'th_12', 'ENV-01', 'แยกของเสียตามประเภทถูกต้อง ของเสียอันตรายเก็บในจุดที่กำหนด', 'Waste segregated, hazardous waste stored correctly', 'medium', 10, 1),
  ('ck_env_2', 'th_12', 'ENV-02', 'ไม่มีการรั่วไหลลงพื้นหรือลงท่อระบายน้ำ', 'No leaks to floor or drains', 'high', 20, 1),
  ('ck_env_3', 'th_12', 'ENV-03', 'ระบบระบายอากาศและดูดฝุ่นทำงานปกติที่จุดที่ต้องมี', 'Ventilation and dust extraction working', 'medium', 30, 1),
  ('ck_env_4', 'th_12', 'ENV-04', 'ระดับเสียงและแสงสว่างในพื้นที่อยู่ในเกณฑ์', 'Noise and lighting within limits', 'low', 40, 1);


-- ============================================================================
--  ตัวอย่างการใส่สิทธิ์รายคน (ทำทีหลังได้ที่หน้า /admin/roles)
--
--    INSERT INTO user_roles (id, manager_id, role_id, scope_area_id, granted_by, granted_at)
--    SELECT 'ur_' || m.id || '_safety', m.id, 'role_safety', '*', 'seed', datetime('now')
--      FROM managers m WHERE m.manager_code = 'T-815';
--
--  scope_area_id = '*' คือทั้งโรงงาน · ใส่ id ของพื้นที่เพื่อจำกัดเฉพาะพื้นที่นั้น
--  คนหนึ่งถือได้หลายบทบาท สิทธิ์ที่ได้คือผลรวมของทุกบทบาทที่ถืออยู่
-- ============================================================================
