import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_FORM, addIssue, blankManualIssues, fillUnanswered, issueTitle, issuesOfTopic, patchIssue, removeIssue,
  setAnswer, setNote, statusOptions, topicStats, unansweredTechnical,
} from '../gembaForm';
import { GEMBA_TOPICS, buildGembaChecklist } from '../gembaTopics';
import type { SafetyChecklistItem, Severity } from '../types';

const item = (id: string, over: Partial<SafetyChecklistItem> = {}): SafetyChecklistItem => ({
  id,
  theme_id: 't1',
  item_code: id.toUpperCase(),
  section: 'technical',
  question: `คำถาม ${id}`,
  default_severity: 'high',
  sort_order: 10,
  is_active: true,
  ...over,
});

const due = (s: Severity) => `due-${s}`;
const a = item('a', { sort_order: 10 });
const b = item('b', { sort_order: 20 });
const eng = item('e1', { section: 'engagement', sort_order: 1010 });

describe('setAnswer', () => {
  it('adds a linked issue row when a technical item is answered "No"', () => {
    const s = setAnswer(EMPTY_FORM, a, 'fail', due);
    expect(s.answers.a.result).toBe('fail');
    expect(s.issues).toHaveLength(1);
    expect(s.issues[0]).toMatchObject({ item_id: 'a', theme_id: 't1', severity: 'high', due_date: 'due-high', due_auto: true });
  });

  it('removes the row when the answer changes, and restores what was typed when switched back', () => {
    let s = setAnswer(EMPTY_FORM, a, 'fail', due);
    s = patchIssue(s, s.issues[0].key, { corrective_action: 'ติดการ์ด' }, due);
    s = setAnswer(s, a, 'pass', due);
    expect(s.issues).toHaveLength(0);
    s = setAnswer(s, a, 'fail', due);
    expect(s.issues[0].corrective_action).toBe('ติดการ์ด');
    expect(s.stash).toEqual({});
  });

  it('clears the answer with null and keeps the comment when changing result', () => {
    let s = setAnswer(EMPTY_FORM, a, 'na', due);
    s = setNote(s, 'a', 'ไม่มีเครื่องในพื้นที่');
    s = setAnswer(s, a, 'pass', due);
    expect(s.answers.a).toEqual({ result: 'pass', note: 'ไม่มีเครื่องในพื้นที่' });
    expect(setAnswer(s, a, null, due).answers.a).toBeUndefined();
  });

  it('never opens an issue for employee engagement questions', () => {
    const s = setAnswer(EMPTY_FORM, eng, 'fail', due);
    expect(s.answers.e1.result).toBe('fail');
    expect(s.issues).toHaveLength(0);
  });
});

describe('issue rows', () => {
  it('moves the due date with severity until the inspector picks a date', () => {
    let s = addIssue(EMPTY_FORM, 't1', due);
    const key = s.issues[0].key;
    s = patchIssue(s, key, { severity: 'critical' }, due);
    expect(s.issues[0].due_date).toBe('due-critical');
    s = patchIssue(s, key, { due_date: '2026-12-01' }, due);
    s = patchIssue(s, key, { severity: 'low' }, due);
    expect(s.issues[0]).toMatchObject({ due_date: '2026-12-01', due_auto: false });
  });

  it('only lets hand-added rows be removed', () => {
    let s = setAnswer(EMPTY_FORM, a, 'fail', due);
    s = addIssue(s, 't1', due);
    const [linked, manual] = s.issues;
    expect(removeIssue(s, linked.key).issues).toHaveLength(2);
    expect(removeIssue(s, manual.key).issues).toEqual([linked]);
  });

  it('orders linked rows by item order, then hand-added rows', () => {
    let s = addIssue(EMPTY_FORM, 't1', due);
    s = setAnswer(s, b, 'fail', due);
    s = setAnswer(s, a, 'fail', due);
    expect(issuesOfTopic(s, 't1', [a, b]).map((r) => r.item_id)).toEqual(['a', 'b', null]);
  });

  it('uses the question as the finding title when the issue cell is blank', () => {
    expect(issueTitle({ issue: '  ' }, a)).toBe('คำถาม a');
    expect(issueTitle({ issue: 'สายไฟชำรุด' }, a)).toBe('สายไฟชำรุด');
  });

  it('flags hand-added rows with no issue text', () => {
    let s = addIssue(EMPTY_FORM, 't1', due);
    s = setAnswer(s, a, 'fail', due);
    expect(blankManualIssues(s.issues)).toHaveLength(1);
  });
});

describe('counting', () => {
  it('counts technical answers apart from engagement questions', () => {
    let s = setAnswer(EMPTY_FORM, a, 'fail', due);
    s = setAnswer(s, eng, 'pass', due);
    expect(topicStats([a, b, eng], s.answers)).toEqual({
      technical: 2, answered: 1, yes: 0, no: 1, na: 0, engagement: 1, asked: 1,
    });
    expect(unansweredTechnical([a, b, eng], s.answers).map((i) => i.id)).toEqual(['b']);
  });

  it('fills only the unanswered items', () => {
    let s = setAnswer(EMPTY_FORM, a, 'fail', due);
    s = fillUnanswered(s, [a, b], 'pass', due);
    expect(s.answers.a.result).toBe('fail');
    expect(s.answers.b.result).toBe('pass');
  });

  it('offers OK/NOK only on LPA forms, and Yes/No on engagement questions', () => {
    expect(statusOptions('technical', 'yes_no_na')).toEqual(['pass', 'fail', 'na']);
    expect(statusOptions('technical', 'ok_nok')).toEqual(['pass', 'fail']);
    expect(statusOptions('engagement', 'yes_no_na')).toEqual(['pass', 'fail']);
  });
});

describe('GEMBA WALK seed', () => {
  const items = buildGembaChecklist();

  it('has the 13 topics from the Excel folder with their item counts', () => {
    expect(GEMBA_TOPICS).toHaveLength(13);
    const technical = (code: string) => items.filter((i) => i.item_code.startsWith(`${code}-`) && i.section === 'technical').length;
    expect(technical('CHM')).toBe(8);
    expect(technical('LPA')).toBe(20);
    expect(technical('PIV')).toBe(10);
    expect(items.filter((i) => i.section === 'engagement')).toHaveLength(48);
    expect(GEMBA_TOPICS.filter((t) => t.form_style === 'ok_nok').map((t) => t.id)).toEqual(['gw_03']);
  });

  it('matches worker/seed-gemba-topics.sql row for row', () => {
    const sql = readFileSync(resolve(__dirname, '../../../worker/seed-gemba-topics.sql'), 'utf8');
    for (const t of GEMBA_TOPICS) expect(sql).toContain(`('${t.id}', '${t.theme_name.replace(/'/g, "''")}'`);
    const sqlItemIds = [...sql.matchAll(/^\s+\('(gi_[a-z0-9_]+)'/gm)].map((m) => m[1]);
    expect(sqlItemIds).toEqual(items.map((i) => i.id));
  });
});
