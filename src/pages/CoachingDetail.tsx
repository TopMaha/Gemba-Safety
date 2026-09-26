import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Camera, Ticket } from 'lucide-react';
import { PageTitle } from '@/components/ManagerShell';
import { ThemeBadges } from '@/components/ThemeBadges';
import { WalkDetailDialog } from '@/components/WalkDetailDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, StatBlock } from '@/components/ui/card';
import { Avatar, BandBar, EmptyState } from '@/components/ui/misc';
import { useCoreData } from '@/hooks/useData';
import { adherence, themeCompletion } from '@/lib/calc';
import { managerLabel, themeLabel, useI18n } from '@/lib/i18n';
import { addDays, formatDate, todayISO } from '@/lib/time';
import type { WalkRecord } from '@/lib/types';
import { cn } from '@/lib/utils';

const RANGES = [30, 90] as const;

export default function CoachingDetail() {
  const { managerId } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { managers, plans, records, themes, pathOf } = useCoreData();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [detail, setDetail] = useState<WalkRecord | null>(null);

  const today = todayISO();
  const from = addDays(today, -days + 1);
  const manager = managers.find((m) => m.id === managerId);

  const mine = useMemo(
    () =>
      records
        .filter((r) => r.manager_id === managerId && r.actual_date >= from && r.actual_date <= today)
        .sort((a, b) => b.actual_date.localeCompare(a.actual_date)),
    [records, managerId, from, today],
  );

  const ad = adherence(plans, from, today, managerId);
  const areasCovered = new Set(mine.map((r) => r.actual_area_id)).size;
  const themeRows = useMemo(
    () => (manager ? themeCompletion(themes.filter((x) => x.is_active).map((x) => x.id), mine, [manager], from, today) : []),
    [themes, mine, manager, from, today],
  );

  if (!manager) return <EmptyState title={t('common.noData')} />;

  return (
    <div>
      <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/coaching')}>
        <ArrowLeft className="h-4 w-4" />
        {t('common.back')}
      </Button>

      <PageTitle title={t('coaching.profile')} />

      <Card accent className="mb-4">
        <CardBody className="flex items-center gap-3.5">
          <Avatar name={managerLabel(manager, lang)} src={manager.avatar_url} seed={manager.id} size={56} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold">{managerLabel(manager, lang)}</div>
            <div className="num text-[12px] text-muted-foreground">
              {manager.manager_code} · {manager.department}
            </div>
            {manager.position ? <div className="mt-0.5 text-[12px]">{manager.position}</div> : null}
          </div>
          <Badge tone={manager.is_active ? 'ok' : 'bad'} size="md">
            {manager.is_active ? t('common.active') : t('common.inactive')}
          </Badge>
        </CardBody>
      </Card>

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

      <div className="stagger mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatBlock label={t('coaching.walks')} value={mine.length} />
        <StatBlock label={t('coaching.adherence')} value={ad.pct} unit="%" sub={`${ad.done}/${ad.total}`} />
        <StatBlock label={t('coaching.issues')} value={mine.filter((r) => r.has_issue).length} tone="bad" />
        <StatBlock label={t('coaching.areasCovered')} value={areasCovered} tone="accent" />
      </div>

      <Card className="mb-4">
        <CardHeader title={t('coaching.themesCovered')} />
        <CardBody className="space-y-2.5">
          {themeRows.map((row) => {
            const th = themes.find((x) => x.id === row.theme_id);
            return (
              <div key={row.theme_id}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-[12px]">{themeLabel(th, lang)}</span>
                  <span className="num text-[11px] text-muted-foreground">{row.actual ? '✓' : '—'}</span>
                </div>
                <BandBar pct={row.pct} />
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('coaching.recentWalks')} right={<span className="num text-[11px] text-muted-foreground">{mine.length}</span>} />
        <CardBody className="space-y-2">
          {mine.length ? (
            mine.slice(0, 20).map((r) => (
              <button
                key={r.id}
                onClick={() => setDetail(r)}
                className="press focusable flex w-full items-start gap-3 rounded-md border p-3 text-left"
              >
                <span className="num shrink-0 pt-0.5 text-[12px] font-semibold">
                  {formatDate(r.actual_date, lang, { noYear: true })}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] text-muted-foreground">{pathOf(r.actual_area_id)}</p>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-snug">{r.observation}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <ThemeBadges ids={r.theme_ids} themes={themes} max={2} />
                    {r.has_issue ? <Badge tone="bad">{t('status.issue')}</Badge> : null}
                    {r.photo_urls.length ? (
                      <span className="num flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Camera className="h-3 w-3" />
                        {r.photo_urls.length}
                      </span>
                    ) : null}
                    {r.ci_ticket_no ? (
                      <span className="num flex items-center gap-0.5 text-[10px] text-accent">
                        <Ticket className="h-3 w-3" />
                        {r.ci_ticket_no}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <EmptyState title={t('coaching.noWalks')} className="border-0" />
          )}
        </CardBody>
      </Card>

      <WalkDetailDialog record={detail} open={!!detail} onOpenChange={(o) => !o && setDetail(null)} />
    </div>
  );
}
