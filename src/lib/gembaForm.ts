import type { ISODate } from './time';
import type { ChecklistResultValue, ChecklistSection, FormStyle, SafetyChecklistItem, Severity, WalkTheme } from './types';

/**
 * ── สถานะของแบบฟอร์ม GEMBA WALK ระหว่างกรอก ──────────────────────────────
 *
 * แบบฟอร์มหนึ่งหัวข้อมีสามตารางเหมือนเอกสาร Excel
 *   1. คำถามทางเทคนิค       สถานะ ใช่/ไม่ใช่/ไม่เกี่ยวข้อง (LPA: OK/NOK) + ความคิดเห็น
 *   2. คำถามความผูกพันพนักงาน ถามแล้ว ใช่/ไม่ใช่ + ความคิดเห็น
 *   3. ปัญหาที่ตรวจพบ         ปัญหา · การดำเนินการแก้ไข · วันครบกำหนด · เจ้าของ
 *
 * ข้อทางเทคนิคที่ตอบ "ไม่ใช่" จะเพิ่มแถวในตารางที่ 3 ให้เอง (ผูกกับข้อนั้น)
 * เปลี่ยนคำตอบเป็นอย่างอื่นแล้วแถวนั้นหายไป แต่สิ่งที่กรอกไว้ถูกเก็บพักไว้ใน stash
 * กดกลับเป็น "ไม่ใช่" อีกครั้งจะได้ของเดิมคืน — กดสลับไปมาแล้วข้อมูลไม่หาย
 *
 * ทุกฟังก์ชันในไฟล์นี้คืนสถานะชุดใหม่ ไม่แก้ของเดิม (ใช้กับ setState ได้ตรง ๆ)
 */

export interface FormAnswer {
  result: ChecklistResultValue;
  note: string;
}

export type FormAnswers = Record<string, FormAnswer>;

/** หนึ่งแถวในตาราง "ปัญหาด้านความปลอดภัยที่ตรวจพบ" — บันทึกแล้วกลายเป็นใบแจ้งปัญหาหนึ่งใบ */
export interface IssueDraft {
  /** คีย์คงที่สำหรับ React — แถวที่ผูกกับข้อตรวจใช้ item:<id> */
  key: string;
  theme_id: string;
  /** ข้อตรวจที่ตอบ "ไม่ใช่" · null = ผู้ตรวจเพิ่มแถวเอง */
  item_id: string | null;
  issue: string;
  corrective_action: string;
  due_date: ISODate;
  /** วันครบกำหนดยังคิดจากความรุนแรงอยู่ (ผู้ตรวจยังไม่ได้เลือกวันเอง) */
  due_auto: boolean;
  owner_id: string | null;
  severity: Severity;
  photos: string[];
}

export interface WalkFormState {
  answers: FormAnswers;
  issues: IssueDraft[];
  stash: Record<string, IssueDraft>;
}

/** วันครบกำหนดตามความรุนแรง — ส่งเข้ามาจากหน้าจอเพื่อให้ไฟล์นี้ไม่ต้องรู้จักค่าตั้งของระบบ */
export type DueFor = (severity: Severity) => ISODate;

export const EMPTY_FORM: WalkFormState = { answers: {}, issues: [], stash: {} };

export const sectionOf = (item: Pick<SafetyChecklistItem, 'section'>): ChecklistSection => item.section ?? 'technical';

export const styleOf = (theme: Pick<WalkTheme, 'form_style'> | undefined): FormStyle => theme?.form_style ?? 'yes_no_na';

/** ตัวเลือกในคอลัมน์สถานะ — LPA มีแค่ OK/NOK ตามเอกสาร */
export function statusOptions(section: ChecklistSection, style: FormStyle): ChecklistResultValue[] {
  if (section === 'engagement' || style === 'ok_nok') return ['pass', 'fail'];
  return ['pass', 'fail', 'na'];
}

const linkedKey = (itemId: string) => `item:${itemId}`;

/** ตอบข้อหนึ่ง (null = ล้างคำตอบ) — ข้อทางเทคนิคที่เป็น "ไม่ใช่" จะได้แถวปัญหาที่ผูกกับข้อนั้น */
export function setAnswer(
  state: WalkFormState,
  item: SafetyChecklistItem,
  result: ChecklistResultValue | null,
  dueFor: DueFor,
): WalkFormState {
  const answers = { ...state.answers };
  const prev = answers[item.id];
  if (result === null) delete answers[item.id];
  else answers[item.id] = { result, note: prev?.note ?? '' };

  if (sectionOf(item) !== 'technical') return { ...state, answers };

  const key = linkedKey(item.id);
  const existing = state.issues.find((i) => i.key === key);
  let issues = state.issues;
  let stash = state.stash;

  if (result === 'fail' && !existing) {
    const restored = stash[key];
    const row: IssueDraft = restored ?? {
      key,
      theme_id: item.theme_id,
      item_id: item.id,
      issue: '',
      corrective_action: '',
      due_date: dueFor(item.default_severity),
      due_auto: true,
      owner_id: null,
      severity: item.default_severity,
      photos: [],
    };
    issues = [...issues, row];
    if (restored) {
      stash = { ...stash };
      delete stash[key];
    }
  } else if (result !== 'fail' && existing) {
    issues = issues.filter((i) => i.key !== key);
    stash = { ...stash, [key]: existing };
  }

  return { answers, issues, stash };
}

