import { useMemo, useState } from 'react';
import { AlertTriangle, CalendarPlus, CheckCircle2, ClipboardPaste, Copy, Trash2, X, XCircle } from 'lucide-react';
import { HierarchicalAreaPicker } from '@/components/HierarchicalAreaPicker';
import { ManagerSelect } from '@/components/safety/FindingDialogs';
import { ThemeBadges } from '@/components/ThemeBadges';
import { ThemePicker } from '@/components/ThemePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Avatar } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useChecklist, useCoreData, useCreatePlan, useSaveManager, useUpdatePlan } from '@/hooks/useData';
import { managerLabel, themeLabel, useI18n, type TKey } from '@/lib/i18n';
import { DEFAULT_PLAN_TIME, TEMPLATE_HEADER, parsePlanPaste, type ParsedPlanRow, type RowIssue } from '@/lib/planImport';
import { addDays, formatDate, todayISO } from '@/lib/time';
import { cn } from '@/lib/utils';

/**
 * ── วางแผนการเดินให้ทีม (เฉพาะโหมดผู้ดูแล) ────────────────────────────────────
 *
 * สามส่วน: เพิ่มทีละแผน · วางหลายแถวจาก Excel (ตรวจก่อนสร้าง) · แผนที่กำลังจะถึงของทุกคน
 * แผนที่สร้างตรงนี้คือแผนของคนนั้นเอง (manager_id = ผู้เดินตรวจ) จึงขึ้นที่หน้า "แผนการเดิน" ของเขาทันที
 */
export function TeamPlansTab() {
  return (
    <div className="space-y-4">
      <QuickAddCard />
      <PasteCard />
      <UpcomingCard />
    </div>
  );
}

/* ── เพิ่มทีละแผน ─────────────────────────────────────────────────────── */

