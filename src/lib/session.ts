import type { Manager } from './types';

/** เซสชันผู้ใช้ เก็บใน localStorage — คงอยู่หลังรีเฟรช/เปลี่ยนหน้า */

const KEY = 'gemba.session';

/**
 * เซสชันผู้ดูแลระบบ
 *
 * ของเดิมเก็บแค่ธง '1' ซึ่งใครก็ตั้งเองใน devtools ได้ แล้วเข้าหน้าตั้งค่า
 * ไปเปิดสิทธิ์ให้ตัวเองได้ทั้งที่ไม่รู้รหัสผู้ดูแล ตอนนี้เก็บโทเคนที่เซิร์ฟเวอร์ออกให้แทน
 *
 * ⚠️ ค่าที่เก็บตรงนี้ไม่ใช่ด่านกัน — ปลอมได้เหมือนเดิมทุกประการ
 *    มันมีหน้าที่แค่ตัดสินว่าจะโชว์เมนูผู้ดูแลไหม ด่านจริงอยู่ที่ Worker
 *    ซึ่งตรวจโทเคนกับตาราง admin_sessions ทุกครั้งที่มีการเขียนงานแอดมิน
 */
const ADMIN_KEY = 'gemba.admin.session';

/** ธงชุดเก่าที่เคยใช้เป็นด่าน — ล้างทิ้งเพื่อไม่ให้เหลือค้างชวนเข้าใจผิด */
const LEGACY_ADMIN_KEY = 'gemba.admin';

export interface Session {
  manager_id: string;
  manager_code: string;
  full_name: string;
  full_name_en?: string;
  department: string;
  dashboard_enabled: boolean;
  avatar_url?: string | null;
  signed_in_at: string;
}

const listeners = new Set<() => void>();

/**
 * แคชค่าที่ parse แล้วไว้ เพื่อให้ได้ reference เดิมตราบใดที่ข้อมูลไม่เปลี่ยน
 * (useSyncExternalStore ต้องการ snapshot ที่เสถียร ไม่งั้นจะ re-render ไม่สิ้นสุด)
 */
let cachedRaw: string | null = null;
let cachedSession: Session | null = null;

export function getSession(): Session | null {
  const raw = localStorage.getItem(KEY);
  if (raw === cachedRaw) return cachedSession;
  cachedRaw = raw;
  try {
    cachedSession = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    cachedSession = null;
  }
  return cachedSession;
}

export function startSession(m: Manager): Session {
  const s: Session = {
    manager_id: m.id,
    manager_code: m.manager_code,
    full_name: m.full_name,
    full_name_en: m.full_name_en,
    department: m.department,
    dashboard_enabled: m.dashboard_enabled,
    avatar_url: m.avatar_url,
    signed_in_at: new Date().toISOString(),
  };
  localStorage.setItem(KEY, JSON.stringify(s));
  emit();
  return s;
}

/**
 * ซิงก์ค่าสิทธิ์ล่าสุดจากฐานข้อมูล (Admin แก้แล้วต้องมีผลทันที)
 *
 * ถูกเตะออกเมื่อ: ถูกลบออกจากทะเบียน · ปิดบัญชี (ลาออก) · ถูกถอนสิทธิ์เข้าใช้งาน
 * ทั้งสามกรณีต้องออกจากระบบทันที ไม่ใช่รอให้เซสชันหมดอายุ
 */
export function syncSession(m: Manager | undefined): 'ok' | 'kicked' {
  const s = getSession();
  if (!s) return 'ok';
  if (!m || !m.is_active || !m.can_login) {
    endSession();
    return 'kicked';
  }
  if (s.dashboard_enabled !== m.dashboard_enabled || s.full_name !== m.full_name || s.avatar_url !== m.avatar_url) {
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...s, dashboard_enabled: m.dashboard_enabled, full_name: m.full_name, avatar_url: m.avatar_url }),
    );
    emit();
  }
  return 'ok';
}

export function endSession() {
  localStorage.removeItem(KEY);
  emit();
}

export interface AdminSession {
  admin_id: string;
  full_name: string;
  /** โทเคนที่ต้องแนบไปกับทุกคำสั่งที่เป็นงานแอดมิน — Worker เป็นคนตรวจ */
  token: string;
  expires_at: string;
}

let cachedAdminRaw: string | null = null;
let cachedAdmin: AdminSession | null = null;

export function getAdminSession(): AdminSession | null {
  const raw = localStorage.getItem(ADMIN_KEY);
  if (raw === cachedAdminRaw) return cachedAdmin;
  cachedAdminRaw = raw;
  try {
    cachedAdmin = raw ? (JSON.parse(raw) as AdminSession) : null;
  } catch {
    cachedAdmin = null;
  }
  return cachedAdmin;
}

/**
 * ใช้ตัดสินว่าจะแสดงหน้าจอผู้ดูแลไหมเท่านั้น ไม่ใช่ด่านกัน
 * เทียบวันหมดอายุแบบสตริงได้ เพราะ ISO 8601 แบบ UTC เรียงตามตัวอักษรตรงกับตามเวลา
 */
export function isAdmin(): boolean {
  const s = getAdminSession();
  return Boolean(s?.token) && s!.expires_at > new Date().toISOString();
}

export function startAdminSession(s: AdminSession) {
  localStorage.removeItem(LEGACY_ADMIN_KEY);
  localStorage.setItem(ADMIN_KEY, JSON.stringify(s));
  emit();
}

export function endAdminSession() {
  localStorage.removeItem(LEGACY_ADMIN_KEY);
  localStorage.removeItem(ADMIN_KEY);
  emit();
}

export function subscribeSession(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit() {
  listeners.forEach((fn) => fn());
}
