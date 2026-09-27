/**
 * โหมดสว่าง/มืด — เก็บค่าที่เลือกไว้ในเครื่อง
 *
 * สีของแอปผูกกับแบรนด์ TENNECO (น้ำเงิน–ขาว) ตายตัวแล้ว จึงไม่มีตัวเลือกสีเน้นอีก
 * ค่าสีทั้งหมดอยู่ใน src/index.css
 */

import { STORAGE_KEYS } from './storageKeys';

export type Mode = 'light' | 'dark';

/**
 * คีย์ของแอปนี้เอง — คีย์รุ่นเก่า gemba.accent / gemba.mode / gemba.mode.v2 เป็นของ Gemba Walk
 * ที่อยู่ origin เดียวกัน แอปนี้จึงไม่ลบ ปล่อยให้ Gemba Walk จัดการเอง (ดู storageKeys.ts)
 */
const MODE_KEY = STORAGE_KEYS.mode;

/** เริ่มต้นเป็นโหมดสว่าง (ตอนเช้า) เสมอ ไม่ตามธีมของเครื่อง — มืดเฉพาะเมื่อผู้ใช้กดเปลี่ยนเอง */
export function getMode(): Mode {
  return localStorage.getItem(MODE_KEY) === 'dark' ? 'dark' : 'light';
}

export function applyTheme(mode: Mode = getMode()) {
  const root = document.documentElement;
  root.classList.remove('theme-steel', 'theme-lime');
  root.classList.toggle('dark', mode === 'dark');
  localStorage.setItem(MODE_KEY, mode);
}

/** สีประจำตัวจาก id (ใช้กับ avatar และแท็กหัวข้อ) */
export function hueFrom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}
