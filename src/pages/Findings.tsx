import { useMemo, useState } from 'react';
import { Plus, Search, ShieldAlert } from 'lucide-react';
import { PageTitle } from '@/components/ManagerShell';
import { FindingCard } from '@/components/safety/FindingBits';
import { FindingFormDialog } from '@/components/safety/FindingDialogs';
import { Button } from '@/components/ui/button';
import { StatBlock } from '@/components/ui/card';
import { Input } from '@/components/ui/field';
import { EmptyState, SkeletonList } from '@/components/ui/misc';
import { useAccess, useCoreData, useFindings, useSession } from '@/hooks/useData';
import { fullPath } from '@/lib/areaTree';
import { useI18n } from '@/lib/i18n';
import { OPEN_STATUSES, countFindings, isOverdue, sortFindings } from '@/lib/safety';
import { cn } from '@/lib/utils';

type Filter = 'open' | 'mine' | 'overdue' | 'waiting' | 'all';

/** ทะเบียนใบแจ้งปัญหาความปลอดภัยทั้งหมด — จุดเริ่มของงานแก้ไขทุกใบ */
export default function Findings() {
  const { t, lang } = useI18n();
  const { session } = useSession();
  const access = useAccess();
  const { areas, themes, managers, isLoading } = useCoreData();
  const { data: findings } = useFindings();

  const [filter, setFilter] = useState<Filter>('open');
  const [term, setTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const all = findings ?? [];

  // เห็นเฉพาะพื้นที่ที่อยู่ในขอบเขตของตัวเอง เว้นแต่ถือสิทธิ์ "เห็นทุกพื้นที่"
  const visible = useMemo(() => all.filter((f) => access.canSeeArea(f.area_id)), [all, access]);
  const counts = useMemo(() => countFindings(visible), [visible]);

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase();
    const byFilter = visible.filter((f) => {
      switch (filter) {
        case 'open':
          return OPEN_STATUSES.includes(f.status);
        case 'mine':
          return (
            f.assigned_manager_id === session?.manager_id ||
            f.assigned_supervisor_id === session?.manager_id ||
            f.reported_by === session?.manager_id
          );
        case 'overdue':
          return isOverdue(f);
        case 'waiting':
          return f.status === 'fixed';
        default:
          return true;
      }
    });

    const searched = q
      ? byFilter.filter((f) =>
          `${f.finding_no} ${f.title} ${f.description} ${fullPath(areas, f.area_id, lang)}`
            .toLowerCase()
            .includes(q),
        )
      : byFilter;

    return sortFindings(searched);
  }, [visible, filter, term, session, areas, lang]);

  return (
    <div>
      <PageTitle
        title={t('safety.title')}
        subtitle={t('safety.subtitle')}
        right={
          access.can('finding.create') ? (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-4 w-4" />
              {t('safety.newFinding')}
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatBlock label={t('safety.cOpen')} value={counts.open} tone={counts.open ? 'warn' : 'ok'} />
        <StatBlock label={t('safety.cOverdue')} value={counts.overdue} tone={counts.overdue ? 'bad' : 'ok'} />
        <StatBlock label={t('safety.cWaiting')} value={counts.waitingVerify} tone="accent" />
        <StatBlock label={t('safety.cClosed')} value={counts.closed} tone="ok" />
      </div>

      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={`${t('common.search')} — ${t('safety.findingNo')} · ${t('safety.problem')} · ${t('common.area')}`}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['open', t('safety.filterOpen')],
              ['mine', t('safety.filterMine')],
              ['overdue', t('safety.filterOverdue')],
              ['waiting', t('safety.filterWaiting')],
              ['all', t('safety.filterAll')],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'press focusable rounded-full border px-3 py-1.5 text-[12px] font-medium',
                filter === key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
          <span className="num ml-auto self-center text-[11px] text-muted-foreground">{rows.length}</span>
        </div>
      </div>

      {isLoading ? (
        <SkeletonList rows={5} />
      ) : rows.length ? (
        <div className="space-y-2">
          {rows.map((f) => (
            <FindingCard key={f.id} finding={f} areas={areas} managers={managers} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8" />}
          title={t('safety.noFindings')}
          hint={t('safety.noFindingsHint')}
          action={
            access.can('finding.create') ? (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" />
                {t('safety.newFinding')}
              </Button>
            ) : null
          }
        />
      )}

      <FindingFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        areas={areas}
        themes={themes}
        managers={managers}
      />
    </div>
  );
}
