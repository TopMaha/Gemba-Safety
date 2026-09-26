import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { HierarchicalAreaPicker } from '@/components/HierarchicalAreaPicker';
import { PhotoUploader } from '@/components/PhotoUploader';
import { useCreateFinding, useFindingAction, useSettings, useUpdateFinding } from '@/hooks/useData';
import { managerLabel, themeLabel, useI18n } from '@/lib/i18n';
import { SEVERITIES, dueDateFor, severityMeta } from '@/lib/safety';
import { todayISO } from '@/lib/time';
import type { Area, Manager, SafetyFinding, Severity, WalkTheme } from '@/lib/types';

/**
 * ── กล่องโต้ตอบของใบแจ้งปัญหา ────────────────────────────────────────────
 *
 * ทุกกล่องในไฟล์นี้เขียนผ่าน hooks เดียวกับหน้าจออื่น จึงบันทึกลงเครื่องก่อน
 * แล้วค่อยซิงก์ขึ้นเซิร์ฟเวอร์ — กดปิดงานกลางโรงงานที่สัญญาณไม่ถึงได้
 */

/**
 * เลือกผู้รับผิดชอบ — แสดงเฉพาะคนที่ล็อกอินได้
 * คนที่ไม่มีบัญชีจะเข้ามาแก้งานและแนบรูปไม่ได้ ใส่ชื่อไปก็ได้ใบค้างเปล่า ๆ
 */
