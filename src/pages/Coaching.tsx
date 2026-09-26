import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Users } from 'lucide-react';
import { PageTitle } from '@/components/ManagerShell';
import { Badge } from '@/components/ui/badge';
import { Avatar, BandBar, EmptyState, SkeletonList } from '@/components/ui/misc';
import { useCoreData } from '@/hooks/useData';
import { rankManagers } from '@/lib/calc';
import { managerLabel, useI18n } from '@/lib/i18n';
import { addDays, formatDate, todayISO } from '@/lib/time';
import { cn } from '@/lib/utils';

const RANGES = [7, 30, 90] as const;

export default function Coaching() {
  const { t, lang } = useI18n();
  const { activeManagers, plans, records, isLoading } = useCoreData();
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);

  const today = todayISO();
  const from = addDays(today, -days + 1);
  const rows = useMemo(
    () => rankManagers(activeManagers, plans, records, from, today),
    [activeManagers, plans, records, from, today],
  );

  return (
    <div>
      <PageTitle title={t('coaching.title')} subtitle={t('coaching.subtitle')} />

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
        <SkeletonList rows={6} />
      ) : rows.length ? (
        <div className="space-y-2">
          {rows.map((row) => (
            <Link
              key={row.manager.id}
              to={`/coaching/${row.manager.id}`}
              className="panel press focusable flex animate-fade-up items-center gap-3 p-3.5"
            >
              <span className="num w-6 shrink-0 text-center text-[13px] font-semibold text-muted-foreground">
                {row.rank}
              </span>
              <Avatar name={managerLabel(row.manager, lang)} src={row.manager.avatar_url} seed={row.manager.id} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium">{managerLabel(row.manager, lang)}</span>
                  {row.issues ? <Badge tone="bad">{row.issues}</Badge> : null}
                </div>
                <div className="num text-[11px] text-muted-foreground">
                  {row.manager.manager_code} · {row.manager.department}
                </div>
                <BandBar pct={row.adherence} className="mt-1.5 max-w-[220px]" />
              </div>
              <div className="shrink-0 text-right">
                <div className="num text-lg font-semibold leading-none">{row.walks}</div>
                <div className="text-[10px] text-muted-foreground">{t('coaching.walks')}</div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Users className="h-8 w-8" />} title={t('common.noData')} />
      )}
    </div>
  );
}
