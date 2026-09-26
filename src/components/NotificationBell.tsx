import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/misc';
import { useMarkNotificationsRead, useNotifications, useSession } from '@/hooks/useData';
import { useI18n } from '@/lib/i18n';
import { formatDate } from '@/lib/time';
import { cn } from '@/lib/utils';

/**
 * กระดิ่งแจ้งเตือนบนหัวจอ — งานที่ถูกมอบหมายให้เราต้องเห็นทันทีที่เปิดแอป
 * ไม่ได้ส่งอีเมลหรือ LINE ในเวอร์ชันนี้ ทุกอย่างอยู่ในแอป
 */
export function NotificationBell() {
  const { t, lang } = useI18n();
  const { session } = useSession();
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();

  if (!session) return null;

  const rows = data ?? [];
  const unread = rows.filter((n) => !n.read_at).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="focusable press relative grid h-8 w-8 place-items-center rounded-md border bg-card"
          aria-label={t('safety.notifications')}
        >
          <Bell className={cn('h-4 w-4', unread ? 'text-accent' : 'text-muted-foreground')} />
          {unread ? (
            <span className="num absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(92vw,340px)] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-[13px] font-semibold">{t('safety.notifications')}</span>
          {unread ? (
            <Button size="sm" variant="ghost" onClick={() => markRead.mutate()} disabled={markRead.isPending}>
              {t('safety.markAllRead')}
            </Button>
          ) : null}
        </div>

        <div className="max-h-[60dvh] overflow-y-auto">
          {rows.length ? (
            rows.slice(0, 20).map((n) => (
              <Link
                key={n.id}
                to={n.finding_id ? `/findings/${n.finding_id}` : '/tasks'}
                className={cn(
                  'block border-b px-3 py-2.5 last:border-b-0 hover:bg-muted/60',
                  !n.read_at && 'bg-accent/[0.06]',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium leading-snug">{n.title}</span>
                  <span className="num shrink-0 text-[10px] text-muted-foreground">
                    {formatDate(n.created_at.slice(0, 10), lang, { noYear: true })}
                  </span>
                </div>
                {n.body ? <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{n.body}</p> : null}
              </Link>
            ))
          ) : (
            <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">{t('safety.noNotifications')}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
