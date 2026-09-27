import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS, STORAGE_PREFIX, migrateSharedKeys } from '../storageKeys';

/** localStorage จำลอง — ชุดทดสอบรันบน node ไม่มี localStorage จริง */
function fakeStore(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  };
}

const safetyDb = (managers: { id: string; is_active: boolean; can_login: boolean }[]) =>
  JSON.stringify({ managers });

describe('storageKeys — แยกคีย์ออกจาก Gemba Walk ที่อยู่ origin เดียวกัน', () => {
  it('ทุกคีย์ของแอปขึ้นต้นด้วย safety. เท่านั้น', () => {
    for (const key of Object.values(STORAGE_KEYS)) expect(key.startsWith(STORAGE_PREFIX)).toBe(true);
  });

  it('รับภาษา โหมด และเซสชันแอดมินมาจากคีย์เดิม โดยไม่ลบของ Gemba Walk', () => {
    const admin = JSON.stringify({ admin_id: 'su_1', token: 't', expires_at: '2099-01-01' });
    const s = fakeStore({ 'gemba.lang': 'en', 'gemba.mode.v2': 'dark', 'gemba.admin.session': admin });
    migrateSharedKeys(s);
    expect(s.getItem(STORAGE_KEYS.lang)).toBe('en');
    expect(s.getItem(STORAGE_KEYS.mode)).toBe('dark');
    expect(s.getItem(STORAGE_KEYS.adminSession)).toBe(admin);
    expect(s.getItem('gemba.lang')).toBe('en');
    expect(s.getItem('gemba.mode.v2')).toBe('dark');
    expect(s.getItem('gemba.admin.session')).toBe(admin);
  });

  it('รับเซสชันผู้ใช้เฉพาะคนที่แอปนี้ให้เข้าได้', () => {
    const session = JSON.stringify({ manager_id: 'mgr_T_815', manager_code: 'T-815' });
    const s = fakeStore({
      'gemba.session': session,
      [STORAGE_KEYS.db]: safetyDb([{ id: 'mgr_T_815', is_active: true, can_login: true }]),
    });
    migrateSharedKeys(s);
    expect(s.getItem(STORAGE_KEYS.session)).toBe(session);
    expect(s.getItem('gemba.session')).toBe(session);
  });

  it('ไม่รับเซสชันของคนที่เข้าได้แค่ Gemba Walk — ไม่งั้นจะเข้าแอปนี้โดยไม่ได้กรอกรหัส', () => {
    const session = JSON.stringify({ manager_id: 'mgr_L_1787' });
    const noLogin = fakeStore({
      'gemba.session': session,
      [STORAGE_KEYS.db]: safetyDb([{ id: 'mgr_L_1787', is_active: true, can_login: false }]),
    });
    migrateSharedKeys(noLogin);
    expect(noLogin.getItem(STORAGE_KEYS.session)).toBeNull();

    const unknown = fakeStore({ 'gemba.session': session, [STORAGE_KEYS.db]: safetyDb([]) });
    migrateSharedKeys(unknown);
    expect(unknown.getItem(STORAGE_KEYS.session)).toBeNull();

    const noCopy = fakeStore({ 'gemba.session': session });
    migrateSharedKeys(noCopy);
    expect(noCopy.getItem(STORAGE_KEYS.session)).toBeNull();
  });

  it('ไม่ทับค่าที่แอปนี้มีอยู่แล้ว', () => {
    const s = fakeStore({ 'gemba.lang': 'en', [STORAGE_KEYS.lang]: 'th' });
    migrateSharedKeys(s);
    expect(s.getItem(STORAGE_KEYS.lang)).toBe('th');
  });

  it('ย้ายครั้งเดียว — ออกจากระบบแล้วเปิดใหม่ต้องไม่ถูกพากลับเข้าระบบจากคีย์เดิม', () => {
    const session = JSON.stringify({ manager_id: 'mgr_T_815' });
    const s = fakeStore({
      'gemba.session': session,
      [STORAGE_KEYS.db]: safetyDb([{ id: 'mgr_T_815', is_active: true, can_login: true }]),
    });
    migrateSharedKeys(s);
    s.map.delete(STORAGE_KEYS.session); // กดออกจากระบบ
    migrateSharedKeys(s); // เปิดแอปใหม่
    expect(s.getItem(STORAGE_KEYS.session)).toBeNull();
  });

  it('สำเนาข้อมูลเสียหายก็ไม่ทำให้แอปพัง', () => {
    const s = fakeStore({ 'gemba.session': '{not json', [STORAGE_KEYS.db]: 'also broken' });
    expect(() => migrateSharedKeys(s)).not.toThrow();
    expect(s.getItem(STORAGE_KEYS.session)).toBeNull();
  });
});
