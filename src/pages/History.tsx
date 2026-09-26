import { useMemo, useState } from 'react';
import { AlertTriangle, Camera, History as HistoryIcon, Search, Ticket, Zap } from 'lucide-react';
import { PageTitle } from '@/components/ManagerShell';
import { ThemeBadges } from '@/components/ThemeBadges';
import { WalkDetailDialog } from '@/components/WalkDetailDialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/field';
import { Avatar, EmptyState, SkeletonList } from '@/components/ui/misc';
import { useCoreData, useSession } from '@/hooks/useData';
import { managerLabel, themeLabel, useI18n } from '@/lib/i18n';
import { formatDate, formatWeekday } from '@/lib/time';
import type { WalkRecord } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function History() {
  const { t, lang } = useI18n();
  const { session, admin } = useSession();
  const { records, themes, managers, pathOf, isLoading } = useCoreData();
  const [term, setTerm] = useState('');
  const [issueOnly, setIssueOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(!!session);
  const [detail, setDetail] = useState<WalkRecord | null>(null);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return records
      .filter((r) => (mineOnly && session ? r.manager_id === session.manager_id : true))
      .filter((r) => (issueOnly ? r.has_issue : true))
      .filter((r) => {
        if (!q) return true;
        const themeNames = r.theme_ids
          .map((id) => themeLabel(themes.find((x) => x.id === id), lang))
          .join(' ');
        return `${pathOf(r.actual_area_id)} ${r.observation} ${r.issue_summary ?? ''} ${themeNames} ${r.ci_ticket_no ?? ''}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => b.actual_date.localeCompare(a.actual_date) || b.actual_time.localeCompare(a.actual_time));
  }, [records, mineOnly, session, issueOnly, term, pathOf, themes, lang]);

  const grouped = useMemo(() => {
    const map = new Map<string, WalkRecord[]>();
    filtered.forEach((r) => map.set(r.actual_date, [...(map.get(r.actual_date) ?? []), r]));
    return [...map.entries()];
  }, [filtered]);

  return (
    <div>
      <PageTitle title={t('history.title')} subtitle={t('history.subtitle')} />

      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t('history.searchPlaceholder')}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={issueOnly} onClick={() => setIssueOnly((v) => !v)}>
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('history.filterIssue')}
          </FilterChip>
          {session ? (
            <FilterChip active={mineOnly} onClick={() => setMineOnly((v) => !v)}>
              {t('history.filterMine')}
            </FilterChip>
          ) : null}
          <span className="num ml-auto self-center text-[11px] text-muted-foreground">
            {filtered.length} {t('common.times')}
          </span>
        </div>
      </div>

      {isLoading ? (
        <SkeletonList rows={5} />
      ) : grouped.length ? (
        <div className="space-y-5">
          {grouped.map(([date, list]) => (
            <section key={date}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="text-[13px] font-semibold">
                  {formatWeekday(date, lang, true)} {formatDate(date, lang)}
                </h2>
                <span className="num text-[11px] text-muted-foreground">{list.length}</span>
              </div>
              <div className="space-y-2">
                {list.map((r) => {
                  const m = managers.find((x) => x.id === r.manager_id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => setDetail(r)}
                      className={cn(
                        'panel press focusable animate-fade-up w-full p-3.5 text-left',
                        'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[""]',
                        r.has_issue ? 'before:bg-bad' : 'before:bg-ok',
                      )}
                    >
                      <div className="flex items-start gap-3 pl-1.5">
                        <Avatar
                          name={managerLabel(m, lang)}
                          src={m?.avatar_url}
                          seed={m?.id}
                          size={34}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="num text-[13px] font-semibold">{r.actual_time}</span>
                            <span className="truncate text-[13px] font-medium">{managerLabel(m, lang)}</span>
                            {!r.plan_id ? (
                              <Badge tone="steel">
                                <Zap className="h-2.5 w-2.5" />
                                {t('status.adhoc')}
                              </Badge>
                            ) : null}
                            {r.has_issue ? <Badge tone="bad">{t('status.issue')}</Badge> : null}
                          </div>
                          <p className="mt-1 truncate text-[12px] text-muted-foreground">{pathOf(r.actual_area_id)}</p>
                          <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug">{r.observation}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <ThemeBadges ids={r.theme_ids} themes={themes} max={2} />
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
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState icon={<HistoryIcon className="h-8 w-8" />} title={t('history.empty')} />
      )}

      <WalkDetailDialog record={detail} open={!!detail} onOpenChange={(o) => !o && setDetail(null)} />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'press focusable flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
