import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, ImageIcon, MapPin, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { areaName } from '@/lib/areaTree';
import { managerLabel, useI18n } from '@/lib/i18n';
import { daysLeft, isDueSoon, isOverdue, severityMeta, statusMeta } from '@/lib/safety';
import { formatDate, todayISO } from '@/lib/time';
import type { Area, Manager, SafetyFinding, Severity, FindingStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

/** ป้ายระดับความรุนแรง — วิกฤตใช้พื้นทึบเพื่อให้สะดุดตาที่สุดในรายการ */
export function SeverityBadge({ severity, size }: { severity: Severity; size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  const meta = severityMeta(severity);
  return (
    <Badge tone={meta.tone} size={size}>
      {severity === 'critical' ? <AlertTriangle className="h-3 w-3" /> : null}
      {t(meta.key)}
    </Badge>
  );
}

export function StatusBadge({ status, size }: { status: FindingStatus; size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  const meta = statusMeta(status);
  return (
    <Badge tone={meta.tone} size={size}>
      {status === 'closed' ? <CheckCircle2 className="h-3 w-3" /> : null}
      {t(meta.key)}
    </Badge>
  );
}

/**
 * ป้ายวันครบกำหนด — เลยกำหนดเป็นสีแดง ใกล้ครบเป็นสีส้ม
 * ใบที่ปิดหรือยกเลิกแล้วไม่ต้องเตือนอะไร แสดงแค่วันเฉย ๆ
 */
export function DueBadge({ finding }: { finding: SafetyFinding }) {
  const { t, lang } = useI18n();
  const today = todayISO();
  const left = daysLeft(finding, today);

  if (isOverdue(finding, today)) {
    return (
      <Badge tone="bad">
        <Clock className="h-3 w-3" />
        {t('safety.overdueBy', { n: Math.abs(left) })}
      </Badge>
    );
  }
  if (isDueSoon(finding, today)) {
    return (
      <Badge tone="warn">
        <CalendarClock className="h-3 w-3" />
        {left === 0 ? t('safety.dueToday') : t('safety.daysLeft', { n: left })}
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <CalendarClock className="h-3 w-3" />
      {formatDate(finding.due_date, lang, { noYear: true })}
    </Badge>
  );
}

/** รายการหนึ่งบรรทัดในหน้าใบแจ้ง — แตะเพื่อเปิดรายละเอียด */
export function FindingCard({
  finding,
  areas,
  managers,
  className,
}: {
  finding: SafetyFinding;
  areas: Area[];
  managers: Manager[];
  className?: string;
}) {
  const { t, lang } = useI18n();
  const overdue = isOverdue(finding);

  const owner = managers.find(
    (m) => m.id === (finding.assigned_supervisor_id ?? finding.assigned_manager_id),
  );

  return (
    <Link
      to={`/findings/${finding.id}`}
      className={cn(
        'press focusable block rounded-lg border bg-card p-3 shadow-panel transition-colors hover:border-foreground/25',
        overdue && 'border-bad/40',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="num text-[11px] font-semibold text-muted-foreground">{finding.finding_no}</span>
            <SeverityBadge severity={finding.severity} />
            <StatusBadge status={finding.status} />
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm font-medium leading-snug">{finding.title}</p>
        </div>
        {finding.before_photos.length || finding.after_photos.length ? (
          <span className="flex shrink-0 items-center gap-1 rounded-md border bg-muted/60 px-1.5 py-1 text-[11px] text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5" />
            <span className="num">{finding.before_photos.length + finding.after_photos.length}</span>
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <MapPin className="h-3 w-3" />
          {areaName(areas, finding.area_id, lang)}
        </span>
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {owner ? managerLabel(owner, lang) : t('safety.unassigned')}
        </span>
        <span className="num ml-auto">{formatDate(finding.reported_at.slice(0, 10), lang, { noYear: true })}</span>
        <DueBadge finding={finding} />
      </div>
    </Link>
  );
}
