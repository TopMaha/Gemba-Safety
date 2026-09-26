import type { TKey } from './i18n';
import { addDays, diffDays, todayISO, type ISODate } from './time';
import type { AppSettings, FindingEventType, SafetyChecklistItem, SafetyFinding, Severity, FindingStatus } from './types';

/**
 * ── โดเมนความปลอดภัย (ฝั่งหน้าจอ) ────────────────────────────────────────
 *
 * ป้ายชื่อ · สี · ลำดับความสำคัญ · การนับ — รวมไว้ที่เดียวเพื่อให้ทุกหน้าจอ
 * เรียกใบแจ้งใบเดียวกันด้วยคำและสีเดียวกันเสมอ
 *
 * ตัวเลขบนแดชบอร์ดคำนวณที่ Worker (GET /api/safety/summary) ไฟล์นี้ใช้สำหรับ
 * การนับเบา ๆ บนหน้าจอที่ทำงานกับสำเนาในเครื่อง เช่น ตัวเลขบนป้ายเมนู
 */

export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'accent' | 'steel' | 'solid' | 'critical';

/** ระดับความรุนแรง เรียงจากเบาไปหนัก — ใช้เป็นลำดับการจัดเรียงด้วย */
export const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'critical'];

export const STATUSES: FindingStatus[] = ['open', 'assigned', 'in_progress', 'fixed', 'closed', 'cancelled'];

/** สถานะที่ถือว่างานยังไม่จบ — ตรงกับ OPEN_STATUSES ฝั่ง Worker */
export const OPEN_STATUSES: FindingStatus[] = ['open', 'assigned', 'in_progress', 'fixed'];

const SEVERITY_META: Record<Severity, { key: TKey; tone: Tone; rank: number }> = {
  low: { key: 'safety.sevLow', tone: 'steel', rank: 1 },
  medium: { key: 'safety.sevMedium', tone: 'warn', rank: 2 },
  high: { key: 'safety.sevHigh', tone: 'bad', rank: 3 },
  critical: { key: 'safety.sevCritical', tone: 'critical', rank: 4 },
};

const STATUS_META: Record<FindingStatus, { key: TKey; tone: Tone }> = {
  open: { key: 'safety.stOpen', tone: 'bad' },
  assigned: { key: 'safety.stAssigned', tone: 'warn' },
  in_progress: { key: 'safety.stInProgress', tone: 'accent' },
  fixed: { key: 'safety.stFixed', tone: 'steel' },
  closed: { key: 'safety.stClosed', tone: 'ok' },
  cancelled: { key: 'safety.stCancelled', tone: 'neutral' },
};

export const severityMeta = (s: Severity) => SEVERITY_META[s] ?? SEVERITY_META.medium;
export const statusMeta = (s: FindingStatus) => STATUS_META[s] ?? STATUS_META.open;

const EVENT_KEY: Record<FindingEventType, TKey> = {
  created: 'safety.evCreated',
  assigned: 'safety.evAssigned',
  reassigned: 'safety.evReassigned',
  started: 'safety.evStarted',
  fixed: 'safety.evFixed',
  rejected: 'safety.evRejected',
  verified: 'safety.evVerified',
  closed: 'safety.evClosed',
  cancelled: 'safety.evCancelled',
  reopened: 'safety.evReopened',
  comment: 'safety.evComment',
  due_changed: 'safety.evDueChanged',
  severity_changed: 'safety.evSeverityChanged',
  updated: 'safety.evUpdated',
};

export const eventKey = (t: FindingEventType): TKey => EVENT_KEY[t] ?? 'safety.evUpdated';

/* ── วันครบกำหนด ───────────────────────────────────────────────────────── */

/**
 * วันครบกำหนดแก้ไขตามระดับความรุนแรง
 * ค่าเดียวกับที่ Worker ใช้ตอนสร้างใบแจ้ง (worker/src/lib/safety.js)
 * คำนวณซ้ำที่นี่เพื่อให้หน้าจอโชว์วันได้ทันทีตั้งแต่ยังไม่ได้ส่งขึ้นเซิร์ฟเวอร์
 */
export function dueDateFor(severity: Severity, settings: AppSettings | undefined, from: ISODate = todayISO()): ISODate {
  const days = {
    low: settings?.due_days_low ?? 30,
    medium: settings?.due_days_medium ?? 14,
    high: settings?.due_days_high ?? 3,
    critical: settings?.due_days_critical ?? 1,
  }[severity];
  return addDays(from, days);
}

/** เลยกำหนดแล้วหรือยัง — ใบที่ปิดหรือยกเลิกไปแล้วไม่นับ */
export function isOverdue(f: SafetyFinding, today: ISODate = todayISO()): boolean {
  return OPEN_STATUSES.includes(f.status) && f.due_date < today;
}

/** เหลืออีกกี่วัน — ติดลบคือเลยกำหนดมาแล้วกี่วัน */
export function daysLeft(f: SafetyFinding, today: ISODate = todayISO()): number {
  return diffDays(today, f.due_date);
}

/** ใกล้ครบกำหนด (เหลือไม่เกิน 2 วัน) แต่ยังไม่เลย */
export function isDueSoon(f: SafetyFinding, today: ISODate = todayISO()): boolean {
  if (!OPEN_STATUSES.includes(f.status)) return false;
  const left = daysLeft(f, today);
  return left >= 0 && left <= 2;
}

