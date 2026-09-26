-- ============================================================================
--  ล้างข้อมูลตัวอย่างชุดเดิมออกจาก D1 ก่อนขึ้นระบบจริง
--  รันด้วย: wrangler d1 execute gemba-audit --file=./wipe-demo.sql --remote
--  แล้วค่อยรัน seed.sql เพื่อใส่ทะเบียนพนักงานจริง
--
--  ลำดับสำคัญ: ลบตารางที่ถูกอ้างถึงเป็นลำดับสุดท้ายเสมอ (FK)
-- ============================================================================

DELETE FROM login_history;
DELETE FROM change_history;
DELETE FROM record_participants;
DELETE FROM record_photos;
DELETE FROM record_themes;
DELETE FROM gemba_walk_records;
DELETE FROM plan_themes;
DELETE FROM gemba_plans;
DELETE FROM focus_themes;
DELETE FROM weekly_focus;
DELETE FROM areas;
DELETE FROM managers;
DELETE FROM superusers;
DELETE FROM app_settings;
