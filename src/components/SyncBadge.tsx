import { useSyncExternalStore } from 'react';
import { AlertTriangle, Check, CloudOff, RefreshCw, UploadCloud } from 'lucide-react';
import { ONLINE_MODE } from '@/lib/config';
import { getSyncStatus, subscribeSync, syncNow, type SyncState } from '@/lib/sync';
import { cn } from '@/lib/utils';

/**
 * ป้ายบอกสถานะการซิงก์ — สำคัญมากสำหรับงานหน้างาน
 * ผู้ใช้ต้องรู้ทันทีว่างานที่เพิ่งบันทึกขึ้นเซิร์ฟเวอร์แล้วหรือยัง
 * ไม่งั้นจะไม่กล้าปิดแอปหรือบันทึกซ้ำโดยไม่จำเป็น
 */

const LOOK: Record<SyncState, { icon: typeof Check; text: string; className: string }> = {
  idle: { icon: Check, text: 'ซิงก์แล้ว', className: 'text-ok' },
  syncing: { icon: RefreshCw, text: 'กำลังซิงก์', className: 'text-muted-foreground' },
  pending: { icon: UploadCloud, text: 'ยังไม่ซิงก์', className: 'text-warn' },
  offline: { icon: CloudOff, text: 'ออฟไลน์', className: 'text-warn' },
  error: { icon: AlertTriangle, text: 'ซิงก์ไม่สำเร็จ', className: 'text-bad' },
};

export function SyncBadge() {
  const status = useSyncExternalStore(subscribeSync, getSyncStatus, getSyncStatus);

  // โหมดในเครื่องล้วน (ยังไม่ได้ตั้ง VITE_API_URL) ไม่มีอะไรให้ซิงก์
  if (!ONLINE_MODE) return null;

  const look = LOOK[status.state];
  const Icon = look.icon;
  const canRetry = status.state === 'error' || status.state === 'offline' || status.pending > 0;

  const title = [
    `สถานะ: ${look.text}`,
    status.pending > 0 ? `ค้างอยู่ ${status.pending} รายการ` : null,
    status.lastSyncedAt ? `ซิงก์ล่าสุด ${new Date(status.lastSyncedAt).toLocaleString('th-TH')}` : null,
    status.lastError,
    canRetry ? 'แตะเพื่อลองใหม่' : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      disabled={status.state === 'syncing'}
      title={title}
      aria-label={title}
      className={cn(
        'focusable press flex h-8 items-center gap-1.5 rounded-md border bg-card px-2 text-[11px] font-medium',
        look.className,
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', status.state === 'syncing' && 'animate-spin')} />
      <span className="hidden sm:inline">{look.text}</span>
      {status.pending > 0 ? (
        <span className="num rounded bg-warn/15 px-1 text-[10px] tabular-nums">{status.pending}</span>
      ) : null}
    </button>
  );
}
