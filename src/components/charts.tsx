import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * ── กราฟเล็ก ๆ ของแดชบอร์ด ────────────────────────────────────────────────
 *
 * เขียนด้วย HTML/CSS ล้วน (ไม่มีไลบรารีกราฟ) ตามแนวของ dataviz
 *   - แท่งบาง ≤ 24px ปลายมน 4px ฐานเหลี่ยม · เส้นกริด/แกนบางและจาง
 *   - ชุดข้อมูลเดียวใช้สีแบรนด์ (accent) ไม่มีกล่องคำอธิบาย ชื่อกราฟบอกแล้ว
 *   - ตัวเลขไม่ใส่ทุกแท่ง — แสดงค่าสูงสุดกับแท่งที่เลือก ที่เหลืออยู่ในคำอ่าน (แตะ/ชี้/โฟกัส)
 *   - ตัวหนังสือใช้สีข้อความเสมอ ไม่ใช้สีของข้อมูล
 */

/* ── Meter: อัตราส่วนเดียวเทียบเต็ม ──────────────────────────────────────── */

const TONE_FILL = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', accent: 'bg-accent' } as const;
const TONE_TRACK = { ok: 'bg-ok/15', warn: 'bg-warn/15', bad: 'bg-bad/15', accent: 'bg-accent/15' } as const;

