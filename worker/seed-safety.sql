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


-- ── ข้อตรวจของแต่ละหัวข้อ ──────────────────────────────────────────────────
-- ย้ายไปอยู่ใน seed-gemba-topics.sql แล้ว (151 ข้อ ตามเอกสาร GEMBA WALK 13 หมวด)


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
