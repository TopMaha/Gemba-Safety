import { buildSeedDb } from './seed';
import type { Db } from './types';

/**
 * ── ชั้นเก็บข้อมูล (Data layer) ───────────────────────────────
 * เวอร์ชันนี้เก็บลง localStorage ของเครื่อง เพื่อให้แอปใช้งานได้จริงทันที
 * โดยยังไม่ต้องต่อระบบหลังบ้าน  โครงตารางตรงตามสเปกทุกคอลัมน์
 *
 * เมื่อจะต่อ backend จริง (Lovable Cloud / Supabase / REST):
 *   แก้เฉพาะไฟล์นี้กับ api.ts ให้ยิง HTTP แทน — ส่วนหน้าจอไม่ต้องแก้
 */

/**
 * safety.db.v1 = GEMBA SAFETY — เพิ่มตารางใบแจ้งปัญหา เช็คลิสต์ และสิทธิ์ผู้ใช้งาน
 *
 * ใช้คีย์คนละตัวกับ gemba.db.* ของแอปเดิมโดยตั้งใจ เครื่องที่เคยเปิดแอปเดิมไว้
 * จะได้เริ่มจากทะเบียนตั้งต้นชุดใหม่ ไม่ใช่สำเนาเก่าที่ไม่มีตารางความปลอดภัย
 * (สำเนาเก่าถูกลบทิ้งใน fresh() เพื่อไม่ให้กินพื้นที่ค้างไว้เปล่า ๆ)
 *
 * การเปลี่ยนเลขนี้ทำให้เครื่องที่ยังค้างสำเนาชุดเก่าเริ่มใหม่จากทะเบียนตั้งต้น
 */
const KEY = 'safety.db.v1';
const LEGACY_KEYS = ['gemba.db.v1', 'gemba.db.v2', 'gemba.db.v3'];
const LATENCY = 90; // จำลองดีเลย์เครือข่าย เพื่อให้เห็น loading state จริง

let cache: Db | null = null;
const listeners = new Set<() => void>();

function fresh(): Db {
  // ทิ้งข้อมูลตัวอย่างชุดเก่าที่ยังค้างอยู่ในเครื่อง ไม่งั้นกินพื้นที่ไปเปล่า ๆ
  for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  const db = buildSeedDb();
  localStorage.setItem(KEY, JSON.stringify(db));
  return db;
}

function read(): Db {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? heal(JSON.parse(raw) as Db) : fresh();
  } catch {
    cache = fresh();
  }
  return cache;
}

/**
 * เติมตารางที่ขาดให้ครบ
 *
 * สำเนาที่ค้างในเครื่องอาจถูกเขียนไว้ก่อนที่ตารางบางตัวจะมี (เช่นผู้ใช้ที่เปิดแอปค้างไว้
 * ข้ามรอบ deploy) ถ้าปล่อยเป็น undefined หน้าจอที่ .filter() ต่อจะพังทั้งหน้า
 * ทางเลือกอื่นคือล้างสำเนาทิ้งทุกครั้งที่เพิ่มตาราง ซึ่งทำให้งานที่ยังไม่ซิงก์หาย
 */
function heal(db: Db): Db {
  const seed = buildSeedDb();
  const lists: (keyof Db)[] = [
    'managers', 'superusers', 'areas', 'walk_themes', 'gemba_plans', 'gemba_walk_records',
    'change_history', 'weekly_focus', 'login_history', 'roles', 'permissions', 'user_roles',
    'safety_checklist_items', 'walk_checklist_results', 'safety_findings', 'finding_events', 'notifications',
  ];
  for (const key of lists) {
    if (!Array.isArray(db[key])) (db as unknown as Record<string, unknown>)[key] = seed[key];
  }
  db.app_settings = { ...seed.app_settings, ...db.app_settings };
  return db;
}

function persist() {
  if (cache) localStorage.setItem(KEY, JSON.stringify(cache));
  listeners.forEach((fn) => fn());
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** อ่านข้อมูล (async เพื่อให้พฤติกรรมเหมือนเรียก API จริง) */
export async function query<T>(fn: (db: Db) => T): Promise<T> {
  await sleep(LATENCY);
  return structuredClone(fn(read()));
}

/** อ่านแบบทันที ใช้เฉพาะกรณีที่ต้องใช้ค่าใน render loop */
export function peek<T>(fn: (db: Db) => T): T {
  return fn(read());
}

/** เขียนข้อมูล */
export async function mutate<T>(fn: (db: Db) => T): Promise<T> {
  await sleep(LATENCY);
  const db = read();
  const result = fn(db);
  persist();
  return structuredClone(result);
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** ล้างสำเนาในเครื่องแล้วเริ่มใหม่จากทะเบียนตั้งต้น (ไม่กระทบข้อมูลบนเซิร์ฟเวอร์) */
export async function resetDb() {
  localStorage.removeItem(KEY);
  cache = null;
  read();
  persist();
}

/** ล้างข้อมูลการเดินทั้งหมด แต่เก็บผู้ใช้/พื้นที่/หมวด/สิทธิ์ไว้ (ใช้ตอนขึ้นระบบจริง) */
export async function clearTransactions() {
  return mutate((db) => {
    db.gemba_plans = [];
    db.gemba_walk_records = [];
    db.change_history = [];
    db.walk_checklist_results = [];
    db.safety_findings = [];
    db.finding_events = [];
    db.notifications = [];
  });
}

export async function exportDb(): Promise<string> {
  return JSON.stringify(read(), null, 2);
}

/**
 * ทับสำเนาในเครื่องด้วยข้อมูลจากเซิร์ฟเวอร์ (ใช้โดย src/lib/sync.ts)
 * เขียนทับเฉพาะตารางที่ส่งมา ตารางอื่นคงของเดิมไว้
 */
export function hydrate(patch: Partial<Db>) {
  const db = read();
  cache = { ...db, ...patch };
  persist();
}

export async function importDb(json: string) {
  const parsed = JSON.parse(json) as Db;
  if (!parsed.managers || !parsed.areas) throw new Error('ไฟล์ข้อมูลไม่ถูกต้อง');
  cache = parsed;
  persist();
}
