import type { Area, GembaPlan, Manager, WalkRecord } from './types';
import { diffDays, inRange, todayISO, type ISODate } from './time';

/**
 * ── Adherence: จำนวนแผนที่เดินแล้ว ÷ แผนทั้งหมดในช่วง × 100
 * ไม่นับแผนที่ยกเลิก และไม่นับแผนที่ยังไม่ถึงกำหนด (เช่น ดูสัปดาห์ปัจจุบันกลางสัปดาห์
 * แผนของวันพรุ่งนี้จะยังไม่ถูกนับเป็นความผิด) — ตัวเลขที่ยังไม่ถึงกำหนดแสดงแยกใน upcoming
 */
export interface AdherenceResult {
  done: number;
  total: number;
  cancelled: number;
  upcoming: number;
  pct: number;
}

export function adherence(
  plans: GembaPlan[],
  from: ISODate,
  to: ISODate,
  managerId?: string,
  asOf: ISODate = todayISO(),
): AdherenceResult {
  const scope = plans.filter(
    (p) => inRange(p.plan_date, from, to) && (!managerId || p.manager_id === managerId),
  );
  const cancelled = scope.filter((p) => p.status === 'cancelled').length;
  const active = scope.filter((p) => p.status !== 'cancelled');
  const upcoming = active.filter((p) => p.plan_date > asOf && p.status !== 'completed').length;
  const counted = active.filter((p) => p.plan_date <= asOf || p.status === 'completed');
  const done = counted.filter((p) => p.status === 'completed').length;
  return {
    done,
    total: counted.length,
    cancelled,
    upcoming,
    pct: counted.length ? Math.floor((done / counted.length) * 100) : 0,
  };
}

/** ── Completion รายหัวข้อ: นับ "คน" ไม่ซ้ำ เทียบกับพนักงาน Active ทั้งหมด */
export interface ThemeCompletionRow {
  theme_id: string;
  plan: number;
  actual: number;
  pct: number;
  doneManagerIds: string[];
  missingManagerIds: string[];
}

export function themeCompletion(
  themeIds: string[],
  records: WalkRecord[],
  activeManagers: Manager[],
  from: ISODate,
  to: ISODate,
): ThemeCompletionRow[] {
  const inScope = records.filter((r) => inRange(r.actual_date, from, to));
  const activeIds = activeManagers.map((m) => m.id);

  return themeIds.map((themeId) => {
    const doneSet = new Set(
      inScope.filter((r) => r.theme_ids.includes(themeId)).map((r) => r.manager_id),
    );
    const doneManagerIds = activeIds.filter((id) => doneSet.has(id));
    const missingManagerIds = activeIds.filter((id) => !doneSet.has(id));
    const plan = activeIds.length;
    return {
      theme_id: themeId,
      plan,
      actual: doneManagerIds.length,
      pct: plan ? Math.floor((doneManagerIds.length / plan) * 100) : 0,
      doneManagerIds,
      missingManagerIds,
    };
  });
}

/** ภาพรวมหัวข้อที่เลือก = ผลรวม Actual ÷ ผลรวม Plan */
export function overallCompletion(rows: ThemeCompletionRow[]) {
  const actual = rows.reduce((s, r) => s + r.actual, 0);
  const plan = rows.reduce((s, r) => s + r.plan, 0);
  return { actual, plan, pct: plan ? Math.floor((actual / plan) * 100) : 0 };
}

export function bandOf(pct: number): 'ok' | 'warn' | 'bad' {
  if (pct >= 80) return 'ok';
  if (pct >= 50) return 'warn';
  return 'bad';
}

/** ── อันดับผู้จัดการในช่วงเวลา */
export interface RankRow {
  manager: Manager;
  walks: number;
  planned: number;
  completed: number;
  adherence: number;
  issues: number;
  themes: number;
  rank: number;
}

export function rankManagers(
  managers: Manager[],
  plans: GembaPlan[],
  records: WalkRecord[],
  from: ISODate,
  to: ISODate,
): RankRow[] {
  const rows = managers.map((manager) => {
    const rs = records.filter((r) => r.manager_id === manager.id && inRange(r.actual_date, from, to));
    const ad = adherence(plans, from, to, manager.id);
    const themes = new Set(rs.flatMap((r) => r.theme_ids)).size;
    return {
      manager,
      walks: rs.length,
      planned: ad.total,
      completed: ad.done,
      adherence: ad.pct,
      issues: rs.filter((r) => r.has_issue).length,
      themes,
      rank: 0,
    };
  });

  rows.sort((a, b) => b.walks - a.walks || b.adherence - a.adherence || b.themes - a.themes);
  let last = -1;
  let lastRank = 0;
  rows.forEach((r, i) => {
    const score = r.walks * 1000 + r.adherence;
    if (score !== last) {
      lastRank = i + 1;
      last = score;
    }
    r.rank = lastRank;
  });
  return rows;
}

/** ── ความครอบคลุมพื้นที่ */
export interface CoverageRow {
  area: Area;
  path: string;
  visits: number;
  lastVisit: ISODate | null;
  daysSince: number | null;
  managers: number;
}

export function coverage(
  areas: Area[],
  records: WalkRecord[],
  from: ISODate,
  to: ISODate,
  pathOf: (id: string) => string,
): CoverageRow[] {
  const today = todayISO();
  const scope = records.filter((r) => inRange(r.actual_date, from, to));
  return areas
    .filter((a) => a.is_active)
    .map((area) => {
      const rs = scope.filter((r) => r.actual_area_id === area.id);
      const lastVisit = rs.length ? rs.map((r) => r.actual_date).sort().at(-1)! : null;
      return {
        area,
        path: pathOf(area.id),
        visits: rs.length,
        lastVisit,
        daysSince: lastVisit ? diffDays(lastVisit, today) : null,
        managers: new Set(rs.map((r) => r.manager_id)).size,
      };
    });
}

/** พื้นที่ที่ควรเดินรอบถัดไป — ไม่เคยเดินมาก่อนขึ้นก่อน แล้วตามด้วยที่ห่างหายนานสุด */
export function suggestNextAreas(rows: CoverageRow[], limit = 6): CoverageRow[] {
  return [...rows]
    .sort((a, b) => {
      if (a.visits === 0 && b.visits !== 0) return -1;
      if (b.visits === 0 && a.visits !== 0) return 1;
      return (b.daysSince ?? 9999) - (a.daysSince ?? 9999) || a.visits - b.visits;
    })
    .slice(0, limit);
}

/** เตือนเมื่อพื้นที่เพิ่งถูกเดินไปไม่นาน */
export function recentVisitWarning(
  records: WalkRecord[],
  areaId: string,
  withinDays: number,
): { last: ISODate; days: number } | null {
  const today = todayISO();
  const last = records
    .filter((r) => r.actual_area_id === areaId)
    .map((r) => r.actual_date)
    .sort()
    .at(-1);
  if (!last) return null;
  const days = diffDays(last, today);
  return days <= withinDays ? { last, days } : null;
}