export function ManagerSelect({
  managers,
  value,
  onChange,
  placeholder,
}: {
  managers: Manager[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder: string;
}) {
  const { lang } = useI18n();

  const groups = useMemo(() => {
    const usable = managers.filter((m) => m.is_active && m.can_login);
    const byDept = new Map<string, Manager[]>();
    for (const m of usable) {
      const key = m.department || '—';
      byDept.set(key, [...(byDept.get(key) ?? []), m]);
    }
    return [...byDept.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [managers]);

  return (
    <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {groups.map(([dept, list]) => (
        <optgroup key={dept} label={dept}>
          {list.map((m) => (
            <option key={m.id} value={m.id}>
              {managerLabel(m, lang)} · {m.manager_code}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

export function SeveritySelect({ value, onChange }: { value: Severity; onChange: (s: Severity) => void }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {SEVERITIES.map((s) => {
        const active = s === value;
        const tone = severityMeta(s).tone;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={[
              'press focusable min-h-[44px] whitespace-nowrap rounded-md border px-1 py-2 text-[12px] font-medium',
              active && tone === 'steel' ? 'border-steel bg-steel/15 text-steel' : '',
              active && tone === 'warn' ? 'border-warn bg-warn/15 text-warn' : '',
              active && tone === 'bad' ? 'border-bad bg-bad/15 text-bad' : '',
              active && tone === 'critical' ? 'border-bad bg-bad text-white' : '',
              active ? '' : 'border-border bg-card text-muted-foreground hover:border-foreground/25',
            ].join(' ')}
          >
            {t(severityMeta(s).key)}
          </button>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   เปิดใบแจ้งใหม่ / แก้ไขใบเดิม
   ══════════════════════════════════════════════════════════════════════════ */

export function FindingFormDialog({
  open,
  onOpenChange,
  finding,
  areas,
  themes,
  managers,
  defaults,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** ส่งมาเมื่อเป็นการแก้ไขใบเดิม */
  finding?: SafetyFinding | null;
  areas: Area[];
  themes: WalkTheme[];
  managers: Manager[];
  /** ค่าตั้งต้นตอนเปิดจากหน้าบันทึกการเดิน */
  defaults?: {
    area_id?: string;
    theme_id?: string;
    record_id?: string;
    checklist_item_id?: string;
    title?: string;
    severity?: Severity;
  };
  onCreated?: (f: SafetyFinding) => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { data: settings } = useSettings();
  const create = useCreateFinding();
  const update = useUpdateFinding();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [areaId, setAreaId] = useState<string | null>(null);
  const [themeId, setThemeId] = useState<string>('');
  const [dueDate, setDueDate] = useState(todayISO());
  const [immediate, setImmediate] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [managerId, setManagerId] = useState<string | null>(null);
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** ผู้ใช้แก้วันครบกำหนดเองแล้วหรือยัง — ถ้ายัง ให้เลื่อนตามความรุนแรงอัตโนมัติ */
  const [dueTouched, setDueTouched] = useState(false);

  /**
   * ตั้งค่าเริ่มต้นของฟอร์ม — ทำเฉพาะตอนเปิดกล่องเท่านั้น
   *
   * ห้ามใส่ settings หรือ defaults (อ็อบเจกต์ที่สร้างใหม่ทุกรอบ) ลงใน deps ตรง ๆ
   * ไม่งั้นพอข้อมูลตั้งค่าโหลดเสร็จระหว่างที่ผู้ใช้พิมพ์อยู่ ฟอร์มจะถูกล้างทิ้งกลางคัน
   */
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const defaultsKey = JSON.stringify(defaults ?? {});

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDueTouched(false);
    if (finding) {
      setTitle(finding.title);
      setDescription(finding.description);
      setSeverity(finding.severity);
      setAreaId(finding.area_id);
      setThemeId(finding.theme_id ?? '');
      setDueDate(finding.due_date);
      setImmediate(finding.immediate_action);
      setPhotos(finding.before_photos);
      setManagerId(finding.assigned_manager_id);
      setSupervisorId(finding.assigned_supervisor_id);
      return;
    }
    const sev = defaults?.severity ?? 'medium';
    setTitle(defaults?.title ?? '');
    setDescription('');
    setSeverity(sev);
    setAreaId(defaults?.area_id ?? null);
    setThemeId(defaults?.theme_id ?? '');
    setDueDate(dueDateFor(sev, settingsRef.current));
    setImmediate('');
    setPhotos([]);
    setManagerId(null);
    setSupervisorId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, finding, defaultsKey]);

  // ความรุนแรงเป็นตัวกำหนดว่าให้เวลาแก้กี่วัน เปลี่ยนระดับแล้ววันต้องขยับตาม
  useEffect(() => {
    if (finding || dueTouched) return;
    setDueDate(dueDateFor(severity, settings));
  }, [severity, settings, finding, dueTouched]);

  const busy = create.isPending || update.isPending;

  const submit = async () => {
    if (!title.trim()) return setError(t('safety.problem'));
    if (!areaId) return setError(t('plan.pickArea'));

    if (finding) {
      await update.mutateAsync({
        id: finding.id,
        patch: {
          title: title.trim(),
          description: description.trim(),
          severity,
          area_id: areaId,
          theme_id: themeId || null,
          due_date: dueDate,
          immediate_action: immediate.trim(),
          before_photos: photos,
        },
      });
      toast(t('safety.actionDone'));
    } else {
      const created = await create.mutateAsync({
        record_id: defaults?.record_id ?? null,
        area_id: areaId,
        theme_id: themeId || null,
        checklist_item_id: defaults?.checklist_item_id ?? null,
        title: title.trim(),
        description: description.trim(),
        severity,
        due_date: dueDate,
        immediate_action: immediate.trim(),
        before_photos: photos,
        assigned_manager_id: managerId,
        assigned_supervisor_id: supervisorId,
      });
      toast(t('safety.opened'));
      onCreated?.(created);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={finding ? `${t('common.edit')} ${finding.finding_no}` : t('safety.newFinding')}
        description={finding ? undefined : t('safety.subtitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Field label={t('safety.problem')} required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('safety.problemPlaceholder')} />
          </Field>

          <Field label={t('safety.severity')} required>
            <SeveritySelect value={severity} onChange={setSeverity} />
          </Field>

          <Field label={t('common.area')} required>
            <HierarchicalAreaPicker areas={areas} value={areaId} onChange={setAreaId} />
          </Field>

          <Field label={t('common.theme')} hint={t('common.optional')}>
            <Select value={themeId} onChange={(e) => setThemeId(e.target.value)}>
              <option value="">—</option>
              {themes
                .filter((th) => th.is_active)
                .map((th) => (
                  <option key={th.id} value={th.id}>
                    {themeLabel(th, lang)}
                  </option>
                ))}
            </Select>
          </Field>

          <Field label={t('safety.description')}>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('safety.descriptionPlaceholder')}
            />
          </Field>

          <Field label={t('safety.immediateAction')} hint={t('common.optional')}>
            <Input value={immediate} onChange={(e) => setImmediate(e.target.value)} placeholder={t('safety.immediatePlaceholder')} />
          </Field>

          <Field label={t('safety.dueDate')} required>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueTouched(true);
                setDueDate(e.target.value);
              }}
            />
          </Field>

          <Field label={t('safety.beforePhotos')}>
            <PhotoUploader value={photos} onChange={setPhotos} max={6} />
          </Field>

          {!finding ? (
            <>
              <Field label={t('safety.manager')} hint={t('common.optional')}>
                <ManagerSelect
                  managers={managers}
                  value={managerId}
                  onChange={setManagerId}
                  placeholder={t('safety.unassigned')}
                />
              </Field>
              <Field label={t('safety.supervisor')} hint={t('common.optional')}>
                <ManagerSelect
                  managers={managers}
                  value={supervisorId}
                  onChange={setSupervisorId}
                  placeholder={t('safety.unassigned')}
                />
              </Field>
            </>
          ) : null}

          {error ? (
            <p className="flex items-center gap-1.5 text-[13px] text-bad">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   มอบหมายผู้รับผิดชอบ — ส่งงานให้ผู้จัดการและหัวหน้างานเข้าแก้ไข
   ══════════════════════════════════════════════════════════════════════════ */

export function AssignDialog({
  open,
  onOpenChange,
  finding,
  managers,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  finding: SafetyFinding;
  managers: Manager[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const act = useFindingAction();

  const [managerId, setManagerId] = useState<string | null>(null);
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState(finding.due_date);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setManagerId(finding.assigned_manager_id);
    setSupervisorId(finding.assigned_supervisor_id);
    setDueDate(finding.due_date);
    setNote('');
    setError(null);
  }, [open, finding]);

  const submit = async () => {
    if (!managerId && !supervisorId) return setError(t('safety.unassigned'));
    await act.mutateAsync({
      id: finding.id,
      action: 'assign',
      input: {
        assigned_manager_id: managerId,
        assigned_supervisor_id: supervisorId,
        due_date: dueDate,
        note,
      },
    });
    toast(t('safety.actionDone'));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('safety.assign')}
        description={finding.finding_no}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={act.isPending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={act.isPending}>
              {act.isPending ? t('common.saving') : t('safety.assign')}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Field label={t('safety.manager')}>
            <ManagerSelect managers={managers} value={managerId} onChange={setManagerId} placeholder={t('safety.unassigned')} />
          </Field>
          <Field label={t('safety.supervisor')}>
            <ManagerSelect
              managers={managers}
              value={supervisorId}
              onChange={setSupervisorId}
              placeholder={t('safety.unassigned')}
            />
          </Field>
          <Field label={t('safety.dueDate')}>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label={t('common.note')} hint={t('common.optional')}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('safety.commentPlaceholder')} />
          </Field>
          {error ? <p className="text-[13px] text-bad">{error}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   บันทึกการแก้ไข — ต้องแนบรูปหลังแก้ ซึ่งเป็นหลักฐานปิดงาน
   ══════════════════════════════════════════════════════════════════════════ */

export function FixDialog({
  open,
  onOpenChange,
  finding,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  finding: SafetyFinding;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const act = useFindingAction();
  const { data: settings } = useSettings();

  const [actionTaken, setActionTaken] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setActionTaken(finding.action_taken);
    setRootCause(finding.root_cause);
    setPhotos(finding.after_photos);
    setError(null);
  }, [open, finding]);

  const needPhoto = settings?.require_after_photo ?? true;

  const submit = async () => {
    if (!actionTaken.trim()) return setError(t('safety.actionTaken'));
    if (needPhoto && photos.length === 0) return setError(t('safety.afterPhotoRequired'));

    await act.mutateAsync({
      id: finding.id,
      action: 'fix',
      input: { action_taken: actionTaken.trim(), root_cause: rootCause.trim(), after_photos: photos },
    });
    toast(t('safety.actionDone'));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('safety.fix')}
        description={`${finding.finding_no} · ${finding.title}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={act.isPending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={act.isPending}>
              {act.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <Field label={t('safety.actionTaken')} required>
            <Textarea
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              placeholder={t('safety.actionPlaceholder')}
            />
          </Field>
          <Field label={t('safety.rootCause')} hint={t('common.optional')}>
            <Input value={rootCause} onChange={(e) => setRootCause(e.target.value)} placeholder={t('safety.rootCausePlaceholder')} />
          </Field>
          <Field label={t('safety.afterPhotos')} required={needPhoto} hint={needPhoto ? t('safety.afterPhotoRequired') : undefined}>
            <PhotoUploader value={photos} onChange={setPhotos} max={6} />
          </Field>
          {error ? (
            <p className="flex items-center gap-1.5 text-[13px] text-bad">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   กล่องข้อความสั้น — ตรวจรับ · ตีกลับ · ยกเลิก · เปิดใหม่ · แสดงความเห็น
   ══════════════════════════════════════════════════════════════════════════ */

export function NoteDialog({
  open,
  onOpenChange,
  finding,
  action,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  finding: SafetyFinding;
  action: 'verify' | 'reject' | 'cancel' | 'reopen' | 'comment' | 'start';
}) {
  const { t } = useI18n();
  const toast = useToast();
  const act = useFindingAction();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNote('');
    setError(null);
  }, [open, action]);

  // ตีกลับ ยกเลิก และเปิดใหม่ ต้องมีเหตุผลเสมอ — คนที่รับงานต่อต้องรู้ว่าทำไม
  const required = action === 'reject' || action === 'cancel' || action === 'reopen' || action === 'comment';

  const labels: Record<typeof action, { title: string; field: string }> = {
    verify: { title: t('safety.verify'), field: t('safety.verifyNote') },
    reject: { title: t('safety.reject'), field: t('safety.rejectReason') },
    cancel: { title: t('safety.cancelFinding'), field: t('safety.cancelReason') },
    reopen: { title: t('safety.reopen'), field: t('common.note') },
    comment: { title: t('safety.comment'), field: t('common.note') },
    start: { title: t('safety.start'), field: t('common.note') },
  };

  const submit = async () => {
    if (required && !note.trim()) return setError(t('safety.noteRequired'));
    await act.mutateAsync({ id: finding.id, action, input: { note: note.trim() } });
    toast(t('safety.actionDone'));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={labels[action].title}
        description={finding.finding_no}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={act.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={action === 'reject' || action === 'cancel' ? 'danger' : 'primary'}
              onClick={submit}
              disabled={act.isPending}
            >
              {act.isPending ? t('common.saving') : t('common.confirm')}
            </Button>
          </>
        }
      >
        <Field label={labels[action].field} required={required} hint={required ? undefined : t('common.optional')}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('safety.commentPlaceholder')} />
        </Field>
        {error ? <p className="mt-2 text-[13px] text-bad">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
