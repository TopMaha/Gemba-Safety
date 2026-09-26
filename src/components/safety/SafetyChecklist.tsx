import { Camera, CheckCheck, CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import { PhotoUploader } from '@/components/PhotoUploader';
import { SeveritySelect } from '@/components/safety/FindingDialogs';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { themeLabel, useI18n } from '@/lib/i18n';
import type { ChecklistResultValue, SafetyChecklistItem, Severity, WalkTheme } from '@/lib/types';
import { cn } from '@/lib/utils';

/** คำตอบของข้อตรวจหนึ่งข้อ — ข้อที่ไม่ผ่านจะพารูปและรายละเอียดปัญหาไปเปิดใบแจ้งต่อ */
export interface ChecklistAnswerDraft {
  result: ChecklistResultValue;
  note: string;
  photos: string[];
  /** ความรุนแรงที่ผู้ตรวจเลือกเอง — ไม่ระบุ = ใช้ค่าตั้งต้นของข้อตรวจ */
  severity?: Severity;
  /** สิ่งที่ทำทันทีหน้างาน (กั้นพื้นที่ · หยุดเครื่อง) */
  immediate_action?: string;
}

export type ChecklistDraft = Record<string, ChecklistAnswerDraft>;

const BUTTONS: { value: ChecklistResultValue; icon: typeof CheckCircle2; on: string }[] = [
  { value: 'pass', icon: CheckCircle2, on: 'border-ok bg-ok/15 text-ok' },
  { value: 'fail', icon: XCircle, on: 'border-bad bg-bad/15 text-bad' },
  { value: 'na', icon: MinusCircle, on: 'border-steel bg-steel/15 text-steel' },
];

/** สีขอบซ้ายของแถวตามผลตรวจ — ใช้คู่กับไอคอนบนปุ่มเสมอ ไม่ได้สื่อด้วยสีอย่างเดียว */
const ROW_EDGE: Record<ChecklistResultValue, string> = {
  pass: 'border-l-ok',
  fail: 'border-l-bad',
  na: 'border-l-steel',
};

/**
 * เช็คลิสต์ความปลอดภัยของการเดินหนึ่งครั้ง
 *
 * แสดงเฉพาะข้อตรวจของหมวดที่เลือกไว้ ผู้เดินติ๊กทีละข้อ (แตะปุ่มเดิมซ้ำเพื่อล้างคำตอบ)
 * ข้อที่ติ๊ก "ไม่ผ่าน" จะเปิดช่องบันทึกปัญหา: รายละเอียด · ความรุนแรง · การแก้ไขเบื้องต้น · รูปถ่าย
 * แล้วตอนกดบันทึก ระบบจะเปิดใบแจ้งปัญหาให้อัตโนมัติทีละข้อ
 */
export function SafetyChecklist({
  items,
  themes,
  value,
  onChange,
}: {
  items: SafetyChecklistItem[];
  themes: WalkTheme[];
  value: ChecklistDraft;
  onChange: (next: ChecklistDraft) => void;
}) {
  const { t, lang } = useI18n();

  const setResult = (item: SafetyChecklistItem, result: ChecklistResultValue) => {
    const current = value[item.id];
    if (current?.result === result) {
      // แตะปุ่มเดิมซ้ำ = ยกเลิกคำตอบข้อนี้ (กดผิดแล้วอยากกลับเป็น "ยังไม่ตรวจ")
      const { [item.id]: _removed, ...rest } = value;
      onChange(rest);
      return;
    }
    // เปลี่ยนผลแล้วเก็บรายละเอียด/รูปที่กรอกไว้ต่อ เผื่อกดสลับไปมาระหว่าง "ไม่ผ่าน" กับผลอื่น
    onChange({ ...value, [item.id]: current ? { ...current, result } : { result, note: '', photos: [] } });
  };

  const patch = (itemId: string, p: Partial<ChecklistAnswerDraft>) => {
    const current = value[itemId];
    if (!current) return;
    onChange({ ...value, [itemId]: { ...current, ...p } });
  };

  const markRestPass = (list: SafetyChecklistItem[]) => {
    const next = { ...value };
    for (const item of list) if (!next[item.id]) next[item.id] = { result: 'pass', note: '', photos: [] };
    onChange(next);
  };

  const byTheme = new Map<string, SafetyChecklistItem[]>();
  for (const item of items) byTheme.set(item.theme_id, [...(byTheme.get(item.theme_id) ?? []), item]);

  if (!items.length) return null;

  const counts = countDraft(value, items);

  return (
    <div className="space-y-4">
      {/* ความคืบหน้ารวม — แท่งแบ่งสัดส่วน ผ่าน/ไม่ผ่าน/ไม่เกี่ยว */}
      <div>
        <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[12px] font-medium">
            {t('safety.checklistProgress', { n: counts.answered, total: items.length })}
          </span>
          <span className="num flex gap-2.5 text-[11px]">
            <span className="flex items-center gap-1 text-ok"><CheckCircle2 className="h-3 w-3" />{t('safety.passCount', { n: counts.passed })}</span>
            <span className="flex items-center gap-1 text-bad"><XCircle className="h-3 w-3" />{t('safety.failCount', { n: counts.failed })}</span>
            <span className="flex items-center gap-1 text-steel"><MinusCircle className="h-3 w-3" />{t('safety.naCount', { n: counts.na })}</span>
          </span>
        </div>
        <div
          className="flex h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={counts.answered}
          aria-label={t('safety.checklistProgress', { n: counts.answered, total: items.length })}
        >
          <span className="bg-ok transition-[width] duration-300" style={{ width: `${(counts.passed / items.length) * 100}%` }} />
          <span className="bg-bad transition-[width] duration-300" style={{ width: `${(counts.failed / items.length) * 100}%` }} />
          <span className="bg-steel transition-[width] duration-300" style={{ width: `${(counts.na / items.length) * 100}%` }} />
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {t('safety.checklistHint')} · {t('safety.clearAnswer')}
        </p>
      </div>

      {[...byTheme.entries()].map(([themeId, list]) => {
        const done = list.filter((i) => value[i.id]).length;
        return (
          <section key={themeId}>
            <div className="mb-1.5 flex items-center gap-2">
              <h3 className="label-micro min-w-0 flex-1 truncate">{themeLabel(themes.find((x) => x.id === themeId), lang)}</h3>
              <span className="num shrink-0 text-[11px] text-muted-foreground">
                {done}/{list.length}
              </span>
              {done < list.length ? (
                <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-[12px] text-ok" onClick={() => markRestPass(list)}>
                  <CheckCheck className="h-4 w-4" />
                  {t('safety.markRestPass')}
                </Button>
              ) : null}
            </div>

            <ul className="divide-y overflow-hidden rounded-md border">
              {list.map((item) => {
                const answer = value[item.id];
                const question = lang === 'en' ? item.question_en || item.question : item.question;
                return (
                  <li
                    key={item.id}
                    className={cn('border-l-[3px] p-3', answer ? ROW_EDGE[answer.result] : 'border-l-transparent')}
                  >
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] leading-snug">{question}</p>
                        <span className="num mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                          {item.item_code}
                          {answer?.result === 'fail' && answer.photos.length ? (
                            <span className="flex items-center gap-0.5 text-bad">
                              <Camera className="h-3 w-3" />
                              {t('safety.photoCount', { n: answer.photos.length })}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div className="grid shrink-0 grid-cols-3 gap-1.5 sm:w-[258px]" role="group" aria-label={item.item_code || question}>
                        {BUTTONS.map(({ value: v, icon: Icon, on }) => {
                          const selected = answer?.result === v;
                          return (
                            <button
                              key={v}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setResult(item, v)}
                              className={cn(
                                'press focusable flex h-11 items-center justify-center gap-1.5 rounded-md border px-2 text-[12px] font-medium',
                                selected ? on : 'bg-card text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                              )}
                            >
                              <Icon className="h-4 w-4 shrink-0" />
                              <span className="truncate">{t(`safety.${v}` as 'safety.pass')}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {answer?.result === 'fail' ? (
                      <ProblemPanel
                        item={item}
                        answer={answer}
                        onPatch={(p) => patch(item.id, p)}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** ช่องบันทึกปัญหาของข้อที่ไม่ผ่าน — ข้อมูลทั้งหมดนี้จะกลายเป็นใบแจ้งปัญหาหนึ่งใบ */
function ProblemPanel({
  item,
  answer,
  onPatch,
}: {
  item: SafetyChecklistItem;
  answer: ChecklistAnswerDraft;
  onPatch: (p: Partial<ChecklistAnswerDraft>) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-3 space-y-3 rounded-md border border-bad/30 bg-bad/[0.05] p-3 animate-fade-up">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-bad">
        <XCircle className="h-4 w-4" />
        {t('safety.problemFound')}
        <span className="font-normal text-muted-foreground">· {t('safety.newFinding')}</span>
      </div>

      <Field label={t('safety.problemDetail')}>
        <Textarea
          value={answer.note}
          onChange={(e) => onPatch({ note: e.target.value })}
          placeholder={t('safety.descriptionPlaceholder')}
          className="min-h-[76px] bg-card"
        />
      </Field>

      <div>
        <span className="mb-1.5 block text-[13px] font-medium">{t('safety.severity')}</span>
        <SeveritySelect value={answer.severity ?? item.default_severity} onChange={(severity) => onPatch({ severity })} />
      </div>

      <Field label={t('safety.immediateAction')} hint={t('common.optional')}>
        <Input
          value={answer.immediate_action ?? ''}
          onChange={(e) => onPatch({ immediate_action: e.target.value })}
          placeholder={t('safety.immediatePlaceholder')}
          className="bg-card"
        />
      </Field>

      <div>
        <div className="mb-1.5 flex items-center gap-1.5">
          <Camera className="h-4 w-4 text-bad" />
          <span className="text-[13px] font-medium">{t('safety.problemPhotos')}</span>
        </div>
        <p className="-mt-1 mb-2 text-[11px] text-muted-foreground">{t('safety.problemPhotosHint')}</p>
        <PhotoUploader value={answer.photos} onChange={(photos) => onPatch({ photos })} max={5} />
      </div>
    </div>
  );
}

/** นับผลที่ติ๊กไว้ — ส่ง items มาด้วยเพื่อไม่นับคำตอบของข้อที่ถูกซ่อนไปแล้ว (เช่น เอาหมวดออก) */
export function countDraft(draft: ChecklistDraft, items?: SafetyChecklistItem[]) {
  const values = items ? items.map((i) => draft[i.id]).filter(Boolean) : Object.values(draft);
  return {
    answered: values.length,
    passed: values.filter((v) => v.result === 'pass').length,
    failed: values.filter((v) => v.result === 'fail').length,
    na: values.filter((v) => v.result === 'na').length,
  };
}
