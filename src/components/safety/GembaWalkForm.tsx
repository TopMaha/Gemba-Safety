import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type TextareaHTMLAttributes } from 'react';
import { Camera, CheckCheck, CheckCircle2, ChevronDown, CircleDashed, Link2, MinusCircle, Plus, Trash2, XCircle } from 'lucide-react';
import { PhotoUploader } from '@/components/PhotoUploader';
import { ManagerSelect, SeveritySelect } from '@/components/safety/FindingDialogs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import {
  addIssue, fillUnanswered, issuesOfTopic, patchIssue, removeIssue, sectionOf, setAnswer, setNote,
  statusOptions, styleOf, topicStats,
  type DueFor, type IssueDraft, type TopicStats, type WalkFormState,
} from '@/lib/gembaForm';
import { useI18n, type TKey } from '@/lib/i18n';
import type { ChecklistResultValue, ChecklistSection, FormStyle, Manager, SafetyChecklistItem, WalkTheme } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * ── แบบฟอร์ม GEMBA WALK แบบตาราง ─────────────────────────────────────────
 *
 * หน้าตาเลียนเอกสาร Excel ในโฟลเดอร์ "รายการที่ต้องตรวจสอบ" ทีละหัวข้อ
 *   ตาราง 1  # · คำถามทางเทคนิค · สถานะ (ใช่/ไม่ใช่/ไม่เกี่ยวข้อง) · ความคิดเห็น   (LPA: OK/NOK)
 *   ตาราง 2  # · คำถามเพื่อสร้างความผูกพันของพนักงาน · ถามแล้ว (ใช่/ไม่ใช่) · ความคิดเห็น
 *   ตาราง 3  # · ปัญหาที่ตรวจพบ · การดำเนินการแก้ไข · วันครบกำหนด · เจ้าของ
 *
 * จอกว้าง (md ขึ้นไป) เป็นตารางหลายคอลัมน์จริง · มือถือแต่ละแถวพับเป็นสามบรรทัด
 * (คำถาม → ปุ่มสถานะ → ความคิดเห็น) แต่ยังมีเส้นตารางและเลขข้อเหมือนเดิม
 */

/* ── ชื่อปุ่มสถานะตามรูปแบบฟอร์ม ───────────────────────────────────────── */

const RESULT_ICON: Record<ChecklistResultValue, typeof CheckCircle2> = {
  pass: CheckCircle2,
  fail: XCircle,
  na: MinusCircle,
};

const RESULT_ON: Record<ChecklistResultValue, string> = {
  pass: 'border-ok bg-ok/15 text-ok',
  fail: 'border-bad bg-bad/15 text-bad',
  na: 'border-steel bg-steel/15 text-steel',
};

/** คำบนปุ่ม — LPA ใช้ OK/NOK ส่วนแบบฟอร์มอื่นและคำถามความผูกพันใช้ ใช่/ไม่ใช่ */
export function resultLabelKey(result: ChecklistResultValue, style: FormStyle, section: ChecklistSection): TKey {
  if (section === 'technical' && style === 'ok_nok') return result === 'fail' ? 'gemba.nok' : 'gemba.ok';
  return result === 'pass' ? 'gemba.yes' : result === 'fail' ? 'gemba.no' : 'gemba.na';
}

/** ชื่อแบบฟอร์มแบบที่พิมพ์อยู่หัวเอกสาร เช่น "การจัดการสารเคมี GEMBA WALK" */
export function formTitle(theme: WalkTheme, name: string, t: (k: TKey, v?: Record<string, string>) => string) {
  const bare = name.replace(/^\d+\s*-\s*/, '');
  return styleOf(theme) === 'ok_nok' ? t('gemba.lpaTitle', { name: bare }) : t('gemba.formTitle', { name: bare });
}

/* ── แถบเลือกหัวข้อ (เหมือนแท็บชีตใน Excel) ──────────────────────────────── */

