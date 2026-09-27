/**
 * คีย์ในเครื่อง (localStorage) ของ GEMBA SAFETY — ทุกคีย์ขึ้นต้นด้วย safety.
 *
 * แอปนี้ fork มาจาก Gemba Walk และทั้งสองแอป (รวมถึง QC Audit และหน้า GEMBA Center)
 * เสิร์ฟจาก https://topmaha.github.io ซึ่งเป็น origin เดียวกัน จึงใช้ localStorage ก้อนเดียวกัน
 * เดิมแอปนี้ยังใช้คีย์ gemba.* ของ Gemba Walk อยู่ ทำให้สองแอปทับกันเอง
 *   - เข้าแอปหนึ่ง = เข้าอีกแอปไปด้วย แล้วถูกเตะออกทั้งคู่เมื่ออีกฝั่งไม่รู้จักคนนั้น
 *   - เปิดแอปนี้ครั้งแรก / กดกู้หน้าจอพัง ไปลบสำเนาข้อมูลและร่างของ Gemba Walk ทิ้ง
 *
 * กติกา: แอปนี้เขียนและลบได้เฉพาะคีย์ที่ขึ้นต้นด้วย STORAGE_PREFIX เท่านั้น
 * ห้ามแตะ gemba.* (ของ Gemba Walk) และ qc.* (ของ QC Audit)
 *
 * ⚠️ หน้า GEMBA Center (repo List-GEMBA · dashboard.html) อ่าน db / session / adminSession ด้วย
 *    ถ้าเปลี่ยนชื่อคีย์ ต้องแก้ SOURCES ในไฟล์นั้นตามด้วย
 */

export const STORAGE_PREFIX = 'safety.';

export const STORAGE_KEYS = {
  db: 'safety.db.v1',
  session: 'safety.session',
  adminSession: 'safety.admin.session',
  lang: 'safety.lang',
  mode: 'safety.mode',
} as const;

/** ธงว่าเครื่องนี้ย้ายค่าจากคีย์ที่เคยใช้ร่วมกับ Gemba Walk แล้ว — ย้ายครั้งเดียวต่อเครื่อง */
const MIGRATED = 'safety.keys.v1';

/** คีย์เดิมที่เคยใช้ร่วมกับ Gemba Walk — อ่านอย่างเดียว ห้ามเขียนหรือลบ */
const SHARED = {
  session: 'gemba.session',
  adminSession: 'gemba.admin.session',
  lang: 'gemba.lang',
  mode: 'gemba.mode.v2',
} as const;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function copyIfMissing(store: Store, from: string, to: string) {
  const value = store.getItem(from);
  if (value !== null && store.getItem(to) === null) store.setItem(to, value);
}

/**
 * คนในเซสชันเดิมเข้าแอปนี้ได้ไหม — ดูจากสำเนาทะเบียนผู้ใช้ของแอปนี้ในเครื่อง
 * เซสชันเดิมอาจเป็นของ Gemba Walk ถ้ารับมาทั้งหมด คนที่เข้า Gemba Walk ไว้
 * จะกลายเป็นเข้าแอปนี้ไปด้วยโดยไม่ได้กรอกรหัส
 */
function canLoginHere(store: Store, rawSession: string): boolean {
  try {
    const id = (JSON.parse(rawSession) as { manager_id?: string } | null)?.manager_id;
    const db = JSON.parse(store.getItem(STORAGE_KEYS.db) ?? 'null') as {
      managers?: { id: string; is_active?: boolean; can_login?: boolean }[];
    } | null;
    const m = db?.managers?.find((x) => x.id === id);
    return Boolean(m && m.is_active && m.can_login);
  } catch {
    return false;
  }
}

/**
 * ย้ายค่าจากคีย์ที่เคยใช้ร่วมกับ Gemba Walk มาไว้ที่คีย์ของแอปนี้ — ทำครั้งเดียวต่อเครื่อง
 *
 * คัดลอกเท่านั้น ไม่ลบของเดิม เพราะ gemba.* เป็นของ Gemba Walk ที่ยังใช้งานอยู่
 * ค่าที่มีอยู่แล้วในคีย์ safety.* ไม่ถูกทับ
 * ต้องมีธง MIGRATED กันทำซ้ำ ไม่งั้นกดออกจากระบบแล้วเปิดใหม่ จะถูกพากลับเข้าระบบจากคีย์เดิมอีก
 */
export function migrateSharedKeys(store: Store) {
  if (store.getItem(MIGRATED) !== null) return;

  copyIfMissing(store, SHARED.lang, STORAGE_KEYS.lang);
  copyIfMissing(store, SHARED.mode, STORAGE_KEYS.mode);
  // โทเคนแอดมินถูกตรวจกับ Worker ทุกครั้งที่เปิดแอป (verifyAdminSession)
  // ถ้าเป็นโทเคนที่ Gemba Walk ออกให้ Worker ของแอปนี้จะไม่รู้จัก แล้วถูกทิ้งเอง
  copyIfMissing(store, SHARED.adminSession, STORAGE_KEYS.adminSession);

  const shared = store.getItem(SHARED.session);
  if (shared !== null && store.getItem(STORAGE_KEYS.session) === null && canLoginHere(store, shared)) {
    store.setItem(STORAGE_KEYS.session, shared);
  }

  store.setItem(MIGRATED, '1');
}

// รันตอนโหลดโมดูล — ทุกไฟล์ที่ใช้คีย์ import ค่าจากที่นี่ จึงได้ค่าที่ย้ายแล้วเสมอไม่ว่าลำดับ import เป็นอย่างไร
try {
  if (typeof localStorage !== 'undefined') migrateSharedKeys(localStorage);
} catch {
  // โหมดส่วนตัว / ปิดคุกกี้ — ใช้ค่าตั้งต้นไป
}
