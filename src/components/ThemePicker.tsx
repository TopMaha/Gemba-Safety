import { Check, Star } from 'lucide-react';
import { themeLabel, useI18n } from '@/lib/i18n';
import type { WalkTheme } from '@/lib/types';
import { cn } from '@/lib/utils';

/** เลือกหัวข้อการเดิน 1–3 หัวข้อ · หัวข้อที่ประกาศประจำสัปดาห์จะถูกไฮไลต์ (ไม่บังคับเลือก) */
export function ThemePicker({
  themes,
  value,
  onChange,
  recommended = [],
  max = 3,
}: {
  themes: WalkTheme[];
  value: string[];
  onChange: (ids: string[]) => void;
  recommended?: string[];
  max?: number;
}) {
  const { t, lang } = useI18n();
  const active = themes.filter((th) => th.is_active);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else if (value.length < max) onChange([...value, id]);
  };

  return (
    <div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {active.map((th) => {
          const selected = value.includes(th.id);
          const isRec = recommended.includes(th.id);
          const disabled = !selected && value.length >= max;
          const name = themeLabel(th, lang);
          const m = /^(\d+)[-.\s]\s*(.*)$/.exec(name);
          return (
            <button
              key={th.id}
              type="button"
              onClick={() => toggle(th.id)}
              disabled={disabled}
              className={cn(
                'press focusable relative flex items-center gap-2 rounded-md border px-3 py-2.5 text-left text-[13px]',
                selected ? 'border-accent bg-accent/12 font-medium' : 'bg-card hover:bg-muted',
                disabled && 'cursor-not-allowed opacity-40',
                isRec && !selected && 'border-accent/45',
              )}
            >
              <span
                className={cn(
                  'grid h-5 w-5 shrink-0 place-items-center rounded-[4px] border',
                  selected ? 'border-accent bg-accent text-accent-foreground' : 'border-border',
                )}
              >
                {selected ? <Check className="h-3.5 w-3.5" /> : m ? <span className="num text-[10px]">{m[1]}</span> : null}
              </span>
              <span className="min-w-0 flex-1 leading-snug">{m ? m[2] : name}</span>
              {isRec ? (
                <span className="flex shrink-0 items-center gap-0.5 font-mono text-[9px] uppercase tracking-wider text-accent">
                  <Star className="h-3 w-3 fill-accent" />
                  {t('focus.recommended')}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {t('plan.themeLimit')} · {value.length}/{max}
      </p>
    </div>
  );
}
