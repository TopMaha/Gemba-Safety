import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, History, MinusCircle, Pencil, Ticket, XCircle } from 'lucide-react';
import { StatusBadge } from '@/components/safety/FindingBits';
import { formTitle, resultLabelKey } from '@/components/safety/GembaWalkForm';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Avatar, SwitchRow } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { PhotoGrid, PhotoUploader } from '@/components/PhotoUploader';
import { ThemeBadges } from '@/components/ThemeBadges';
import { ThemePicker } from '@/components/ThemePicker';
import { useChangeHistory, useChecklist, useChecklistResults, useCoreData, useFindings, useUpdateRecord } from '@/hooks/useData';
import { sectionOf, styleOf } from '@/lib/gembaForm';
import { managerLabel, themeLabel, useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/time';
import type { ChecklistResultValue, ChecklistSection, SafetyChecklistItem, WalkChecklistResult, WalkRecord, WalkTheme } from '@/lib/types';
import { cn } from '@/lib/utils';

const FIELD_LABELS: Record<string, { th: string; en: string }> = {
  observation: { th: 'สิ่งที่พบ', en: 'Observation' },
  shift: { th: 'กะ', en: 'Shift' },
  has_issue: { th: 'สถานะปัญหา', en: 'Issue status' },
  issue_summary: { th: 'สรุปปัญหา', en: 'Issue summary' },
  photo_urls: { th: 'รูปภาพ', en: 'Photos' },
  theme_ids: { th: 'หัวข้อการเดิน', en: 'Walk themes' },
  ci_ticket_no: { th: 'เลขที่ CI Ticket', en: 'CI ticket no.' },
  ci_ticket_link: { th: 'ลิงก์ CI Ticket', en: 'CI ticket link' },
  ci_required: { th: 'ต้องเปิด CI', en: 'CI required' },
  participant_names: { th: 'ผู้ร่วมเดิน', en: 'Participants' },
  status: { th: 'สถานะแผน', en: 'Plan status' },
  plan_date: { th: 'วันที่ตามแผน', en: 'Plan date' },
  plan_time: { th: 'เวลาตามแผน', en: 'Plan time' },
  area_id: { th: 'พื้นที่', en: 'Area' },
};

export function WalkDetailDialog({
  record,
  open,
  onOpenChange,
  canEdit = true,
}: {
  record: WalkRecord | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  canEdit?: boolean;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { managers, themes, pathOf, plans } = useCoreData();
  const updateRecord = useUpdateRecord();
  const { data: changes } = useChangeHistory(record?.id);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<WalkRecord>>({});

  useEffect(() => {
    if (!open) setEditing(false);
  }, [open]);

  useEffect(() => {
    if (record) setDraft({ ...record });
  }, [record]);

  if (!record) return null;

  const manager = managers.find((m) => m.id === record.manager_id);
  const plan = plans.find((p) => p.id === record.plan_id);
  const value = { ...record, ...draft } as WalkRecord;

  const save = async () => {
    const patch: Partial<WalkRecord> = {
      observation: value.observation,
      has_issue: value.has_issue,
      issue_summary: value.issue_summary,
      photo_urls: value.photo_urls,
      participant_names: value.participant_names,
      ci_required: value.ci_required,
      ci_ticket_no: value.ci_ticket_no,
      ci_ticket_link: value.ci_ticket_link,
      ...(record.plan_id ? { theme_ids: value.theme_ids } : {}),
    };
    await updateRecord.mutateAsync({ id: record.id, patch });
    toast(t('history.saved'));
    setEditing(false);
  };

  const fieldLabel = (key?: string) => (key ? FIELD_LABELS[key]?.[lang] ?? key : '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        title={editing ? t('history.editTitle') : t('common.detail')}
        description={`${formatDate(record.actual_date, lang, { full: true })} · ${record.actual_time}`}
        footer={
          editing ? (
            <>
              <Button variant="outline" onClick={() => (setDraft({ ...record }), setEditing(false))}>
                {t('common.cancel')}
              </Button>
              <Button variant="accent" onClick={save} disabled={updateRecord.isPending}>
                {updateRecord.isPending ? t('common.saving') : t('common.save')}
              </Button>
            </>
          ) : canEdit ? (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              {t('common.edit')}
            </Button>
          ) : null
        }
      >
        <div className="space-y-5">
          {/* หัวข้อมูล */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Avatar name={managerLabel(manager, lang)} src={manager?.avatar_url} seed={manager?.id} size={38} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{managerLabel(manager, lang)}</div>
              <div className="num text-[11px] text-muted-foreground">
                {manager?.manager_code} · {manager?.department}
              </div>
            </div>
            {record.plan_id ? (
              <Badge tone="ok">{t('status.completed')}</Badge>
            ) : (
              <Badge tone="steel">{t('status.adhoc')}</Badge>
            )}
            {value.has_issue ? <Badge tone="bad">{t('status.issue')}</Badge> : <Badge tone="neutral">{t('status.normal')}</Badge>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="panel p-3">
              <div className="label-micro mb-1">{t('walk.actual')}</div>
              <div className="text-[13px] font-medium">{pathOf(record.actual_area_id)}</div>
              <div className="num mt-1 text-[11px] text-muted-foreground">
                {formatDate(record.actual_date, lang)} · {record.actual_time}
                {record.shift ? ` · ${t('gemba.shiftLabel', { shift: record.shift })}` : ''}
              </div>
            </div>
            {plan ? (
              <div className="panel p-3">
                <div className="label-micro mb-1">{t('walk.planInfo')}</div>
                <div className="text-[13px] font-medium">{pathOf(plan.area_id)}</div>
                <div className="num mt-1 text-[11px] text-muted-foreground">
                  {formatDate(plan.plan_date, lang)} · {plan.plan_time}
                </div>
              </div>
            ) : null}
          </div>

          {/* หัวข้อการเดิน */}
          <section>
            <div className="label-micro mb-1.5">{t('common.theme')}</div>
            {editing && record.plan_id ? (
              <ThemePicker
                themes={themes}
                value={value.theme_ids}
                onChange={(ids) => setDraft((d) => ({ ...d, theme_ids: ids }))}
              />
            ) : (
              <>
                <ThemeBadges ids={value.theme_ids} themes={themes} />
                {editing ? <p className="mt-1 text-[11px] text-muted-foreground">{t('history.themeEditNote')}</p> : null}
              </>
            )}
          </section>

          {/* ผลตามแบบฟอร์ม — ตารางเดียวกับตอนกรอก (อ่านอย่างเดียว) + ปัญหาที่ตรวจพบพร้อมสถานะใบแจ้ง */}
          {!editing ? <ChecklistResultsSection record={record} /> : null}

          {/* สิ่งที่พบ */}
          <section>
            <div className="label-micro mb-1.5">{t('walk.observation')}</div>
            {editing ? (
              <Textarea
                value={value.observation}
                onChange={(e) => setDraft((d) => ({ ...d, observation: e.target.value }))}
              />
            ) : (
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{value.observation || '—'}</p>
            )}
          </section>

          {/* ปัญหา */}
          <section className="rounded-md border p-3">
            {editing ? (
              <SwitchRow
                label={t('walk.hasIssue')}
                checked={!!value.has_issue}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, has_issue: v }))}
              />
            ) : (
              <div className="label-micro">{t('walk.issueSummary')}</div>
            )}
            {value.has_issue ? (
              editing ? (
                <Textarea
                  className="mt-2 min-h-[70px]"
                  value={value.issue_summary ?? ''}
                  placeholder={t('walk.issuePlaceholder')}
                  onChange={(e) => setDraft((d) => ({ ...d, issue_summary: e.target.value }))}
                />
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{value.issue_summary || '—'}</p>
              )
            ) : !editing ? (
              <p className="mt-1 text-[13px] text-muted-foreground">{t('status.normal')}</p>
            ) : null}
          </section>

          {/* CI Ticket */}
          <section className="rounded-md border p-3">
            <div className="mb-2 flex items-center gap-2">
              <Ticket className="h-4 w-4 text-accent" />
              <span className="label-micro">{t('walk.ciTicket')}</span>
            </div>
            {editing ? (
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label={t('walk.ciNo')}>
                  <Input
                    value={value.ci_ticket_no ?? ''}
                    placeholder="CI-2601"
                    onChange={(e) => setDraft((d) => ({ ...d, ci_ticket_no: e.target.value, ci_required: !!e.target.value }))}
                  />
                </Field>
                <Field label={t('walk.ciLink')}>
                  <Input
                    value={value.ci_ticket_link ?? ''}
                    placeholder="https://…"
                    onChange={(e) => setDraft((d) => ({ ...d, ci_ticket_link: e.target.value }))}
                  />
                </Field>
              </div>
            ) : value.ci_ticket_no ? (
              <div className="flex items-center gap-2">
                <span className="num text-sm font-semibold">{value.ci_ticket_no}</span>
                {value.ci_ticket_link ? (
                  <a
                    href={value.ci_ticket_link}
                    target="_blank"
                    rel="noreferrer"
                    className="focusable inline-flex items-center gap-1 text-[12px] text-steel underline underline-offset-2"
                  >
                    {t('walk.ciLink')}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">—</p>
            )}
          </section>

          {/* รูปภาพ */}
          <section>
            <div className="label-micro mb-1.5">{t('walk.photos')}</div>
            {editing ? (
              <PhotoUploader
                value={value.photo_urls}
                onChange={(keys) => setDraft((d) => ({ ...d, photo_urls: keys }))}
              />
            ) : value.photo_urls.length ? (
              <PhotoGrid keys={value.photo_urls} />
            ) : (
              <p className="text-[13px] text-muted-foreground">—</p>
            )}
          </section>

          {/* ผู้ร่วมเดิน */}
          {value.participant_names.length || editing ? (
            <section>
              <div className="label-micro mb-1.5">{t('walk.participants')}</div>
              {editing ? (
                <Input
                  value={value.participant_names.join(', ')}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      participant_names: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }))
                  }
                />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {value.participant_names.map((p) => (
                    <Badge key={p} size="md" tone="neutral" className="tracking-normal normal-case">
                      {p}
                    </Badge>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {/* Audit trail */}
          <section className="rounded-md border bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="label-micro">{t('history.auditTrail')}</span>
            </div>
            {changes?.length ? (
              <ul className="space-y-2">
                {changes.map((c) => (
                  <li key={c.id} className="border-l-2 border-accent/50 pl-2.5 text-[12px] leading-relaxed">
                    <div className="font-medium">
                      {c.action_type === 'create'
                        ? lang === 'th'
                          ? 'สร้างรายการ'
                          : 'Created'
                        : t('history.changedField', { field: fieldLabel(c.field) })}
                    </div>
                    {c.action_type === 'update' ? (
                      <div className="text-muted-foreground">
                        {t('history.from')} <span className="line-through">{c.old_value ?? '—'}</span> {t('history.to')}{' '}
                        <span className="text-foreground">{c.new_value ?? '—'}</span>
                      </div>
                    ) : null}
                    <div className="num text-[10px] text-muted-foreground">
                      {new Date(c.changed_at).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', {
                        timeZone: 'Asia/Bangkok',
                      })}{' '}
                      · {t('history.by')} {c.changed_by}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-muted-foreground">{t('history.auditEmpty')}</p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const RESULT_META: Record<ChecklistResultValue, { icon: typeof CheckCircle2; text: string; chip: string }> = {
  pass: { icon: CheckCircle2, text: 'text-ok', chip: 'border-ok/40 bg-ok/10 text-ok' },
  fail: { icon: XCircle, text: 'text-bad', chip: 'border-bad/40 bg-bad/10 text-bad' },
  na: { icon: MinusCircle, text: 'text-steel', chip: 'border-steel/40 bg-steel/10 text-steel' },
};

const R_GRID = 'grid grid-cols-[32px_minmax(0,1fr)] sm:grid-cols-[40px_minmax(0,1.4fr)_112px_minmax(0,1fr)]';

/**
 * ผลการตรวจของการเดินหนึ่งครั้ง แสดงเป็นตารางแบบเดียวกับแบบฟอร์ม (หนึ่งหัวข้อต่อหนึ่งชุด)
 * แล้วตามด้วยตาราง "ปัญหาที่ตรวจพบ" ซึ่งดึงจากใบแจ้งที่เปิดจากการเดินนี้ — เห็นสถานะงานแก้ไขล่าสุดเลย
 */
function ChecklistResultsSection({ record }: { record: WalkRecord }) {
  const { t, lang } = useI18n();
  const { themes, managers } = useCoreData();
  const { data: results = [] } = useChecklistResults(record.id);
  const { data: checklist = [] } = useChecklist();
  const { data: findings = [] } = useFindings();

  const byItem = new Map(results.map((r) => [r.item_id, r]));
  const answeredItems = checklist.filter((i) => byItem.has(i.id));
  // หัวข้อตามลำดับที่บันทึกไว้ + หัวข้อของผลตรวจที่อาจไม่อยู่ในรายการ (กันหล่น)
  const topicIds = [...new Set([...record.theme_ids, ...answeredItems.map((i) => i.theme_id)])];
  const issues = findings
    .filter((f) => f.record_id === record.id)
    .sort((a, b) => a.reported_at.localeCompare(b.reported_at));

  // แสดงทั้งแบบฟอร์มเหมือนกระดาษ (ข้อที่ไม่ได้ตอบขึ้นเป็น "ยังไม่ได้ตอบ") เลขข้อจึงตรงกับตอนกรอก
  // หมวดเดิมที่ปิดไปแล้วแสดงเฉพาะข้อที่มีผล เพราะข้อที่ปิดไม่ได้อยู่ในแบบฟอร์มตอนนั้น
  const topicsWithResults = topicIds
    .map((id) => ({
      theme: themes.find((th) => th.id === id),
      items: checklist
        .filter((i) => i.theme_id === id && (byItem.has(i.id) || i.is_active))
        .sort(
          (a, b) =>
            Number(sectionOf(a) === 'engagement') - Number(sectionOf(b) === 'engagement') || a.sort_order - b.sort_order,
        ),
    }))
    .filter((x) => x.items.some((i) => byItem.has(i.id)));

  return (
    <section className="space-y-4">
      <div className="label-micro">{t('gemba.resultsTitle')}</div>

      {topicsWithResults.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{t('gemba.noResults')}</p>
      ) : (
        topicsWithResults.map(({ theme, items }) => {
          const style = styleOf(theme);
          const technical = items.filter((i) => sectionOf(i) === 'technical');
          const engagement = items.filter((i) => sectionOf(i) === 'engagement');
          const name = themeLabel(theme, lang);
          return (
            <div key={theme?.id ?? name} className="space-y-2">
              <h4 className="text-[13px] font-semibold">{theme ? formTitle(theme, name, t) : name}</h4>
              {[
                { section: 'technical' as ChecklistSection, list: technical },
                { section: 'engagement' as ChecklistSection, list: engagement },
              ]
                .filter((g) => g.list.length)
                .map((g) => (
                  <ResultTable
                    key={g.section}
                    section={g.section}
                    theme={theme}
                    items={g.list}
                    byItem={byItem}
                    findingNo={(id) => findings.find((f) => f.id === id)}
                    style={style}
                  />
                ))}
            </div>
          );
        })
      )}

      {issues.length ? (
        <div className="space-y-2">
          <h4 className="text-[13px] font-semibold">{t('gemba.issuesOfWalk')}</h4>
          <div className="overflow-hidden rounded-md border">
            <div className="hidden grid-cols-[40px_minmax(0,1.3fr)_minmax(0,1fr)_96px_minmax(0,0.8fr)] bg-primary text-[11px] font-semibold text-primary-foreground sm:grid">
              <span className="px-1 py-2 text-center">#</span>
              <span className="px-2.5 py-2">{t('gemba.issues')}</span>
              <span className="border-l border-primary-foreground/15 px-2.5 py-2">{t('gemba.correctiveAction')}</span>
              <span className="border-l border-primary-foreground/15 px-2.5 py-2">{t('gemba.dueDate')}</span>
              <span className="border-l border-primary-foreground/15 px-2.5 py-2">{t('gemba.owner')}</span>
            </div>
            {issues.map((f, idx) => {
              const owner = managers.find((m) => m.id === (f.assigned_manager_id ?? f.assigned_supervisor_id));
              return (
                <div
                  key={f.id}
                  className="grid grid-cols-[32px_minmax(0,1fr)] border-t text-[12px] first:border-t-0 sm:grid-cols-[40px_minmax(0,1.3fr)_minmax(0,1fr)_96px_minmax(0,0.8fr)] sm:first:border-t"
                >
                  <span className="num row-span-4 border-r bg-muted/50 pt-2.5 text-center text-muted-foreground sm:row-span-1">{idx + 1}</span>
                  <div className="space-y-1 px-2.5 py-2">
                    <p className="text-[13px] leading-snug">{f.title}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link
                        to={`/findings/${f.id}`}
                        className="focusable num rounded-sm text-[11px] font-medium text-accent underline-offset-2 hover:underline"
                      >
                        {f.finding_no}
                      </Link>
                      <StatusBadge status={f.status} />
                    </div>
                    {f.before_photos.length ? <PhotoGrid keys={f.before_photos} className="max-w-[220px]" /> : null}
                  </div>
                  <p className="col-start-2 whitespace-pre-wrap px-2.5 pb-1 text-muted-foreground sm:col-start-3 sm:row-start-1 sm:border-l sm:py-2 sm:text-foreground">
                    <span className="font-medium text-foreground sm:hidden">{t('gemba.correctiveAction')}: </span>
                    {f.corrective_action || '—'}
                  </p>
                  <p className="num col-start-2 px-2.5 pb-1 text-muted-foreground sm:col-start-4 sm:row-start-1 sm:border-l sm:py-2 sm:text-foreground">
                    <span className="font-sans font-medium text-foreground sm:hidden">{t('gemba.dueDate')}: </span>
                    {formatDate(f.due_date, lang)}
                  </p>
                  <p className="col-start-2 px-2.5 pb-2 text-muted-foreground sm:col-start-5 sm:row-start-1 sm:border-l sm:py-2 sm:text-foreground">
                    <span className="font-medium text-foreground sm:hidden">{t('gemba.owner')}: </span>
                    {owner ? managerLabel(owner, lang) : t('gemba.ownerNone')}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ResultTable({
  section,
  theme,
  style,
  items,
  byItem,
  findingNo,
}: {
  section: ChecklistSection;
  theme: WalkTheme | undefined;
  style: ReturnType<typeof styleOf>;
  items: SafetyChecklistItem[];
  byItem: Map<string, WalkChecklistResult>;
  findingNo: (id: string) => { id: string; finding_no: string } | undefined;
}) {
  const { t, lang } = useI18n();
  const heading =
    section === 'engagement' ? t('gemba.engagement') : style === 'ok_nok' ? t('gemba.lpaItems') : t('gemba.technical');
  return (
    <div className="overflow-hidden rounded-md border" aria-label={`${heading} · ${theme?.theme_name ?? ''}`}>
      <div className={cn(R_GRID, 'bg-primary text-[11px] font-semibold text-primary-foreground')}>
        <span className="px-1 py-2 text-center">#</span>
        <span className="px-2.5 py-2">{heading}</span>
        <span className="hidden border-l border-primary-foreground/15 px-2.5 py-2 sm:block">
          {section === 'engagement' ? t('gemba.asked') : t('gemba.status')}
        </span>
        <span className="hidden border-l border-primary-foreground/15 px-2.5 py-2 sm:block">{t('gemba.comment')}</span>
      </div>
      {items.map((item, idx) => {
        const r = byItem.get(item.id);
        const meta = r ? RESULT_META[r.result] : null;
        const Icon = meta?.icon;
        const finding = r?.finding_id ? findingNo(r.finding_id) : undefined;
        return (
          <div key={item.id} className={cn(R_GRID, 'border-t text-[12px]', r?.result === 'fail' && section === 'technical' ? 'bg-bad/[0.045]' : '')}>
            <span className="num row-span-3 border-r bg-muted/50 pt-2.5 text-center text-muted-foreground sm:row-span-1">{idx + 1}</span>
            <p className={cn('px-2.5 pb-1 pt-2 text-[13px] leading-snug sm:pb-2', r ? '' : 'text-muted-foreground')}>
              {lang === 'en' ? item.question_en || item.question : item.question}
            </p>
            <div className="col-start-2 flex flex-wrap items-center gap-1.5 px-2.5 pb-1 sm:col-start-3 sm:row-start-1 sm:border-l sm:py-2">
              {r && meta && Icon ? (
                <span className={cn('inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] font-medium', meta.chip)}>
                  <Icon className="h-3 w-3" aria-hidden />
                  {t(resultLabelKey(r.result, style, section))}
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">{t('gemba.unanswered')}</span>
              )}
              {finding ? (
                <Link
                  to={`/findings/${finding.id}`}
                  className="focusable num rounded-sm text-[11px] font-medium text-accent underline-offset-2 hover:underline"
                >
                  {finding.finding_no}
                </Link>
              ) : null}
            </div>
            <p className="col-start-2 whitespace-pre-wrap px-2.5 pb-2 text-muted-foreground sm:col-start-4 sm:row-start-1 sm:border-l sm:py-2 sm:text-foreground">
              {r?.note || <span className="text-muted-foreground">—</span>}
            </p>
          </div>
        );
      })}
    </div>
  );
}
