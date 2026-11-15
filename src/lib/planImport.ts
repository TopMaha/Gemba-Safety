import type { ISODate } from './time';
import type { Area, GembaPlan, Manager, SafetyChecklistItem, WalkTheme } from './types';

/**
 * ── วางแผนให้ทีมจาก Excel ──────────────────────────────────────────────────
 *
 * ผู้ดูแลคัดลอกแถวจาก Excel แล้ววาง — ข้อความที่ได้คือคอลัมน์คั่นด้วยแท็บ แถวคั่นด้วยขึ้นบรรทัด
 * คอลัมน์ตามลำดับ: รหัสพนักงาน · วันที่ · เวลา · พื้นที่ · หัวข้อ (สูงสุด 3) · หมายเหตุ
 *
 * ทุกช่องอ่านแบบใจกว้าง เพราะคนพิมพ์ใน Excel ไม่ได้พิมพ์ตามรูปแบบเดียวกันเสมอ
 *   รหัส     T-815 · t815 · T 815
 *   วันที่    20/11/2026 · 20/11/2569 (พ.ศ.) · 2026-11-20 · 20 พ.ย. 69 · 46346 (เลขวันที่ของ Excel)
 *   เวลา     09:00 · 9.30 · 0930 · 9 · 0.375 (เวลาแบบเศษของวันใน Excel) · ว่าง = 09:00
 *   พื้นที่    VSM1 · QC · MTN · Office · ชื่อเต็มภาษาไทย/อังกฤษ
 *   หัวข้อ    01, 12 · CHM, PPE · ชื่อหัวข้อ — คั่นด้วย , ; / + หรือขึ้นบรรทัด
 */

export const DEFAULT_PLAN_TIME = '09:00';

export const TEMPLATE_HEADER = ['รหัสพนักงาน', 'วันที่', 'เวลา', 'พื้นที่', 'หัวข้อ', 'หมายเหตุ'];

/** ข้อความแจ้งของแต่ละแถว — key ตรงกับกลุ่ม team ในไฟล์แปลภาษา */
export interface RowIssue {
  key: 'errCode' | 'errDate' | 'errTime' | 'errArea' | 'errTopic' | 'errNoTopic' | 'errTooMany' | 'inactive'
    | 'warnPast' | 'warnNotWalker' | 'warnDup';
  v?: string;
}

export interface ParsedPlanRow {
  /** ลำดับแถวในข้อความที่วาง (เริ่มที่ 1 ไม่นับหัวตาราง) */
  n: number;
  cells: string[];
  manager?: Manager;
  plan_date?: ISODate;
  plan_time?: string;
  area?: Area;
  theme_ids: string[];
  note: string;
  errors: RowIssue[];
  warnings: RowIssue[];
}

export interface ImportContext {
  managers: Manager[];
  areas: Area[];
  themes: WalkTheme[];
  checklist: SafetyChecklistItem[];
  plans: GembaPlan[];
  today: ISODate;
}

/* ── ตัวช่วยอ่านค่า ───────────────────────────────────────────────────── */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** เทียบรหัสพนักงานแบบไม่สนขีด ช่องว่าง ตัวเล็กใหญ่ — "t 815" = "T-815" */
export const codeKey = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** เทียบชื่อแบบไม่สนช่องว่างและตัวเล็กใหญ่ */
const nameKey = (s: string) => s.toLowerCase().replace(/[\s\-_.()]/g, '');

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** ปีสองหลัก: 50 ขึ้นไปถือเป็น พ.ศ. (69 = 2569 = 2026) ต่ำกว่านั้นเป็น ค.ศ. (26 = 2026) · ปี พ.ศ. เต็มลบ 543 */
function fullYear(y: number): number {
  if (y < 100) return y >= 50 ? 2500 + y - 543 : 2000 + y;
  return y > 2400 ? y - 543 : y;
}

