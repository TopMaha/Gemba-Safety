/**
 * โหมดสว่าง/มืด — เก็บค่าที่เลือกไว้ในเครื่อง
 *
 * สีของแอปผูกกับแบรนด์ TENNECO (น้ำเงิน–ขาว) ตายตัวแล้ว จึงไม่มีตัวเลือกสีเน้นอีก
 * ค่าสีทั้งหมดอยู่ใน src/index.css
 */

export type Mode = 'light' | 'dark';

const MODE_KEY = 'gemba.mode.v2';
/**
 * คีย์รุ่นเก่า — ล้างทิ้งเมื่อเปิดแอป
 *   gemba.accent  ตัวเลือกสีเน้นรุ่นเก่า (amber/steel/lime)
 *   gemba.mode    รุ่นเดิมบันทึกโหมดตามธีมของเครื่องตั้งแต่เปิดครั้งแรก (มือถือที่ตั้งมืดไว้จึงค้างโหมดมืด)
 *                 เปลี่ยนคีย์เพื่อให้ทุกเครื่องกลับมาเริ่มที่โหมดสว่างครั้งเดียว
 */
const LEGACY_KEYS = ['gemba.accent', 'gemba.mode'];

/** เริ่มต้นเป็นโหมดสว่าง (ตอนเช้า) เสมอ ไม่ตามธีมของเครื่อง — มืดเฉพาะเมื่อผู้ใช้กดเปลี่ยนเอง */
export function getMode(): Mode {
  return localStorage.getItem(MODE_KEY) === 'dark' ? 'dark' : 'light';
}

export function applyTheme(mode: Mode = getMode()) {
  const root = document.documentElement;
  root.classList.remove('theme-steel', 'theme-lime');
  root.classList.toggle('dark', mode === 'dark');
  LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  localStorage.setItem(MODE_KEY, mode);
}

/** สีประจำตัวจาก id (ใช้กับ avatar และแท็กหัวข้อ) */
export function hueFrom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}
