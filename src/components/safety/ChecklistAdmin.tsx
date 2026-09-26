import { useEffect, useMemo, useRef, useState } from 'react';
import { ListChecks, Pencil, Plus, Search, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { EmptyState, SkeletonList, Switch, SwitchRow } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { SeverityBadge } from '@/components/safety/FindingBits';
import { SeveritySelect } from '@/components/safety/FindingDialogs';
import { useChecklist, useCoreData, useSaveChecklistItem } from '@/hooks/useData';
import { themeLabel, useI18n } from '@/lib/i18n';
import { nextSortOrder, suggestItemCode } from '@/lib/safety';
import type { SafetyChecklistItem, WalkTheme } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * ── แม่แบบเช็คลิสต์ (เฉพาะ Super Admin) ─────────────────────────────────
 *
 * อยู่ในหน้าตั้งค่าซึ่งต้องเข้าโหมดผู้ดูแลก่อน และ Worker กันการเขียน /api/checklist
 * ด้วยเซสชันผู้ดูแลอีกชั้น — ผู้ใช้ทั่วไปอ่านได้อย่างเดียว
 *
 * ไม่มีปุ่มลบโดยตั้งใจ: ผลตรวจเก่าอ้างข้อตรวจด้วย FK แบบ RESTRICT
 * จึงใช้ "ปิดใช้งาน" แทน ข้อที่ปิดจะไม่ขึ้นในหน้าบันทึกการเดินอีก แต่ประวัติยังอยู่ครบ
 */
export function ChecklistAdminTab() {
  const { t, lang } = useI18n();
  const { themes } = useCoreData();
  const { data: items = [], isLoading } = useChecklist();
  const save = useSaveChecklistItem();

  const [themeFilter, setThemeFilter] = useState('all');
  const [term, setTerm] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; item: SafetyChecklistItem | null; themeId?: string }>({
    open: false,
    item: null,
  });

  const q = term.trim().toLowerCase();
  const groups = useMemo(
    () =>
      themes
        .filter((th) => themeFilter === 'all' || th.id === themeFilter)
        .map((theme) => ({
          theme,
          list: items
            .filter((i) => i.theme_id === theme.id)
            .filter((i) => !q || `${i.item_code} ${i.question} ${i.question_en ?? ''}`.toLowerCase().includes(q))
            .sort((a, b) => a.sort_order - b.sort_order || a.item_code.localeCompare(b.item_code)),
        }))
        // ตอนค้นหาซ่อนหมวดที่ไม่มีข้อตรง · ตอนไม่ค้นหาแสดงหมวดว่างด้วย เพื่อให้กดเพิ่มข้อแรกได้
        .filter((g) => !q || g.list.length > 0),
    [themes, items, themeFilter, q],
  );

  const activeCount = items.filter((i) => i.is_active).length;
  const openNew = (themeId?: string) =>
    setDialog({ open: true, item: null, themeId: themeId ?? (themeFilter !== 'all' ? themeFilter : undefined) });

  return (
    <div className="space-y-3">
      {/* หัวส่วน: บอกว่าเป็นงานของใคร และตัวเลขรวม */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start gap-3 p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-accent/12 text-accent">
            <ListChecks className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[15px] font-semibold">{t('checklistAdmin.title')}</h2>
              <Badge tone="accent">
                <ShieldCheck className="h-3 w-3" />
                {t('checklistAdmin.superAdmin')}
              </Badge>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{t('checklistAdmin.hint')}</p>
            <p className="num mt-1.5 text-[11px] text-muted-foreground">
              {t('checklistAdmin.count', { n: activeCount, off: items.length - activeCount })} ·{' '}
              {t('checklistAdmin.manageThemes')}
            </p>
          </div>
        </div>
      </Card>

      {/* แถบเครื่องมือ */}
      <div className="grid gap-2 sm:grid-cols-[1fr_minmax(0,240px)_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t('common.search')}
            aria-label={t('common.search')}
            className="pl-9"
          />
        </div>
        <Select value={themeFilter} onChange={(e) => setThemeFilter(e.target.value)} aria-label={t('checklistAdmin.category')}>
          <option value="all">{t('checklistAdmin.allThemes')}</option>
          {themes.map((th) => (
            <option key={th.id} value={th.id}>
              {themeLabel(th, lang)}
            </option>
          ))}
        </Select>
        <Button variant="accent" className="h-11" onClick={() => openNew()}>
          <Plus className="h-4 w-4" />
          {t('checklistAdmin.newItem')}
        </Button>
      </div>

      {isLoading ? (
        <SkeletonList rows={4} />
      ) : groups.length === 0 ? (
        <EmptyState icon={<Search className="h-8 w-8" />} title={t('checklistAdmin.noMatch')} />
      ) : (
        <div className="space-y-3">
          {groups.map(({ theme, list }) => (
            <ThemeGroup
              key={theme.id}
              theme={theme}
              list={list}
              onAdd={() => openNew(theme.id)}
              onEdit={(item) => setDialog({ open: true, item })}
              onToggle={(item, v) => save.mutateAsync({ id: item.id, is_active: v })}
            />
          ))}
        </div>
      )}

      <ChecklistItemDialog
        open={dialog.open}
        item={dialog.item}
        themeId={dialog.themeId}
        themes={themes}
        items={items}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />
    </div>
  );
}

function ThemeGroup({
  theme,
  list,
  onAdd,
  onEdit,
  onToggle,
}: {
  theme: WalkTheme;
  list: SafetyChecklistItem[];
  onAdd: () => void;
  onEdit: (item: SafetyChecklistItem) => void;
  onToggle: (item: SafetyChecklistItem, active: boolean) => void;
}) {
  const { t, lang } = useI18n();
  const name = themeLabel(theme, lang);
  const m = /^(\d+)[-.\s]\s*(.*)$/.exec(name);

  return (
    <Card className={cn('overflow-hidden', !theme.is_active && 'opacity-60')}>
      <div className="flex items-center gap-2.5 border-b bg-muted/40 px-3 py-2">
        {m ? (
          <span className="num grid h-7 min-w-[28px] place-items-center rounded-[5px] bg-accent px-1 text-[11px] font-semibold text-accent-foreground">
            {m[1]}
          </span>
        ) : null}
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold">{m ? m[2] : name}</h3>
        {!theme.is_active ? <Badge>{t('common.inactive')}</Badge> : null}
        <span className="num shrink-0 text-[11px] text-muted-foreground">
          {t('checklistAdmin.itemsInTheme', { n: list.length })}
        </span>
        <Button variant="ghost" size="iconSm" onClick={onAdd} aria-label={t('checklistAdmin.addToTheme')} title={t('checklistAdmin.addToTheme')}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {list.length ? (
        <ul className="divide-y">
          {list.map((item) => (
            <li key={item.id} className={cn('flex items-start gap-3 px-3 py-2.5', !item.is_active && 'bg-muted/30')}>
              <span className={cn('num w-[58px] shrink-0 pt-0.5 text-[11px] font-semibold', item.is_active ? 'text-accent' : 'text-muted-foreground')}>
                {item.item_code || '—'}
              </span>
              <div className={cn('min-w-0 flex-1', !item.is_active && 'opacity-60')}>
                <p className="text-[13px] leading-snug">{lang === 'en' ? item.question_en || item.question : item.question}</p>
                {lang === 'th' && item.question_en ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{item.question_en}</p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <SeverityBadge severity={item.default_severity} />
                  {!item.is_active ? <Badge>{t('checklistAdmin.inactive')}</Badge> : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Switch
                  checked={item.is_active}
                  onCheckedChange={(v) => onToggle(item, v)}
                  aria-label={`${t('checklistAdmin.active')} ${item.item_code}`}
                />
                <Button variant="ghost" size="iconSm" onClick={() => onEdit(item)} aria-label={`${t('common.edit')} ${item.item_code}`}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-4">
          <p className="text-[12px] text-muted-foreground">{t('checklistAdmin.emptyTheme')}</p>
          <Button variant="outline" size="sm" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            {t('checklistAdmin.addToTheme')}
          </Button>
        </div>
      )}
    </Card>
  );
}

type Form = Pick<
  SafetyChecklistItem,
  'theme_id' | 'item_code' | 'question' | 'question_en' | 'default_severity' | 'sort_order' | 'is_active'
>;

function ChecklistItemDialog({
  open,
  item,
  themeId,
  themes,
  items,
  onOpenChange,
}: {
  open: boolean;
  item: SafetyChecklistItem | null;
  themeId?: string;
  themes: WalkTheme[];
  items: SafetyChecklistItem[];
  onOpenChange: (open: boolean) => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const save = useSaveChecklistItem();
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const [form, setForm] = useState<Form>(() => blankForm(items, themeId));
  const [errors, setErrors] = useState<{ theme?: string; question?: string }>({});
  /** ผู้ใช้พิมพ์รหัสเองแล้วหรือยัง — ถ้ายัง เปลี่ยนหมวดแล้วเสนอรหัสใหม่ให้ตามหมวด */
  const [codeTouched, setCodeTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      item
        ? {
            theme_id: item.theme_id,
            item_code: item.item_code,
            question: item.question,
            question_en: item.question_en ?? '',
            default_severity: item.default_severity,
            sort_order: item.sort_order,
            is_active: item.is_active,
          }
        : blankForm(items, themeId),
    );
    setErrors({});
    setCodeTouched(!!item);
    // เปิดกล่องใหม่เท่านั้นที่ต้องรีเซ็ต — items เปลี่ยนระหว่างกรอก (ซิงก์เบื้องหลัง) ต้องไม่ล้างสิ่งที่พิมพ์ไว้
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, themeId]);

  const pickTheme = (id: string) => {
    setErrors((e) => ({ ...e, theme: undefined }));
    setForm((f) => ({
      ...f,
      theme_id: id,
      ...(item || codeTouched ? {} : { item_code: suggestItemCode(items, id), sort_order: nextSortOrder(items, id) }),
    }));
  };

  // หมวดที่ปิดไปแล้วไม่ให้เลือกใหม่ ยกเว้นหมวดเดิมของข้อที่กำลังแก้
  const themeOptions = themes.filter((th) => th.is_active || th.id === form.theme_id);

  const submit = async () => {
    const next: typeof errors = {};
    if (!form.theme_id) next.theme = t('checklistAdmin.needTheme');
    if (!form.question.trim()) next.question = t('checklistAdmin.needQuestion');
    setErrors(next);
    if (next.question) questionRef.current?.focus();
    if (next.theme || next.question) return;

    await save.mutateAsync({
      ...form,
      id: item?.id,
      item_code: form.item_code.trim(),
      question: form.question.trim(),
      question_en: form.question_en?.trim() ?? '',
      sort_order: Number.isFinite(form.sort_order) ? form.sort_order : 999,
    });
    toast(t('checklistAdmin.saved'));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={item ? t('checklistAdmin.editItem') : t('checklistAdmin.newItem')}
        description={item?.item_code || undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="accent" onClick={submit} disabled={save.isPending}>
              {save.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('checklistAdmin.category')} required error={errors.theme}>
            <Select value={form.theme_id} onChange={(e) => pickTheme(e.target.value)} aria-invalid={!!errors.theme}>
              <option value="">—</option>
              {themeOptions.map((th) => (
                <option key={th.id} value={th.id}>
                  {themeLabel(th, lang)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={t('checklistAdmin.question')} required error={errors.question}>
            <Textarea
              ref={questionRef}
              value={form.question}
              onChange={(e) => {
                setForm((f) => ({ ...f, question: e.target.value }));
                if (errors.question) setErrors((x) => ({ ...x, question: undefined }));
              }}
              placeholder={t('checklistAdmin.questionPlaceholder')}
              aria-invalid={!!errors.question}
              className="min-h-[84px]"
              maxLength={500}
            />
          </Field>

          <Field label={t('checklistAdmin.questionEn')} hint={t('common.optional')}>
            <Textarea
              value={form.question_en ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, question_en: e.target.value }))}
              className="min-h-[64px]"
              maxLength={500}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('checklistAdmin.code')} hint={t('checklistAdmin.codeHint')}>
              <Input
                value={form.item_code}
                onChange={(e) => (setCodeTouched(true), setForm((f) => ({ ...f, item_code: e.target.value.toUpperCase() })))}
                className="num uppercase"
                maxLength={30}
                autoCapitalize="characters"
                spellCheck={false}
              />
            </Field>
            <Field label={t('checklistAdmin.sortOrder')} hint={t('checklistAdmin.sortHint')}>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={9999}
                value={Number.isFinite(form.sort_order) ? form.sort_order : ''}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.valueAsNumber }))}
                className="num"
              />
            </Field>
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline gap-1.5">
              <span className="text-[13px] font-medium">{t('checklistAdmin.defaultSeverity')}</span>
              <span className="text-[11px] text-muted-foreground">{t('checklistAdmin.defaultSeverityHint')}</span>
            </div>
            <SeveritySelect value={form.default_severity} onChange={(s) => setForm((f) => ({ ...f, default_severity: s }))} />
          </div>

          <div className="rounded-md border p-3">
            <SwitchRow
              label={t('checklistAdmin.active')}
              hint={t('checklistAdmin.activeHint')}
              checked={form.is_active}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function blankForm(items: SafetyChecklistItem[], themeId?: string): Form {
  const theme = themeId ?? '';
  return {
    theme_id: theme,
    item_code: theme ? suggestItemCode(items, theme) : '',
    question: '',
    question_en: '',
    default_severity: 'medium',
    sort_order: theme ? nextSortOrder(items, theme) : 10,
    is_active: true,
  };
}
