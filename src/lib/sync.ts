/**
 * ตัวซิงก์ข้อมูลระหว่างเครื่องกับเซิร์ฟเวอร์
 *
 * แนวคิด: หน้าจอทุกหน้าอ่าน–เขียนกับ "สำเนาในเครื่อง" (src/lib/db.ts) เท่านั้น
 * ไฟล์นี้ทำหน้าที่สองอย่างอยู่เบื้องหลัง
 *   pull — ดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์มาทับสำเนาในเครื่อง
 *   push — ส่งงานที่ค้างในคิวขึ้นเซิร์ฟเวอร์ตามลำดับที่ทำไว้
 *
 * ผลคือแอปใช้งานได้ต่อเนื่องแม้เน็ตหลุดกลางคัน ซึ่งเป็นเรื่องปกติในโรงงาน
 * และไม่ต้องแก้หน้าจอสักหน้าเดียว
 */

import { ONLINE_MODE } from './config';
import { hydrate, peek } from './db';
import { ApiError, apiDelete, apiGet, apiPost, apiPut, apiUpload } from './net';
import { LOCAL_PREFIX, getPhotoBlob } from './photos';
import { listQueue, markFailed, queueSize, removeFromQueue, type QueueItem } from './queue';
import type {
  AppNotification, AppSettings, Area, FindingEvent, GembaPlan, LoginHistory, Manager, Permission, Role,
  SafetyChecklistItem, SafetyFinding, UserRole, WalkChecklistResult, WalkRecord, WalkTheme, WeeklyFocus,
} from './types';

export type SyncState = 'offline' | 'idle' | 'syncing' | 'pending' | 'error';

export interface SyncStatus {
  state: SyncState;
  /** จำนวนงานที่ยังไม่ได้ส่งขึ้นเซิร์ฟเวอร์ */
  pending: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  online: boolean;
}

let status: SyncStatus = {
  state: ONLINE_MODE ? 'idle' : 'offline',
  pending: 0,
  lastSyncedAt: null,
  lastError: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
};

const listeners = new Set<() => void>();

/** snapshot ต้องเป็น reference เดิมถ้าค่าไม่เปลี่ยน ไม่งั้น useSyncExternalStore จะวนไม่จบ */
export const getSyncStatus = () => status;

