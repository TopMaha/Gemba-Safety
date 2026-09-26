import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, ClipboardList, Clock, MapPin, Pencil, Play, Plus, Zap } from 'lucide-react';
import { PageTitle } from '@/components/ManagerShell';
import { PlanEditor } from '@/components/PlanEditor';
import { ThemeBadges } from '@/components/ThemeBadges';
import { WeeklyFocusBanner } from '@/components/WeeklyFocusBanner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, SkeletonList } from '@/components/ui/misc';
import { useCoreData, useSession, useWeeklyFocus } from '@/hooks/useData';
import { useI18n } from '@/lib/i18n';
import { addDays, endOfMonth, endOfWeek, formatDate, formatWeekday, minutesOf, relativeDay, todayISO } from '@/lib/time';
import type { GembaPlan } from '@/lib/types';
import { cn } from '@/lib/utils';

type Filter = 'today' | 'tomorrow' | 'week' | 'month' | 'all';

export default function Plan() {
  const { t, lang } = useI18n();
  const { session } = useSession();
  const { plans, themes, pathOf, isLoading } = useCoreData();
  const { data: focus } = useWeeklyFocus();
  const [filter, setFilter] = useState<Filter>('week');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<GembaPlan | null>(null);

  const today = todayISO();
  const mine = useMemo(
    () => plans.filter((p) => p.manager_id === session?.manager_id && p.status === 'planned'),
    [plans, session],
  );

  const overdue = useMemo(
    () => mine.filter((p) => p.plan_date < today).sort((a, b) => b.plan_date.localeCompare(a.plan_date)),
    [mine, today],
  );

  const upcoming = useMemo(() => {
    const to =
      filter === 'today'
        ? today
        : filter === 'tomorrow'
          ? addDays(today, 1)
          : filter === 'week'
            ? endOfWeek(today)
            : filter === 'month'
              ? endOfMonth(today)
              : '9999-12-31';
    const from = filter === 'tomorrow' ? addDays(today, 1) : today;
    return mine
      .filter((p) => p.plan_date >= from && p.plan_date <= to)
      .sort((a, b) => a.plan_date.localeCompare(b.plan_date) || minutesOf(a.plan_time) - minutesOf(b.plan_time));
  }, [mine, filter, today]);

  const grouped = useMemo(() => {
    const map = new Map<string, GembaPlan[]>();
    upcoming.forEach((p) => map.set(p.plan_date, [...(map.get(p.plan_date) ?? []), p]));
    return [...map.entries()];
  }, [upcoming]);

  const filters: { id: Filter; label: string }[] = [
    { id: 'today', label: t('plan.filterToday') },
    { id: 'tomorrow', label: t('plan.filterTomorrow') },
    { id: 'week', label: t('plan.filterWeek') },
    { id: 'month', label: t('plan.filterMonth') },
    { id: 'all', label: t('plan.filterAll') },
  ];

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  return (
    <div>
      <PageTitle
        title={t('plan.title')}
        subtitle={t('plan.subtitle')}
        right={
          <div className="hidden gap-2 sm:flex">
            <Button variant="outline" asChild>
              <Link to="/walk/new">
                <Zap className="h-4 w-4" />
                {t('home.quickWalk')}
              </Link>
            </Button>
            <Button variant="accent" onClick={openNew}>
              <Plus className="h-4 w-4" />
              {t('plan.new')}
            </Button>
          </div>
        }
      />

      <WeeklyFocusBanner focus={focus} themes={themes} />

      <div className="scroll-x no-scrollbar -mx-3 mb-4 flex gap-1.5 px-3 sm:mx-0 sm:px-0">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'press focusable shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium',
              filter === f.id ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="num ml-auto hidden shrink-0 self-center pl-3 text-[11px] text-muted-foreground sm:block">
          {t('plan.countPlans', { n: upcoming.length })}
        </span>
      </div>

      {isLoading ? (
        <SkeletonList rows={4} />
      ) : (
        <div className="space-y-5">
          {overdue.length ? (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <Badge tone="bad" size="md">
                  {t('plan.overdue')}
                </Badge>
                <span className="num text-[11px] text-muted-foreground">{overdue.length}</span>
              </div>
              <div className="space-y-2">
                {overdue.map((p) => (
                  <PlanCard
                    key={p.id}
                    plan={p}
                    overdue
                    path={pathOf(p.area_id)}
                    themes={themes}
                    focusIds={focus?.theme_ids ?? []}
                    onEdit={() => (setEditing(p), setEditorOpen(true))}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {grouped.length ? (
            grouped.map(([date, list]) => (
              <section key={date}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h2 className="text-[13px] font-semibold">
                    {formatWeekday(date, lang, true)} {formatDate(date, lang)}
                  </h2>
                  <span className="num text-[11px] text-muted-foreground">{relativeDay(date, lang)}</span>
                </div>
                <div className="space-y-2">
                  {list.map((p) => (
                    <PlanCard
                      key={p.id}
                      plan={p}
                      path={pathOf(p.area_id)}
                      themes={themes}
                      focusIds={focus?.theme_ids ?? []}
                      onEdit={() => (setEditing(p), setEditorOpen(true))}
                    />
                  ))}
                </div>
              </section>
            ))
          ) : (
            <EmptyState
              icon={<ClipboardList className="h-8 w-8" />}
              title={t('plan.empty')}
              hint={t('plan.emptyHint')}
              action={
                <Button variant="accent" onClick={openNew}>
                  <CalendarPlus className="h-4 w-4" />
                  {t('plan.new')}
                </Button>
              }
            />
          )}
        </div>
      )}

      {/* ปุ่มลอยบนมือถือ */}
      <button
        onClick={openNew}
        className="press focusable fixed bottom-[calc(env(safe-area-inset-bottom)+68px)] right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-foreground shadow-lift sm:hidden"
        aria-label={t('plan.new')}
      >
        <Plus className="h-6 w-6" />
      </button>

      <PlanEditor open={editorOpen} onOpenChange={setEditorOpen} plan={editing} />
    </div>
  );
}

function PlanCard({
  plan,
  path,
  themes,
  focusIds,
  onEdit,
  overdue,
}: {
  plan: GembaPlan;
  path: string;
  themes: ReturnType<typeof useCoreData>['themes'];
  focusIds: string[];
  onEdit: () => void;
  overdue?: boolean;
}) {
  const { t, lang } = useI18n();
  return (
    <article
      className={cn(
        'panel animate-fade-up p-3.5',
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[""]',
        overdue ? 'before:bg-bad' : 'before:bg-accent',
      )}
    >
      <div className="flex items-start gap-3 pl-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="num flex items-center gap-1 text-sm font-semibold">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              {plan.plan_time}
            </span>
            {overdue ? (
              <Badge tone="bad">{formatDate(plan.plan_date, lang)}</Badge>
            ) : (
              <Badge tone="neutral">{relativeDay(plan.plan_date, lang)}</Badge>
            )}
          </div>

          <div className="mt-1.5 flex items-start gap-1.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="text-[13px] font-medium leading-snug">{path}</p>
          </div>

          <ThemeBadges ids={plan.theme_ids} themes={themes} highlight={focusIds} className="mt-2" />

          {plan.note ? <p className="mt-2 text-[12px] text-muted-foreground">{plan.note}</p> : null}
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          <Button size="sm" variant="accent" asChild>
            <Link to={`/walk/${plan.id}`}>
              <Play className="h-3.5 w-3.5" />
              {t('plan.start')}
            </Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
            {t('common.edit')}
          </Button>
        </div>
      </div>
    </article>
  );
}
