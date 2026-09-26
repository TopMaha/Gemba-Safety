import { describe, expect, it } from 'vitest';
import { nextSortOrder, suggestItemCode } from '../safety';

const item = (theme_id: string, item_code: string, sort_order = 10) => ({ theme_id, item_code, sort_order });

describe('suggestItemCode', () => {
  it('continues the numbering of the category', () => {
    const items = [item('th_01', 'PPE-01'), item('th_01', 'PPE-02'), item('th_01', 'PPE-04'), item('th_02', 'GRD-09')];
    expect(suggestItemCode(items, 'th_01')).toBe('PPE-05');
  });

  it('keeps the zero padding width', () => {
    expect(suggestItemCode([item('t', 'A-009')], 't')).toBe('A-010');
    expect(suggestItemCode([item('t', '5S-2')], 't')).toBe('5S-3');
  });

  it('uses the most common prefix when codes are mixed', () => {
    const items = [item('t', 'FIR-01'), item('t', 'FIR-02'), item('t', 'X-40')];
    expect(suggestItemCode(items, 't')).toBe('FIR-03');
  });

  it('returns empty when the category has no numbered codes', () => {
    expect(suggestItemCode([item('t', ''), item('u', 'U-01')], 't')).toBe('');
  });
});

describe('nextSortOrder', () => {
  it('appends after the last item in steps of 10', () => {
    expect(nextSortOrder([item('t', 'a', 10), item('t', 'b', 40), item('u', 'c', 90)], 't')).toBe(50);
  });

  it('starts at 10 for an empty category', () => {
    expect(nextSortOrder([], 't')).toBe(10);
  });
});
