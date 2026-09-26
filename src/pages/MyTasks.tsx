import { useMemo } from 'react';
import { BellRing, CheckCircle2, ClipboardCheck, Wrench } from 'lucide-react';
import { PageTitle } from '@/components/ManagerShell';
import { FindingCard } from '@/components/safety/FindingBits';
import { Button } from '@/components/ui/button';
import { StatBlock } from '@/components/ui/card';
import { EmptyState, SectionTitle, SkeletonList } from '@/components/ui/misc';
import {
  useCoreData, useFindings, useMarkNotificationsRead, useNotifications, useSession,
} from '@/hooks/useData';
import { useI18n } from '@/lib/i18n';
import { assignedTo, isOverdue, sortFindings, waitingMyVerify } from '@/lib/safety';
import { formatDate } from '@/lib/time';
import { cn } from '@/lib/utils';

/**
 * งานของฉัน — หน้าที่ผู้จัดการกับหัวหน้างานเปิดเป็นหน้าแรกของวัน
 * แบ่งสองกอง: งานที่ต้องลงมือแก้ กับใบที่ตัวเองแจ้งไว้แล้วรอตรวจรับ
 */
export default function MyTasks() {
  const { t, lang } = useI18n();
  const { session } = useSession();
  const { areas, managers, isLoading } = useCoreData();
  const { data: findings } = useFindings();
  const { data: notifications } = useNotifications();
  const markRead = useMarkNotificationsRead();

  const me = session?.manager_id;
  const all = findings ?? [];

  const toFix = useMemo(() => sortFindings(assignedTo(all, me)), [all, me]);
  const toVerify = useMemo(() => sortFindings(waitingMyVerify(all, me)), [all, me]);
  const overdue = useMemo(() => toFix.filter((f) => isOverdue(f)).length, [toFix]);
  const unread = (notifications ?? []).filter((n) => !n.read_at);

  return (
    <div>
      <PageTitle title={t('safety.tasksTitle')} subtitle={t('safety.tasksSubtitle')} />

      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatBlock label={t('safety.myFix')} value={toFix.length} tone={toFix.length ? 'warn' : 'ok'} />
        <StatBlock label={t('safety.cOverdue')} value={overdue} tone={overdue ? 'bad' : 'ok'} />
        <StatBlock label={t('safety.myVerify')} value={toVerify.length} tone="accent" />
      </div>

      {unread.length ? (
        <section className="mb-5">
          <SectionTitle
            right={
              <Button size="sm" variant="ghost" onClick={() => markRead.mutate()} disabled={markRead.isPending}>
                <CheckCircle2 className="h-4 w-4" />
                {t('safety.markAllRead')}
              </Button>
            }
          >
            <span className="flex items-center gap-1.5">
              <BellRing className="h-4 w-4 text-accent" />
              {t('safety.notifications')}
              <span className="num text-muted-foreground">({unread.length})</span>
            </span>
          </SectionTitle>
          <div className="space-y-1.5">
            {unread.slice(0, 6).map((n) => (
              <div key={n.id} className={cn('rounded-md border bg-card px-3 py-2', 'border-accent/35')}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium">{n.title}</span>
                  <span className="num shrink-0 text-[11px] text-muted-foreground">
                    {formatDate(n.created_at.slice(0, 10), lang, { noYear: true })}
                  </span>
                </div>
                {n.body ? <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{n.body}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {isLoading ? (
        <SkeletonList rows={4} />
      ) : (
        <div className="space-y-6">
          <section>
            <SectionTitle>
              <span className="flex items-center gap-1.5">
                <Wrench className="h-4 w-4 text-accent" />
                {t('safety.myFix')}
                <span className="num text-muted-foreground">({toFix.length})</span>
              </span>
            </SectionTitle>
            {toFix.length ? (
              <div className="space-y-2">
                {toFix.map((f) => (
                  <FindingCard key={f.id} finding={f} areas={areas} managers={managers} />
                ))}
              </div>
            ) : (
              <EmptyState icon={<ClipboardCheck className="h-7 w-7" />} title={t('safety.noTasks')} hint={t('safety.noTasksHint')} />
            )}
          </section>

          {toVerify.length ? (
            <section>
              <SectionTitle>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-ok" />
                  {t('safety.myVerify')}
                  <span className="num text-muted-foreground">({toVerify.length})</span>
                </span>
              </SectionTitle>
              <div className="space-y-2">
                {toVerify.map((f) => (
                  <FindingCard key={f.id} finding={f} areas={areas} managers={managers} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
