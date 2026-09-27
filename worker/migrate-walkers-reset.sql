-- ============================================================================
--  ล้างรายชื่อผู้เดินตรวจตั้งต้น ให้ Super Admin กำหนดเองรายคน
--  รันด้วย: wrangler d1 execute gemba-safety --remote --file=./migrate-walkers-reset.sql
--
--  เดิม migrate-access.sql เปิดสิทธิ์ให้ระดับหัวหน้าขึ้นไป 63 คนโดยอัตโนมัติตามตำแหน่ง
--  ผู้ใช้ขอให้เอารายชื่อชุดนั้นออกก่อน แล้วค่อยกำหนดทีหลังว่าใครต้องเดินบ้าง
--
--  can_login = ผู้เดินตรวจ (ล็อกอินได้ + นับเป็นเป้า "Plan = N คน" ในแดชบอร์ด)
--  เหลือไว้แค่ T-815 (Super Admin) เพื่อให้ยังทดสอบฝั่งผู้เดินได้
--  การเข้าหน้า /admin ใช้ตาราง superusers แยกต่างหาก ไม่กระทบจากไฟล์นี้
--
--  รันซ้ำได้ ผลลัพธ์เหมือนเดิม
-- ============================================================================

-- เก็บร่องรอยไว้ใน change_history ก่อนเปลี่ยน เพื่อย้อนดูได้ว่าใครเคยถูกเปิดไว้
INSERT INTO change_history (id, table_name, record_id, action_type, field, old_value, new_value, changed_by, changed_at)
SELECT 'ch_walkreset_' || id, 'managers', id, 'update', 'can_login', 'true', 'false',
       'ระบบ (ล้างรายชื่อผู้เดินตั้งต้น)', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM managers
 WHERE can_login = 1
   AND manager_code <> 'T-815'
   AND 'ch_walkreset_' || id NOT IN (SELECT id FROM change_history);

UPDATE managers SET can_login = 0 WHERE can_login = 1 AND manager_code <> 'T-815';

UPDATE managers SET can_login = 1 WHERE manager_code = 'T-815' AND is_active = 1;
