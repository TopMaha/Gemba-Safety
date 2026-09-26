import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  calendarGrid,
  diffDays,
  endOfMonth,
  endOfWeek,
  formatDate,
  startOfWeek,
  weekdayIndex,
  weeksOfMonth,
} from '../time';

describe('time — โซนเวลา Asia/Bangkok, สัปดาห์เริ่มวันอาทิตย์', () => {
  it('สัปดาห์เริ่มวันอาทิตย์', () => {
    // 2026-08-18 คือวันอังคาร -> ต้นสัปดาห์ = 2026-08-16 (อาทิตย์)
    expect(startOfWeek('2026-08-18')).toBe('2026-08-16');
    expect(endOfWeek('2026-08-18')).toBe('2026-08-22');
    expect(weekdayIndex('2026-08-16')).toBe(0);
  });

  it('วันอาทิตย์อยู่แล้ว ต้นสัปดาห์คือวันเดิม', () => {
    expect(startOfWeek('2026-08-16')).toBe('2026-08-16');
  });

  it('บวกวันข้ามเดือน/ข้ามปีได้ถูกต้อง', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(diffDays('2026-08-01', '2026-08-31')).toBe(30);
  });

  it('สิ้นเดือนคำนวณถูก รวมปีอธิกสุรทิน', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(endOfMonth('2026-08-01')).toBe('2026-08-31');
  });

  it('บวกเดือนแล้ววันที่เกินสิ้นเดือนถูกปรับลง', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('แสดงวันที่ภาษาไทยเป็น พ.ศ. และอังกฤษเป็น ค.ศ.', () => {
    expect(formatDate('2026-08-18', 'th')).toBe('18 ส.ค. 69');
    expect(formatDate('2026-08-18', 'th', { full: true })).toBe('18 สิงหาคม 2569');
    expect(formatDate('2026-08-18', 'en')).toBe('18 Aug 2026');
  });

  it('ตารางปฏิทินมี 42 ช่อง และเริ่มที่วันอาทิตย์', () => {
    const grid = calendarGrid('2026-08');
    expect(grid).toHaveLength(42);
    expect(weekdayIndex(grid[0])).toBe(0);
    expect(grid).toContain('2026-08-01');
    expect(grid).toContain('2026-08-31');
  });

  it('สัปดาห์ของเดือนครอบคลุมทุกวันในเดือน', () => {
    const weeks = weeksOfMonth('2026-08');
    expect(weeks[0].start <= '2026-08-01').toBe(true);
    expect(weeks[weeks.length - 1].end >= '2026-08-31').toBe(true);
  });
});
