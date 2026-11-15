-- ============================================================================
--  ตั้ง T-815 เป็นผู้ดูแลระบบ (บทบาท admin ทั้งโรงงาน) ไปก่อน
--
--  บทบาท admin ในทะเบียนสิทธิ์ = ทำได้ทุกอย่างในแอปตอนล็อกอินปกติ (มอบหมาย · ตรวจรับ · เห็นทุกพื้นที่ …)
--  และเห็นทางลัด "ผู้ดูแลระบบ" ในเมนู ส่วนงานที่แก้กติกาของระบบ (ผู้เดินตรวจ · วางแผนให้ทีม ·
--  พื้นที่ · หัวข้อ) ยังต้องเข้าโหมดผู้ดูแลที่ /admin — T-815 อยู่ในตาราง superusers อยู่แล้ว
--
--  รันซ้ำได้ (UNIQUE manager_id + role_id + scope):
--    npx wrangler d1 execute gemba-safety --remote --file=./grant-t815-admin.sql
--  เพิ่ม/ถอนทีหลังได้ที่หน้า /admin/roles
-- ============================================================================

INSERT OR IGNORE INTO user_roles (id, manager_id, role_id, scope_area_id, granted_by, granted_at)
SELECT 'ur_' || m.id || '_admin', m.id, 'role_admin', '*', 'ตั้งค่าเริ่มต้น', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM managers m
 WHERE m.manager_code = 'T-815';

-- ตรวจผล
-- SELECT ur.id, m.manager_code, ur.role_id, ur.scope_area_id FROM user_roles ur JOIN managers m ON m.id = ur.manager_id;
