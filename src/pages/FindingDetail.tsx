import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, MessageSquare, Pencil, PlayCircle,
  RotateCcw, ShieldAlert, UserPlus, Wrench, XCircle,
} from 'lucide-react';
import { PageTitle } from '@/components/ManagerShell';
import { PhotoGrid } from '@/components/PhotoUploader';
import { DueBadge, SeverityBadge, StatusBadge } from '@/components/safety/FindingBits';
import { AssignDialog, FindingFormDialog, FixDialog, NoteDialog } from '@/components/safety/FindingDialogs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Avatar, EmptyState, SectionTitle } from '@/components/ui/misc';
import { useAccess, useCoreData, useFinding, useFindingEvents, useSession } from '@/hooks/useData';
import { fullPath } from '@/lib/areaTree';
import { managerLabel, themeLabel, useI18n } from '@/lib/i18n';
import { findingAbilities } from '@/lib/permissions';
import { eventKey } from '@/lib/safety';
import { formatDate } from '@/lib/time';
import type { FindingEvent } from '@/lib/types';
import { cn } from '@/lib/utils';

type DialogKind = 'assign' | 'fix' | 'edit' | 'verify' | 'reject' | 'cancel' | 'reopen' | 'comment' | 'start' | null;

/** ใบแจ้งปัญหาหนึ่งใบ — รายละเอียด หลักฐานรูป ไทม์ไลน์ และปุ่มทำงานตามสิทธิ์ */
export default function FindingDetail() {
  const { findingId } = useParams<{ findingId: string }>();
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { session } = useSession();
  const access = useAccess();
  const { areas, themes, managers } = useCoreData();
  const finding = useFinding(findingId);
  const { data: events } = useFindingEvents(findingId);
  const [dialog, setDialog] = useState<DialogKind>(null);

  if (!finding) {
    return (
      <div>
        <PageTitle title={t('safety.title')} />
        <EmptyState
          icon={<ShieldAlert className="h-8 w-8" />}
          title={t('common.noData')}
          action={
            <Button size="sm" variant="outline" onClick={() => navigate('/findings')}>
              <ArrowLeft className="h-4 w-4" />
              {t('common.back')}
            </Button>
          }
        />
      </div>
    );
  }

  const can = findingAbilities(finding, access, session?.manager_id);
  const reporter = managers.find((m) => m.id === finding.reported_by);
  const manager = managers.find((m) => m.id === finding.assigned_manager_id);
  const supervisor = managers.find((m) => m.id === finding.assigned_supervisor_id);
  const verifier = managers.find((m) => m.id === finding.verified_by);
  const fixer = managers.find((m) => m.id === finding.fixed_by);
  const theme = themes.find((x) => x.id === finding.theme_id);

  return (
    <div className="pb-4">
      <Link
        to="/findings"
        className="focusable mb-3 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('safety.title')}
      </Link>

      <PageTitle
        title={finding.title}
        subtitle={`${finding.finding_no} · ${fullPath(areas, finding.area_id, lang)}`}
        right={
          can.edit ? (
            <Button size="sm" variant="outline" onClick={() => setDialog('edit')}>
              <Pencil className="h-4 w-4" />
              {t('common.edit')}
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <SeverityBadge severity={finding.severity} size="md" />
        <StatusBadge status={finding.status} size="md" />
        <DueBadge finding={finding} />
        {finding.record_id ? (
          <Link to="/history" className="focusable">
            <Badge tone="steel">{t('safety.fromWalk')}</Badge>
          </Link>
        ) : (
          <Badge tone="neutral">{t('safety.direct')}</Badge>
        )}
        {theme ? <Badge tone="neutral">{themeLabel(theme, lang)}</Badge> : null}
      </div>

      {/* ── ปุ่มทำงานตามวงจรงาน ── */}
      <div className="mb-4 flex flex-wrap gap-2">
        {can.assign ? (
          <Button size="sm" onClick={() => setDialog('assign')}>
            <UserPlus className="h-4 w-4" />
            {finding.assigned_manager_id || finding.assigned_supervisor_id ? t('safety.reassign') : t('safety.assign')}
          </Button>
        ) : null}
        {can.start ? (
          <Button size="sm" variant="outline" onClick={() => setDialog('start')}>
            <PlayCircle className="h-4 w-4" />
            {t('safety.start')}
          </Button>
        ) : null}
        {can.fix ? (
          <Button size="sm" variant="accent" onClick={() => setDialog('fix')}>
            <Wrench className="h-4 w-4" />
            {t('safety.fix')}
          </Button>
        ) : null}
        {can.verify ? (
          <Button size="sm" onClick={() => setDialog('verify')}>
            <CheckCircle2 className="h-4 w-4" />
            {t('safety.verify')}
          </Button>
        ) : null}
        {can.reject ? (
          <Button size="sm" variant="danger" onClick={() => setDialog('reject')}>
            <XCircle className="h-4 w-4" />
            {t('safety.reject')}
          </Button>
        ) : null}
        {can.comment ? (
          <Button size="sm" variant="ghost" onClick={() => setDialog('comment')}>
            <MessageSquare className="h-4 w-4" />
            {t('safety.comment')}
          </Button>
        ) : null}
        {can.cancel ? (
          <Button size="sm" variant="ghost" onClick={() => setDialog('cancel')}>
            <XCircle className="h-4 w-4" />
            {t('safety.cancelFinding')}
          </Button>
        ) : null}
        {can.reopen ? (
          <Button size="sm" variant="outline" onClick={() => setDialog('reopen')}>
            <RotateCcw className="h-4 w-4" />
            {t('safety.reopen')}
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          {/* ── ปัญหาที่พบ ── */}
          <Card>
            <CardHeader title={t('safety.description')} />
            <CardBody className="space-y-3">
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                {finding.description || <span className="text-muted-foreground">{t('common.noData')}</span>}
              </p>
              {finding.immediate_action ? (
                <div className="rounded-md border border-warn/35 bg-warn/10 px-3 py-2">
                  <div className="label-micro mb-1">{t('safety.immediateAction')}</div>
                  <p className="text-[13px]">{finding.immediate_action}</p>
                </div>
              ) : null}
              {finding.before_photos.length ? (
                <div>
                  <div className="label-micro mb-1.5">{t('safety.beforePhotos')}</div>
                  <PhotoGrid keys={finding.before_photos} />
                </div>
              ) : null}
            </CardBody>
          </Card>

          {/* ── การแก้ไข ── */}
          {finding.action_taken || finding.after_photos.length ? (
            <Card accent>
              <CardHeader
                title={t('safety.actionTaken')}
                hint={
                  fixer
                    ? `${managerLabel(fixer, lang)} · ${finding.fixed_at ? formatDate(finding.fixed_at.slice(0, 10), lang) : ''}`
                    : undefined
                }
              />
              <CardBody className="space-y-3">
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{finding.action_taken}</p>
                {finding.root_cause ? (
                  <div>
                    <div className="label-micro mb-1">{t('safety.rootCause')}</div>
                    <p className="text-[13px]">{finding.root_cause}</p>
                  </div>
                ) : null}
                {finding.after_photos.length ? (
                  <div>
                    <div className="label-micro mb-1.5">{t('safety.afterPhotos')}</div>
                    <PhotoGrid keys={finding.after_photos} />
                  </div>
                ) : null}
              </CardBody>
            </Card>
          ) : null}

          {/* ── ผลการตรวจรับ ── */}
          {finding.status === 'closed' ? (
            <Card>
              <CardHeader
                title={t('safety.verify')}
                hint={
                  verifier
                    ? `${managerLabel(verifier, lang)} · ${finding.verified_at ? formatDate(finding.verified_at.slice(0, 10), lang) : ''}`
                    : undefined
                }
              />
              <CardBody>
                <p className="flex items-start gap-2 text-[13px]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" />
                  {finding.verify_note || t('safety.stClosed')}
                </p>
              </CardBody>
            </Card>
          ) : null}

          {/* ── ไทม์ไลน์ ── */}
          <section>
            <SectionTitle>{t('safety.timeline')}</SectionTitle>
            <Timeline events={events ?? []} />
          </section>
        </div>

        {/* ── ผู้เกี่ยวข้อง ── */}
        <Card className="h-fit">
          <CardHeader title={t('safety.responsible')} />
          <CardBody className="space-y-3">
            <Person label={t('safety.reporter')} name={managerLabel(reporter, lang)} sub={formatDate(finding.reported_at.slice(0, 10), lang, { full: true })} />
            <Person label={t('safety.manager')} name={managerLabel(manager, lang)} sub={manager?.department} muted={!manager} />
            <Person label={t('safety.supervisor')} name={managerLabel(supervisor, lang)} sub={supervisor?.department} muted={!supervisor} />
            <div className="border-t pt-3">
              <div className="label-micro">{t('safety.dueDate')}</div>
              <div className="num mt-0.5 text-sm font-semibold">{formatDate(finding.due_date, lang, { full: true })}</div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* ── กล่องโต้ตอบ ── */}
      <FindingFormDialog
        open={dialog === 'edit'}
        onOpenChange={(o) => !o && setDialog(null)}
        finding={finding}
        areas={areas}
        themes={themes}
        managers={managers}
      />
      <AssignDialog
        open={dialog === 'assign'}
        onOpenChange={(o) => !o && setDialog(null)}
        finding={finding}
        managers={managers}
      />
      <FixDialog open={dialog === 'fix'} onOpenChange={(o) => !o && setDialog(null)} finding={finding} />
      {dialog && ['verify', 'reject', 'cancel', 'reopen', 'comment', 'start'].includes(dialog) ? (
        <NoteDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          finding={finding}
          action={dialog as 'verify' | 'reject' | 'cancel' | 'reopen' | 'comment' | 'start'}
        />
      ) : null}
    </div>
  );
}

function Person({
  label,
  name,
  sub,
  muted,
}: {
  label: string;
  name: string;
  sub?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={name} size={34} />
      <div className="min-w-0">
        <div className="label-micro">{label}</div>
        <div className={cn('truncate text-[13px] font-medium', muted && 'text-muted-foreground')}>{name}</div>
        {sub ? <div className="truncate text-[11px] text-muted-foreground">{sub}</div> : null}
      </div>
    </div>
  );
}

/** ไทม์ไลน์เรียงจากเก่าไปใหม่ — อ่านเป็นเรื่องราวว่าใบนี้เดินทางมาอย่างไร */
function Timeline({ events }: { events: FindingEvent[] }) {
  const { t, lang } = useI18n();

  if (!events.length) {
    return <p className="text-[13px] text-muted-foreground">{t('common.noData')}</p>;
  }

  return (
    <ol className="relative space-y-3 border-l pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={cn(
              'absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background',
              e.event_type === 'closed' || e.event_type === 'verified'
                ? 'bg-ok'
                : e.event_type === 'rejected' || e.event_type === 'cancelled'
                  ? 'bg-bad'
                  : e.event_type === 'created'
                    ? 'bg-accent'
                    : 'bg-muted-foreground/60',
            )}
          />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[13px] font-medium">{t(eventKey(e.event_type))}</span>
            <span className="text-[11px] text-muted-foreground">{e.actor_name}</span>
            <span className="num ml-auto text-[11px] text-muted-foreground">
              {formatDate(e.at.slice(0, 10), lang, { noYear: true })} {e.at.slice(11, 16)}
            </span>
          </div>
          {e.note ? <p className="mt-0.5 whitespace-pre-wrap text-[12px] text-muted-foreground">{e.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}
