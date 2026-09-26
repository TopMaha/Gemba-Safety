import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, ListChecks, Plus, ShieldAlert, Ticket, X, Zap } from 'lucide-react';
import { PageTitle } from '@/components/ManagerShell';
import { HierarchicalAreaPicker } from '@/components/HierarchicalAreaPicker';
import { PhotoUploader } from '@/components/PhotoUploader';
import { SafetyChecklist, countDraft, type ChecklistDraft } from '@/components/safety/SafetyChecklist';
import { ThemeBadges } from '@/components/ThemeBadges';
import { ThemePicker } from '@/components/ThemePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { SwitchRow } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { Select } from '@/components/ui/field';
import {
  useAccess, useChecklist, useCoreData, useCreateFinding, useCreateRecord, useSession, useWeeklyFocus,
} from '@/hooks/useData';
import { useI18n } from '@/lib/i18n';
import { SEVERITIES, severityMeta } from '@/lib/safety';
import { formatDate, nowHHMM, todayISO } from '@/lib/time';
import type { Severity } from '@/lib/types';

export default function WalkRecordPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { t, lang } = useI18n();
  const { session } = useSession();
  const { plans, themes, areas, pathOf } = useCoreData();
  const { data: focus } = useWeeklyFocus();
  const { data: checklist } = useChecklist();
  const access = useAccess();
  const createRecord = useCreateRecord();
  const createFinding = useCreateFinding();

  const plan = useMemo(() => plans.find((p) => p.id === planId), [plans, planId]);
  const isAdhoc = planId === 'new' || !plan;

  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState(nowHHMM());
  const [areaId, setAreaId] = useState<string | null>(null);
  const [themeIds, setThemeIds] = useState<string[]>([]);
  const [observation, setObservation] = useState('');
  const [hasIssue, setHasIssue] = useState(false);
  const [issueSummary, setIssueSummary] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [participantDraft, setParticipantDraft] = useState('');
  const [ciNo, setCiNo] = useState('');
  const [ciLink, setCiLink] = useState('');
  const [error, setError] = useState<string | null>(null);

  // ── เช็คลิสต์ความปลอดภัย ──
  const [draft, setDraft] = useState<ChecklistDraft>({});
  /** เปิดใบแจ้งจากช่อง "พบปัญหา" ด้วยไหม (นอกเหนือจากข้อที่ไม่ผ่านในเช็คลิสต์) */
  const [issueOpensFinding, setIssueOpensFinding] = useState(true);
  const [issueSeverity, setIssueSeverity] = useState<Severity>('medium');

  /** ข้อตรวจของหมวดที่เลือกไว้เท่านั้น — เดินหมวด PPE ไม่ต้องเจอคำถามเรื่อง LOTO */
  const items = useMemo(
    () => (checklist ?? []).filter((i) => i.is_active && themeIds.includes(i.theme_id)),
    [checklist, themeIds],
  );
  const draftCount = countDraft(draft, items);
  const canOpenFinding = access.can('finding.create');

  useEffect(() => {
    if (plan) {
      setAreaId(plan.area_id);
      setThemeIds(plan.theme_ids);
    }
  }, [plan]);

  const addParticipant = () => {
    const name = participantDraft.trim();
    if (!name) return;
    setParticipants((p) => [...new Set([...p, name])]);
    setParticipantDraft('');
  };

  const submit = async () => {
    if (!session) return;
    if (!observation.trim()) {
      setError(t('walk.needObservation'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!areaId) return setError(t('plan.pickArea'));
    if (!themeIds.length) return setError(t('plan.pickTheme'));

    // เฉพาะข้อที่ยังแสดงอยู่ — ถ้าเอาหมวดออกหลังติ๊กไปแล้ว คำตอบของหมวดนั้นไม่ควรถูกบันทึก
    const answered = Object.entries(draft).filter(([itemId]) => items.some((i) => i.id === itemId));
    const failed = answered.filter(([, a]) => a.result === 'fail');

    const record = await createRecord.mutateAsync({
      plan_id: plan?.id ?? null,
      manager_id: session.manager_id,
      actual_date: date,
      actual_time: time,
      actual_area_id: areaId,
      theme_ids: themeIds,
      observation: observation.trim(),
      // ข้อที่ไม่ผ่านนับเป็น "พบปัญหา" เอง ผู้ใช้ไม่ต้องติ๊กซ้ำอีกที
      has_issue: hasIssue || failed.length > 0,
      issue_summary: hasIssue ? issueSummary.trim() : '',
      photo_urls: photos,
      participant_names: participants,
      checklist_results: answered.map(([item_id, a]) => ({
        item_id,
        result: a.result,
        note: a.note,
      })),
      ci_required: hasIssue && !!ciNo,
      ci_ticket_no: ciNo,
      ci_ticket_link: ciLink,
    });

    /**
     * เปิดใบแจ้งให้ทุกข้อที่ไม่ผ่าน — หัวใจของระบบนี้
     * ทำทีละใบตามลำดับ ไม่ใช่ Promise.all เพราะแต่ละใบต้องเข้าคิวซิงก์ตามลำดับที่ทำ
     */
    let opened = 0;
    if (canOpenFinding) {
      for (const [itemId, answer] of failed) {
        const item = items.find((i) => i.id === itemId);
        if (!item) continue;
        await createFinding.mutateAsync({
          record_id: record.id,
          area_id: areaId,
          theme_id: item.theme_id,
          checklist_item_id: item.id,
          title: item.question,
          description: answer.note.trim(),
          // ผู้ตรวจปรับความรุนแรงได้ตอนบันทึกปัญหา ถ้าไม่ได้ปรับใช้ค่าตั้งต้นของข้อ
          severity: answer.severity ?? item.default_severity,
          immediate_action: answer.immediate_action?.trim() ?? '',
          before_photos: answer.photos,
        });
        opened++;
      }

      // ปัญหาที่เขียนไว้ในช่อง "พบปัญหา" ไม่ได้ผูกกับข้อตรวจข้อไหน เปิดเป็นใบของตัวเอง
      if (hasIssue && issueOpensFinding && issueSummary.trim()) {
        await createFinding.mutateAsync({
          record_id: record.id,
          area_id: areaId,
          theme_id: themeIds[0] ?? null,
          title: issueSummary.trim().slice(0, 120),
          description: issueSummary.trim(),
          severity: issueSeverity,
          before_photos: photos,
        });
        opened++;
      }
    }

    toast(t('walk.done'));
    navigate(opened > 0 ? '/findings' : '/history');
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" />
        {t('common.back')}
      </Button>

      <PageTitle
        title={t('walk.title')}
        subtitle={isAdhoc ? t('walk.adhoc') : undefined}
        right={isAdhoc ? <Badge tone="steel" size="md"><Zap className="h-3 w-3" />{t('status.adhoc')}</Badge> : null}
      />

      {plan ? (
        <Card className="mb-4" accent>
          <CardHeader
            title={t('walk.planInfo')}
            right={<span className="num text-[11px] text-muted-foreground">{formatDate(plan.plan_date, lang)} · {plan.plan_time}</span>}
          />
          <CardBody className="py-3">
            <p className="text-[13px] font-medium">{pathOf(plan.area_id)}</p>
            <ThemeBadges ids={plan.theme_ids} themes={themes} highlight={focus?.theme_ids ?? []} className="mt-2" />
            {plan.note ? <p className="mt-2 text-[12px] text-muted-foreground">{plan.note}</p> : null}
          </CardBody>
        </Card>
      ) : null}

      <div className="space-y-4">
        <Card>
          <CardHeader title={t('walk.actual')} />
          <CardBody className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('common.date')}>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label={t('common.time')}>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </Field>
            </div>
            <Field label={t('common.area')} required>
              <HierarchicalAreaPicker areas={areas} value={areaId} onChange={setAreaId} />
            </Field>
            {isAdhoc ? (
              <Field label={t('plan.pickTheme')} required>
                <ThemePicker themes={themes} value={themeIds} onChange={setThemeIds} recommended={focus?.theme_ids ?? []} />
              </Field>
            ) : null}
          </CardBody>
        </Card>

        <Card accent>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-accent" />
                {t('safety.checklist')}
              </span>
            }
            right={
              items.length ? (
                <span className="num text-[11px] text-muted-foreground">
                  {draftCount.answered}/{items.length}
                  {draftCount.failed ? (
                    <span className="ml-1.5 text-bad">{t('safety.failCount', { n: draftCount.failed })}</span>
                  ) : null}
                </span>
              ) : null
            }
          />
          <CardBody>
            {items.length ? (
              <SafetyChecklist items={items} themes={themes} value={draft} onChange={setDraft} />
            ) : (
              <p className="flex items-start gap-2 rounded-md border border-dashed px-3 py-4 text-[12px] leading-relaxed text-muted-foreground">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0" />
                {themeIds.length ? t('safety.checklistEmpty') : t('safety.checklistPickTheme')}
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('walk.observation')} hint={t('walk.observationPlaceholder')} />
          <CardBody className="space-y-3.5">
            <Textarea
              value={observation}
              onChange={(e) => (setObservation(e.target.value), setError(null))}
              placeholder={t('walk.observationPlaceholder')}
              className="min-h-[140px]"
            />
            {error ? <p className="text-[12px] text-bad">{error}</p> : null}

            <div className="rounded-md border p-3">
              <SwitchRow label={t('walk.hasIssue')} checked={hasIssue} onCheckedChange={setHasIssue} />
              {hasIssue ? (
                <div className="mt-3 space-y-3">
                  <Textarea
                    value={issueSummary}
                    onChange={(e) => setIssueSummary(e.target.value)}
                    placeholder={t('walk.issuePlaceholder')}
                    className="min-h-[80px]"
                  />
                  {canOpenFinding ? (
                    <div className="rounded-md border border-accent/35 bg-accent/[0.07] p-2.5">
                      <SwitchRow
                        label={t('safety.newFinding')}
                        hint={t('safety.subtitle')}
                        checked={issueOpensFinding}
                        onCheckedChange={setIssueOpensFinding}
                      />
                      {issueOpensFinding ? (
                        <Field label={t('safety.severity')} className="mt-2">
                          <Select value={issueSeverity} onChange={(e) => setIssueSeverity(e.target.value as Severity)}>
                            {SEVERITIES.map((s) => (
                              <option key={s} value={s}>
                                {t(severityMeta(s).key)}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <Field label={<span className="flex items-center gap-1.5"><Ticket className="h-3.5 w-3.5 text-accent" />{t('walk.ciNo')}</span>}>
                      <Input value={ciNo} onChange={(e) => setCiNo(e.target.value)} placeholder="CI-2601" />
                    </Field>
                    <Field label={t('walk.ciLink')}>
                      <Input value={ciLink} onChange={(e) => setCiLink(e.target.value)} placeholder="https://…" />
                    </Field>
                  </div>
                </div>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('walk.photos')} />
          <CardBody>
            <PhotoUploader value={photos} onChange={setPhotos} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('walk.participants')} />
          <CardBody>
            <div className="flex gap-2">
              <Input
                value={participantDraft}
                onChange={(e) => setParticipantDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addParticipant();
                  }
                }}
                placeholder={t('walk.participantsPlaceholder')}
              />
              <Button variant="outline" size="icon" onClick={addParticipant} aria-label={t('common.add')}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {participants.length ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {participants.map((p) => (
                  <span key={p} className="flex items-center gap-1 rounded-sm border bg-muted px-2 py-1 text-[12px]">
                    {p}
                    <button
                      onClick={() => setParticipants((list) => list.filter((x) => x !== p))}
                      className="press text-muted-foreground hover:text-bad"
                      aria-label={t('common.delete')}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {/* แถบบันทึกติดล่างจอ */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+56px)] z-20 mt-5 md:bottom-4">
        <Button
          variant="accent"
          size="lg"
          className="w-full shadow-lift"
          onClick={submit}
          disabled={createRecord.isPending}
        >
          <ClipboardCheck className="h-5 w-5" />
          {createRecord.isPending ? t('common.saving') : t('walk.submit')}
        </Button>
      </div>
    </div>
  );
}
