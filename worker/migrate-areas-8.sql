-- ============================================================================
--  เหลือพื้นที่เดินตรวจ 8 แห่ง: VSM1–VSM4 · QC · MTN · คลังสินค้า · Office
--
--  พื้นที่อื่น 13 แห่งถูก "ปิดใช้งาน" ไม่ได้ลบ — แผน/การเดิน/ใบแจ้งเดิมยังอ้างถึงอยู่
--  (areas ใช้ FK แบบ RESTRICT) เปิดกลับได้ที่ ตั้งค่า › พื้นที่
--
--  รันซ้ำได้ ไม่มีผลข้างเคียง:
--    npx wrangler d1 execute gemba-safety --remote --file=./migrate-areas-8.sql
--  ⚠️ ต้องตรงกับ AREAS ใน src/lib/roster.ts และบล็อกพื้นที่ใน seed.sql
-- ============================================================================

-- ชื่อสั้นในวงเล็บคือชื่อที่หน้างานเรียกกัน — ใช้ค้นในตัวเลือกพื้นที่และตอนวางแผนจาก Excel ได้ด้วย
UPDATE areas SET area_name = 'ควบคุมคุณภาพ (QC)', area_name_en = 'Quality Control (QC)' WHERE id = 'ar_qc';
UPDATE areas SET area_name = 'ซ่อมบำรุง (MTN)', area_name_en = 'Maintenance (MTN)' WHERE id = 'ar_maint';
UPDATE areas SET area_name = 'คลังสินค้า (Warehouse)', area_name_en = 'Warehouse' WHERE id = 'ar_wh';

INSERT OR IGNORE INTO areas (id, area_name, area_name_en, parent_id, department, is_active) VALUES
  ('ar_office', 'สำนักงาน (Office)', 'Office', NULL, 'Office', 1);

UPDATE areas SET is_active = 1
 WHERE id IN ('ar_vsm1', 'ar_vsm2', 'ar_vsm3', 'ar_vsm4', 'ar_qc', 'ar_maint', 'ar_wh', 'ar_office');

-- พื้นที่ย่อยของ 8 แห่งนี้ (ถ้ามี) ยังเปิดอยู่ตามเดิม
UPDATE areas SET is_active = 0
 WHERE id NOT IN ('ar_vsm1', 'ar_vsm2', 'ar_vsm3', 'ar_vsm4', 'ar_qc', 'ar_maint', 'ar_wh', 'ar_office')
   AND COALESCE(parent_id, '') NOT IN ('ar_vsm1', 'ar_vsm2', 'ar_vsm3', 'ar_vsm4', 'ar_qc', 'ar_maint', 'ar_wh', 'ar_office');

-- ตรวจผล — ต้องได้ 8
-- SELECT COUNT(*) FROM areas WHERE is_active = 1 AND parent_id IS NULL;