export function subscribeSync(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function setStatus(patch: Partial<SyncStatus>) {
  const next = { ...status, ...patch };
  const same =
    next.state === status.state &&
    next.pending === status.pending &&
    next.lastSyncedAt === status.lastSyncedAt &&
    next.lastError === status.lastError &&
    next.online === status.online;
  if (same) return;
  status = next;
  listeners.forEach((fn) => fn());
}

/* ── ดึงข้อมูลจากเซิร์ฟเวอร์มาทับสำเนาในเครื่อง ───────────────────────── */

/**
 * ข้อมูลที่เปลี่ยนตลอดเวลา (งานประจำวัน) ดึงทุกรอบซิงก์
 * ส่วนทะเบียนที่นาน ๆ เปลี่ยนที (คน · พื้นที่ · หมวด · เช็คลิสต์ · สิทธิ์) ดึงห่างกว่า
 * เพื่อไม่ให้ยิง 16 คำขอทุกนาทีจากมือถือทุกเครื่องในโรงงาน
 */
const MASTER_EVERY_MS = 5 * 60 * 1000;
let lastMasterPull = 0;

/**
 * ดึงของใหม่จากเซิร์ฟเวอร์มาทับสำเนาในเครื่อง
 *
 * นี่คือกลไกที่ทำให้ "ทุกคนเห็นข้อมูลชุดเดียวกัน" — ใบแจ้งที่คนอื่นเปิดหรือปิดไป
 * จะโผล่ในเครื่องเราภายในรอบซิงก์ถัดไป (เปิดแอป · กลับมาที่แท็บ · ทุก 1 นาที · กดที่ป้าย)
 */
export async function pull(options: { master?: boolean } = {}): Promise<void> {
  if (!ONLINE_MODE) return;

  const withMaster = options.master ?? Date.now() - lastMasterPull > MASTER_EVERY_MS;

  const [plans, records, findings, findingEvents, checklistResults, notifications, focusList, loginHistory] =
    await Promise.all([
      apiGet<GembaPlan[]>('/api/plans?limit=5000'),
      apiGet<WalkRecord[]>('/api/records?limit=5000'),
      apiGet<SafetyFinding[]>('/api/findings?limit=5000'),
      apiGet<FindingEvent[]>('/api/finding-events?limit=5000'),
      apiGet<WalkChecklistResult[]>('/api/checklist-results?limit=5000'),
      apiGet<AppNotification[]>('/api/notifications?limit=500'),
      apiGet<WeeklyFocus[]>('/api/focus/list'),
      apiGet<LoginHistory[]>('/api/login-history'),
    ]);

  /**
   * ⚠️ ของที่ยังค้างอยู่ในคิวต้องไม่ถูกลบทิ้งด้วยข้อมูลจากเซิร์ฟเวอร์
   *
   * ผู้ใช้กดบันทึกแล้วงานถูกเขียนลงเครื่องทันที แต่การส่งขึ้นเซิร์ฟเวอร์เกิดทีหลัง
   * ถ้าระหว่างนั้นมีรอบ pull คั่น (เช่นกลับมาที่แท็บพอดี) แล้วเราเอาผลจากเซิร์ฟเวอร์
   * มาทับทั้งชุด งานที่เพิ่งบันทึกจะหายไปจากหน้าจอทั้งที่ยังอยู่ในคิว
   * ผู้ใช้จะนึกว่าบันทึกไม่ติดแล้วกดซ้ำ กลายเป็นข้อมูลซ้ำ
   */
  const pending = await pendingIds();

  hydrate({
    gemba_plans: keepPending(plans, peek((db) => db.gemba_plans), pending),
    gemba_walk_records: keepPending(records, peek((db) => db.gemba_walk_records), pending),
    safety_findings: keepPending(findings, peek((db) => db.safety_findings), pending),
    finding_events: keepChildren(findingEvents, peek((db) => db.finding_events), pending, (e) => e.finding_id),
    walk_checklist_results: keepChildren(
      checklistResults,
      peek((db) => db.walk_checklist_results),
      pending,
      (r) => r.record_id,
    ),
    notifications,
    weekly_focus: focusList,
    login_history: loginHistory,
  });

  if (!withMaster) return;

  const [managers, areas, themes, checklist, roles, permissions, userRoles, settings] = await Promise.all([
    apiGet<Manager[]>('/api/managers'),
    apiGet<Area[]>('/api/areas'),
    apiGet<WalkTheme[]>('/api/themes'),
    apiGet<SafetyChecklistItem[]>('/api/checklist'),
    apiGet<Role[]>('/api/roles'),
    apiGet<Permission[]>('/api/permissions'),
    apiGet<UserRole[]>('/api/user-roles'),
    apiGet<AppSettings>('/api/settings'),
  ]);

  hydrate({
    managers,
    areas,
    walk_themes: themes,
    safety_checklist_items: checklist,
    roles,
    permissions,
    user_roles: userRoles,
    app_settings: settings,
    // superusers เก็บของเดิมไว้ เพราะ API ไม่เปิดให้ดึงรายชื่อ (มีแค่ endpoint ตรวจรหัส)
    superusers: peek((db) => db.superusers),
    change_history: peek((db) => db.change_history),
  });
  lastMasterPull = Date.now();
}

/**
 * id ของงานทุกชิ้นที่ยังค้างอยู่ในคิว
 * localId ของคำสั่งใบแจ้งเป็นรูปแบบ "<id>:<action>:<เลขสุ่ม>" จึงตัดเอาเฉพาะส่วนแรก
 */
async function pendingIds(): Promise<Set<string>> {
  const items = await listQueue();
  return new Set(items.map((i) => i.localId.split(':')[0].replace(/^new:/, '')));
}

/** เก็บแถวที่ยังไม่ถูกส่งขึ้นเซิร์ฟเวอร์ไว้ต่อท้ายข้อมูลที่ดึงมา */
function keepPending<T extends { id: string }>(server: T[], local: T[], pending: Set<string>): T[] {
  if (pending.size === 0) return server;
  const known = new Set(server.map((r) => r.id));
  const extra = local.filter((r) => pending.has(r.id) && !known.has(r.id));
  return extra.length ? [...extra, ...server] : server;
}

/** เก็บแถวลูก (ไทม์ไลน์ · ผลตรวจ) ของงานที่ยังค้างคิวไว้ด้วย ไม่งั้นเปิดดูแล้วว่างเปล่า */
function keepChildren<T>(server: T[], local: T[], pending: Set<string>, parentOf: (row: T) => string): T[] {
  if (pending.size === 0) return server;
  const extra = local.filter((r) => pending.has(parentOf(r)));
  return extra.length ? [...server, ...extra] : server;
}

/* ── ส่งงานที่ค้างขึ้นเซิร์ฟเวอร์ ───────────────────────────────────────── */

/**
 * อัปโหลดรูปที่ยังอยู่ในเครื่อง แล้วคืนคีย์ที่เซิร์ฟเวอร์ให้มา
 * คีย์ที่ไม่ได้ขึ้นต้นด้วย local: แปลว่าอัปโหลดไปแล้ว ปล่อยผ่าน
 */
async function uploadPendingPhotos(keys: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const key of keys) {
    if (!key.startsWith(LOCAL_PREFIX)) {
      out.push(key);
      continue;
    }
    const blob = await getPhotoBlob(key);
    if (!blob) continue; // รูปหายไปจากเครื่องแล้ว ข้ามไปไม่ให้ทั้งคิวค้าง
    out.push(await apiUpload(blob));
  }
  return out;
}