export function setNote(state: WalkFormState, itemId: string, note: string): WalkFormState {
  const prev = state.answers[itemId];
  if (!prev) return state;
  return { ...state, answers: { ...state.answers, [itemId]: { ...prev, note } } };
}

/** ตอบทุกข้อที่ยังว่างในชุดที่ส่งมาด้วยผลเดียวกัน (ปุ่ม "ข้อที่เหลือ ใช่ ทั้งหมด") */
export function fillUnanswered(
  state: WalkFormState,
  items: SafetyChecklistItem[],
  result: ChecklistResultValue,
  dueFor: DueFor,
): WalkFormState {
  return items.reduce((s, item) => (s.answers[item.id] ? s : setAnswer(s, item, result, dueFor)), state);
}

let manualSeq = 0;

/** เพิ่มแถวปัญหาเอง (ปัญหาที่เห็นหน้างานแต่ไม่ตรงกับข้อไหนในแบบฟอร์ม) */
export function addIssue(state: WalkFormState, themeId: string, dueFor: DueFor, severity: Severity = 'medium'): WalkFormState {
  manualSeq += 1;
  const row: IssueDraft = {
    key: `manual:${Date.now().toString(36)}${manualSeq}`,
    theme_id: themeId,
    item_id: null,
    issue: '',
    corrective_action: '',
    due_date: dueFor(severity),
    due_auto: true,
    owner_id: null,
    severity,
    photos: [],
  };
  return { ...state, issues: [...state.issues, row] };
}

/** แก้แถวปัญหา — เปลี่ยนความรุนแรงแล้ววันครบกำหนดเลื่อนตาม เว้นแต่ผู้ตรวจเลือกวันเองไปแล้ว */
export function patchIssue(
  state: WalkFormState,
  key: string,
  patch: Partial<Omit<IssueDraft, 'key' | 'theme_id' | 'item_id'>>,
  dueFor: DueFor,
): WalkFormState {
  return {
    ...state,
    issues: state.issues.map((row) => {
      if (row.key !== key) return row;
      const next = { ...row, ...patch };
      if ('due_date' in patch) next.due_auto = false;
      else if (patch.severity && row.due_auto) next.due_date = dueFor(patch.severity);
      return next;
    }),
  };
}

/** ลบได้เฉพาะแถวที่เพิ่มเอง — แถวที่มาจากข้อ "ไม่ใช่" หายเมื่อเปลี่ยนคำตอบของข้อนั้นเท่านั้น */
export function removeIssue(state: WalkFormState, key: string): WalkFormState {
  return { ...state, issues: state.issues.filter((i) => !(i.key === key && i.item_id === null)) };
}

/** แถวปัญหาของหัวข้อหนึ่ง เรียงแบบเอกสาร: แถวจากข้อตรวจตามลำดับข้อ แล้วตามด้วยแถวที่เพิ่มเอง */
export function issuesOfTopic(state: WalkFormState, themeId: string, items: SafetyChecklistItem[]): IssueDraft[] {
  const order = new Map(items.map((i, n) => [i.id, n]));
  const rows = state.issues.filter((i) => i.theme_id === themeId);
  const linked = rows
    .filter((i) => i.item_id !== null)
    .sort((a, b) => (order.get(a.item_id!) ?? 0) - (order.get(b.item_id!) ?? 0));
  return [...linked, ...rows.filter((i) => i.item_id === null)];
}

export interface TopicStats {
  technical: number;
  answered: number;
  yes: number;
  no: number;
  na: number;
  engagement: number;
  asked: number;
}

/** นับผลของหัวข้อหนึ่ง — ข้อความผูกพันพนักงานนับแยก ไม่ปนกับผ่าน/ไม่ผ่าน */
export function topicStats(items: SafetyChecklistItem[], answers: FormAnswers): TopicStats {
  const s: TopicStats = { technical: 0, answered: 0, yes: 0, no: 0, na: 0, engagement: 0, asked: 0 };
  for (const item of items) {
    const a = answers[item.id];
    if (sectionOf(item) === 'engagement') {
      s.engagement += 1;
      if (a?.result === 'pass') s.asked += 1;
      continue;
    }
    s.technical += 1;
    if (!a) continue;
    s.answered += 1;
    if (a.result === 'pass') s.yes += 1;
    else if (a.result === 'fail') s.no += 1;
    else s.na += 1;
  }
  return s;
}

/** ข้อทางเทคนิคที่ยังไม่ได้ตอบ — ใช้เตือนก่อนบันทึก */
export function unansweredTechnical(items: SafetyChecklistItem[], answers: FormAnswers): SafetyChecklistItem[] {
  return items.filter((i) => sectionOf(i) === 'technical' && !answers[i.id]);
}

/** ชื่อใบแจ้งของแถวปัญหา — ไม่ได้พิมพ์อะไรไว้ใช้คำถามของข้อนั้นแทน */
export function issueTitle(row: Pick<IssueDraft, 'issue'>, item?: Pick<SafetyChecklistItem, 'question'>): string {
  return (row.issue.trim() || item?.question || '').slice(0, 300);
}

/** แถวที่เพิ่มเองแต่ยังไม่ได้เขียนว่าปัญหาคืออะไร — บันทึกไม่ได้เพราะใบแจ้งต้องมีชื่อ */
export function blankManualIssues(rows: IssueDraft[]): IssueDraft[] {
  return rows.filter((r) => r.item_id === null && !r.issue.trim());
}