function validDate(y: number, m: number, d: number): ISODate | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function parsePlanDate(raw: string): ISODate | null {
  const s = raw.trim();
  if (!s) return null;

  // เลขวันที่ของ Excel (นับจาก 30 ธ.ค. 1899) — ช่วงปี 1982–2119
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial < 30000 || serial > 80000) return null;
    const dt = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return dt.toISOString().slice(0, 10);
  }

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return validDate(fullYear(Number(m[1])), Number(m[2]), Number(m[3]));

  // วัน/เดือน/ปี (แบบไทย) — ถ้าเดือนเกิน 12 แต่วันไม่เกิน แปลว่าเป็นแบบอเมริกัน เดือน/วัน/ปี
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    let d = Number(m[1]);
    let mo = Number(m[2]);
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    return validDate(fullYear(Number(m[3])), mo, d);
  }

  // 20 พ.ย. 69 · 20 พฤศจิกายน 2569 · 20 Nov 2026 · 20-Nov-26
  m = /^(\d{1,2})[\s-]*([^\d\s-]+)[\s-]*(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const word = m[2].trim().toLowerCase();
    let mo = THAI_MONTHS.findIndex((x) => x === word || x.replace(/\./g, '') === word.replace(/\./g, ''));
    if (mo < 0) mo = THAI_MONTHS_FULL.findIndex((x) => x === word);
    if (mo < 0) mo = EN_MONTHS.findIndex((x) => word.startsWith(x));
    if (mo >= 0) return validDate(fullYear(Number(m[3])), mo + 1, Number(m[1]));
  }
  return null;
}

