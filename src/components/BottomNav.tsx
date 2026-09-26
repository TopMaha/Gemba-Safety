import { NavLink, useLocation } from 'react-router-dom';
import {
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Grid2x2,
  History as HistoryIcon,
  KeyRound,
  LayoutDashboard,
  MoreHorizontal,
  Shield,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { useI18n, type TKey } from '@/lib/i18n';
import { useSession } from '@/hooks/useData';
import { cn } from '@/lib/utils';

interface Item {
  to: string;
  key: TKey;
  icon: ComponentType<{ className?: string }>;
}

/**
 * เมนูหลักของแอปความปลอดภัย
 * เรียงตามลำดับที่คนหน้างานใช้จริงในหนึ่งวัน: ดูแผน → เดินตรวจ → ตามงานแก้ไขของตัวเอง
 */
const PRIMARY: Item[] = [
  { to: '/plan', key: 'nav.plan', icon: ClipboardList },
  { to: '/findings', key: 'nav.findings', icon: ShieldAlert },
  { to: '/tasks', key: 'nav.tasks', icon: ClipboardCheck },
];

const DASHBOARD: Item = { to: '/dashboard', key: 'nav.dashboard', icon: LayoutDashboard };

const SECONDARY: Item[] = [
  { to: '/history', key: 'nav.history', icon: HistoryIcon },
  { to: '/calendar', key: 'nav.calendar', icon: CalendarDays },
  { to: '/coverage', key: 'nav.coverage', icon: Grid2x2 },
  { to: '/coaching', key: 'nav.coaching', icon: Users },
];

export function BottomNav() {
  const { t } = useI18n();
  const { session, admin } = useSession();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  const canDash = session?.dashboard_enabled || admin;
  const items = canDash ? [...PRIMARY, DASHBOARD] : PRIMARY;
  const secondary = admin
    ? [
        ...SECONDARY,
        { to: '/admin/roles', key: 'nav.roles' as TKey, icon: KeyRound },
        { to: '/admin/settings', key: 'nav.settings' as TKey, icon: Shield },
      ]
    : SECONDARY;
  const moreActive = secondary.some((s) => location.pathname.startsWith(s.to));

  return (
    <>
      {/* เดสก์ท็อป: เมนูบน */}
      <nav className="sticky top-14 z-30 hidden border-b bg-background/80 backdrop-blur md:block">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-5 py-1.5">
          {[...items, ...secondary].map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'press focusable flex items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium',
                  isActive ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {t(item.key)}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* มือถือ: เมนูล่าง */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur-md pb-safe md:hidden">
        <div className="mx-auto flex max-w-lg items-stretch">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'absolute inset-x-4 top-0 h-[2px] rounded-full transition-opacity',
                      isActive ? 'bg-accent opacity-100' : 'opacity-0',
                    )}
                  />
                  <item.icon className={cn('h-[18px] w-[18px]', isActive && 'text-accent')} />
                  <span className="truncate px-0.5">{t(item.key)}</span>
                </>
              )}
            </NavLink>
          ))}

          <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
            <DialogTrigger asChild>
              <button
                className={cn(
                  'relative flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium',
                  moreActive ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'absolute inset-x-4 top-0 h-[2px] rounded-full',
                    moreActive ? 'bg-accent' : 'opacity-0',
                  )}
                />
                <MoreHorizontal className={cn('h-[18px] w-[18px]', moreActive && 'text-accent')} />
                <span>{t('nav.more')}</span>
              </button>
            </DialogTrigger>
            <DialogContent title={t('nav.more')}>
              <div className="grid grid-cols-2 gap-2">
                {secondary.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className="press focusable flex flex-col gap-2 rounded-md border bg-card p-4 text-sm font-medium"
                  >
                    <item.icon className="h-5 w-5 text-accent" />
                    {t(item.key)}
                  </NavLink>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </nav>
    </>
  );
}
