import { ThemeTag } from '@/components/ui/badge';
import { themeLabel, useI18n } from '@/lib/i18n';
import type { WalkTheme } from '@/lib/types';
import { cn } from '@/lib/utils';

/** แสดงหัวข้อการเดินของแผน/บันทึก */
export function ThemeBadges({
  ids,
  themes,
  highlight = [],
  max,
  className,
}: {
  ids: string[];
  themes: WalkTheme[];
  highlight?: string[];
  max?: number;
  className?: string;
}) {
  const { lang } = useI18n();
  const list = max ? ids.slice(0, max) : ids;
  const rest = max ? ids.length - list.length : 0;

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {list.map((id) => {
        const th = themes.find((x) => x.id === id);
        if (!th) return null;
        return <ThemeTag key={id} name={themeLabel(th, lang)} highlight={highlight.includes(id)} />;
      })}
      {rest > 0 ? <span className="num text-[11px] text-muted-foreground">+{rest}</span> : null}
    </div>
  );
}
