import { Megaphone } from 'lucide-react';
import { ThemeBadges } from '@/components/ThemeBadges';
import { useI18n } from '@/lib/i18n';
import { formatRange } from '@/lib/time';
import type { WalkTheme, WeeklyFocus } from '@/lib/types';

/** ประกาศหัวข้อเน้นประจำสัปดาห์ — แสดงในหน้าวางแผน */
export function WeeklyFocusBanner({ focus, themes }: { focus?: WeeklyFocus | null; themes: WalkTheme[] }) {
  const { t, lang } = useI18n();
  if (!focus || !focus.is_active) return null;

  return (
    <div className="relative mb-4 overflow-hidden rounded-lg border border-accent/40 bg-accent/[0.07] animate-fade-up">
      <div className="brand-stripe absolute inset-y-0 left-0 w-[5px]" />
      <div className="py-3 pl-5 pr-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-accent" />
          <span className="label-micro text-accent">{t('focus.banner')}</span>
          <span className="num ml-auto text-[10px] text-muted-foreground">
            {formatRange(focus.week_start, focus.week_end, lang)}
          </span>
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed">
          {lang === 'th' ? focus.message_th : focus.message_en || focus.message_th}
        </p>
        <ThemeBadges ids={focus.theme_ids} themes={themes} highlight={focus.theme_ids} className="mt-2" />
      </div>
    </div>
  );
}
