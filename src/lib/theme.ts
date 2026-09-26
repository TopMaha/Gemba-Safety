/**
 * โหมดสว่าง/มืด — เก็บค่าที่เลือกไว้ในเครื่อง
 *
 * สีของแอปผูกกับแบรนด์ TENNECO (น้ำเงิน–ขาว) ตายตัวแล้ว จึงไม่มีตัวเลือกสีเน้นอีก
 * ค่าสีทั้งหมดอยู่ใน src/index.css
 */

export type Mode = 'light' | 'dark';

const MODE_KEY = 'gemba.mode';
/** คีย์ของตัวเลือกสีเน้นรุ่นเก่า (amber/steel/lime) — ล้างทิ้งเมื่อเปิดแอป */
const LEGACY_ACCENT_KEY = 'gemba.accent';

export function getMode(): Mode {
  const v = localStorage.getItem(MODE_KEY);
  if (v === 'dark' || v === 'light') return v;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(mode: Mode = getMode()) {
  const root = document.documentElement;
  root.classList.remove('theme-steel', 'theme-lime');
  root.classList.toggle('dark', mode === 'dark');
  localStorage.removeItem(LEGACY_ACCENT_KEY);
  localStorage.setItem(MODE_KEY, mode);
}

/** สีประจำตัวจาก id (ใช้กับ avatar และแท็กหัวข้อ) */
export function hueFrom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}