/* ── การจัดเรียงและการกรอง ─────────────────────────────────────────────── */

/**
 * ลำดับที่หน้างานอยากเห็น: เลยกำหนดก่อน → รุนแรงกว่าก่อน → ครบกำหนดเร็วกว่าก่อน
 * ใบที่ปิดแล้วไปอยู่ท้ายสุดเสมอ ไม่ว่าจะรุนแรงแค่ไหน
 */
export function sortFindings(list: SafetyFinding[], today: ISODate = todayISO()): SafetyFinding[] {
  return [...list].sort((a, b) => {
    const liveA = OPEN_STATUSES.includes(a.status) ? 0 : 1;
    const liveB = OPEN_STATUSES.includes(b.status) ? 0 : 1;
    if (liveA !== liveB) return liveA - liveB;

    const odA = isOverdue(a, today) ? 0 : 1;
    const odB = isOverdue(b, today) ? 0 : 1;
    if (odA !== odB) return odA - odB;

    const sev = severityMeta(b.severity).rank - severityMeta(a.severity).rank;
    if (sev !== 0) return sev;

    if (a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
    return b.reported_at.localeCompare(a.reported_at);
  });
}

/** ใบที่คนนี้ต้องลงมือทำ — ถูกมอบหมายเป็นผู้จัดการหรือหัวหน้างาน และงานยังไม่จบ */
export function assignedTo(list: SafetyFinding[], managerId: string | null | undefined): SafetyFinding[] {
  if (!managerId) return [];
  return list.filter(
    (f) =>
      OPEN_STATUSES.includes(f.status) &&
      (f.assigned_manager_id === managerId || f.assigned_supervisor_id === managerId),
  );
}

/** ใบที่คนนี้แจ้งไว้แล้วรอตรวจรับ — ผู้แจ้งเป็นคนยืนยันว่าปัญหาหายจริง */
export function waitingMyVerify(list: SafetyFinding[], managerId: string | null | undefined): SafetyFinding[] {
  if (!managerId) return [];
  return list.filter((f) => f.status === 'fixed' && f.reported_by === managerId);
}

export interface FindingCounts {
  total: number;
  open: number;
  overdue: number;
  waitingVerify: number;
  closed: number;
  bySeverity: Record<Severity, number>;
}

export function countFindings(list: SafetyFinding[], today: ISODate = todayISO()): FindingCounts {
  const bySeverity = { low: 0, medium: 0, high: 0, critical: 0 } as Record<Severity, number>;
  let open = 0;
  let overdue = 0;
  let waitingVerify = 0;
  let closed = 0;

  for (const f of list) {
    bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;
    if (OPEN_STATUSES.includes(f.status)) open++;
    if (isOverdue(f, today)) overdue++;
    if (f.status === 'fixed') waitingVerify++;
    if (f.status === 'closed') closed++;
  }

  return { total: list.length, open, overdue, waitingVerify, closed, bySeverity };
}

/** เลขที่ใบแจ้งที่สร้างในเครื่อง — รูปแบบเดียวกับที่ Worker สร้าง */
export function newFindingNo(today: ISODate = todayISO()): string {
  const rand = Math.random().toString(36).toUpperCase().slice(2, 6).padEnd(4, 'X');
  return `SF-${today.replace(/-/g, '')}-${rand}`;
}

/* ── แม่แบบเช็คลิสต์ (หน้าตั้งค่าของ Super Admin) ─────────────────────── */

/**
 * เสนอรหัสข้อถัดไปของหมวด — ดูจากรหัสที่มีอยู่ในหมวดนั้น เช่น PPE-01…PPE-04 → PPE-05
 * ใช้คำนำหน้าที่พบบ่อยที่สุดในหมวด และคงจำนวนหลักเดิม · หมวดที่ยังไม่มีรหัสแบบนี้คืนค่าว่าง
 */
export function suggestItemCode(items: Pick<SafetyChecklistItem, 'theme_id' | 'item_code'>[], themeId: string): string {
  const parsed = items
    .filter((i) => i.theme_id === themeId)
    .map((i) => /^(.*?)(\d+)$/.exec(i.item_code.trim()))
    .filter((m): m is RegExpExecArray => m !== null);
  if (!parsed.length) return '';

  const freq = new Map<string, number>();
  for (const m of parsed) freq.set(m[1], (freq.get(m[1]) ?? 0) + 1);
  const prefix = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const digits = parsed.filter((m) => m[1] === prefix).map((m) => m[2]);
  const width = Math.max(...digits.map((d) => d.length));
  const next = Math.max(...digits.map(Number)) + 1;
  return `${prefix}${String(next).padStart(width, '0')}`;
}

/** ลำดับถัดไปของหมวด — ต่อท้ายข้อสุดท้ายทีละ 10 เพื่อให้แทรกระหว่างข้อได้ภายหลัง */
export function nextSortOrder(items: Pick<SafetyChecklistItem, 'theme_id' | 'sort_order'>[], themeId: string): number {
  const orders = items.filter((i) => i.theme_id === themeId).map((i) => i.sort_order);
  return orders.length ? Math.max(...orders) + 10 : 10;
}
