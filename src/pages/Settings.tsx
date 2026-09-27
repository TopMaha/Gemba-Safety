import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Database, Download, Layers, MapPin, Megaphone, Pencil, Plus, RefreshCw, Trash2, Upload, Users } from 'lucide-react';
import { PageTitle } from '@/components/ManagerShell';
import { ChecklistAdminTab } from '@/components/safety/ChecklistAdmin';
import { ThemePicker } from '@/components/ThemePicker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Avatar, SkeletonList, SwitchRow, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import {
  useAdminGuard,
  useAreas,
  useCoreData,
  useFocusList,
  useLoginHistory,
  useSaveArea,
  useSaveFocus,
  useSaveManager,
  useSaveSettings,
  useSaveTheme,
  useSession,
  useSettings,
} from '@/hooks/useData';
import { clearTransactions, exportDb, resetDb } from '@/lib/db';
import { descendantIds } from '@/lib/areaTree';
import { downloadText } from '@/lib/csv';
import { areaLabelOf, managerLabel, themeLabel, useI18n } from '@/lib/i18n';
import { savePhoto } from '@/lib/photos';
import { endOfWeek, formatRange, startOfWeek, todayISO } from '@/lib/time';
import type { Area, Manager, WalkTheme, WeeklyFocus } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function Settings() {
  const { t } = useI18n();
  const { admin } = useSession();
  // ต้องเรียกก่อนบรรทัดที่ return ออกไป ไม่งั้นผิดกฎลำดับ hook
  // ถ้าเซิร์ฟเวอร์ปฏิเสธโทเคน ตัว hook จะล้างเซสชันทิ้ง แล้วบรรทัดล่างเด้งกลับหน้า /admin เอง
  useAdminGuard();
  if (!admin) return <Navigate to="/admin" replace />;

  return (
    <div>
      <PageTitle title={t('nav.settings')} subtitle={t('admin.title')} />
      <Tabs defaultValue="users">
        <div className="scroll-x no-scrollbar -mx-3 mb-4 px-3">
          <TabsList>
            <TabsTrigger value="users">{t('admin.tabUsers')}</TabsTrigger>
            <TabsTrigger value="areas">{t('admin.tabAreas')}</TabsTrigger>
            <TabsTrigger value="themes">{t('admin.tabThemes')}</TabsTrigger>
            <TabsTrigger value="checklist">{t('admin.tabChecklist')}</TabsTrigger>
            <TabsTrigger value="focus">{t('admin.tabFocus')}</TabsTrigger>
            <TabsTrigger value="system">{t('admin.tabSystem')}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="areas"><AreasTab /></TabsContent>
        <TabsContent value="themes"><ThemesTab /></TabsContent>
        <TabsContent value="checklist"><ChecklistAdminTab /></TabsContent>
        <TabsContent value="focus"><FocusTab /></TabsContent>
        <TabsContent value="system"><SystemTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/** ── ผู้ใช้งาน ─────────────────────────────────────────── */
function UsersTab() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { managers, isLoading } = useCoreData();
  const saveManager = useSaveManager();
  const [editing, setEditing] = useState<Manager | null>(null);
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  // ทะเบียนมีเกือบสี่ร้อยคนแต่ผู้เดินตรวจมีไม่กี่คน (Super Admin เลือกเองรายคน)
  // ถ้าไม่มีตัวกรองนี้ ผู้ดูแลจะหา "ใครต้องเดินบ้าง" ไม่เจอในกองรายชื่อ
  const [access, setAccess] = useState<'all' | 'yes' | 'no'>('all');

  const rows = managers.filter((m) => {
    if (access === 'yes' && !m.can_login) return false;
    if (access === 'no' && m.can_login) return false;
    return `${m.manager_code} ${m.full_name} ${m.full_name_en ?? ''} ${m.department}`
      .toLowerCase()
      .includes(term.toLowerCase());
  });

  const granted = managers.filter((m) => m.can_login).length;

  const quickToggle = async (m: Manager, patch: Partial<Manager>) => {
    await saveManager.mutateAsync({ id: m.id, ...patch });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={t('common.search')} />
        <Button variant="accent" onClick={() => (setEditing(null), setOpen(true))}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t('admin.newUser')}</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex h-9 items-center rounded-md border bg-card p-0.5">
          {([
            ['all', t('admin.filterAll')],
            ['yes', t('admin.filterCanLogin')],
            ['no', t('admin.filterNoLogin')],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setAccess(value)}
              className={cn(
                'press focusable h-8 rounded-[4px] px-3 text-[12px] font-medium',
                access === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="num text-[11px] text-muted-foreground">
          {t('admin.accessCount', { n: granted, total: managers.length })}
        </p>
      </div>

      {isLoading ? (
        <SkeletonList rows={5} />
      ) : (
        <div className="space-y-2">
          {rows.map((m) => (
            <Card key={m.id} className="p-3">
              <div className="flex items-center gap-3">
                <Avatar name={managerLabel(m, lang)} src={m.avatar_url} seed={m.id} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium">{managerLabel(m, lang)}</span>
                    {!m.is_active ? <Badge tone="bad">{t('common.inactive')}</Badge> : null}
                    {m.is_active && m.can_login ? <Badge tone="accent">{t('admin.walkerBadge')}</Badge> : null}
                  </div>
                  <div className="num text-[11px] text-muted-foreground">
                    {m.manager_code} · {m.department}
                    {m.position ? ` · ${m.position}` : ''}
                  </div>
                </div>
                <Button variant="ghost" size="iconSm" onClick={() => (setEditing(m), setOpen(true))}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 grid gap-2 border-t pt-2 sm:grid-cols-3 sm:gap-3">
                <label className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium">{t('admin.loginAccess')}</span>
                  <Switch checked={m.can_login} onCheckedChange={(v) => quickToggle(m, { can_login: v })} />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-[12px]">{t('admin.activeUser')}</span>
                  <Switch checked={m.is_active} onCheckedChange={(v) => quickToggle(m, { is_active: v })} />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-[12px]">{t('admin.dashboardAccess')}</span>
                  <Switch checked={m.dashboard_enabled} onCheckedChange={(v) => quickToggle(m, { dashboard_enabled: v })} />
                </label>
              </div>
            </Card>
          ))}
        </div>
      )}

      <UserDialog open={open} onOpenChange={setOpen} manager={editing} onSaved={() => toast(t('admin.settingsSaved'))} />
    </div>
  );
}

function UserDialog({
  open,
  onOpenChange,
  manager,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  manager: Manager | null;
  onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const saveManager = useSaveManager();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Partial<Manager>>({});

  useEffect(() => {
    setForm(
      manager ?? {
        manager_code: '',
        full_name: '',
        department: '',
        is_active: true,
        dashboard_enabled: true,
        // คนใหม่ยังล็อกอินไม่ได้จนกว่าจะเปิดสิทธิ์ให้ — ต้องเป็นการตัดสินใจที่ตั้งใจ
        can_login: false,
      },
    );
  }, [manager, open]);

  const upload = async (file?: File) => {
    if (!file) return;
    const key = await savePhoto(file);
    setForm((f) => ({ ...f, avatar_url: key }));
  };

  const submit = async () => {
    if (!form.manager_code || !form.full_name) return;
    await saveManager.mutateAsync({ ...form, id: manager?.id });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={manager ? t('common.edit') : t('admin.newUser')}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button variant="accent" onClick={submit} disabled={saveManager.isPending}>{t('common.save')}</Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="flex items-center gap-3">
            <Avatar name={form.full_name ?? '?'} src={form.avatar_url} seed={manager?.id ?? 'new'} size={56} />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              {t('admin.avatar')}
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('admin.code')} required>
              <Input value={form.manager_code ?? ''} onChange={(e) => setForm((f) => ({ ...f, manager_code: e.target.value }))} />
            </Field>
            <Field label={t('common.department')}>
              <Input value={form.department ?? ''} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
            </Field>
          </div>
          <Field label={t('admin.fullName')} required>
            <Input value={form.full_name ?? ''} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
          </Field>
          <Field label={t('admin.nameEn')}>
            <Input value={form.full_name_en ?? ''} onChange={(e) => setForm((f) => ({ ...f, full_name_en: e.target.value }))} />
          </Field>
          <Field label={t('admin.position')}>
            <Input value={form.position ?? ''} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} />
          </Field>

          <div className="rounded-md border p-3">
            <SwitchRow
              label={t('admin.loginAccess')}
              hint={t('admin.loginAccessHint')}
              checked={form.can_login ?? false}
              onCheckedChange={(v) => setForm((f) => ({ ...f, can_login: v }))}
            />
            <SwitchRow
              label={t('admin.activeUser')}
              checked={form.is_active ?? true}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            />
            <SwitchRow
              label={t('admin.dashboardAccess')}
              hint="dashboard_enabled"
              checked={form.dashboard_enabled ?? true}
              onCheckedChange={(v) => setForm((f) => ({ ...f, dashboard_enabled: v }))}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** ── พื้นที่ ───────────────────────────────────────────── */
function AreasTab() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { data: areas = [], isLoading } = useAreas();
  const saveArea = useSaveArea();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Area | null>(null);

  const ordered = useMemo(() => {
    const out: { area: Area; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      areas
        .filter((a) => a.parent_id === parent)
        .sort((a, b) => areaLabelOf(a, lang).localeCompare(areaLabelOf(b, lang), 'th'))
        .forEach((a) => {
          out.push({ area: a, depth });
          walk(a.id, depth + 1);
        });
    };
    walk(null, 0);
    return out;
  }, [areas, lang]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="accent" onClick={() => (setEditing(null), setOpen(true))}>
          <Plus className="h-4 w-4" />
          {t('admin.newArea')}
        </Button>
      </div>

      {isLoading ? (
        <SkeletonList rows={6} />
      ) : (
        <Card>
          <CardBody className="space-y-1 p-2">
            {ordered.map(({ area, depth }) => (
              <div
                key={area.id}
                className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted', !area.is_active && 'opacity-50')}
                style={{ paddingLeft: 8 + depth * 18 }}
              >
                {depth > 0 ? <span className="h-3 w-3 border-b border-l border-border" /> : <MapPin className="h-3.5 w-3.5 text-accent" />}
                <span className="min-w-0 flex-1 truncate text-[13px]">{areaLabelOf(area, lang)}</span>
                <span className="num hidden text-[10px] text-muted-foreground sm:block">{area.department}</span>
                <Switch
                  checked={area.is_active}
                  onCheckedChange={(v) => saveArea.mutateAsync({ id: area.id, is_active: v })}
                  className="scale-90"
                />
                <Button variant="ghost" size="iconSm" onClick={() => (setEditing(area), setOpen(true))}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <AreaDialog
        open={open}
        onOpenChange={setOpen}
        area={editing}
        areas={areas}
        onSaved={() => toast(t('admin.settingsSaved'))}
      />
    </div>
  );
}

function AreaDialog({
  open,
  onOpenChange,
  area,
  areas,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  area: Area | null;
  areas: Area[];
  onSaved: () => void;
}) {
  const { t, lang } = useI18n();
  const saveArea = useSaveArea();
  const [form, setForm] = useState<Partial<Area>>({});

  useEffect(() => {
    setForm(area ?? { area_name: '', parent_id: null, department: '', is_active: true });
  }, [area, open]);

  const forbidden = area ? new Set(descendantIds(areas, area.id)) : new Set<string>();

  const submit = async () => {
    if (!form.area_name) return;
    await saveArea.mutateAsync({ ...form, id: area?.id });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={area ? t('common.edit') : t('admin.newArea')}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button variant="accent" onClick={submit}>{t('common.save')}</Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Field label={t('admin.areaName')} required>
            <Input value={form.area_name ?? ''} onChange={(e) => setForm((f) => ({ ...f, area_name: e.target.value }))} />
          </Field>
          <Field label={`${t('admin.areaName')} (EN)`}>
            <Input value={form.area_name_en ?? ''} onChange={(e) => setForm((f) => ({ ...f, area_name_en: e.target.value }))} />
          </Field>
          <Field label={t('admin.parentArea')}>
            <Select
              value={form.parent_id ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value || null }))}
            >
              <option value="">{t('admin.rootArea')}</option>
              {areas
                .filter((a) => !forbidden.has(a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {areaLabelOf(a, lang)}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label={t('common.department')}>
            <Input value={form.department ?? ''} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
          </Field>
          <div className="rounded-md border p-3">
            <SwitchRow
              label={t('common.active')}
              checked={form.is_active ?? true}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** ── หัวข้อการเดิน ─────────────────────────────────────── */
function ThemesTab() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { themes, isLoading } = useCoreData();
  const saveTheme = useSaveTheme();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WalkTheme | null>(null);
  const [form, setForm] = useState<Partial<WalkTheme>>({});

  useEffect(() => {
    setForm(editing ?? { theme_name: '', theme_name_en: '', is_active: true });
  }, [editing, open]);

  const submit = async () => {
    if (!form.theme_name) return;
    await saveTheme.mutateAsync({ ...form, id: editing?.id });
    toast(t('admin.settingsSaved'));
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="accent" onClick={() => (setEditing(null), setOpen(true))}>
          <Plus className="h-4 w-4" />
          {t('admin.newTheme')}
        </Button>
      </div>

      {isLoading ? (
        <SkeletonList rows={5} />
      ) : (
        <Card>
          <CardBody className="space-y-1 p-2">
            {themes.map((th) => (
              <div key={th.id} className={cn('flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted', !th.is_active && 'opacity-50')}>
                <Layers className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate text-[13px]">{themeLabel(th, lang)}</span>
                <Switch
                  checked={th.is_active}
                  onCheckedChange={(v) => saveTheme.mutateAsync({ id: th.id, is_active: v })}
                  className="scale-90"
                />
                <Button variant="ghost" size="iconSm" onClick={() => (setEditing(th), setOpen(true))}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={editing ? t('common.edit') : t('admin.newTheme')}
          footer={
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              <Button variant="accent" onClick={submit}>{t('common.save')}</Button>
            </>
          }
        >
          <div className="space-y-3.5">
            <Field label={t('admin.themeName')} required hint="เช่น 3-Safety: รถยก/MHE">
              <Input value={form.theme_name ?? ''} onChange={(e) => setForm((f) => ({ ...f, theme_name: e.target.value }))} />
            </Field>
            <Field label={`${t('admin.themeName')} (EN)`}>
              <Input value={form.theme_name_en ?? ''} onChange={(e) => setForm((f) => ({ ...f, theme_name_en: e.target.value }))} />
            </Field>
            <div className="rounded-md border p-3">
              <SwitchRow
                label={t('common.active')}
                checked={form.is_active ?? true}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** ── ประกาศประจำสัปดาห์ ───────────────────────────────── */
function FocusTab() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { themes } = useCoreData();
  const { data: list = [], isLoading } = useFocusList();
  const saveFocus = useSaveFocus();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WeeklyFocus | null>(null);
  const [form, setForm] = useState<Partial<WeeklyFocus>>({});

  useEffect(() => {
    setForm(
      editing ?? {
        week_start: startOfWeek(todayISO()),
        week_end: endOfWeek(todayISO()),
        theme_ids: [],
        message_th: '',
        message_en: '',
        is_active: true,
      },
    );
  }, [editing, open]);

  const submit = async () => {
    await saveFocus.mutateAsync({ ...form, id: editing?.id });
    toast(t('admin.settingsSaved'));
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="accent" onClick={() => (setEditing(null), setOpen(true))}>
          <Plus className="h-4 w-4" />
          {t('admin.newFocus')}
        </Button>
      </div>

      {isLoading ? (
        <SkeletonList rows={3} />
      ) : (
        <div className="space-y-2">
          {list.map((f) => (
            <Card key={f.id} className="p-3.5">
              <div className="flex items-start gap-3">
                <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="num text-[12px] font-semibold">{formatRange(f.week_start, f.week_end, lang)}</span>
                    <Badge tone={f.is_active ? 'ok' : 'neutral'}>{f.is_active ? t('common.active') : t('common.inactive')}</Badge>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed">{lang === 'th' ? f.message_th : f.message_en || f.message_th}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {f.theme_ids.map((id) => (
                      <Badge key={id} tone="accent" className="normal-case tracking-normal">
                        {themeLabel(themes.find((x) => x.id === id), lang)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button variant="ghost" size="iconSm" onClick={() => (setEditing(f), setOpen(true))}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title={editing ? t('common.edit') : t('admin.newFocus')}
          footer={
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              <Button variant="accent" onClick={submit}>{t('common.save')}</Button>
            </>
          }
        >
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('admin.weekStart')}>
                <Input
                  type="date"
                  value={form.week_start ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, week_start: e.target.value, week_end: endOfWeek(e.target.value) }))}
                />
              </Field>
              <Field label={t('admin.weekEnd')}>
                <Input type="date" value={form.week_end ?? ''} onChange={(e) => setForm((f) => ({ ...f, week_end: e.target.value }))} />
              </Field>
            </div>
            <Field label={t('admin.focusThemes')}>
              <ThemePicker
                themes={themes}
                value={form.theme_ids ?? []}
                onChange={(ids) => setForm((f) => ({ ...f, theme_ids: ids }))}
                max={4}
              />
            </Field>
            <Field label={t('admin.messageTh')}>
              <Textarea
                className="min-h-[80px]"
                value={form.message_th ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, message_th: e.target.value }))}
              />
            </Field>
            <Field label={t('admin.messageEn')}>
              <Textarea
                className="min-h-[80px]"
                value={form.message_en ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, message_en: e.target.value }))}
              />
            </Field>
            <div className="rounded-md border p-3">
              <SwitchRow
                label={t('common.active')}
                checked={form.is_active ?? true}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** ── ระบบ ─────────────────────────────────────────────── */
function SystemTab() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { data: settings } = useSettings();
  const saveSettings = useSaveSettings();
  const { data: logins = [] } = useLoginHistory();
  const [form, setForm] = useState(settings);

  useEffect(() => setForm(settings), [settings]);

  const save = async () => {
    if (!form) return;
    await saveSettings.mutateAsync(form);
    toast(t('admin.settingsSaved'));
  };

  const doExport = async () => {
    downloadText(`gemba-backup-${todayISO()}.json`, await exportDb(), 'application/json');
  };

  const doReset = async () => {
    if (!confirm(t('admin.resetConfirm'))) return;
    await resetDb();
    location.reload();
  };

  const doClear = async () => {
    if (!confirm(t('admin.clearTxConfirm'))) return;
    await clearTransactions();
    location.reload();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t('admin.tabSystem')} />
        <CardBody className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('admin.company')}>
              <Input value={form?.company_name ?? ''} onChange={(e) => setForm((f) => f && { ...f, company_name: e.target.value })} />
            </Field>
            <Field label={t('admin.plant')}>
              <Input value={form?.plant_name ?? ''} onChange={(e) => setForm((f) => f && { ...f, plant_name: e.target.value })} />
            </Field>
            <Field label={t('admin.weeklyTarget')}>
              <Input
                type="number"
                min={1}
                value={form?.weekly_target ?? 1}
                onChange={(e) => setForm((f) => f && { ...f, weekly_target: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('admin.recentDays')}>
              <Input
                type="number"
                min={0}
                value={form?.recent_visit_days ?? 7}
                onChange={(e) => setForm((f) => f && { ...f, recent_visit_days: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Button variant="accent" onClick={save}>{t('common.save')}</Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('admin.dataTools')} hint="ข้อมูลถูกเก็บในเครื่องนี้ (localStorage + IndexedDB)" />
        <CardBody className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={doExport}>
            <Download className="h-4 w-4" />
            {t('admin.exportJson')}
          </Button>
          <Button variant="outline" onClick={doClear}>
            <Trash2 className="h-4 w-4" />
            {t('admin.clearTx')}
          </Button>
          <Button variant="outline" onClick={doReset}>
            <RefreshCw className="h-4 w-4" />
            {t('admin.resetDemo')}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('admin.loginHistory')} right={<Database className="h-4 w-4 text-muted-foreground" />} />
        <CardBody className="space-y-1">
          {logins.slice(0, 12).map((l) => (
            <div key={l.id} className="flex items-center gap-2 border-b py-1.5 last:border-0">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-[12px]">{l.actor_name}</span>
              <Badge tone={l.result === 'success' ? 'ok' : 'bad'}>{l.role}</Badge>
              <span className="num text-[10px] text-muted-foreground">
                {new Date(l.at).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', { timeZone: 'Asia/Bangkok' })}
              </span>
            </div>
          ))}
          {!logins.length ? <p className="py-3 text-center text-[12px] text-muted-foreground">{t('common.noData')}</p> : null}
        </CardBody>
      </Card>
    </div>
  );
}
