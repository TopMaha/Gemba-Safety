-- ============================================================================
--  Gemba Walk — โครงฐานข้อมูล Cloudflare D1 (SQLite)
--  รันด้วย: wrangler d1 execute gemba-audit --file=./schema.sql --remote
--
--  หลักการออกแบบ
--  1. ตารางและชื่อคอลัมน์สะท้อน src/lib/types.ts ของ frontend แบบ 1:1
--     เพื่อให้ Worker แปลงเป็น JSON ส่งกลับได้โดยหน้าจอไม่ต้องแก้อะไรเลย
--  2. ฟิลด์ที่เป็นอาร์เรย์ใน TypeScript (theme_ids / photo_urls / participant_names)
--     แตกเป็นตารางลูกแทนการเก็บ JSON เพราะระบบมีการค้นแบบย้อนกลับจริง เช่น
--     "หัวข้อนี้มีใครเดินไปแล้วบ้าง" ใน themeCompletion() ของ src/lib/calc.ts
--     ถ้าเก็บเป็น JSON จะต้องสแกนทุกแถว ทำ index ไม่ได้
--  3. วันที่ทั้งหมดเก็บเป็น TEXT · boolean เก็บเป็น INTEGER 0/1 พร้อม CHECK
--  4. ตารางที่เป็นหลักฐาน (บันทึกการเดิน) ใช้ RESTRICT ไม่ให้ถูกลบตามใคร
--     ส่วนตารางลูกที่ไม่มีความหมายเมื่อแม่หาย ใช้ CASCADE
--
--  หมายเหตุ: D1 บังคับ FOREIGN KEY ให้อยู่แล้ว ไม่ต้องสั่ง PRAGMA เอง
-- ============================================================================


-- ── ผู้ใช้ ────────────────────────────────────────────────────────────────
-- ทะเบียนพนักงานทั้งโรงงาน ไม่ใช่ทุกคนที่ล็อกอินได้ (ดู can_login)
-- คนที่ล็อกอินไม่ได้ยังต้องอยู่ในตารางนี้ เพราะถูกเลือกเป็นผู้ร่วมเดินได้
--
-- ธงสามตัวนี้ตอบคนละคำถาม อย่ายุบรวมกัน
--   is_active         ยังเป็นพนักงานอยู่ไหม (ลาออกแล้วปิด)
--   can_login         ได้รับสิทธิ์ใช้แอปนี้หรือไม่ — ผู้ดูแลระบบกำหนดรายคน
--   dashboard_enabled เห็นภาพรวมทั้งโรงงานได้หรือเห็นแค่ของตัวเอง
--
-- can_login ตั้งต้นเป็น 0 โดยตั้งใจ: คนใหม่ที่เพิ่มเข้ามาต้องถูก "เปิดสิทธิ์"
-- ก่อนเสมอ เพราะรหัสเข้าระบบคือรหัสพนักงานซึ่งคนอื่นเดาได้ไม่ยาก
CREATE TABLE IF NOT EXISTS managers (
  id                TEXT PRIMARY KEY,
  manager_code      TEXT NOT NULL UNIQUE,
  full_name         TEXT NOT NULL,
  full_name_en      TEXT,
  department        TEXT NOT NULL DEFAULT '',
  position          TEXT,
  avatar_url        TEXT,
  is_active         INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  dashboard_enabled INTEGER NOT NULL DEFAULT 1 CHECK (dashboard_enabled IN (0, 1)),
  can_login         INTEGER NOT NULL DEFAULT 0 CHECK (can_login IN (0, 1)),
  created_at        TEXT NOT NULL
);

-- ผู้ดูแลระบบ แยกจาก managers เพราะเข้าคนละทาง (/admin) และไม่ได้เดิน Gemba
CREATE TABLE IF NOT EXISTS superusers (
  id          TEXT PRIMARY KEY,
  admin_code  TEXT NOT NULL UNIQUE,
  full_name   TEXT NOT NULL
);

