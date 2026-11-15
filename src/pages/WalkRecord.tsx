import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ClipboardCheck, ListChecks, Plus, RotateCcw, X, Zap } from 'lucide-react';
import { PageTitle } from '@/components/ManagerShell';
import { HierarchicalAreaPicker } from '@/components/HierarchicalAreaPicker';
import { PhotoUploader } from '@/components/PhotoUploader';
import { GembaTopicForm, TopicSheetTabs, formTitle } from '@/components/safety/GembaWalkForm';
import { ThemeBadges } from '@/components/ThemeBadges';
import { ThemePicker } from '@/components/ThemePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import {
  useAccess, useChecklist, useCoreData, useCreateFinding, useCreateRecord, useSession, useSettings, useWeeklyFocus,
} from '@/hooks/useData';
import {
  EMPTY_FORM, blankManualIssues, issueTitle, sectionOf, topicStats, unansweredTechnical,
  type WalkFormState,
} from '@/lib/gembaForm';
import { themeLabel, useI18n } from '@/lib/i18n';
import { dueDateFor } from '@/lib/safety';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { formatDate, nowHHMM, todayISO } from '@/lib/time';
import type { SafetyChecklistItem, Severity } from '@/lib/types';
import { cn } from '@/lib/utils';

/** ค่าที่ใช้บ่อยของช่อง "กะ" — พิมพ์อย่างอื่นได้ */
const SHIFT_SUGGESTIONS = ['A', 'B', 'C', 'กลางวัน', 'กลางคืน'];

interface WalkDraft {
  date: string;
  time: string;
  areaId: string | null;
  themeIds: string[];
  shift: string;
  participants: string[];
  observation: string;
  photos: string[];
  form: WalkFormState;
}

function readDraft(key: string): WalkDraft | null {
  try {
    const raw = localStorage.getItem(key);
    const d = raw ? (JSON.parse(raw) as WalkDraft) : null;
    return d && d.form && Array.isArray(d.form.issues) ? d : null;
  } catch {
    return null;
  }
}

/**
 * ── บันทึกการเดิน GEMBA WALK ───────────────────────────────────────────────
 *
 * หน้าตาตามเอกสาร Excel ในโฟลเดอร์ "รายการที่ต้องตรวจสอบ"
 *   หัวแบบฟอร์ม   ผู้เข้าร่วมทัวร์ · แผนก/พื้นที่/เครื่องจักร · กะ · วันที่
 *   แบบฟอร์ม      หนึ่งแท็บต่อหนึ่งหัวข้อ (เหมือนแท็บชีต) — ตารางคำถาม + ตารางปัญหาที่ตรวจพบ
 *   ท้ายแบบฟอร์ม  บันทึกข้อสังเกตเชิงบวก + รูปภาพหลักฐาน
 *
 * ทุกแถวในตารางปัญหาที่ตรวจพบถูกเปิดเป็นใบแจ้งปัญหา (เจ้าของ = ผู้รับผิดชอบ · วันครบกำหนดตามที่กรอก)
 * แบบฟอร์มที่กรอกค้างถูกเก็บในเครื่องอัตโนมัติ ปิดแอปไปกลับมาก็ยังอยู่
 */
