import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { HierarchicalAreaPicker } from '@/components/HierarchicalAreaPicker';
import { ThemePicker } from '@/components/ThemePicker';
import { useCoreData, useCreatePlan, useSession, useSettings, useUpdatePlan, useWeeklyFocus } from '@/hooks/useData';
import { useI18n } from '@/lib/i18n';
import { recentVisitWarning } from '@/lib/calc';
import { todayISO } from '@/lib/time';
import type { GembaPlan } from '@/lib/types';

/** สร้าง / แก้ไข / เลื่อน / ยกเลิกแผนการเดิน */
export function PlanEditor({
  open,
  onOpenChange,
  plan,
  defaultDate,
  defaultAreaId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  plan?: GembaPlan | null;
  defaultDate?: string;
  defaultAreaId?: string;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const { session } = useSession();
  const { areas, themes, records } = useCoreData();
  const { data: focus } = useWeeklyFocus();
  const { data: settings } = useSettings();
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();

  const [date, setDate] = useState(defaultDate ?? todayISO());
  const [time, setTime] = useState('09:00');
  const [areaId, setAreaId] = useState<string | null>(defaultAreaId ?? null);
  const [themeIds, setThemeIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (plan) {
      setDate(plan.plan_date);
      setTime(plan.plan_time);
      setAreaId(plan.area_id);
      setThemeIds(plan.theme_ids);
      setNote(plan.note ?? '');
    } else {
      setDate(defaultDate ?? todayISO());
      setTime('09:00');
      setAreaId(defaultAreaId ?? null);
      setThemeIds(focus?.theme_ids?.slice(0, 1) ?? []);
      setNote('');
    }
  }, [open, plan, defaultDate, defaultAreaId, focus]);

  const warn = areaId ? recentVisitWarning(records, areaId, settings?.recent_visit_days ?? 7) : null;
  const busy = createPlan.isPending || updatePlan.isPending;

  const submit = async () => {
    if (!areaId) return setError(t('plan.pickArea'));
    if (!themeIds.length) return setError(t('plan.pickTheme'));
    if (!session) return;

    if (plan) {
      await updatePlan.mutateAsync({
        id: plan.id,
        patch: { plan_date: date, plan_time: time, area_id: areaId, theme_ids: themeIds, note },
      });
    } else {
      await createPlan.mutateAsync({
        manager_id: session.manager_id,
        plan_date: date,
        plan_time: time,
        area_id: areaId,
        theme_ids: themeIds,
        note,
      });
    }
    toast(t('plan.saved'));
    onOpenChange(false);
  };

  const cancelPlan = async () => {
    if (!plan) return;
    if (!confirm(t('plan.cancelConfirm'))) return;
    await updatePlan.mutateAsync({ id: plan.id, patch: { status: 'cancelled' } });
    toast(t('plan.cancelPlan'), 'info');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={plan ? t('plan.edit') : t('plan.new')}
        description={t('plan.subtitle')}
        footer={
          <>
            {plan ? (
              <Button variant="ghost" size="sm" className="mr-auto text-bad" onClick={cancelPlan} disabled={busy}>
                <Trash2 className="h-4 w-4" />
                {t('plan.cancelPlan')}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button variant="accent" onClick={submit} disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.date')} required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label={t('common.time')} required>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>

          <Field label={t('common.area')} required>
            <HierarchicalAreaPicker areas={areas} value={areaId} onChange={setAreaId} />
          </Field>

          {warn ? (
            <div className="flex items-start gap-2 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[12px] leading-relaxed">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <span>{t('plan.recentWarning', { days: warn.days })}</span>
            </div>
          ) : null}

          <Field label={t('plan.pickTheme')} required>
            <ThemePicker themes={themes} value={themeIds} onChange={setThemeIds} recommended={focus?.theme_ids ?? []} />
          </Field>

          <Field label={t('common.note')} hint={`(${t('common.optional')})`}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[70px]" />
          </Field>

          {error ? <p className="text-[12px] text-bad">{error}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
