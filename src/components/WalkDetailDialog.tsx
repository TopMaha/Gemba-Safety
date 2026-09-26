import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink, History, MinusCircle, Pencil, Ticket, XCircle } from 'lucide-react';
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
import { managerLabel, useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/time';
import type { ChecklistResultValue, WalkRecord } from '@/lib/types';

const FIELD_LABELS: Record<string, { th: string; en: string }> = {
  observation: { th: 'สิ่งที่พบ', en: 'Observation' },
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

          {/* ผลเช็คลิสต์ — อ่านอย่างเดียว ข้อที่ไม่ผ่านโยงไปใบแจ้งพร้อมรูปตอนพบปัญหา */}
          {!editing ? <ChecklistResultsSection recordId={record.id} /> : null}

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

const RESULT_META: Record<ChecklistResultValue, { icon: typeof CheckCircle2; tone: 'ok' | 'bad' | 'steel'; text: string }> = {
  pass: { icon: CheckCircle2, tone: 'ok', text: 'text-ok' },
  fail: { icon: XCircle, tone: 'bad', text: 'text-bad' },
  na: { icon: MinusCircle, tone: 'steel', text: 'text-steel' },
};

/** ผลตรวจรายข้อของการเดินหนึ่งครั้ง เรียงตามลำดับในแม่แบบ · ข้อไม่ผ่านขึ้นก่อนเพื่อให้เห็นปัญหาทันที */
function ChecklistResultsSection({ recordId }: { recordId: string }) {
  const { t, lang } = useI18n();
  const { data: results = [] } = useChecklistResults(recordId);
  const { data: checklist = [] } = useChecklist();
  const { data: findings = [] } = useFindings();

  const rows = results
    .map((r) => ({ r, item: checklist.find((i) => i.id === r.item_id) }))
    .sort(
      (a, b) =>
        Number(b.r.result === 'fail') - Number(a.r.result === 'fail') ||
        (a.item?.theme_id ?? '').localeCompare(b.item?.theme_id ?? '') ||
        (a.item?.sort_order ?? 0) - (b.item?.sort_order ?? 0),
    );
  const failed = rows.filter((x) => x.r.result === 'fail').length;

  return (
    <section>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="label-micro">{t('safety.checklistResults')}</span>
        {rows.length ? (
          <span className="num text-[10px] text-muted-foreground">
            {rows.length - failed}/{rows.length}
            {failed ? <span className="ml-1.5 text-bad">{t('safety.failCount', { n: failed })}</span> : null}
          </span>
        ) : null}
      </div>

      {rows.length ? (
        <ul className="divide-y overflow-hidden rounded-md border">
          {rows.map(({ r, item }) => {
            const meta = RESULT_META[r.result];
            const Icon = meta.icon;
            const finding = r.finding_id ? findings.find((f) => f.id === r.finding_id) : undefined;
            return (
              <li key={r.item_id} className="px-3 py-2.5">
                <div className="flex items-start gap-2.5">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.text}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] leading-snug">
                      {item ? (lang === 'en' ? item.question_en || item.question : item.question) : r.item_id}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {item?.item_code ? <span className="num text-[10px] text-muted-foreground">{item.item_code}</span> : null}
                      <Badge tone={meta.tone}>{t(`safety.${r.result}` as 'safety.pass')}</Badge>
                      {finding ? (
                        <Link
                          to={`/findings/${finding.id}`}
                          className="focusable num rounded-sm text-[11px] font-medium text-accent underline-offset-2 hover:underline"
                        >
                          {finding.finding_no}
                        </Link>
                      ) : null}
                    </div>
                    {r.note ? <p className="mt-1 whitespace-pre-wrap text-[12px] text-muted-foreground">{r.note}</p> : null}
                    {finding?.before_photos.length ? <PhotoGrid keys={finding.before_photos} className="mt-2 max-w-sm" /> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-[12px] text-muted-foreground">{t('safety.noChecklistResults')}</p>
      )}
    </section>
  );
}
