-- ============================================================================
--  ย้ายฐานข้อมูลเดิม (Gemba Walk) ให้รองรับ GEMBA SAFETY
--
--  ใช้เฉพาะกรณีที่มีฐานข้อมูลเดิมซึ่งมีข้อมูลอยู่แล้วและไม่อยากสร้างใหม่
--  ถ้าเป็นฐานข้อมูลใหม่ ให้รัน schema.sql อย่างเดียวพอ ไม่ต้องแตะไฟล์นี้
--
--  ลำดับการรัน
--    1) schema.sql        สร้างตารางใหม่ทั้งหมด (CREATE TABLE IF NOT EXISTS รันซ้ำได้)
--    2) migrate-safety.sql ไฟล์นี้ — เพิ่มคอลัมน์ใน app_settings ซึ่ง CREATE TABLE ข้ามไป
--    3) seed-safety.sql   ใส่บทบาท สิทธิ์ และข้อตรวจตั้งต้น
--
--  ⚠️ SQLite ไม่มี "ADD COLUMN IF NOT EXISTS" — รันซ้ำจะได้ error
--     "duplicate column name" ซึ่งไม่ได้ทำอะไรเสียหาย ข้ามไปได้เลย
-- ============================================================================

ALTER TABLE app_settings ADD COLUMN default_role_code   TEXT    NOT NULL DEFAULT 'inspector';
ALTER TABLE app_settings ADD COLUMN due_days_low        INTEGER NOT NULL DEFAULT 30;
ALTER TABLE app_settings ADD COLUMN due_days_medium     INTEGER NOT NULL DEFAULT 14;
ALTER TABLE app_settings ADD COLUMN due_days_high       INTEGER NOT NULL DEFAULT 3;
ALTER TABLE app_settings ADD COLUMN due_days_critical   INTEGER NOT NULL DEFAULT 1;
ALTER TABLE app_settings ADD COLUMN require_after_photo INTEGER NOT NULL DEFAULT 1;

-- ตรวจว่าครบแล้ว — ต้องเห็นคอลัมน์ทั้งหกตัวด้านบน
-- PRAGMA table_info(app_settings);