function QuickAddCard() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { managers, areas, themes } = useCoreData();
  const createPlan = useCreatePlan();
  const [managerId, setManagerId] = useState<string | null>(null);
  const [date, setDate] = useState(addDays(todayISO(), 1));
  const [time, setTime] = useState(DEFAULT_PLAN_TIME);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [themeIds, setThemeIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!managerId) return setError(t('team.needWalker'));
    if (!areaId) return setError(t('plan.pickArea'));
    if (!themeIds.length) return setError(t('plan.pickTheme'));
    await createPlan.mutateAsync({ manager_id: managerId, plan_date: date, plan_time: time, area_id: areaId, theme_ids: themeIds, note: note.trim() });
    toast(t('team.planAdded', { name: managerLabel(managers.find((m) => m.id === managerId), lang) }));
    // คงผู้เดิน/วัน/เวลาไว้ เผื่อจะเพิ่มแผนให้คนเดิมต่อ ล้างแค่สิ่งที่มักเปลี่ยนทุกแผน
    setAreaId(null);
    setThemeIds([]);
    setNote('');
    setError(null);
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-accent" />
            {t('team.planTitle')}
          </span>
        }
        hint={t('team.planHint')}
      />
      <CardBody className="space-y-3.5">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('team.walker')} required>
            <ManagerSelect managers={managers} value={managerId} onChange={setManagerId} placeholder={t('team.pickWalker')} />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label={t('common.date')} required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="num px-2" />
            </Field>
            <Field label={t('common.time')} required>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="num px-2" />
            </Field>
          </div>
        </div>
        <Field label={t('common.area')} required>
          <HierarchicalAreaPicker areas={areas} value={areaId} onChange={setAreaId} />
        </Field>
        <Field label={t('gemba.topics')} required>
          <ThemePicker themes={themes} value={themeIds} onChange={setThemeIds} />
        </Field>
        <Field label={t('team.note')} hint={t('common.optional')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        {error ? (
          <p role="alert" className="flex items-center gap-1.5 text-[12px] font-medium text-bad">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button variant="accent" className="h-11 w-full sm:w-auto" onClick={submit} disabled={createPlan.isPending}>
            <CalendarPlus className="h-4 w-4" />
            {createPlan.isPending ? t('common.saving') : t('team.addPlan')}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

/* ── วางจาก Excel ─────────────────────────────────────────────────────── */

const EXAMPLE_ROW = ['T-815', '20/11/2026', '09:00', 'VSM1', '01, 12', ''];

function PasteCard() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { managers, areas, themes, plans } = useCoreData();
  const { data: checklist = [] } = useChecklist();
  const createPlan = useCreatePlan();
  const saveManager = useSaveManager();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ParsedPlanRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = rows?.filter((r) => !r.errors.length) ?? [];

  const check = () => setRows(parsePlanPaste(text, { managers, areas, themes, checklist, plans, today: todayISO() }));

  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(`${TEMPLATE_HEADER.join('\t')}\n${EXAMPLE_ROW.join('\t')}`);
      toast(t('team.templateCopied'));
    } catch {
      /* เบราว์เซอร์ไม่ให้เขียนคลิปบอร์ด — หัวตารางยังอ่านได้จากคำอธิบายด้านบน */
    }
  };

  const create = async () => {
    if (!ready.length) return;
    setBusy(true);
    try {
      // คนที่ยังไม่เป็นผู้เดินตรวจ เปิดให้ก่อน ไม่งั้นเขาเข้าแอปมาดูแผนของตัวเองไม่ได้
      const grant = new Map(ready.filter((r) => r.manager && !r.manager.can_login).map((r) => [r.manager!.id, r.manager!]));
      for (const m of grant.values()) await saveManager.mutateAsync({ id: m.id, can_login: true });
      for (const r of ready) {
        await createPlan.mutateAsync({
          manager_id: r.manager!.id,
          plan_date: r.plan_date!,
          plan_time: r.plan_time!,
          area_id: r.area!.id,
          theme_ids: r.theme_ids,
          note: r.note,
        });
      }
      toast(t('team.created', { n: ready.length }));
      // เก็บเฉพาะแถวที่ยังมีปัญหาไว้ให้แก้ต่อ
      const left = rows!.filter((r) => r.errors.length);
      setRows(left.length ? left : null);
      setText(left.map((r) => r.cells.join('\t')).join('\n'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <ClipboardPaste className="h-4 w-4 text-accent" />
            {t('team.pasteTitle')}
          </span>
        }
        right={
          <Button variant="outline" size="sm" className="h-9" onClick={copyTemplate}>
            <Copy className="h-3.5 w-3.5" />
            {t('team.copyTemplate')}
          </Button>
        }
      />
      <CardBody className="space-y-3">
        <div className="space-y-1 text-[12px] text-muted-foreground">
          <p>{t('team.pasteHint')}</p>
          <p className="rounded-sm bg-muted px-2 py-1.5 font-medium text-foreground">{t('team.columns')}</p>
          <p>{t('team.columnsHint')}</p>
        </div>
        <Textarea
          value={text}
          onChange={(e) => (setText(e.target.value), setRows(null))}
          placeholder={EXAMPLE_ROW.join('    ')}
          className="num min-h-[120px] whitespace-pre text-[12px]"
          spellCheck={false}
          aria-label={t('team.pasteTitle')}
        />
        <div className="flex flex-wrap justify-end gap-2">
          {text ? (
            <Button variant="ghost" className="h-11" onClick={() => (setText(''), setRows(null))}>
              <X className="h-4 w-4" />
              {t('team.clear')}
            </Button>
          ) : null}
          <Button variant="outline" className="h-11" onClick={check} disabled={!text.trim()}>
            <CheckCircle2 className="h-4 w-4" />
            {t('team.check')}
          </Button>
        </div>

        {rows ? (
          <div className="space-y-2">
            <p className="text-[13px] font-semibold" aria-live="polite">
              {t('team.previewTitle', { ok: ready.length, total: rows.length })}
            </p>
            <ul className="divide-y overflow-hidden rounded-md border">
              {rows.map((r) => (
                <PreviewRow key={r.n} row={r} lang={lang} themesLabel={(id) => themeLabel(themes.find((x) => x.id === id), lang)} />
              ))}
            </ul>
            <Button variant="accent" size="lg" className="w-full" onClick={create} disabled={busy || !ready.length}>
              <CalendarPlus className="h-5 w-5" />
              {busy ? t('common.saving') : t('team.createN', { n: ready.length })}
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function issueText(t: (k: TKey, v?: Record<string, string | number>) => string, i: RowIssue) {
  return t(`team.${i.key}` as TKey, { v: i.v ?? '' });
}

function PreviewRow({ row, lang, themesLabel }: { row: ParsedPlanRow; lang: 'th' | 'en'; themesLabel: (id: string) => string }) {
  const { t } = useI18n();
  const bad = row.errors.length > 0;
  return (
    <li className={cn('px-3 py-2.5', bad ? 'bg-bad/[0.05]' : '')}>
      <div className="flex items-start gap-2.5">
        {bad ? (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-hidden />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="num text-[11px] text-muted-foreground">{t('team.rowN', { n: row.n })}</span>
            <span className="text-[13px] font-medium">
              {row.manager ? `${managerLabel(row.manager, lang)} · ${row.manager.manager_code}` : row.cells[0] || '—'}
            </span>
            {!bad ? <Badge tone="ok">{t('team.rowOk')}</Badge> : null}
          </div>
          <p className="num text-[12px] text-muted-foreground">
            {row.plan_date ? formatDate(row.plan_date, lang) : row.cells[1] || '—'} · {row.plan_time ?? row.cells[2] ?? '—'} ·{' '}
            <span className="font-sans">{row.area ? row.area.area_name : row.cells[3] || '—'}</span>
          </p>
          {row.theme_ids.length ? (
            <p className="text-[12px]">{row.theme_ids.map(themesLabel).join(' · ')}</p>
          ) : null}
          {row.note ? <p className="text-[12px] text-muted-foreground">{row.note}</p> : null}
          {[...row.errors, ...row.warnings].length ? (
            <ul className="space-y-0.5">
              {row.errors.map((i, k) => (
                <li key={`e${k}`} className="flex items-center gap-1 text-[12px] font-medium text-bad">
                  <XCircle className="h-3 w-3 shrink-0" aria-hidden />
                  {issueText(t, i)}
                </li>
              ))}
              {row.warnings.map((i, k) => (
                <li key={`w${k}`} className="flex items-center gap-1 text-[12px] text-warn">
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                  {issueText(t, i)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/* ── แผนที่กำลังจะถึง ─────────────────────────────────────────────────── */

function UpcomingCard() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { plans, managers, themes, pathOf } = useCoreData();
  const updatePlan = useUpdatePlan();
  const [confirming, setConfirming] = useState<string | null>(null);

  const today = todayISO();
  const until = addDays(today, 30);
  const groups = useMemo(() => {
    const list = plans
      .filter((p) => p.status === 'planned' && p.plan_date >= today && p.plan_date <= until)
      .sort((a, b) => a.plan_date.localeCompare(b.plan_date) || a.plan_time.localeCompare(b.plan_time));
    const byDate = new Map<string, typeof list>();
    for (const p of list) byDate.set(p.plan_date, [...(byDate.get(p.plan_date) ?? []), p]);
    return [...byDate.entries()];
  }, [plans, today, until]);

  const cancel = async (id: string) => {
    await updatePlan.mutateAsync({ id, patch: { status: 'cancelled' } });
    setConfirming(null);
    toast(t('team.cancelled'));
  };

  return (
    <Card>
      <CardHeader title={t('team.upcoming')} hint={t('team.upcomingHint')} />
      <CardBody className="space-y-4">
        {groups.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">{t('team.noUpcoming')}</p>
        ) : (
          groups.map(([date, list]) => (
            <section key={date}>
              <h4 className="label-micro mb-1.5">{formatDate(date, lang, { full: true })}</h4>
              <ul className="divide-y overflow-hidden rounded-md border">
                {list.map((p) => {
                  const m = managers.find((x) => x.id === p.manager_id);
                  return (
                    <li key={p.id} className="flex items-start gap-3 px-3 py-2.5">
                      <span className="num w-11 shrink-0 pt-0.5 text-[12px] font-semibold">{p.plan_time}</span>
                      <Avatar name={managerLabel(m, lang)} src={m?.avatar_url} seed={m?.id} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{managerLabel(m, lang)}</div>
                        <div className="truncate text-[11px] text-muted-foreground">{pathOf(p.area_id)}</div>
                        <ThemeBadges ids={p.theme_ids} themes={themes} className="mt-1" />
                        {p.note ? <p className="mt-1 text-[11px] text-muted-foreground">{p.note}</p> : null}
                      </div>
                      {confirming === p.id ? (
                        <div className="flex shrink-0 flex-col gap-1">
                          <Button variant="danger" size="sm" className="h-9" onClick={() => cancel(p.id)} disabled={updatePlan.isPending}>
                            {t('team.cancelPlan')}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-9" onClick={() => setConfirming(null)}>
                            {t('common.cancel')}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 shrink-0 text-muted-foreground hover:text-bad"
                          onClick={() => setConfirming(p.id)}
                          aria-label={`${t('team.cancelPlan')} · ${managerLabel(m, lang)} · ${p.plan_date}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </CardBody>
    </Card>
  );
}