/** ส่งงานหนึ่งชิ้น — โยน ApiError ออกไปให้ผู้เรียกตัดสินใจว่าจะหยุดหรือข้าม */
async function pushItem(item: QueueItem): Promise<void> {
  const p = item.payload as Record<string, unknown>;

  switch (item.kind) {
    case 'plan.create':
      await apiPost('/api/plans', p);
      return;
    case 'plan.update':
      await apiPut(`/api/plans/${item.localId}`, p);
      return;

    case 'record.create': {
      const photos = await uploadPendingPhotos((p.photo_urls as string[]) ?? []);
      await apiPost('/api/records', { ...p, photo_urls: photos });
      return;
    }
    case 'record.update': {
      const body = { ...p };
      if (Array.isArray(p.photo_urls)) body.photo_urls = await uploadPendingPhotos(p.photo_urls as string[]);
      await apiPut(`/api/records/${item.localId}`, body);
      return;
    }

    case 'manager.save':
      await (item.localId.startsWith('new:')
        ? apiPost('/api/managers', p)
        : apiPut(`/api/managers/${item.localId}`, p));
      return;
    case 'area.save':
      await (item.localId.startsWith('new:') ? apiPost('/api/areas', p) : apiPut(`/api/areas/${item.localId}`, p));
      return;
    case 'theme.save':
      await (item.localId.startsWith('new:') ? apiPost('/api/themes', p) : apiPut(`/api/themes/${item.localId}`, p));
      return;

    case 'settings.save':
      await apiPut('/api/settings', p);
      return;

    /* ── งานความปลอดภัย ── */
    case 'finding.create': {
      const photos = await uploadPendingPhotos((p.before_photos as string[]) ?? []);
      await apiPost('/api/findings', { ...p, before_photos: photos });
      return;
    }
    case 'finding.update': {
      const body = { ...p };
      if (Array.isArray(p.before_photos)) body.before_photos = await uploadPendingPhotos(p.before_photos as string[]);
      await apiPut(`/api/findings/${item.localId.split(':')[0]}`, body);
      return;
    }
    case 'finding.action': {
      // localId = "<findingId>:<action>:<เลขสุ่ม>" — เลขสุ่มกันไม่ให้สองครั้งที่ทำ
      // คำสั่งเดียวกันทับกันในคิว (เช่นคอมเมนต์สองรอบติดกัน)
      const { finding_id: findingId, action, ...rest } = p as Record<string, unknown> & {
        finding_id: string;
        action: string;
      };
      const body: Record<string, unknown> = { ...rest };
      if (Array.isArray(rest.after_photos)) {
        body.after_photos = await uploadPendingPhotos(rest.after_photos as string[]);
      }
      await apiPost(`/api/findings/${findingId}/${action}`, body);
      return;
    }

    case 'checklist.save':
      await (item.localId.startsWith('new:')
        ? apiPost('/api/checklist', p)
        : apiPut(`/api/checklist/${item.localId}`, p));
      return;

    case 'role.perms':
      await apiPut(`/api/roles/${item.localId}/permissions`, p);
      return;
    case 'userRole.add':
      await apiPost('/api/user-roles', p);
      return;
    case 'userRole.remove':
      await apiDelete(`/api/user-roles/${item.localId}`);
      return;

    case 'notify.read':
      await apiPost('/api/notifications/read', p);
      return;
    case 'focus.save':
      await (item.localId.startsWith('new:') ? apiPost('/api/focus', p) : apiPut(`/api/focus/${item.localId}`, p));
      return;
  }
}

/**
 * ส่งคิวทั้งหมดตามลำดับ
 *
 * เจอเน็ตหลุดให้หยุดทันที เก็บที่เหลือไว้รอบหน้า (ลำดับสำคัญ)
 * แต่ถ้าเซิร์ฟเวอร์ปฏิเสธเพราะข้อมูลผิด (4xx) ให้ทิ้งงานชิ้นนั้นแล้วไปต่อ
 * ไม่งั้นงานเสียชิ้นเดียวจะขวางคิวทั้งหมดตลอดไป
 */
