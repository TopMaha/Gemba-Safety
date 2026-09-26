/**
 * เซสชันผู้ดูแลระบบ — ตัวจริงที่ตัดสินว่าใครเป็นแอดมิน
 *
 * ทำไมต้องมี
 *   เดิมหน้า /admin กันด้วยค่าใน localStorage อย่างเดียว (gemba.admin = '1')
 *   ใครเปิด devtools ตั้งค่านั้นเองก็เข้าหน้าตั้งค่าไปเปิดสิทธิ์ can_login ให้ตัวเองได้
 *   ซึ่งทำให้การกำหนดสิทธิ์รายคนไร้ความหมายทั้งหมด เซิร์ฟเวอร์จึงต้องเป็นคนตัดสินเอง
 *   ฝั่งหน้าเว็บเหลือหน้าที่แค่ "ซ่อนเมนู" ไม่ใช่ด่านกันอีกต่อไป
 *
 * เก็บเฉพาะค่าแฮชของโทเคน ไม่เก็บตัวโทเคน
 *   ถ้าฐานข้อมูลหลุดออกไป คนที่ได้ไปจะแปลงกลับเป็นโทเคนที่ใช้ได้จริงไม่ได้
 */

/**
 * อายุเซสชัน 12 ชั่วโมง — ยาวพอให้ทำงานจบกะโดยไม่ต้องกรอกรหัสซ้ำ
 * แต่ไม่ยาวจนเครื่องที่วางทิ้งไว้กลายเป็นประตูเปิดค้าง
 */
const TTL_MS = 12 * 60 * 60 * 1000;

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** โทเคนสุ่ม 256 บิต จากตัวสุ่มเชิงรหัสลับ ไม่ใช่ Math.random() */
function newToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

async function hashToken(token) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}

/**
 * ออกเซสชันใหม่ให้ผู้ดูแลที่กรอกรหัสถูก
 * คืนตัวโทเคนกลับไปครั้งเดียวตอนนี้เท่านั้น หลังจากนี้ในฐานข้อมูลมีแต่ค่าแฮช
 */
export async function createAdminSession(db, su) {
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_MS).toISOString();

  await db.batch([
    // เก็บกวาดของหมดอายุตอนมีคนล็อกอิน จะได้ไม่ต้องตั้งงานตามเวลาแยกอีกตัว
    db.prepare(`DELETE FROM admin_sessions WHERE expires_at < ?`).bind(now.toISOString()),
    db
      .prepare(
        `INSERT INTO admin_sessions (token_hash, admin_id, admin_name, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(await hashToken(token), su.id, su.full_name, now.toISOString(), expiresAt),
  ]);

  return { token, expires_at: expiresAt };
}

/**
 * อ่านเซสชันจากหัวข้อ X-Admin-Token — คืน null เมื่อไม่มี ไม่รู้จัก หรือหมดอายุ
 * เทียบวันหมดอายุแบบสตริงได้ เพราะ ISO 8601 แบบ UTC เรียงตามตัวอักษรตรงกับเรียงตามเวลา
 */
export async function readAdminSession(c) {
  const token = c.req.header('X-Admin-Token');
  if (!token) return null;

  const row = await c.env.DB.prepare(
    `SELECT admin_id, admin_name, expires_at FROM admin_sessions WHERE token_hash = ?`,
  )
    .bind(await hashToken(token))
    .first();

  if (!row || row.expires_at <= new Date().toISOString()) return null;
  return row;
}

/** ออกจากระบบ — ลบเซสชันทิ้งทันที ไม่ต้องรอหมดอายุ */
export async function revokeAdminSession(c) {
  const token = c.req.header('X-Admin-Token');
  if (!token) return;
  await c.env.DB.prepare(`DELETE FROM admin_sessions WHERE token_hash = ?`).bind(await hashToken(token)).run();
}
