import { useMemo, useState } from 'react';
import { CalendarPlus, Grid2x2, MapPin } from 'lucide-react';
import { PageTitle } from '@/components/ManagerShell';
import { PlanEditor } from '@/components/PlanEditor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, StatBlock } from '@/components/ui/card';
import { EmptyState, SectionTitle, Skeleton } from '@/components/ui/misc';
import { useCoreData, useSession } from '@/hooks/useData';
import { coverage, suggestNextAreas } from '@/lib/calc';
import { areaLabel } from '@/lib/areaTree';
import { useI18n } from '@/lib/i18n';
import { addDays, formatDate, todayISO } from '@/lib/time';
import { cn } from '@/lib/utils';

const RANGES = [30, 60, 90] as const;

export default function CoverageHeatmap() {
  const { t, lang } = useI18n();
  const { session } = useSession();
  const { areas, records, pathOf, isLoading } = useCoreData();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [planArea, setPlanArea] = useState<string | null>(null);

  const today = todayISO();
  const from = addDays(today, -days + 1);

  const rows = useMemo(() => coverage(areas, records, from, today, pathOf), [areas, records, from, today, pathOf]);
  const leafRows = useMemo(() => rows.filter((r) => !areas.some((a) => a.parent_id === r.area.id)), [rows, areas]);
  const suggestions = useMemo(() => suggestNextAreas(leafRows, 6), [leafRows]);

  const visited = leafRows.filter((r) => r.visits > 0).length;
  const totalVisits = leafRows.reduce((s, r) => s + r.visits, 0);
  const maxVisits = Math.max(1, ...leafRows.map((r) => r.visits));

  const roots = areas.filter((a) => !a.parent_id && a.is_active);

  return (
    <div>
      <PageTitle title={t('coverage.title')} subtitle={t('coverage.subtitle')} />

      <div className="mb-4 flex gap-1.5">
        {RANGES.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={cn(
              'press focusable rounded-full border px-3.5 py-1.5 text-[12px] font-medium',
              days === d ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground',
            )}
          >
            {d} {t('common.days')}
          </button>
        ))}
        <span className="num ml-auto self-center text-[11px] text-muted-foreground">
          {formatDate(from, lang)} – {formatDate(today, lang)}
        </span>
      </div>

      {isLoading ? (
        <Skeleton className="h-80" />
      ) : (
        <div className="space-y-4">
          <div className="stagger grid grid-cols-3 gap-2">
            <StatBlock label={t('coverage.visited')} value={visited} unit={`/${leafRows.length}`} tone="accent" />
            <StatBlock label={t('coverage.never')} value={leafRows.length - visited} tone="bad" />
            <StatBlock label={t('coverage.totalVisits')} value={totalVisits} />
          </div>

          {/* พื้นที่แนะนำ */}
          <Card accent>
            <CardHeader title={t('coverage.suggest')} hint={t('coverage.suggestHint')} />
            <CardBody className="space-y-1.5">
              {suggestions.map((r) => (
                <div key={r.area.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                  <MapPin className="h-4 w-4 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{areaLabel(r.area, lang)}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{r.path}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    {r.lastVisit ? (
                      <span className="num text-[11px] text-muted-foreground">
                        {t('coverage.daysAgo', { n: r.daysSince ?? 0 })}
                      </span>
                    ) : (
                      <Badge tone="bad">{t('coverage.neverVisited')}</Badge>
                    )}
                  </div>
                  {session ? (
                    <Button variant="outline" size="iconSm" onClick={() => setPlanArea(r.area.id)} aria-label={t('coverage.planIt')}>
                      <CalendarPlus className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </CardBody>
          </Card>

          {/* แผนที่ความถี่ */}
          {roots.map((root) => {
            const children = leafRows.filter((r) => r.path.startsWith(areaLabel(root, lang)));
            if (!children.length) return null;
            return (
              <section key={root.id}>
                <SectionTitle
                  right={
                    <span className="num text-[11px] text-muted-foreground">
                      {children.reduce((s, c) => s + c.visits, 0)} {t('coverage.visits')}
                    </span>
                  }
                >
                  {areaLabel(root, lang)}
                </SectionTitle>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {children.map((r) => {
                    const ratio = r.visits / maxVisits;
                    return (
                      <div
                        key={r.area.id}
                        className={cn(
                          'relative overflow-hidden rounded-md border p-3',
                          r.visits === 0 && 'border-dashed',
                        )}
                        style={{
                          background:
                            r.visits === 0
                              ? undefined
                              : `color-mix(in srgb, hsl(var(--accent)) ${Math.round(12 + ratio * 55)}%, hsl(var(--card)))`,
                        }}
                      >
                        <div className="truncate text-[13px] font-medium">{areaLabel(r.area, lang)}</div>
                        <div className="mt-1.5 flex items-baseline gap-1">
                          <span className="num text-xl font-semibold leading-none">{r.visits}</span>
                          <span className="text-[10px] text-muted-foreground">{t('coverage.visits')}</span>
                        </div>
                        <div className="num mt-1 text-[10px] text-muted-foreground">
                          {r.lastVisit
                            ? `${t('coverage.lastVisit')}: ${formatDate(r.lastVisit, lang, { noYear: true })}`
                            : t('coverage.neverVisited')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {!leafRows.length ? <EmptyState icon={<Grid2x2 className="h-8 w-8" />} title={t('common.noData')} /> : null}
        </div>
      )}

      <PlanEditor
        open={!!planArea}
        onOpenChange={(o) => !o && setPlanArea(null)}
        defaultAreaId={planArea ?? undefined}
      />
    </div>
  );
}