async function pushAll(): Promise<{ sent: number; dropped: number }> {
  let sent = 0;
  let dropped = 0;

  for (const item of await listQueue()) {
    try {
      await pushItem(item);
      await removeFromQueue(item.seq!);
      sent++;
    } catch (e) {
      const err = e as ApiError;
      // 401/403 = สิทธิ์ยังไม่พร้อม (เช่นเซสชันผู้ดูแลหมดอายุระหว่างที่งานค้างคิว)
      // ไม่ใช่ข้อมูลผิด ห้ามทิ้ง ไม่งั้นงานที่ผู้ใช้เห็นว่าบันทึกแล้วจะหายเงียบ ๆ
      // แล้วโดน pull() รอบถัดไปทับกลับเป็นค่าเก่า เก็บไว้รอจนกว่าจะเข้าสู่ระบบใหม่
      if (err.isOffline || err.status >= 500 || err.status === 401 || err.status === 403) {
        await markFailed(item, err.message);
        throw err; // เน็ต สิทธิ์ หรือเซิร์ฟเวอร์มีปัญหา หยุดทั้งรอบ
      }
      // ข้อมูลชิ้นนี้เซิร์ฟเวอร์ไม่รับ — ทิ้งไปเพื่อไม่ให้ขวางคิว
      console.warn('ทิ้งงานที่ซิงก์ไม่ได้', item.kind, item.localId, err.message);
      await removeFromQueue(item.seq!);
      dropped++;
    }
  }
  return { sent, dropped };
}

/* ── รอบซิงก์ ───────────────────────────────────────────────────────────── */

let running = false;
/** ให้ TanStack Query รู้ว่าข้อมูลเปลี่ยน จะได้โหลดหน้าจอใหม่ */
let onChanged: (() => void) | null = null;

export function setSyncListener(fn: () => void) {
  onChanged = fn;
}

/** ซิงก์หนึ่งรอบ: ส่งของค้างขึ้นก่อน แล้วค่อยดึงของใหม่ลงมา */
export async function syncNow(): Promise<void> {
  if (!ONLINE_MODE || running) return;
  running = true;
  setStatus({ state: 'syncing', lastError: null });

  try {
    const { sent } = await pushAll();
    // รอบแรกหลังเปิดแอปดึงทะเบียนทั้งหมด รอบถัด ๆ ไปดึงเฉพาะงานประจำวัน
    await pull({ master: lastMasterPull === 0 });
    setStatus({
      state: 'idle',
      pending: await queueSize(),
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      online: true,
    });
    if (sent > 0 || onChanged) onChanged?.();
  } catch (e) {
    const err = e as ApiError;
    const pending = await queueSize();
    setStatus({
      state: err.isOffline ? 'offline' : 'error',
      pending,
      lastError: err.message,
      online: err.isOffline ? false : status.online,
    });
  } finally {
    running = false;
    if (status.state === 'idle' && status.pending > 0) {
      setStatus({ state: 'pending' });
      /**
       * ยังมีของค้าง — เกิดจากงานที่ถูกบันทึกระหว่างที่รอบนี้กำลังทำงานอยู่
       * (syncNow ที่ถูกเรียกตอนนั้นถูกข้ามไปเพราะมีรอบที่วิ่งอยู่แล้ว)
       * รีบส่งต่อทันที ไม่ต้องรอครบนาที ผู้ใช้จะได้เห็นป้าย "ซิงก์แล้ว" เร็ว
       */
      setTimeout(() => void syncNow(), 1_500);
    }
  }
}

/** เรียกหลังเขียนข้อมูลลงคิว เพื่ออัปเดตตัวเลข "ยังไม่ซิงก์" ให้เห็นทันที */
export async function refreshPending(): Promise<void> {
  const pending = await queueSize();
  setStatus({ pending, state: pending > 0 && status.state === 'idle' ? 'pending' : status.state });
}

let started = false;

/** เริ่มระบบซิงก์ — เรียกครั้งเดียวตอนแอปบูต */
export function startSync(): void {
  if (started || !ONLINE_MODE) return;
  started = true;

  window.addEventListener('online', () => {
    setStatus({ online: true });
    void syncNow();
  });
  window.addEventListener('offline', () => setStatus({ online: false, state: 'offline' }));

  // กลับมาที่แท็บแล้วซิงก์ให้อัตโนมัติ
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });

  /**
   * รอบซิงก์อัตโนมัติทุก 1 นาที
   *
   * ไม่ได้ทำเพื่อส่งของค้างอย่างเดียว แต่เพื่อ "ดึงของใหม่" ด้วย
   * ใบแจ้งที่หัวหน้างานอีกคนเพิ่งปิดต้องหายไปจากจอเราเองโดยไม่ต้องกดรีเฟรช
   * แท็บที่ถูกซ่อนอยู่ข้ามรอบไป เพื่อไม่ให้กินแบตและเน็ตของเครื่องที่วางทิ้งไว้
   * (ยกเว้นมีของค้างส่งหรือกำลังมีปัญหา ซึ่งต้องพยายามต่อจนสำเร็จ)
   */
  setInterval(() => {
    const needsRetry = status.pending > 0 || status.state === 'offline' || status.state === 'error';
    if (needsRetry || document.visibilityState === 'visible') void syncNow();
  }, 60_000);

  void syncNow();
}