export default function WalkRecordPage() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { t, lang } = useI18n();
  const { session } = useSession();
  const { plans, themes, areas, managers, pathOf } = useCoreData();
  const { data: focus } = useWeeklyFocus();
  const { data: checklist } = useChecklist();
  const { data: settings } = useSettings();
  const access = useAccess();
  const createRecord = useCreateRecord();
  const createFinding = useCreateFinding();

  const plan = useMemo(() => plans.find((p) => p.id === planId), [plans, planId]);
  const isAdhoc = planId === 'new' || !plan;
  const draftKey = `${STORAGE_KEYS.walkDraft}.${planId ?? 'new'}`;

  // ── กู้คืนแบบฟอร์มที่กรอกค้าง (อ่านครั้งเดียวตอนเปิดหน้า) ──
  const [initial] = useState(() => readDraft(draftKey));
  const restored = useRef(initial !== null);

  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [time, setTime] = useState(initial?.time ?? nowHHMM());
  const [areaId, setAreaId] = useState<string | null>(initial?.areaId ?? null);
  const [themeIds, setThemeIds] = useState<string[]>(initial?.themeIds ?? []);
  const [shift, setShift] = useState(initial?.shift ?? '');
  const [participants, setParticipants] = useState<string[]>(initial?.participants ?? []);
  const [participantDraft, setParticipantDraft] = useState('');
  const [observation, setObservation] = useState(initial?.observation ?? '');
  const [photos, setPhotos] = useState<string[]>(initial?.photos ?? []);
  const [form, setForm] = useState<WalkFormState>(initial?.form ?? EMPTY_FORM);
  const [activeTopic, setActiveTopic] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  /** กดบันทึกแล้วยังมีข้อว่าง — ไฮไลต์ข้อนั้น และรอให้กดยืนยันอีกครั้ง */
  const [showMissing, setShowMissing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) toast(t('gemba.draftRestored'));
    // แจ้งครั้งเดียวตอนเปิดหน้า
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeThemeIds = useMemo(() => new Set(themes.filter((th) => th.is_active).map((th) => th.id)), [themes]);
  /** แผนเก่าที่ผูกกับหมวดเดิม (ปิดใช้งานแล้ว) — ให้เลือกหัวข้อใหม่แทน */
  const planTopicsRetired = Boolean(plan && themes.length && !plan.theme_ids.some((id) => activeThemeIds.has(id)));
  const canPickTopics = isAdhoc || planTopicsRetired;

  // ตั้งพื้นที่/หัวข้อตามแผนครั้งเดียว — หมวดถูกดึงใหม่ทุกนาที ถ้าตั้งซ้ำจะทับสิ่งที่ผู้ตรวจเพิ่งเปลี่ยน
  const planApplied = useRef(false);
  useEffect(() => {
    if (!plan || restored.current || planApplied.current || !themes.length) return;
    planApplied.current = true;
    setAreaId(plan.area_id);
    setThemeIds(plan.theme_ids.filter((id) => activeThemeIds.has(id)));
  }, [plan, themes.length, activeThemeIds]);

  // ── เก็บแบบฟอร์มค้างไว้ในเครื่อง (หน่วงครึ่งวินาทีหลังพิมพ์) ──
  useEffect(() => {
    const draft: WalkDraft = { date, time, areaId, themeIds, shift, participants, observation, photos, form };
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        /* เต็มหรือถูกปิด — แบบฟอร์มยังทำงานได้ แค่ไม่ถูกเก็บ */
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draftKey, date, time, areaId, themeIds, shift, participants, observation, photos, form]);

  const discardDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ไม่เป็นไร */
    }
    restored.current = false;
    setForm(EMPTY_FORM);
    setObservation('');
    setPhotos([]);
    setParticipants([]);
    setShift('');
    setShowMissing(false);
    setError(null);
    if (plan) {
      setAreaId(plan.area_id);
      setThemeIds(plan.theme_ids.filter((id) => activeThemeIds.has(id)));
    } else {
      setAreaId(null);
      setThemeIds([]);
    }
  };

  /** หัวข้อที่เลือกไว้ (เฉพาะที่เปิดใช้งาน) ตามลำดับที่เลือก */
  const topics = useMemo(
    () => themeIds.map((id) => themes.find((th) => th.id === id)).filter((th) => th && th.is_active) as typeof themes,
    [themeIds, themes],
  );

  /** ข้อตรวจของแต่ละหัวข้อ — ทางเทคนิคก่อน แล้วตามด้วยคำถามความผูกพันพนักงาน */
  const itemsByTopic = useMemo(() => {
    const map = new Map<string, SafetyChecklistItem[]>();
    for (const item of checklist ?? []) {
      if (!item.is_active || !themeIds.includes(item.theme_id)) continue;
      map.set(item.theme_id, [...(map.get(item.theme_id) ?? []), item]);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          Number(sectionOf(a) === 'engagement') - Number(sectionOf(b) === 'engagement') || a.sort_order - b.sort_order,
      );
    }
    return map;
  }, [checklist, themeIds]);

  const allItems = useMemo(() => topics.flatMap((th) => itemsByTopic.get(th.id) ?? []), [topics, itemsByTopic]);

  // แท็บที่เปิดอยู่ต้องเป็นหัวข้อที่ยังเลือกอยู่เสมอ
  const currentTopic = topics.find((th) => th.id === activeTopic) ?? topics[0];

  const dueFor = useCallback((s: Severity) => dueDateFor(s, settings), [settings]);
  const canOpenFinding = access.can('finding.create');

  const addParticipant = () => {
    const name = participantDraft.trim();
    if (!name) return;
    setParticipants((p) => [...new Set([...p, name])]);
    setParticipantDraft('');
  };

  const scrollToForm = () =>
    requestAnimationFrame(() => {
      const el = document.querySelector('[data-missing]') ?? document.getElementById('gemba-form');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

  const submit = async () => {
    if (!session || saving) return;
    setError(null);
    if (!areaId) return setError(t('plan.pickArea'));
    if (!topics.length) return setError(t('plan.pickTheme'));

    // แถวปัญหาเฉพาะของหัวข้อที่ยังเลือกอยู่ — เอาหัวข้อออกหลังกรอกไปแล้ว แถวของหัวข้อนั้นไม่ถูกบันทึก
    const issues = form.issues.filter((r) => topics.some((th) => th.id === r.theme_id));
    const blank = blankManualIssues(issues);
    if (blank.length) {
      setActiveTopic(blank[0].theme_id);
      setError(t('gemba.issueNeedText'));
      return;
    }

    const missing = unansweredTechnical(allItems, form.answers);
    if (missing.length && !showMissing) {
      // กดครั้งแรก: ชี้ข้อที่ยังว่าง · กดอีกครั้ง (ปุ่ม "บันทึกเท่าที่มี") จึงบันทึกจริง
      setShowMissing(true);
      setActiveTopic(missing[0].theme_id);
      scrollToForm();
      return;
    }

    setSaving(true);
    try {
      const answered = allItems.filter((i) => form.answers[i.id]);
      const record = await createRecord.mutateAsync({
        plan_id: plan?.id ?? null,
        manager_id: session.manager_id,
        actual_date: date,
        actual_time: time,
        actual_area_id: areaId,
        theme_ids: topics.map((th) => th.id),
        shift: shift.trim(),
        observation: observation.trim(),
        has_issue: issues.length > 0,
        // สรุปปัญหาไว้ที่ตัวบันทึกด้วย เพื่อให้หน้าประวัติและรายงาน CSV ค้นเจอ
        issue_summary: issues
          .map((r) => issueTitle(r, allItems.find((i) => i.id === r.item_id)))
          .join('\n')
          .slice(0, 2000),
        photo_urls: photos,
        participant_names: participants,
        checklist_results: answered.map((i) => ({
          item_id: i.id,
          result: form.answers[i.id].result,
          note: form.answers[i.id].note.trim(),
        })),
      });

      /**
       * ทุกแถวในตารางปัญหาที่ตรวจพบ = ใบแจ้งปัญหาหนึ่งใบ
       * ทำทีละใบตามลำดับ ไม่ใช่ Promise.all เพราะแต่ละใบต้องเข้าคิวซิงก์ตามลำดับที่ทำ
       */
      let opened = 0;
      if (canOpenFinding) {
        for (const row of issues) {
          const item = row.item_id ? allItems.find((i) => i.id === row.item_id) : undefined;
          await createFinding.mutateAsync({
            record_id: record.id,
            area_id: areaId,
            theme_id: row.theme_id,
            checklist_item_id: item?.id ?? null,
            title: issueTitle(row, item),
            // ความคิดเห็นของข้อที่ตอบ "ไม่ใช่" คือรายละเอียดของปัญหา
            description: item ? form.answers[item.id]?.note.trim() ?? '' : '',
            corrective_action: row.corrective_action.trim(),
            severity: row.severity,
            due_date: row.due_date,
            assigned_manager_id: row.owner_id,
            before_photos: row.photos,
          });
          opened++;
        }
      }

      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ไม่เป็นไร */
      }
      toast(t('walk.done'));
      navigate(opened > 0 ? '/findings' : '/history');
    } finally {
      setSaving(false);
    }
  };

  const missingCount = showMissing ? unansweredTechnical(allItems, form.answers).length : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </Button>
        {initial ? (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={discardDraft}>
            <RotateCcw className="h-4 w-4" />
            {t('gemba.startOver')}
          </Button>
        ) : null}
      </div>

      <PageTitle
        title={`${t('walk.title')} · GEMBA WALK`}
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
        {/* ── หัวแบบฟอร์ม (เหมือนแถวบนสุดของเอกสาร) ── */}
        <Card>
          <CardHeader title={t('gemba.header')} />
          <CardBody className="space-y-3.5">
            <div className="grid gap-3.5 md:grid-cols-2">
              <Field label={t('gemba.area')} required>
                <HierarchicalAreaPicker areas={areas} value={areaId} onChange={setAreaId} />
              </Field>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)] gap-2.5">
                <Field label={t('common.date')}>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="num px-2" />
                </Field>
                <Field label={t('common.time')}>
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="num px-2" />
                </Field>
                <Field label={t('gemba.shift')}>
                  <Input
                    value={shift}
                    onChange={(e) => setShift(e.target.value)}
                    list="gemba-shifts"
                    placeholder="A"
                    aria-describedby="gemba-shift-hint"
                    maxLength={40}
                  />
                  <datalist id="gemba-shifts">
                    {SHIFT_SUGGESTIONS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  <span id="gemba-shift-hint" className="sr-only">{t('gemba.shiftPlaceholder')}</span>
                </Field>
              </div>
            </div>

            <Field label={t('gemba.participants')}>
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
                  placeholder={t('gemba.participantsPlaceholder')}
                />
                <Button variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={addParticipant} aria-label={t('common.add')}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {participants.length ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {participants.map((p) => (
                    <span key={p} className="flex items-center gap-1 rounded-sm border bg-muted py-0.5 pl-2 text-[12px]">
                      {p}
                      <button
                        type="button"
                        onClick={() => setParticipants((list) => list.filter((x) => x !== p))}
                        className="press focusable flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground hover:text-bad"
                        aria-label={`${t('common.delete')} ${p}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </Field>

            {canPickTopics ? (
              <Field label={t('gemba.topics')} required hint={planTopicsRetired ? t('gemba.planTopicsRetired') : t('gemba.topicsHint')}>
                <ThemePicker themes={themes} value={themeIds} onChange={setThemeIds} recommended={focus?.theme_ids ?? []} />
              </Field>
            ) : null}

            {error ? (
              <p role="alert" className="flex items-start gap-1.5 text-[12px] font-medium text-bad">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}
          </CardBody>
        </Card>

        {/* ── แบบฟอร์มของแต่ละหัวข้อ (แท็บเหมือนชีตใน Excel) ── */}
        <section id="gemba-form" aria-label={t('gemba.topics')}>
          {topics.length && currentTopic ? (
            <>
              <TopicSheetTabs
                topics={topics}
                active={currentTopic.id}
                onSelect={setActiveTopic}
                statsOf={(id) => topicStats(itemsByTopic.get(id) ?? [], form.answers)}
                labelOf={(th) => themeLabel(th, lang)}
              />
              <Card className={cn('relative overflow-hidden', topics.length > 1 ? 'rounded-tl-none' : '')}>
                <span className="brand-stripe absolute inset-x-0 top-0 h-[3px]" aria-hidden />
                <CardBody className="pt-5" role={topics.length > 1 ? 'tabpanel' : undefined}>
                  <GembaTopicForm
                    key={currentTopic.id}
                    theme={currentTopic}
                    title={formTitle(currentTopic, themeLabel(currentTopic, lang), t)}
                    items={itemsByTopic.get(currentTopic.id) ?? []}
                    state={form}
                    onChange={setForm}
                    dueFor={dueFor}
                    managers={managers}
                    showMissing={showMissing}
                  />
                </CardBody>
              </Card>
            </>
          ) : (
            <Card>
              <CardBody>
                <p className="flex items-start gap-2 rounded-md border border-dashed px-3 py-4 text-[12px] leading-relaxed text-muted-foreground">
                  <ListChecks className="mt-0.5 h-4 w-4 shrink-0" />
                  {t('gemba.pickTopicFirst')}
                </p>
              </CardBody>
            </Card>
          )}
        </section>

        {/* ── ท้ายแบบฟอร์ม ── */}
        <Card>
          <CardHeader title={t('gemba.positive')} hint={t('common.optional')} />
          <CardBody>
            <Textarea
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder={t('gemba.positivePlaceholder')}
              className="min-h-[110px]"
              aria-label={t('gemba.positive')}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('walk.photos')} />
          <CardBody>
            <PhotoUploader value={photos} onChange={setPhotos} />
          </CardBody>
        </Card>
      </div>

      {/* แถบบันทึกติดล่างจอ — ถ้ายังตอบไม่ครบ บอกจำนวนและให้เลือกว่าจะตอบต่อหรือบันทึกเท่าที่มี */}
      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+56px)] z-20 mt-5 space-y-2 md:bottom-4">
        {missingCount > 0 ? (
          <div role="alert" className="flex items-start gap-2.5 rounded-md border border-warn/50 bg-card p-3 shadow-lift">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{t('gemba.incompleteTitle', { n: missingCount })}</p>
              <p className="text-[12px] text-muted-foreground">{t('gemba.incompleteBody')}</p>
            </div>
          </div>
        ) : null}
        <Button variant="accent" size="lg" className="w-full shadow-lift" onClick={submit} disabled={saving}>
          <ClipboardCheck className="h-5 w-5" />
          {saving ? t('common.saving') : missingCount > 0 ? t('gemba.saveAnyway') : t('walk.submit')}
        </Button>
      </div>
    </div>
  );
}