-- เซสชันผู้ดูแลระบบ — เป็นด่านจริงของหน้า /admin
--
-- ค่าใน localStorage ฝั่งเบราว์เซอร์ปลอมได้ ถ้าใช้แค่นั้นเป็นด่าน ใครก็ตั้งเองแล้ว
-- เข้าไปเปิดสิทธิ์ can_login ให้ตัวเองได้ การเขียนที่เป็นงานแอดมินจึงต้องแนบโทเคน
-- จากตารางนี้เสมอ และ Worker เป็นคนตรวจ ไม่ใช่หน้าเว็บ
--
-- เก็บเฉพาะค่าแฮช SHA-256 ของโทเคน ตัวโทเคนจริงส่งกลับไปครั้งเดียวตอนล็อกอิน
-- ฐานข้อมูลหลุดก็แปลงกลับเป็นโทเคนที่ใช้ได้ไม่ได้
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash  TEXT PRIMARY KEY,
  admin_id    TEXT NOT NULL,
  admin_name  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

-- ใช้ตอนเก็บกวาดเซสชันหมดอายุ
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions (expires_at);


-- ── พื้นที่ (โครงสร้างต้นไม้) ─────────────────────────────────────────────
-- parent_id ชี้ไปยังพื้นที่แม่ · ระดับบนสุดมีค่าเป็น NULL
-- CASCADE เพราะถ้าลบ "สายการผลิต" ทิ้ง ไลน์ย่อยข้างใต้ก็ไม่มีความหมายแล้ว
CREATE TABLE IF NOT EXISTS areas (
  id            TEXT PRIMARY KEY,
  area_name     TEXT NOT NULL,
  area_name_en  TEXT,
  parent_id     TEXT REFERENCES areas (id) ON DELETE CASCADE,
  department    TEXT NOT NULL DEFAULT '',
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_areas_parent ON areas (parent_id);
CREATE INDEX IF NOT EXISTS idx_areas_active ON areas (is_active);


-- ── หัวข้อการเดิน ────────────────────────────────────────────────────────
-- เป็นแท็กติดบนการเดิน ไม่ใช่ชุดคำถาม (ระบบนี้ไม่มีเช็คลิสต์รายข้อ)
CREATE TABLE IF NOT EXISTS walk_themes (
  id             TEXT PRIMARY KEY,
  theme_name     TEXT NOT NULL,
  theme_name_en  TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);


-- ── แผนการเดิน ───────────────────────────────────────────────────────────
-- manager_id ใช้ CASCADE ได้เพราะแผนเป็นของชั่วคราว ไม่ใช่หลักฐาน
-- area_id ใช้ RESTRICT กันลบพื้นที่ที่ยังมีแผนผูกอยู่ (แอปใช้ is_active = 0 แทนการลบ)
CREATE TABLE IF NOT EXISTS gemba_plans (
  id          TEXT PRIMARY KEY,
  manager_id  TEXT NOT NULL REFERENCES managers (id) ON DELETE CASCADE,
  plan_date   TEXT NOT NULL,
  plan_time   TEXT NOT NULL,
  area_id     TEXT NOT NULL REFERENCES areas (id) ON DELETE RESTRICT,
  note        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'planned'
              CHECK (status IN ('planned', 'completed', 'cancelled')),
  created_at  TEXT NOT NULL
);

-- หน้าแผน/ปฏิทินกรองตามช่วงวันที่เสมอ
CREATE INDEX IF NOT EXISTS idx_plans_date         ON gemba_plans (plan_date);
-- adherence() คิดรายคนในช่วงเวลา
CREATE INDEX IF NOT EXISTS idx_plans_manager_date ON gemba_plans (manager_id, plan_date);
CREATE INDEX IF NOT EXISTS idx_plans_area         ON gemba_plans (area_id);
-- หน้าแผนแยกกลุ่ม "เลยกำหนด" ด้วย status + วันที่
CREATE INDEX IF NOT EXISTS idx_plans_status_date  ON gemba_plans (status, plan_date);


-- หัวข้อของแผน (สูงสุด 3 หัวข้อ — จำกัดที่ชั้น Worker)
-- sort_order เก็บลำดับเดิม เพื่อให้ theme_ids[0] ที่ frontend ใช้ยังคงลำดับเดียวกัน
CREATE TABLE IF NOT EXISTS plan_themes (
  plan_id     TEXT NOT NULL REFERENCES gemba_plans (id) ON DELETE CASCADE,
  theme_id    TEXT NOT NULL REFERENCES walk_themes (id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (plan_id, theme_id)
);

CREATE INDEX IF NOT EXISTS idx_plan_themes_theme ON plan_themes (theme_id);


-- ── บันทึกการเดิน (หลักฐาน) ──────────────────────────────────────────────
-- plan_id เป็น NULL ได้ = การเดินแบบ Ad-hoc ที่ไม่ได้วางแผนล่วงหน้า
-- ใช้ SET NULL ไม่ใช่ CASCADE เพราะถ้าลบแผนทิ้ง บันทึกต้องไม่หายตาม
-- แค่กลายสภาพเป็น Ad-hoc · manager_id ใช้ RESTRICT ด้วยเหตุผลเดียวกัน
CREATE TABLE IF NOT EXISTS gemba_walk_records (
  id              TEXT PRIMARY KEY,
  plan_id         TEXT REFERENCES gemba_plans (id) ON DELETE SET NULL,
  manager_id      TEXT NOT NULL REFERENCES managers (id) ON DELETE RESTRICT,
  actual_date     TEXT NOT NULL,
  actual_time     TEXT NOT NULL,
  actual_area_id  TEXT NOT NULL REFERENCES areas (id) ON DELETE RESTRICT,
  observation     TEXT NOT NULL DEFAULT '',
  has_issue       INTEGER NOT NULL DEFAULT 0 CHECK (has_issue IN (0, 1)),
  issue_summary   TEXT NOT NULL DEFAULT '',
  ci_required     INTEGER NOT NULL DEFAULT 0 CHECK (ci_required IN (0, 1)),
  ci_ticket_no    TEXT NOT NULL DEFAULT '',
  ci_ticket_link  TEXT NOT NULL DEFAULT '',
  completed_at    TEXT NOT NULL
);

-- แดชบอร์ด/รายงานกรองตามช่วงวันที่เป็นหลัก
CREATE INDEX IF NOT EXISTS idx_records_date         ON gemba_walk_records (actual_date);
-- rankManagers() คิดรายคนในช่วงเวลา
CREATE INDEX IF NOT EXISTS idx_records_manager_date ON gemba_walk_records (manager_id, actual_date);
-- coverage() นับครั้งต่อพื้นที่ + หาวันที่เดินล่าสุด
CREATE INDEX IF NOT EXISTS idx_records_area_date    ON gemba_walk_records (actual_area_id, actual_date);
CREATE INDEX IF NOT EXISTS idx_records_plan         ON gemba_walk_records (plan_id);
-- นับประเด็นที่พบ — partial index เก็บเฉพาะแถวที่มีปัญหา ซึ่งเป็นส่วนน้อย
CREATE INDEX IF NOT EXISTS idx_records_issue        ON gemba_walk_records (actual_date) WHERE has_issue = 1;


-- หัวข้อของบันทึก — เก็บแยกจากแผนโดยตั้งใจ เพราะการเดินแบบ Ad-hoc ไม่มีแผนให้อ้าง
-- และการแก้หัวข้อย้อนหลังต้องไม่ไปทับของแผนโดยไม่ได้ตั้งใจ
CREATE TABLE IF NOT EXISTS record_themes (
  record_id   TEXT NOT NULL REFERENCES gemba_walk_records (id) ON DELETE CASCADE,
  theme_id    TEXT NOT NULL REFERENCES walk_themes (id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (record_id, theme_id)
);

-- ใช้บ่อยมาก: themeCompletion() ถามว่า "หัวข้อนี้ใครเดินไปแล้วบ้าง"
CREATE INDEX IF NOT EXISTS idx_record_themes_theme ON record_themes (theme_id);


-- รูปหน้างาน — photo_key คือคีย์ของอ็อบเจกต์ใน R2 (binding PHOTOS)
CREATE TABLE IF NOT EXISTS record_photos (
  id          TEXT PRIMARY KEY,
  record_id   TEXT NOT NULL REFERENCES gemba_walk_records (id) ON DELETE CASCADE,
  photo_key   TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_record_photos_record ON record_photos (record_id, sort_order);


-- ผู้ร่วมเดิน — เก็บเป็นชื่อข้อความตามที่ frontend ใช้ ไม่ผูก FK กับ managers
-- เพราะผู้ร่วมเดินมักเป็นพนักงานหน้างานที่ไม่มีบัญชีในระบบ
CREATE TABLE IF NOT EXISTS record_participants (
  id                TEXT PRIMARY KEY,
  record_id         TEXT NOT NULL REFERENCES gemba_walk_records (id) ON DELETE CASCADE,
  participant_name  TEXT NOT NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_record_participants_record ON record_participants (record_id, sort_order);


-- ── ร่องรอยการแก้ไข ──────────────────────────────────────────────────────
-- record_id ชี้ข้ามตารางได้ (polymorphic) จึงตั้ง FOREIGN KEY ไม่ได้โดยธรรมชาติ
-- และไม่ควรตั้งด้วย เพราะประวัติต้องอยู่ต่อแม้แถวต้นทางถูกลบไปแล้ว
CREATE TABLE IF NOT EXISTS change_history (
  id           TEXT PRIMARY KEY,
  table_name   TEXT NOT NULL,
  record_id    TEXT NOT NULL,
  action_type  TEXT NOT NULL CHECK (action_type IN ('create', 'update', 'delete')),
  field        TEXT,
  old_value    TEXT,
  new_value    TEXT,
  changed_by   TEXT NOT NULL,
  changed_at   TEXT NOT NULL
);

-- WalkDetailDialog เปิดดูประวัติของบันทึกใบเดียว
CREATE INDEX IF NOT EXISTS idx_changes_record ON change_history (record_id);
-- หน้าตั้งค่าแสดงประวัติล่าสุดเรียงตามเวลา
CREATE INDEX IF NOT EXISTS idx_changes_at     ON change_history (changed_at DESC);


-- ── ประกาศหัวข้อประจำสัปดาห์ ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weekly_focus (
  id          TEXT PRIMARY KEY,
  week_start  TEXT NOT NULL,
  week_end    TEXT NOT NULL,
  message_th  TEXT NOT NULL DEFAULT '',
  message_en  TEXT NOT NULL DEFAULT '',
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

-- getActiveFocus() หาสัปดาห์ที่ครอบวันที่ปัจจุบัน
CREATE INDEX IF NOT EXISTS idx_focus_week ON weekly_focus (week_start, week_end);

CREATE TABLE IF NOT EXISTS focus_themes (
  focus_id  TEXT NOT NULL REFERENCES weekly_focus (id) ON DELETE CASCADE,
  theme_id  TEXT NOT NULL REFERENCES walk_themes (id) ON DELETE CASCADE,
  PRIMARY KEY (focus_id, theme_id)
);


-- ── ประวัติการเข้าสู่ระบบ ────────────────────────────────────────────────
-- actor_id เก็บ '-' ได้เมื่อล็อกอินไม่สำเร็จ (ไม่รู้ว่าเป็นใคร) จึงไม่ตั้ง FK
CREATE TABLE IF NOT EXISTS login_history (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT NOT NULL,
  actor_name  TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('manager', 'admin')),
  at          TEXT NOT NULL,
  result      TEXT NOT NULL CHECK (result IN ('success', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_login_at ON login_history (at DESC);


-- ── ตั้งค่าระบบ ──────────────────────────────────────────────────────────
-- ตารางแถวเดียว บังคับด้วย CHECK (id = 1) กันไม่ให้เผลอมีหลายชุด
CREATE TABLE IF NOT EXISTS app_settings (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  weekly_target      INTEGER NOT NULL DEFAULT 1,
  recent_visit_days  INTEGER NOT NULL DEFAULT 7,
  company_name       TEXT NOT NULL DEFAULT '',
  plant_name         TEXT NOT NULL DEFAULT '',

  -- ── ค่าตั้งของงานความปลอดภัย ──────────────────────────────────────────
  -- บทบาทที่ให้อัตโนมัติกับคนที่ยังไม่ถูกใส่ไว้ใน user_roles
  -- เมื่อกรอกทะเบียนสิทธิ์ครบแล้วให้เปลี่ยนเป็น 'viewer' ระบบจะกลายเป็นปิดโดยปริยาย
  default_role_code   TEXT NOT NULL DEFAULT 'inspector',
  -- จำนวนวันที่ให้แก้ไข นับจากวันที่พบ — แยกตามระดับความรุนแรง
  due_days_low        INTEGER NOT NULL DEFAULT 30,
  due_days_medium     INTEGER NOT NULL DEFAULT 14,
  due_days_high       INTEGER NOT NULL DEFAULT 3,
  due_days_critical   INTEGER NOT NULL DEFAULT 1,
  -- บังคับแนบรูปหลังแก้ไขก่อนส่งตรวจรับ (หลักฐานปิดงาน)
  require_after_photo INTEGER NOT NULL DEFAULT 1 CHECK (require_after_photo IN (0, 1))
);


-- ============================================================================
--  ส่วนขยาย GEMBA SAFETY — การตรวจความปลอดภัย · ใบแจ้งปัญหา · สิทธิ์ผู้ใช้งาน
--
--  ทั้งหมดต่อยอดจากตารางเดิม ไม่แก้ตารางเดิมสักตัว (ยกเว้น app_settings ที่เพิ่มคอลัมน์)
--  ฐานข้อมูลเดิมที่มีข้อมูลอยู่แล้วให้รัน migrate-safety.sql ตามหลังไฟล์นี้
-- ============================================================================


-- ── สิทธิ์ผู้ใช้งาน (RBAC) ────────────────────────────────────────────────
--
-- ออกแบบเป็น 4 ตารางตามแบบ role-based access control มาตรฐาน
--   permissions      รายการ "สิ่งที่ทำได้" ทั้งหมดในระบบ — เพิ่มเมื่อมีฟีเจอร์ใหม่
--   roles            บทบาท เช่น ผู้ดูแลระบบ · จป. · ผู้จัดการ · หัวหน้างาน
--   role_permissions บทบาทไหนทำอะไรได้บ้าง
--   user_roles       ใครเป็นบทบาทไหน — ตารางนี้ตั้งใจเว้นว่างไว้ ใส่ทีหลังได้
--
-- ระหว่างที่ user_roles ยังว่าง ผู้ที่ล็อกอินได้จะได้บทบาทตั้งต้นตามค่า
-- app_settings.default_role_code เพื่อให้ระบบเดินได้ทันทีโดยไม่ต้องรอกรอกทะเบียนสิทธิ์
CREATE TABLE IF NOT EXISTS roles (
  id            TEXT PRIMARY KEY,
  role_code     TEXT NOT NULL UNIQUE,
  role_name     TEXT NOT NULL,
  role_name_en  TEXT,
  description   TEXT NOT NULL DEFAULT '',
  -- บทบาทของระบบ ห้ามลบ (ลบแล้วคนที่ถืออยู่จะไร้สิทธิ์ทันที)
  is_system     INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS permissions (
  perm_code     TEXT PRIMARY KEY,
  perm_group    TEXT NOT NULL,
  perm_name     TEXT NOT NULL,
  perm_name_en  TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id    TEXT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  perm_code  TEXT NOT NULL REFERENCES permissions (perm_code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, perm_code)
);

CREATE INDEX IF NOT EXISTS idx_role_perms_perm ON role_permissions (perm_code);

-- ใครเป็นบทบาทไหน — จำกัดขอบเขตเป็นรายพื้นที่ได้ด้วย
--
-- scope_area_id ใช้ '*' แทน "ทั้งโรงงาน" ไม่ใช่ NULL โดยตั้งใจ
-- เพราะ SQLite ถือว่า NULL ไม่เท่ากับ NULL คีย์ UNIQUE จึงกันแถวซ้ำไม่ได้ถ้าใช้ NULL
-- ผลคือคนเดียวถูกใส่บทบาทเดิมซ้ำได้ไม่จำกัด ทะเบียนสิทธิ์จะรกจนอ่านไม่ออก
CREATE TABLE IF NOT EXISTS user_roles (
  id             TEXT PRIMARY KEY,
  manager_id     TEXT NOT NULL REFERENCES managers (id) ON DELETE CASCADE,
  role_id        TEXT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  scope_area_id  TEXT NOT NULL DEFAULT '*',
  granted_by     TEXT NOT NULL DEFAULT '',
  granted_at     TEXT NOT NULL,
  UNIQUE (manager_id, role_id, scope_area_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_manager ON user_roles (manager_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role    ON user_roles (role_id);


-- ── แม่แบบเช็คลิสต์ความปลอดภัย ───────────────────────────────────────────
--
-- ผูกกับ walk_themes ซึ่งในแอปนี้คือ "หมวดความปลอดภัย" (PPE · การ์ดเครื่องจักร · LOTO …)
-- ผู้เดินเลือกหมวดตอนวางแผน แล้วหน้าบันทึกจะดึงข้อตรวจของหมวดนั้นมาให้ติ๊กทีละข้อ
CREATE TABLE IF NOT EXISTS safety_checklist_items (
  id                TEXT PRIMARY KEY,
  theme_id          TEXT NOT NULL REFERENCES walk_themes (id) ON DELETE CASCADE,
  item_code         TEXT NOT NULL DEFAULT '',
  question          TEXT NOT NULL,
  question_en       TEXT,
  -- ระดับความรุนแรงตั้งต้นเมื่อข้อนี้ "ไม่ผ่าน" — ผู้ตรวจปรับได้ตอนเปิดใบแจ้ง
  default_severity  TEXT NOT NULL DEFAULT 'medium'
                    CHECK (default_severity IN ('low', 'medium', 'high', 'critical')),
  sort_order        INTEGER NOT NULL DEFAULT 0,
  is_active         INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_checklist_theme ON safety_checklist_items (theme_id, sort_order);


-- ── ใบแจ้งปัญหาความปลอดภัย (หัวใจของระบบ) ────────────────────────────────
--
-- วงจรงาน: พบปัญหา → มอบหมายผู้จัดการ + หัวหน้างาน → ลงมือแก้ → แนบรูปหลังแก้
--          → ผู้ตรวจตรวจรับ → ปิดงาน   (ตรวจรับไม่ผ่าน = ตีกลับไปสถานะกำลังแก้ไข)
--
--   open        พบแล้วแต่ยังไม่มอบหมาย
--   assigned    มอบหมายให้ผู้จัดการ + หัวหน้างานแล้ว
--   in_progress ผู้รับผิดชอบกดรับงานแล้ว กำลังแก้
--   fixed       แก้เสร็จ แนบรูปหลังแก้แล้ว รอผู้ตรวจตรวจรับ
--   closed      ตรวจรับผ่าน ปิดงาน
--   cancelled   ยกเลิก (ซ้ำกับใบอื่น หรือดูแล้วไม่ใช่ปัญหาจริง)
--
-- reported_by / assigned_* ใช้ RESTRICT — ใบแจ้งเป็นหลักฐาน ห้ามหายเพราะลบคน
CREATE TABLE IF NOT EXISTS safety_findings (
  id                      TEXT PRIMARY KEY,
  finding_no              TEXT NOT NULL UNIQUE,
  -- ใบที่เปิดจากการเดินตรวจจะมี record_id · ใบที่แจ้งตรง ๆ ไม่มี (NULL)
  record_id               TEXT REFERENCES gemba_walk_records (id) ON DELETE SET NULL,
  area_id                 TEXT NOT NULL REFERENCES areas (id) ON DELETE RESTRICT,
  theme_id                TEXT REFERENCES walk_themes (id) ON DELETE SET NULL,
  checklist_item_id       TEXT REFERENCES safety_checklist_items (id) ON DELETE SET NULL,

  title                   TEXT NOT NULL,
  description             TEXT NOT NULL DEFAULT '',
  severity                TEXT NOT NULL DEFAULT 'medium'
                          CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status                  TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'assigned', 'in_progress', 'fixed', 'closed', 'cancelled')),

  reported_by             TEXT NOT NULL REFERENCES managers (id) ON DELETE RESTRICT,
  reported_at             TEXT NOT NULL,
  due_date                TEXT NOT NULL,
  -- สิ่งที่ทำทันทีหน้างานเพื่อกันอันตรายเฉพาะหน้า (กั้นพื้นที่ · หยุดเครื่อง)
  immediate_action        TEXT NOT NULL DEFAULT '',

  assigned_manager_id     TEXT REFERENCES managers (id) ON DELETE RESTRICT,
  assigned_supervisor_id  TEXT REFERENCES managers (id) ON DELETE RESTRICT,
  assigned_at             TEXT,
  assigned_by             TEXT NOT NULL DEFAULT '',

  root_cause              TEXT NOT NULL DEFAULT '',
  action_taken            TEXT NOT NULL DEFAULT '',
  fixed_by                TEXT REFERENCES managers (id) ON DELETE RESTRICT,
  fixed_at                TEXT,

  verified_by             TEXT REFERENCES managers (id) ON DELETE RESTRICT,
  verified_at             TEXT,
  verify_note             TEXT NOT NULL DEFAULT '',
  closed_at               TEXT,

  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

-- หน้าจอหลักคือ "ใบที่ยังไม่ปิด เรียงตามวันครบกำหนด" — index นี้รองรับตรง ๆ
CREATE INDEX IF NOT EXISTS idx_findings_status_due  ON safety_findings (status, due_date);
CREATE INDEX IF NOT EXISTS idx_findings_area        ON safety_findings (area_id, status);
-- "งานของฉัน" ของผู้จัดการกับของหัวหน้างานถามคนละคอลัมน์ จึงต้องมีสอง index
CREATE INDEX IF NOT EXISTS idx_findings_manager     ON safety_findings (assigned_manager_id, status);
CREATE INDEX IF NOT EXISTS idx_findings_supervisor  ON safety_findings (assigned_supervisor_id, status);
CREATE INDEX IF NOT EXISTS idx_findings_reported    ON safety_findings (reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_findings_record      ON safety_findings (record_id);


-- ผลตรวจรายข้อของการเดินหนึ่งครั้ง
--
-- item_id ใช้ RESTRICT เพราะผลตรวจเป็นหลักฐาน ถ้าลบข้อตรวจทิ้งแล้วผลหายตาม
-- รายงานย้อนหลังจะเพี้ยน — ให้ปิด is_active แทนการลบเสมอ
CREATE TABLE IF NOT EXISTS walk_checklist_results (
  record_id   TEXT NOT NULL REFERENCES gemba_walk_records (id) ON DELETE CASCADE,
  item_id     TEXT NOT NULL REFERENCES safety_checklist_items (id) ON DELETE RESTRICT,
  result      TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'na')),
  note        TEXT NOT NULL DEFAULT '',
  -- ใบแจ้งปัญหาที่เกิดจากข้อนี้ (ถ้ามี) — ผูกไว้เพื่อให้ตามรอยกลับได้
  finding_id  TEXT REFERENCES safety_findings (id) ON DELETE SET NULL,
  PRIMARY KEY (record_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_checklist_results_item ON walk_checklist_results (item_id, result);


-- รูปประกอบใบแจ้ง — แยก "ก่อนแก้" กับ "หลังแก้" ด้วยคอลัมน์ phase
-- รูปหลังแก้คือหลักฐานปิดงาน ระบบบังคับว่าต้องมีอย่างน้อย 1 รูปก่อนเปลี่ยนเป็น fixed
CREATE TABLE IF NOT EXISTS finding_photos (
  id           TEXT PRIMARY KEY,
  finding_id   TEXT NOT NULL REFERENCES safety_findings (id) ON DELETE CASCADE,
  photo_key    TEXT NOT NULL,
  phase        TEXT NOT NULL DEFAULT 'before' CHECK (phase IN ('before', 'after')),
  uploaded_by  TEXT NOT NULL DEFAULT '',
  uploaded_at  TEXT NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_finding_photos ON finding_photos (finding_id, phase, sort_order);


-- ไทม์ไลน์ของใบแจ้ง — ทุกการเปลี่ยนมือและทุกความเห็นถูกบันทึกที่นี่
-- เก็บชื่อผู้ทำรายการเป็นข้อความไปเลย ประวัติจึงยังอ่านออกแม้คนนั้นถูกลบจากทะเบียน
CREATE TABLE IF NOT EXISTS finding_events (
  id          TEXT PRIMARY KEY,
  finding_id  TEXT NOT NULL REFERENCES safety_findings (id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL CHECK (event_type IN (
                'created', 'assigned', 'reassigned', 'started', 'fixed',
                'rejected', 'verified', 'closed', 'cancelled', 'reopened',
                'comment', 'due_changed', 'severity_changed', 'updated')),
  actor_id    TEXT NOT NULL DEFAULT '',
  actor_name  TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finding_events ON finding_events (finding_id, at);


-- กล่องงานของผู้รับผิดชอบ — สร้างตอนมอบหมาย · ตีกลับ · ตรวจรับ
-- เวอร์ชันนี้ยังไม่ส่งอีเมล/LINE ผู้ใช้เห็นที่หน้า "งานของฉัน" และกระดิ่งบนหัวจอ
CREATE TABLE IF NOT EXISTS notifications (
  id           TEXT PRIMARY KEY,
  manager_id   TEXT NOT NULL REFERENCES managers (id) ON DELETE CASCADE,
  finding_id   TEXT REFERENCES safety_findings (id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'assigned',
  title        TEXT NOT NULL,
  body         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  read_at      TEXT
);

-- หน้าจอถามอย่างเดียวว่า "ของฉันล่าสุดมีอะไรบ้าง"
CREATE INDEX IF NOT EXISTS idx_notifications_inbox ON notifications (manager_id, created_at DESC);
