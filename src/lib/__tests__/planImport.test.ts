import { describe, expect, it } from 'vitest';
import { buildGembaChecklist, GEMBA_TOPICS } from '../gembaTopics';
import { matchArea, parsePlanDate, parsePlanPaste, parsePlanTime, splitPaste } from '../planImport';
import { buildAreas } from '../roster';
import type { GembaPlan, Manager } from '../types';

const person = (code: string, over: Partial<Manager> = {}): Manager => ({
  id: `mgr_${code.replace(/[^A-Za-z0-9]/g, '_')}`,
  manager_code: code,
  full_name: `นาย ${code}`,
  department: 'VSM1',
  is_active: true,
  dashboard_enabled: true,
  can_login: true,
  created_at: '',
  ...over,
});

const managers = [person('T-815'), person('M-089', { can_login: false }), person('X-001', { is_active: false })];
const ctx = {
  managers,
  areas: buildAreas(),
  themes: GEMBA_TOPICS,
  checklist: buildGembaChecklist(),
  plans: [] as GembaPlan[],
  today: '2026-11-16',
};

describe('parsePlanDate', () => {
  it.each([
    ['20/11/2026', '2026-11-20'],
    ['20/11/2569', '2026-11-20'],
    ['2026-11-20', '2026-11-20'],
    ['11/20/2026', '2026-11-20'],
    ['20 พ.ย. 69', '2026-11-20'],
    ['20 พฤศจิกายน 2569', '2026-11-20'],
    ['20-Nov-26', '2026-11-20'],
    ['46346', '2026-11-20'],
  ])('reads %s', (raw, iso) => expect(parsePlanDate(raw)).toBe(iso));

  it('rejects impossible dates', () => {
    expect(parsePlanDate('31/02/2026')).toBeNull();
    expect(parsePlanDate('พรุ่งนี้')).toBeNull();
  });
});

describe('parsePlanTime', () => {
  it.each([
    ['', '09:00'],
    ['9', '09:00'],
    ['9.30', '09:30'],
    ['13:15', '13:15'],
    ['0930', '09:30'],
    ['0.375', '09:00'],
    ['2:30 PM', '14:30'],
    ['10.00 น.', '10:00'],
  ])('reads "%s"', (raw, hhmm) => expect(parsePlanTime(raw)).toBe(hhmm));

  it('rejects 25:00', () => expect(parsePlanTime('25:00')).toBeNull());
});

describe('matchArea', () => {
  it.each([
    ['VSM1', 'ar_vsm1'],
    ['vsm 3', 'ar_vsm3'],
    ['QC', 'ar_qc'],
    ['MTN', 'ar_maint'],
    ['office', 'ar_office'],
    ['คลังสินค้า', 'ar_wh'],
  ])('finds %s', (raw, id) => expect(matchArea(raw, ctx.areas)?.id).toBe(id));

  it('ignores retired areas', () => expect(matchArea('จัดซื้อ', ctx.areas)).toBeUndefined());
});

describe('parsePlanPaste', () => {
  it('reads Excel rows, skips the header, and matches topics by number, code or name', () => {
    const text = [
      'รหัสพนักงาน\tวันที่\tเวลา\tพื้นที่\tหัวข้อ\tหมายเหตุ',
      't815\t20/11/2026\t9.00\tVSM1\t01, LPA\tเน้นถังสารเคมี',
      'T-815\t21/11/2026\t\tMTN\tLOTOTO',
    ].join('\r\n');
    const rows = parsePlanPaste(text, ctx);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      plan_date: '2026-11-20', plan_time: '09:00', theme_ids: ['gw_01', 'gw_03'], note: 'เน้นถังสารเคมี', errors: [],
    });
    expect(rows[0].area?.id).toBe('ar_vsm1');
    expect(rows[1]).toMatchObject({ plan_time: '09:00', theme_ids: ['gw_08'], errors: [] });
  });

  it('flags unknown codes, closed accounts, bad dates and too many topics', () => {
    const rows = parsePlanPaste(
      ['Z-999\t20/11/2026\t09:00\tVSM1\t01', 'X-001\t20/11/2026\t09:00\tVSM1\t01', 'T-815\t99/99/2026\t09:00\tVSM1\t1,2,3,4'].join('\n'),
      ctx,
    );
    expect(rows[0].errors.map((e) => e.key)).toEqual(['errCode']);
    expect(rows[1].errors.map((e) => e.key)).toEqual(['inactive']);
    expect(rows[2].errors.map((e) => e.key)).toEqual(['errDate', 'errTooMany']);
  });

  it('warns about non-walkers, past dates and duplicates without blocking', () => {
    const plans = [{ id: 'p', manager_id: 'mgr_T_815', plan_date: '2026-11-20', area_id: 'ar_vsm1', status: 'planned' } as GembaPlan];
    const rows = parsePlanPaste(['M-089\t01/11/2026\t\tQC\tPPE', 'T-815\t20/11/2026\t\tVSM1\t12'].join('\n'), { ...ctx, plans });
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].warnings.map((w) => w.key)).toEqual(['warnNotWalker', 'warnPast']);
    expect(rows[1].warnings.map((w) => w.key)).toEqual(['warnDup']);
  });

  it('keeps a first row that is real data', () => {
    expect(splitPaste('T-815\t20/11/2026')).toHaveLength(1);
  });
});
