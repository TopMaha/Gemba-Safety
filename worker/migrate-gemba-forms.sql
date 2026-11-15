-- ============================================================================
--  เปลี่ยนการเดินตรวจเป็นแบบฟอร์ม GEMBA WALK (ตารางเหมือนเอกสาร Excel)
--
--  ใช้กับฐานข้อมูลที่มีอยู่แล้วเท่านั้น — ฐานข้อมูลใหม่ใช้ schema.sql ซึ่งมีคอลัมน์ครบแล้ว
--
--  ลำดับการรัน (ครั้งเดียว)
--    1) migrate-gemba-forms.sql   ไฟล์นี้ — เพิ่มคอลัมน์ใหม่ 4 ตัว
--    2) seed-gemba-topics.sql     ปิดหมวดเดิม 12 หมวด + ใส่หัวข้อ 13 หมวดและข้อตรวจ 151 ข้อ
--
--    npx wrangler d1 execute gemba-safety --remote --file=./migrate-gemba-forms.sql
--    npx wrangler d1 execute gemba-safety --remote --file=./seed-gemba-topics.sql
--
--  ⚠️ SQLite ไม่มี "ADD COLUMN IF NOT EXISTS" — รันซ้ำจะได้ error "duplicate column name"
--     แปลว่าเคยรันไปแล้ว ไม่ได้ทำอะไรเสียหาย ข้ามไปขั้นที่ 2 ได้เลย
--  ⚠️ ต้อง deploy Worker ตัวใหม่หลังรันไฟล์นี้ (Worker เก่าไม่รู้จักคอลัมน์ใหม่ แต่ก็ไม่พัง)
-- ============================================================================

-- คอลัมน์สถานะของแบบฟอร์ม: ใช่/ไม่ใช่/ไม่เกี่ยวข้อง หรือ OK/NOK (LPA)
ALTER TABLE walk_themes ADD COLUMN form_style TEXT NOT NULL DEFAULT 'yes_no_na'
  CHECK (form_style IN ('yes_no_na', 'ok_nok'));

-- ตารางคำถามทางเทคนิค หรือ ตารางคำถามความผูกพันของพนักงาน
ALTER TABLE safety_checklist_items ADD COLUMN section TEXT NOT NULL DEFAULT 'technical'
  CHECK (section IN ('technical', 'engagement'));

-- ช่อง "กะ:" บนหัวแบบฟอร์ม
ALTER TABLE gemba_walk_records ADD COLUMN shift TEXT NOT NULL DEFAULT '';

-- คอลัมน์ "การดำเนินการแก้ไข" ในตารางปัญหาที่ตรวจพบ
ALTER TABLE safety_findings ADD COLUMN corrective_action TEXT NOT NULL DEFAULT '';

-- ตรวจว่าครบแล้ว
-- PRAGMA table_info(walk_themes);
-- PRAGMA table_info(safety_checklist_items);
