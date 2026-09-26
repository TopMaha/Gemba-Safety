import { describe, expect, it } from 'vitest';
import { adherence, bandOf, overallCompletion, rankManagers, themeCompletion } from '../calc';
import type { GembaPlan, Manager, WalkRecord } from '../types';

const mgr = (id: string, active = true): Manager => ({
  id,
  manager_code: id,
  full_name: id,
  department: 'Production',
  avatar_url: null,
  is_active: active,
  dashboard_enabled: true,
  can_login: true,
  created_at: '2026-01-01T00:00:00.000Z',
});

const plan = (id: string, manager_id: string, date: string, status: GembaPlan['status']): GembaPlan => ({
  id,
  manager_id,
  plan_date: date,
  plan_time: '09:00',
  area_id: 'ar_1',
  theme_ids: ['th_01'],
  theme_id: 'th_01',
  status,
  created_at: '2026-01-01T00:00:00.000Z',
});

const rec = (id: string, manager_id: string, date: string, theme_ids: string[]): WalkRecord => ({
  id,
  plan_id: null,
  manager_id,
  actual_date: date,
  actual_time: '09:30',
  actual_area_id: 'ar_1',
  theme_ids,
  observation: 'ok',
  has_issue: false,
  photo_urls: [],
  participant_names: [],
  ci_required: false,
  completed_at: `${date}T09:30:00.000Z`,
});

describe('Adherence', () => {
  const plans = [
    plan('p1', 'm1', '2026-08-17', 'completed'),
    plan('p2', 'm1', '2026-08-18', 'completed'),
    plan('p3', 'm1', '2026-08-19', 'planned'),
    plan('p4', 'm1', '2026-08-20', 'cancelled'),
    plan('p5', 'm2', '2026-08-18', 'planned'),
  ];

  it('นับเฉพาะแผนในช่วงเวลา และไม่นับแผนที่ยกเลิก', () => {
    const r = adherence(plans, '2026-08-16', '2026-08-22', 'm1', '2026-08-22');
    expect(r.done).toBe(2);
    expect(r.total).toBe(3);
    expect(r.cancelled).toBe(1);
    expect(r.pct).toBe(66);
  });

  it('ไม่นับแผนที่ยังไม่ถึงกำหนด (แยกไว้ใน upcoming)', () => {
    const r = adherence(plans, '2026-08-16', '2026-08-22', 'm1', '2026-08-18');
    expect(r.done).toBe(2);
    expect(r.total).toBe(2);
    expect(r.upcoming).toBe(1);
    expect(r.pct).toBe(100);
  });

  it('กรองรายบุคคลได้', () => {
    expect(adherence(plans, '2026-08-16', '2026-08-22', 'm2', '2026-08-22').total).toBe(1);
  });

  it('ไม่มีแผนในช่วง คืนค่า 0 โดยไม่หารด้วยศูนย์', () => {
    expect(adherence(plans, '2026-01-01', '2026-01-07', undefined, '2026-08-22').pct).toBe(0);
  });
});

describe('Completion รายหัวข้อ', () => {
  const managers = [mgr('m1'), mgr('m2'), mgr('m3')];
  const records = [
    rec('r1', 'm1', '2026-08-17', ['th_01']),
    rec('r2', 'm1', '2026-08-18', ['th_01']), // คนเดิม หัวข้อเดิม -> นับเป็น 1
    rec('r3', 'm2', '2026-08-18', ['th_01', 'th_02']),
  ];

  it('คนเดิมเดินหัวข้อเดิมหลายครั้ง นับเป็น 1 คน', () => {
    const [row] = themeCompletion(['th_01'], records, managers, '2026-08-16', '2026-08-22');
    expect(row.actual).toBe(2);
    expect(row.plan).toBe(3);
    expect(row.pct).toBe(66);
    expect(row.missingManagerIds).toEqual(['m3']);
  });

  it('ไม่นับรายการนอกช่วงเวลา', () => {
    const [row] = themeCompletion(['th_01'], records, managers, '2026-09-01', '2026-09-30');
    expect(row.actual).toBe(0);
    expect(row.missingManagerIds).toHaveLength(3);
  });

  it('ภาพรวมหัวข้อที่เลือก = ผลรวม Actual ÷ ผลรวม Plan (ตัวอย่างในสเปก 17/30 = 56%)', () => {
    const rows = [
      { theme_id: 'a', plan: 15, actual: 9, pct: 60, doneManagerIds: [], missingManagerIds: [] },
      { theme_id: 'b', plan: 15, actual: 8, pct: 53, doneManagerIds: [], missingManagerIds: [] },
    ];
    expect(overallCompletion(rows)).toEqual({ actual: 17, plan: 30, pct: 56 });
  });
});

describe('แถบสี Completion', () => {
  it('เขียว ≥80, ส้ม 50–79, แดง <50', () => {
    expect(bandOf(80)).toBe('ok');
    expect(bandOf(79)).toBe('warn');
    expect(bandOf(50)).toBe('warn');
    expect(bandOf(49)).toBe('bad');
  });
});

describe('อันดับผู้จัดการ', () => {
  it('เรียงตามจำนวนครั้งที่เดิน และให้อันดับเท่ากันเมื่อคะแนนเท่ากัน', () => {
    const managers = [mgr('m1'), mgr('m2'), mgr('m3')];
    const records = [
      rec('r1', 'm1', '2026-08-17', ['th_01']),
      rec('r2', 'm1', '2026-08-18', ['th_01']),
      rec('r3', 'm2', '2026-08-18', ['th_01']),
      rec('r4', 'm3', '2026-08-18', ['th_01']),
    ];
    const rows = rankManagers(managers, [], records, '2026-08-16', '2026-08-22');
    expect(rows[0].manager.id).toBe('m1');
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
    expect(rows[2].rank).toBe(2);
  });
});