export function TopicSheetTabs({
  topics,
  active,
  onSelect,
  statsOf,
  labelOf,
}: {
  topics: WalkTheme[];
  active: string;
  onSelect: (id: string) => void;
  statsOf: (id: string) => TopicStats;
  labelOf: (theme: WalkTheme) => string;
}) {
  const { t } = useI18n();
  if (topics.length < 2) return null;
  return (
    <div role="tablist" aria-label={t('gemba.topics')} className="scroll-x -mb-px flex gap-1 px-1">
      {topics.map((th) => {
        const s = statsOf(th.id);
        const selected = th.id === active;
        const done = s.technical > 0 && s.answered === s.technical;
        return (
          <button
            key={th.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onSelect(th.id)}
            className={cn(
              'press focusable relative flex min-h-[44px] max-w-[240px] shrink-0 items-center gap-2 rounded-t-md border px-3 py-2 text-left text-[12px]',
              selected
                ? 'z-10 border-b-card bg-card font-semibold text-foreground'
                : 'border-transparent bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {selected ? <span className="brand-stripe absolute inset-x-0 top-0 h-[3px] rounded-t-md" aria-hidden /> : null}
            <span className="min-w-0 truncate">{labelOf(th)}</span>
            <span className={cn('num shrink-0 text-[10px]', done ? 'text-ok' : 'text-muted-foreground')}>
              {s.answered}/{s.technical}
            </span>
            {s.no ? (
              <span className="num shrink-0 rounded-sm bg-bad px-1 text-[10px] font-semibold text-white">{s.no}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ── แบบฟอร์มหนึ่งหัวข้อ ───────────────────────────────────────────────── */

export function GembaTopicForm({
  theme,
  title,
  items,
  state,
  onChange,
  dueFor,
  managers,
  showMissing,
}: {
  theme: WalkTheme;
  title: string;
  /** ข้อตรวจที่เปิดใช้งานของหัวข้อนี้ เรียงตาม sort_order แล้ว */
  items: SafetyChecklistItem[];
  state: WalkFormState;
  onChange: (updater: (s: WalkFormState) => WalkFormState) => void;
  dueFor: DueFor;
  managers: Manager[];
  /** ไฮไลต์ข้อที่ยังไม่ตอบ (หลังกดบันทึกครั้งแรก) */
  showMissing: boolean;
}) {
  const { t } = useI18n();
  const style = styleOf(theme);
  const technical = items.filter((i) => sectionOf(i) === 'technical');
  const engagement = items.filter((i) => sectionOf(i) === 'engagement');
  const justAdded = useRef<string | null>(null);
  const stats = topicStats(items, state.answers);
  const issues = issuesOfTopic(state, theme.id, technical);
  const numberOf = new Map(technical.map((i, n) => [i.id, n + 1]));

  const answer = (item: SafetyChecklistItem, result: ChecklistResultValue | null) =>
    onChange((s) => setAnswer(s, item, result, dueFor));
  const note = (itemId: string, text: string) => onChange((s) => setNote(s, itemId, text));

  return (
    <div className="space-y-4">
      {/* หัวแบบฟอร์ม: ชื่อเอกสาร + ความคืบหน้า + คำแนะนำ */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 className="text-[15px] font-semibold leading-snug">{title}</h3>
          <span className="num flex gap-2.5 text-[11px] text-muted-foreground">
            <span>{t('gemba.progress', { n: stats.answered, total: stats.technical })}</span>
            {stats.no ? (
              <span className="flex items-center gap-1 font-medium text-bad">
                <XCircle className="h-3 w-3" aria-hidden />
                {t('gemba.noCount', { label: t(resultLabelKey('fail', style, 'technical')), n: stats.no })}
              </span>
            ) : null}
          </span>
        </div>
        <ProgressBar stats={stats} />
        <details className="group mt-2 text-[12px] text-muted-foreground">
          <summary className="focusable inline-flex min-h-[32px] cursor-pointer list-none items-center gap-1 rounded-sm font-medium text-foreground/80 hover:text-foreground">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
            {t('gemba.instructions')}
          </summary>
          <p className="mt-1 max-w-prose leading-relaxed">
            {t(style === 'ok_nok' ? 'gemba.instructionsLpa' : 'gemba.instructionsGemba')}
          </p>
        </details>
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-[12px] text-muted-foreground">{t('gemba.noItems')}</p>
      ) : null}

      {technical.length ? (
        <QuestionTable
          section="technical"
          style={style}
          items={technical}
          state={state}
          onAnswer={answer}
          onNote={note}
          showMissing={showMissing}
          onFillRest={() => onChange((s) => fillUnanswered(s, technical, 'pass', dueFor))}
        />
      ) : null}

      {engagement.length ? (
        <QuestionTable
          section="engagement"
          style={style}
          items={engagement}
          state={state}
          onAnswer={answer}
          onNote={note}
          showMissing={false}
        />
      ) : null}

      <IssuesTable
        theme={theme}
        style={style}
        rows={issues}
        numberOf={numberOf}
        technical={technical}
        managers={managers}
        focusKey={justAdded}
        onAdd={() =>
          onChange((s) => {
            const next = addIssue(s, theme.id, dueFor);
            justAdded.current = next.issues[next.issues.length - 1]?.key ?? null;
            return next;
          })
        }
        onPatch={(key, p) => onChange((s) => patchIssue(s, key, p, dueFor))}
        onRemove={(key) => onChange((s) => removeIssue(s, key))}
      />
    </div>
  );
}

/** แท่งสัดส่วน ใช่/ไม่ใช่/ไม่เกี่ยวข้อง ของคำถามทางเทคนิค — มีตัวเลขกำกับด้านบนเสมอ ไม่ได้สื่อด้วยสีอย่างเดียว */
function ProgressBar({ stats }: { stats: TopicStats }) {
  const total = Math.max(stats.technical, 1);
  return (
    <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
      <span className="bg-ok transition-[width] duration-300" style={{ width: `${(stats.yes / total) * 100}%` }} />
      <span className="bg-bad transition-[width] duration-300" style={{ width: `${(stats.no / total) * 100}%` }} />
      <span className="bg-steel transition-[width] duration-300" style={{ width: `${(stats.na / total) * 100}%` }} />
    </div>
  );
}

/* ── ตารางคำถาม (ทางเทคนิค / ความผูกพันพนักงาน) ──────────────────────────── */

/** กริดของแถว: มือถือ 2 คอลัมน์ (เลขข้อ + เนื้อหาซ้อนสามบรรทัด) · จอกว้าง 4 คอลัมน์แบบเอกสาร */
const Q_GRID =
  'grid grid-cols-[36px_minmax(0,1fr)] lg:grid-cols-[44px_minmax(0,1fr)_minmax(250px,276px)_minmax(0,0.8fr)]';

function QuestionTable({
  section,
  style,
  items,
  state,
  onAnswer,
  onNote,
  showMissing,
  onFillRest,
}: {
  section: ChecklistSection;
  style: FormStyle;
  items: SafetyChecklistItem[];
  state: WalkFormState;
  onAnswer: (item: SafetyChecklistItem, result: ChecklistResultValue | null) => void;
  onNote: (itemId: string, note: string) => void;
  showMissing: boolean;
  onFillRest?: () => void;
}) {
  const { t, lang } = useI18n();
  const options = statusOptions(section, style);
  const heading =
    section === 'engagement' ? t('gemba.engagement') : style === 'ok_nok' ? t('gemba.lpaItems') : t('gemba.technical');
  const statusHead =
    section === 'engagement'
      ? `${t('gemba.asked')} ${t('gemba.askedYesNo')}`
      : `${t('gemba.status')} ${t(style === 'ok_nok' ? 'gemba.statusOkNok' : 'gemba.statusYesNoNa')}`;
  const unanswered = items.filter((i) => !state.answers[i.id]).length;
  const passLabel = t(resultLabelKey('pass', style, section));

  return (
    <div role="table" aria-label={heading} className="overflow-hidden rounded-md border bg-card">
      {/* หัวตาราง — แถบกรมท่าเหมือนหัวตารางในเอกสาร */}
      <div role="row" className={cn(Q_GRID, 'bg-primary text-[12px] font-semibold text-primary-foreground')}>
        <span role="columnheader" className="flex items-center justify-center px-1 py-2.5">#</span>
        <span role="columnheader" className="flex items-center gap-2 px-3 py-2.5">
          <span className="min-w-0 flex-1">{heading}</span>
          {onFillRest && unanswered > 0 ? (
            <button
              type="button"
              onClick={onFillRest}
              className="press focusable -my-1 flex min-h-[36px] shrink-0 items-center gap-1 rounded-sm border border-primary-foreground/30 px-2 text-[11px] font-medium hover:bg-primary-foreground/10 lg:hidden"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              {t('gemba.markRest', { label: passLabel })}
            </button>
          ) : null}
        </span>
        <span role="columnheader" className="hidden items-center gap-2 border-l border-primary-foreground/15 px-3 py-2.5 lg:flex">
          <span className="min-w-0 flex-1 leading-tight">{statusHead}</span>
        </span>
        <span role="columnheader" className="hidden items-center justify-between gap-2 border-l border-primary-foreground/15 px-3 py-2.5 lg:flex">
          {t('gemba.comment')}
          {onFillRest && unanswered > 0 ? (
            <button
              type="button"
              onClick={onFillRest}
              className="press focusable -my-1 flex min-h-[32px] shrink-0 items-center gap-1 rounded-sm border border-primary-foreground/30 px-2 text-[11px] font-medium hover:bg-primary-foreground/10"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              {t('gemba.markRest', { label: passLabel })}
            </button>
          ) : null}
        </span>
      </div>

      {items.map((item, idx) => {
        const n = idx + 1;
        const a = state.answers[item.id];
        const missing = showMissing && !a;
        const question = lang === 'en' ? item.question_en || item.question : item.question;
        return (
          <div
            key={item.id}
            role="row"
            data-missing={missing || undefined}
            className={cn(
              Q_GRID,
              'border-t transition-colors',
              a?.result === 'fail' && section === 'technical' ? 'bg-bad/[0.045]' : '',
              missing ? 'bg-warn/[0.09]' : '',
            )}
          >
            <span
              role="rowheader"
              className={cn(
                'num row-span-3 flex justify-center border-r bg-muted/50 px-1 pt-3 text-[12px] text-muted-foreground lg:row-span-1 lg:items-start',
                a ? '' : 'font-semibold text-foreground',
              )}
            >
              {n}
            </span>
            <span role="cell" className="col-start-2 px-3 pb-1 pt-3 text-[13px] leading-relaxed lg:pb-3">
              {question}
              {missing ? (
                <span className="ml-2 inline-flex items-center gap-1 align-middle text-[11px] font-medium text-warn">
                  <CircleDashed className="h-3 w-3" aria-hidden />
                  {t('gemba.unanswered')}
                </span>
              ) : null}
            </span>
            <span role="cell" className="col-start-2 px-3 py-1.5 lg:col-start-3 lg:row-start-1 lg:border-l lg:py-2.5">
              <StatusButtons
                options={options}
                style={style}
                section={section}
                value={a?.result}
                label={t('gemba.statusFor', { n })}
                onChange={(r) => onAnswer(item, r === a?.result ? null : r)}
              />
            </span>
            <span role="cell" className="col-start-2 px-3 pb-3 pt-1 lg:col-start-4 lg:row-start-1 lg:border-l lg:px-1.5 lg:py-1.5">
              <CellTextarea
                value={a?.note ?? ''}
                disabled={!a}
                onChange={(e) => onNote(item.id, e.target.value)}
                placeholder={a ? t('gemba.comment') : '—'}
                aria-label={t('gemba.commentFor', { n })}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatusButtons({
  options,
  style,
  section,
  value,
  label,
  onChange,
}: {
  options: ChecklistResultValue[];
  style: FormStyle;
  section: ChecklistSection;
  value: ChecklistResultValue | undefined;
  label: string;
  onChange: (r: ChecklistResultValue) => void;
}) {
  const { t } = useI18n();
  // สามปุ่ม (ใช่/ไม่ใช่/ไม่เกี่ยวข้อง) กว้างไม่พอให้มีไอคอน — คำว่า "ไม่เกี่ยวข้อง" จะถูกตัด จึงแสดงคำอย่างเดียว
  // สองปุ่มมีที่พอ ใส่ไอคอนช่วยแยกด้วย (ความหมายไม่ได้ขึ้นกับสีอย่างเดียวทั้งสองแบบ เพราะมีคำกำกับเสมอ)
  const withIcon = options.length < 3;
  return (
    <div role="group" aria-label={label} className={cn('grid gap-1.5', options.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
      {options.map((r) => {
        const Icon = RESULT_ICON[r];
        const selected = value === r;
        return (
          <button
            key={r}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(r)}
            className={cn(
              'press focusable flex h-11 min-w-0 items-center justify-center gap-1 rounded-md border px-1 text-[12px] font-medium',
              selected ? RESULT_ON[r] : 'bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground',
            )}
          >
            {withIcon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
            <span className="truncate">{t(resultLabelKey(r, style, section))}</span>
          </button>
        );
      })}
    </div>
  );
}

/** ช่องข้อความในเซลล์ — ยืดตามเนื้อหาเหมือนพิมพ์ในเซลล์ Excel ไม่มีแถบเลื่อนซ้อน */
const CellTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function CellTextarea(
  { className, value, ...props },
  outer,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        if (typeof outer === 'function') outer(el);
        else if (outer) outer.current = el;
      }}
      rows={1}
      value={value}
      className={cn(
        'focusable block min-h-[44px] w-full resize-none overflow-hidden rounded-sm border border-border bg-card px-2.5 py-2.5 text-[13px] leading-snug',
        'placeholder:text-muted-foreground/60 hover:border-foreground/25 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:hover:border-border',
        'lg:border-transparent lg:bg-transparent lg:hover:border-border lg:focus:border-ring lg:focus:bg-card',
        className,
      )}
      {...props}
    />
  );
});

/* ── ตารางปัญหาที่ตรวจพบ ───────────────────────────────────────────────── */

const I_GRID =
  'grid grid-cols-[36px_minmax(0,1fr)] lg:grid-cols-[44px_minmax(0,1.15fr)_minmax(0,1fr)_150px_minmax(170px,210px)]';

function IssuesTable({
  theme,
  style,
  rows,
  numberOf,
  technical,
  managers,
  focusKey,
  onAdd,
  onPatch,
  onRemove,
}: {
  theme: WalkTheme;
  style: FormStyle;
  rows: IssueDraft[];
  numberOf: Map<string, number>;
  technical: SafetyChecklistItem[];
  managers: Manager[];
  focusKey: MutableRefObject<string | null>;
  onAdd: () => void;
  onPatch: (key: string, p: Partial<IssueDraft>) => void;
  onRemove: (key: string) => void;
}) {
  const { t } = useI18n();
  const noLabel = t(resultLabelKey('fail', style, 'technical'));
  const head = 'hidden items-center border-l border-primary-foreground/15 px-3 py-2.5 lg:flex';

  return (
    <div>
      <div role="table" aria-label={t('gemba.issues')} className="overflow-hidden rounded-md border bg-card">
        <div role="row" className={cn(I_GRID, 'bg-primary text-[12px] font-semibold text-primary-foreground')}>
          <span role="columnheader" className="flex items-center justify-center px-1 py-2.5">#</span>
          <span role="columnheader" className="flex items-center px-3 py-2.5 lg:border-l-0">{t('gemba.issues')}</span>
          <span role="columnheader" className={head}>{t('gemba.correctiveAction')}</span>
          <span role="columnheader" className={head}>{t('gemba.dueDate')}</span>
          <span role="columnheader" className={head}>{t('gemba.owner')}</span>
        </div>

        {rows.length === 0 ? (
          <p className="border-t px-4 py-4 text-[12px] leading-relaxed text-muted-foreground">
            {t('gemba.noIssues', { no: noLabel })}
          </p>
        ) : (
          rows.map((row, idx) => (
            <IssueRow
              key={row.key}
              n={idx + 1}
              row={row}
              itemNo={row.item_id ? numberOf.get(row.item_id) : undefined}
              item={row.item_id ? technical.find((i) => i.id === row.item_id) : undefined}
              managers={managers}
              focusKey={focusKey}
              onPatch={(p) => onPatch(row.key, p)}
              onRemove={() => onRemove(row.key)}
            />
          ))
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">{t('gemba.issuesBecomeFindings')}</p>
        <Button type="button" variant="outline" size="sm" className="h-11" onClick={onAdd} aria-label={`${t('gemba.addIssue')} · ${theme.theme_name}`}>
          <Plus className="h-4 w-4" />
          {t('gemba.addIssue')}
        </Button>
      </div>
    </div>
  );
}

function IssueRow({
  n,
  row,
  itemNo,
  item,
  managers,
  focusKey,
  onPatch,
  onRemove,
}: {
  n: number;
  row: IssueDraft;
  itemNo?: number;
  item?: SafetyChecklistItem;
  managers: Manager[];
  focusKey: MutableRefObject<string | null>;
  onPatch: (p: Partial<IssueDraft>) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [photosOpen, setPhotosOpen] = useState(false);
  const linked = row.item_id !== null;
  // แถวที่เพิ่งกด "เพิ่มปัญหา" — ให้เคอร์เซอร์อยู่ที่ช่องปัญหาเลย
  const issueRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusKey.current !== row.key) return;
    focusKey.current = null;
    issueRef.current?.focus();
  }, [focusKey, row.key]);

  const miniLabel = 'mb-1 block text-[11px] font-medium text-muted-foreground lg:sr-only';

  return (
    <div role="row" className={cn(I_GRID, 'border-t')}>
      <span role="rowheader" className="num row-span-6 flex justify-center border-r bg-muted/50 px-1 pt-3 text-[12px] text-muted-foreground lg:row-span-2">
        {n}
      </span>

      <label role="cell" className="col-start-2 block px-3 pt-3 lg:px-1.5 lg:py-1.5">
        <span className={miniLabel}>{t('gemba.issue')}</span>
        <CellTextarea
          ref={issueRef}
          value={row.issue}
          onChange={(e) => onPatch({ issue: e.target.value })}
          placeholder={linked && itemNo ? t('gemba.issueFromItem', { n: itemNo }) : t('gemba.issuePlaceholder')}
          aria-required={!linked}
        />
        {linked && item && !row.issue.trim() ? (
          <span className="mt-1 line-clamp-2 block px-1 text-[11px] text-muted-foreground">{item.question}</span>
        ) : null}
      </label>

      <label role="cell" className="col-start-2 block px-3 pt-2 lg:col-start-3 lg:row-start-1 lg:border-l lg:px-1.5 lg:py-1.5">
        <span className={miniLabel}>{t('gemba.correctiveAction')}</span>
        <CellTextarea
          value={row.corrective_action}
          onChange={(e) => onPatch({ corrective_action: e.target.value })}
          placeholder={t('gemba.correctivePlaceholder')}
        />
      </label>

      <label role="cell" className="col-start-2 block px-3 pt-2 lg:col-start-4 lg:row-start-1 lg:border-l lg:px-1.5 lg:py-1.5">
        <span className={miniLabel}>{t('gemba.dueDate')}</span>
        <Input
          type="date"
          value={row.due_date}
          onChange={(e) => e.target.value && onPatch({ due_date: e.target.value })}
          className="num px-2 text-[13px]"
        />
        {row.due_auto ? <span className="mt-1 block px-1 text-[10px] text-muted-foreground">{t('gemba.dueAuto')}</span> : null}
      </label>

      <label role="cell" className="col-start-2 block px-3 pt-2 lg:col-start-5 lg:row-start-1 lg:border-l lg:px-1.5 lg:py-1.5">
        <span className={miniLabel}>{t('gemba.owner')}</span>
        <ManagerSelect
          managers={managers}
          value={row.owner_id}
          onChange={(id) => onPatch({ owner_id: id })}
          placeholder={t('gemba.ownerNone')}
        />
      </label>

      {/* แถวย่อย: ที่มา · ความรุนแรง · รูป · ลบ */}
      <div className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pb-3 pt-2.5 lg:col-span-4 lg:col-start-2 lg:row-start-2 lg:border-t lg:border-dashed lg:px-3 lg:py-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium',
            linked ? 'bg-bad/10 text-bad' : 'bg-muted text-muted-foreground',
          )}
        >
          {linked ? <Link2 className="h-3 w-3" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />}
          {linked && itemNo ? t('gemba.fromItem', { n: itemNo }) : t('gemba.addedByHand')}
        </span>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{t('gemba.severity')}</span>
          <div className="min-w-0 flex-1 sm:w-[300px] sm:flex-none">
            <SeveritySelect value={row.severity} onChange={(severity) => onPatch({ severity })} />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('h-11 px-2.5 text-[12px]', row.photos.length ? 'text-accent' : '')}
            aria-expanded={photosOpen}
            onClick={() => setPhotosOpen((o) => !o)}
          >
            <Camera className="h-4 w-4" />
            {photosOpen ? t('gemba.hidePhotos') : t('gemba.photos', { n: row.photos.length || '' }).trim()}
          </Button>
          {!linked ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 px-2.5 text-[12px] text-muted-foreground hover:text-bad"
              onClick={onRemove}
              aria-label={t('gemba.removeIssue')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        {photosOpen ? (
          <div className="w-full animate-fade-up">
            <PhotoUploader value={row.photos} onChange={(photos) => onPatch({ photos })} max={5} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
