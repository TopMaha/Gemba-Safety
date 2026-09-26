import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { PageTitle } from '@/components/ManagerShell';
import { ThemeBadges } from '@/components/ThemeBadges';
import { WalkDetailDialog } from '@/components/WalkDetailDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useCoreData, useSession } from '@/hooks/useData';
import { useI18n } from '@/lib/i18n';
import {
  addMonths,
  calendarGrid,
  dowLabels,
  formatDate,
  formatMonth,
  monthKey,
  todayISO,
} from '@/lib/time';
import type { WalkRecord } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function CalendarPage() {
  const { t, lang } = useI18n();
  const { session, admin } = useSession();
  const { plans, records, themes, pathOf } = useCoreData();
  const today = todayISO();
  const [month, setMonth] = useState(() => monthKey(today));
  const [selected, setSelected] = useState<string>(today);
  const [detail, setDetail] = useState<WalkRecord | null>(null);

  const mineOnly = !!session;
  const myPlans = useMemo(
    () => plans.filter((p) => (mineOnly ? p.manager_id === session!.manager_id : true) && p.status !== 'cancelled'),
    [plans, mineOnly, session],
  );
  const myRecords = useMemo(
    () => records.filter((r) => (mineOnly ? r.manager_id === session!.manager_id : true)),
    [records, mineOnly, session],
  );

  const days = useMemo(() => calendarGrid(month), [month]);

  const dayInfo = useMemo(() => {
    const map = new Map<string, { done: number; pending: number; overdue: number; adhoc: number }>();
    const touch = (d: string) => map.get(d) ?? { done: 0, pending: 0, overdue: 0, adhoc: 0 };
    myPlans.forEach((p) => {
      const cur = touch(p.plan_date);
      if (p.status === 'completed') cur.done += 1;
      else if (p.plan_date < today) cur.overdue += 1;
      else cur.pending += 1;
      map.set(p.plan_date, cur);
    });
    myRecords
      .filter((r) => !r.plan_id)
      .forEach((r) => {
        const cur = touch(r.actual_date);
        cur.adhoc += 1;
        map.set(r.actual_date, cur);
      });
    return map;
  }, [myPlans, myRecords, today]);

  const selectedPlans = myPlans.filter((p) => p.plan_date === selected);
  const selectedRecords = myRecords.filter((r) => r.actual_date === selected);

  const legend = [
    { tone: 'bg-ok', label: t('calendar.legendDone') },
    { tone: 'bg-accent', label: t('calendar.legendPending') },
    { tone: 'bg-bad', label: t('calendar.legendOverdue') },
    { tone: 'bg-steel', label: t('calendar.legendAdhoc') },
  ];

  return (
    <div>
      <PageTitle title={t('calendar.title')} />

      <Card>
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <Button variant="ghost" size="iconSm" onClick={() => setMonth(monthKey(addMonths(`${month}-01`, -1)))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <div className="text-sm font-semibold">{formatMonth(month, lang, true)}</div>
            <button
              onClick={() => (setMonth(monthKey(today)), setSelected(today))}
              className="num text-[10px] uppercase tracking-wider text-accent hover:underline"
            >
              {t('common.today')}
            </button>
          </div>
          <Button variant="ghost" size="iconSm" onClick={() => setMonth(monthKey(addMonths(`${month}-01`, 1)))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 border-b bg-muted/40">
          {dowLabels(lang).map((d, i) => (
            <div
              key={d}
              className={cn('py-1.5 text-center font-mono text-[10px] uppercase tracking-wider', (i === 0 || i === 6) && 'text-accent')}
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((d) => {
            const info = dayInfo.get(d);
            const isOtherMonth = monthKey(d) !== month;
            const isToday = d === today;
            const isSelected = d === selected;
            return (
              <button
                key={d}
                onClick={() => setSelected(d)}
                className={cn(
                  'relative flex aspect-square flex-col items-center justify-start gap-1 border-b border-r p-1 pt-1.5 last:border-r-0 focusable',
                  isOtherMonth && 'opacity-35',
                  isSelected && 'bg-accent/10 ring-1 ring-inset ring-accent',
                )}
              >
                <span
                  className={cn(
                    'num grid h-6 w-6 place-items-center rounded-full text-[12px]',
                    isToday && 'bg-primary font-semibold text-primary-foreground',
                  )}
                >
                  {Number(d.slice(8, 10))}
                </span>
                <span className="flex flex-wrap justify-center gap-0.5">
                  {info?.done ? <Dot className="bg-ok" n={info.done} /> : null}
                  {info?.pending ? <Dot className="bg-accent" n={info.pending} /> : null}
                  {info?.overdue ? <Dot className="bg-bad" n={info.overdue} /> : null}
                  {info?.adhoc ? <Dot className="bg-steel" n={info.adhoc} /> : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-3 py-2.5">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn('h-2 w-2 rounded-full', l.tone)} />
              {l.label}
            </span>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title={t('calendar.dayDetail', { date: formatDate(selected, lang, { full: true }) })} />
        <CardBody className="space-y-2">
          {!selectedPlans.length && !selectedRecords.length ? (
            <p className="py-4 text-center text-[13px] text-muted-foreground">{t('calendar.noEvents')}</p>
          ) : null}

          {selectedPlans.map((p) => {
            const rec = selectedRecords.find((r) => r.plan_id === p.id);
            const overdue = !rec && p.plan_date < today;
            return (
              <div key={p.id} className="flex items-start gap-3 rounded-md border p-3">
                <span className="num pt-0.5 text-[13px] font-semibold">{p.plan_time}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {rec ? (
                      <Badge tone="ok">{t('status.completed')}</Badge>
                    ) : overdue ? (
                      <Badge tone="bad">{t('status.overdue')}</Badge>
                    ) : (
                      <Badge tone="accent">{t('status.planned')}</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] font-medium leading-snug">{pathOf(p.area_id)}</p>
                  <ThemeBadges ids={p.theme_ids} themes={themes} className="mt-1.5" max={2} />
                </div>
                {rec ? (
                  <Button size="sm" variant="ghost" onClick={() => setDetail(rec)}>
                    {t('common.detail')}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" asChild>
                    <Link to={`/walk/${p.id}`}>
                      <Play className="h-3.5 w-3.5" />
                      {t('plan.start')}
                    </Link>
                  </Button>
                )}
              </div>
            );
          })}

          {selectedRecords
            .filter((r) => !r.plan_id)
            .map((r) => (
              <button
                key={r.id}
                onClick={() => setDetail(r)}
                className="press focusable flex w-full items-start gap-3 rounded-md border p-3 text-left"
              >
                <span className="num pt-0.5 text-[13px] font-semibold">{r.actual_time}</span>
                <div className="min-w-0 flex-1">
                  <Badge tone="steel">{t('status.adhoc')}</Badge>
                  <p className="mt-1 text-[13px] font-medium leading-snug">{pathOf(r.actual_area_id)}</p>
                  <ThemeBadges ids={r.theme_ids} themes={themes} className="mt-1.5" max={2} />
                </div>
              </button>
            ))}
        </CardBody>
      </Card>

      <WalkDetailDialog
        record={detail}
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        canEdit={!!session || admin}
      />
    </div>
  );
}

function Dot({ className, n }: { className: string; n: number }) {
  return (
    <span className="flex items-center gap-[1px]">
      <span className={cn('h-1.5 w-1.5 rounded-full', className)} />
      {n > 1 ? <span className="num text-[8px] text-muted-foreground">{n}</span> : null}
    </span>
  );
}