export function Meter({ pct, tone, label }: { pct: number; tone: keyof typeof TONE_FILL; label: string }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      className={cn('h-2 overflow-hidden rounded-full', TONE_TRACK[tone])}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500', TONE_FILL[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}

/* ── Column chart: ค่าตามเวลา (หนึ่งชุดข้อมูล) ─────────────────────────────── */

export interface Column {
  key: string;
  /** ป้ายใต้แท่ง — ว่างได้ (เดือนเต็มแสดงแค่บางวัน) */
  tick: string;
  value: number;
  /** ข้อความในคำอ่านตอนเลือกแท่งนี้ */
  readout: string;
  /** แท่งที่ควรเด่น เช่น วันนี้ */
  mark?: boolean;
}

export function ColumnChart({
  columns,
  summary,
  ariaLabel,
  height = 132,
}: {
  columns: Column[];
  /** คำอ่านตอนยังไม่ได้เลือกแท่งไหน */
  summary: ReactNode;
  ariaLabel: string;
  height?: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...columns.map((c) => c.value));
  const peak = columns.reduce<Column | null>((best, c) => (c.value > 0 && (!best || c.value > best.value) ? c : best), null);
  const sel = columns.find((c) => c.key === active);

  return (
    <div>
      {/* คำอ่าน — เปลี่ยนตามแท่งที่แตะ/ชี้ ไม่บังกราฟ */}
      <p className="num mb-2 min-h-[20px] text-[12px] text-muted-foreground" aria-live="polite">
        {sel ? <span className="font-semibold text-foreground">{sel.readout}</span> : summary}
      </p>

      <div className="relative" style={{ height }}>
        {/* เส้นกริดค่าสูงสุด + ฐาน */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-border/70" aria-hidden />
        <span className="num pointer-events-none absolute -top-2 right-0 bg-card pl-1 text-[10px] text-muted-foreground" aria-hidden>
          {max}
        </span>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-foreground/25" aria-hidden />

        <div
          role="group"
          aria-label={ariaLabel}
          className="absolute inset-0 flex items-end gap-[2px]"
          onPointerLeave={() => setActive(null)}
        >
          {columns.map((c) => {
            const h = c.value ? Math.max(3, (c.value / max) * (height - 14)) : 0;
            const dim = active !== null && active !== c.key;
            const showValue = c.value > 0 && (c.key === active || (active === null && c.key === peak?.key));
            return (
              <button
                key={c.key}
                type="button"
                aria-label={c.readout}
                onPointerEnter={() => setActive(c.key)}
                onFocus={() => setActive(c.key)}
                onBlur={() => setActive(null)}
                onClick={() => setActive((k) => (k === c.key ? null : c.key))}
                className="focusable group relative flex h-full min-w-0 flex-1 items-end justify-center rounded-sm"
              >
                {showValue ? (
                  <span
                    className="num pointer-events-none absolute text-[11px] font-semibold text-foreground"
                    style={{ bottom: h + 2 }}
                  >
                    {c.value}
                  </span>
                ) : null}
                <span
                  className={cn(
                    'block w-full max-w-[24px] rounded-t-[4px] transition-opacity duration-150',
                    c.mark ? 'bg-accent' : 'bg-accent/80',
                    dim ? 'opacity-35' : 'opacity-100',
                  )}
                  style={{ height: h }}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* ป้ายแกนนอน */}
      <div className="mt-1 flex gap-[2px]" aria-hidden>
        {columns.map((c) => (
          <span
            key={c.key}
            className={cn(
              'num min-w-0 flex-1 truncate text-center text-[10px]',
              c.mark ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {c.tick}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Segmented bar: หนึ่งก้อนแบ่งเป็นส่วน (≤ 6) ───────────────────────────── */

export interface Segment {
  key: string;
  label: string;
  value: number;
  /** ค่าสี เช่น var(--chart-open) */
  color: string;
  /** ตัวหนังสือบนพื้นสีนี้ — ดำบนเหลือง ที่เหลือขาว */
  ink?: 'white' | 'black';
}

export function SegmentedBar({ segments, ariaLabel }: { segments: Segment[]; ariaLabel: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0);

  return (
    <div>
      <div role="img" aria-label={ariaLabel} className="flex h-7 gap-[2px] overflow-hidden rounded-[4px]">
        {total === 0 ? (
          <div className="h-full w-full rounded-[4px] bg-muted" />
        ) : (
          shown.map((s) => (
            <div
              key={s.key}
              title={`${s.label} · ${s.value} (${pct(s.value)}%)`}
              className="flex h-full min-w-[6px] items-center rounded-[4px] px-1.5"
              style={{ flexGrow: s.value, flexBasis: 0, background: s.color }}
            >
              {/* พิมพ์สัดส่วนเฉพาะช่องที่กว้างพอ ช่องแคบดูตัวเลขที่รายการด้านล่างแทน */}
              {pct(s.value) >= 14 ? (
                <span className={cn('text-[11px] font-semibold', s.ink === 'black' ? 'text-[#0b0b0b]' : 'text-white')}>
                  {pct(s.value)}%
                </span>
              ) : null}
            </div>
          ))
        )}
      </div>

      {/* คำอธิบาย + ตัวเลขทุกส่วน (ทำหน้าที่ตารางด้วย — บางสีจางบนพื้นขาว ต้องมีตัวเลขให้อ่านเสมอ) */}
      <ul className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-[12px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
            <span className="num font-semibold">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Bar list: เทียบขนาดรายแถว เรียงมากไปน้อย ──────────────────────────────── */

export interface BarRow {
  key: string;
  label: ReactNode;
  value: number;
  /** ข้อความเล็กต่อท้ายตัวเลข เช่น % เดินตามแผน */
  note?: string;
  /** แถวที่ควรเด่น เช่น ตัวเอง */
  mark?: boolean;
  /** แถวรวม "อื่น ๆ" ใช้สีจาง */
  muted?: boolean;
}

export function BarList({ rows, ariaLabel }: { rows: BarRow[]; ariaLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul aria-label={ariaLabel} className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline gap-2">
            <span className={cn('min-w-0 flex-1 truncate text-[13px]', r.mark ? 'font-semibold' : '')}>{r.label}</span>
            <span className="num shrink-0 text-[13px] font-semibold">{r.value}</span>
            {r.note ? <span className="num w-10 shrink-0 text-right text-[11px] text-muted-foreground">{r.note}</span> : null}
          </div>
          <div className="h-2.5 rounded-r-[4px] bg-muted/60">
            <div
              className={cn('h-full rounded-r-[4px] transition-[width] duration-500', r.muted ? 'bg-steel/45' : r.mark ? 'bg-accent' : 'bg-accent/75')}
              style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0 }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