export function parsePlanTime(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s*น\.?$/, '');
  if (!s) return DEFAULT_PLAN_TIME;

  // เวลาแบบเศษของวันใน Excel (0.375 = 09:00)
  if (/^0?\.\d+$/.test(s)) {
    const mins = Math.round(Number(s) * 24 * 60);
    return mins < 24 * 60 ? `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}` : null;
  }

  const m = /^(\d{1,2})(?:[:.](\d{1,2}))?(?::\d{1,2})?\s*(am|pm)?$/.exec(s) ?? /^(\d{2})(\d{2})()$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad2(h)}:${pad2(min)}`;
}

/** ชื่อเรียกทุกแบบของพื้นที่หนึ่ง — ชื่อไทย ชื่ออังกฤษ แผนก รหัส และคำย่อในวงเล็บ เช่น "(QC)" */
function areaAliases(a: Area): string[] {
  const out = [a.area_name, a.area_name_en ?? '', a.department, a.id, a.id.replace(/^ar_/, '')];
  for (const name of [a.area_name, a.area_name_en ?? '']) {
    for (const m of name.matchAll(/\(([^)]+)\)/g)) out.push(m[1]);
    const bare = name.replace(/\s*\([^)]*\)\s*/g, '').trim();
    if (bare) out.push(bare);
    // "สายการผลิต VSM1" → "VSM1"
    const last = name.trim().split(/\s+/).pop();
    if (last && /[A-Za-z]/.test(last)) out.push(last);
  }
  return out.filter(Boolean).map(nameKey);
}

export function matchArea(raw: string, areas: Area[]): Area | undefined {
  const key = nameKey(raw);
  if (!key) return undefined;
  const active = areas.filter((a) => a.is_active);
  const exact = active.filter((a) => areaAliases(a).includes(key));
  if (exact.length === 1) return exact[0];
  const partial = active.filter((a) => areaAliases(a).some((x) => x.includes(key) || key.includes(x)));
  return partial.length === 1 ? partial[0] : undefined;
}

/** รหัสย่อของหัวข้อ (CHM, LPA …) ดูจากรหัสข้อตรวจที่ใช้มากที่สุดในหัวข้อนั้น */
export function topicCodes(checklist: SafetyChecklistItem[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const i of checklist) {
    const prefix = /^([A-Za-z0-9]+)-/.exec(i.item_code)?.[1]?.toUpperCase();
    if (!prefix) continue;
    const m = counts.get(i.theme_id) ?? new Map<string, number>();
    m.set(prefix, (m.get(prefix) ?? 0) + 1);
    counts.set(i.theme_id, m);
  }
  const out = new Map<string, string>();
  for (const [theme, m] of counts) out.set(theme, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return out;
}

export function matchTopic(raw: string, themes: WalkTheme[], codes: Map<string, string>): WalkTheme | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const active = themes.filter((th) => th.is_active);

  const num = /^(\d{1,2})(?:\s*[-.].*)?$/.exec(s);
  if (num) {
    const prefix = `${pad2(Number(num[1]))}-`;
    const hit = active.find((th) => th.theme_name.startsWith(prefix) || (th.theme_name_en ?? '').startsWith(prefix));
    if (hit) return hit;
  }

  const upper = s.toUpperCase();
  const byCode = active.find((th) => codes.get(th.id) === upper);
  if (byCode) return byCode;

  const key = nameKey(s.replace(/^\d{1,2}\s*-\s*/, ''));
  const names = (th: WalkTheme) =>
    [th.theme_name, th.theme_name_en ?? ''].map((n) => nameKey(n.replace(/^\d{1,2}\s*-\s*/, ''))).filter(Boolean);
  const exact = active.filter((th) => names(th).includes(key));
  if (exact.length === 1) return exact[0];
  const partial = active.filter((th) => names(th).some((n) => n.includes(key)));
  return partial.length === 1 ? partial[0] : undefined;
}

export function findManager(raw: string, managers: Manager[]): Manager | undefined {
  const key = codeKey(raw);
  if (key) {
    const byCode = managers.find((m) => codeKey(m.manager_code) === key);
    if (byCode) return byCode;
  }
  // ใส่ชื่อมาแทนรหัส — ยอมรับเมื่อชื่อตรงคนเดียวเท่านั้น
  const name = nameKey(raw.replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/, ''));
  if (!name) return undefined;
  const hits = managers.filter((m) =>
    [m.full_name, m.full_name_en ?? ''].some((n) => n && nameKey(n.replace(/^(นาย|นางสาว|นาง|น\.ส\.)\s*/, '')) === name),
  );
  return hits.length === 1 ? hits[0] : undefined;
}

/* ── ตัวอ่านทั้งก้อน ──────────────────────────────────────────────────── */

/** แยกข้อความที่วางเป็นแถว/คอลัมน์ — Excel คั่นคอลัมน์ด้วยแท็บ */
export function splitPaste(text: string): string[][] {
  const rows = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.split('\t').map((c) => c.trim().replace(/^"(.*)"$/s, '$1')))
    .filter((cells) => cells.some((c) => c !== ''));
  // แถวแรกเป็นหัวตารางถ้าช่องแรกไม่ใช่รหัสพนักงานที่มีตัวเลข และมีคำว่า รหัส/code
  if (rows.length && /รหัส|code|พนักงาน|employee/i.test(rows[0][0] ?? '') && !/\d/.test(rows[0][0] ?? '')) rows.shift();
  return rows;
}

export function parsePlanPaste(text: string, ctx: ImportContext): ParsedPlanRow[] {
  const codes = topicCodes(ctx.checklist);
  const seen = new Set<string>();

  return splitPaste(text).map((cells, i) => {
    const [codeRaw = '', dateRaw = '', timeRaw = '', areaRaw = '', topicRaw = '', ...rest] = cells;
    const row: ParsedPlanRow = { n: i + 1, cells, theme_ids: [], note: rest.join(' ').trim(), errors: [], warnings: [] };

    row.manager = findManager(codeRaw, ctx.managers);
    if (!row.manager) row.errors.push({ key: 'errCode', v: codeRaw });
    else if (!row.manager.is_active) row.errors.push({ key: 'inactive', v: codeRaw });
    else if (!row.manager.can_login) row.warnings.push({ key: 'warnNotWalker' });

    row.plan_date = parsePlanDate(dateRaw) ?? undefined;
    if (!row.plan_date) row.errors.push({ key: 'errDate', v: dateRaw });
    else if (row.plan_date < ctx.today) row.warnings.push({ key: 'warnPast' });

    row.plan_time = parsePlanTime(timeRaw) ?? undefined;
    if (!row.plan_time) row.errors.push({ key: 'errTime', v: timeRaw });

    row.area = matchArea(areaRaw, ctx.areas);
    if (!row.area) row.errors.push({ key: 'errArea', v: areaRaw });

    const tokens = topicRaw.split(/[,;/+、\n]|\s{2,}/).map((x) => x.trim()).filter(Boolean);
    if (!tokens.length) row.errors.push({ key: 'errNoTopic' });
    for (const tok of tokens) {
      const th = matchTopic(tok, ctx.themes, codes);
      if (!th) row.errors.push({ key: 'errTopic', v: tok });
      else if (!row.theme_ids.includes(th.id)) row.theme_ids.push(th.id);
    }
    if (row.theme_ids.length > 3) row.errors.push({ key: 'errTooMany' });

    if (row.manager && row.plan_date && row.area) {
      const sig = `${row.manager.id}|${row.plan_date}|${row.area.id}`;
      const exists = ctx.plans.some(
        (p) => p.status === 'planned' && p.manager_id === row.manager!.id && p.plan_date === row.plan_date && p.area_id === row.area!.id,
      );
      if (exists || seen.has(sig)) row.warnings.push({ key: 'warnDup' });
      seen.add(sig);
    }
    return row;
  });
}
