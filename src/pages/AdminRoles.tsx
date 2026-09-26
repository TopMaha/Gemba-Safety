import { useMemo, useState } from 'react';
import { KeyRound, Plus, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { PageTitle } from '@/components/ManagerShell';
import { ManagerSelect } from '@/components/safety/FindingDialogs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/field';
import { EmptyState, SwitchRow } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import {
  useAddUserRole, useAdminGuard, useCoreData, usePermissionList, useRemoveUserRole,
  useRoles, useSaveSettings, useSetRolePermissions, useSettings, useUserRoles,
} from '@/hooks/useData';
import { areaName } from '@/lib/areaTree';
import { managerLabel, useI18n } from '@/lib/i18n';
import type { Permission, Role } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * ── กำหนดสิทธิ์ผู้เข้าใช้งาน ──────────────────────────────────────────────
 *
 * หน้านี้คือที่ที่ "ฐานข้อมูลสิทธิ์ที่เตรียมไว้" ถูกกรอกจริง
 * ตาราง user_roles เริ่มต้นว่างเปล่าโดยตั้งใจ ระหว่างนั้นทุกคนใช้บทบาทตั้งต้น
 * ค่อย ๆ ใส่รายคนได้ตามสะดวก โดยระบบไม่หยุดทำงานระหว่างที่ยังกรอกไม่ครบ
 */
export default function AdminRoles() {
  const { t, lang } = useI18n();
  const toast = useToast();
  useAdminGuard();

  const { areas, managers } = useCoreData();
  const { data: roles } = useRoles();
  const { data: permissions } = usePermissionList();
  const { data: userRoles } = useUserRoles();
  const { data: settings } = useSettings();

  const setPerms = useSetRolePermissions();
  const addUserRole = useAddUserRole();
  const removeUserRole = useRemoveUserRole();
  const saveSettings = useSaveSettings();

  const [managerId, setManagerId] = useState<string | null>(null);
  const [roleId, setRoleId] = useState('');
  const [scope, setScope] = useState('*');

  const groups = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissions ?? []) map.set(p.perm_group, [...(map.get(p.perm_group) ?? []), p]);
    return [...map.entries()];
  }, [permissions]);

  const grant = async () => {
    if (!managerId || !roleId) return;
    await addUserRole.mutateAsync({ manager_id: managerId, role_id: roleId, scope_area_id: scope });
    toast(t('safety.actionDone'));
    setManagerId(null);
    setRoleId('');
    setScope('*');
  };

  return (
    <div>
      <PageTitle title={t('safety.rolesTitle')} subtitle={t('safety.rolesSubtitle')} />

      <div className="space-y-4">
        {/* ── บทบาทตั้งต้น ── */}
        <Card accent>
          <CardHeader title={t('safety.defaultRole')} hint={t('safety.defaultRoleHint')} />
          <CardBody>
            <Field label={t('safety.role')}>
              <Select
                value={settings?.default_role_code ?? 'inspector'}
                onChange={(e) => saveSettings.mutate({ default_role_code: e.target.value })}
              >
                {(roles ?? []).map((r) => (
                  <option key={r.id} value={r.role_code}>
                    {lang === 'en' ? r.role_name_en || r.role_name : r.role_name}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="mt-2 text-[12px] text-muted-foreground">{t('safety.noUserRoles')}</p>
          </CardBody>
        </Card>

        {/* ── สิทธิ์รายคน ── */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-accent" />
                {t('safety.userRoles')}
              </span>
            }
            hint={t('safety.grantCount', { n: (userRoles ?? []).length })}
          />
          <CardBody className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
              <ManagerSelect
                managers={managers}
                value={managerId}
                onChange={setManagerId}
                placeholder={t('common.select')}
              />
              <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                <option value="">{t('safety.role')}</option>
                {(roles ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {lang === 'en' ? r.role_name_en || r.role_name : r.role_name}
                  </option>
                ))}
              </Select>
              <Select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="*">{t('safety.allPlant')}</option>
                {areas
                  .filter((a) => a.is_active)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {areaName(areas, a.id, lang)}
                    </option>
                  ))}
              </Select>
              <Button onClick={grant} disabled={!managerId || !roleId || addUserRole.isPending}>
                <Plus className="h-4 w-4" />
                {t('common.add')}
              </Button>
            </div>

            {(userRoles ?? []).length ? (
              <div className="divide-y rounded-md border">
                {(userRoles ?? []).map((ur) => {
                  const m = managers.find((x) => x.id === ur.manager_id);
                  const r = (roles ?? []).find((x) => x.id === ur.role_id);
                  return (
                    <div key={ur.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">
                          {managerLabel(m, lang)}
                          <span className="num ml-2 text-[11px] text-muted-foreground">{m?.manager_code}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          <Badge tone="accent">{r ? (lang === 'en' ? r.role_name_en || r.role_name : r.role_name) : ur.role_code}</Badge>
                          <Badge tone="neutral">
                            {ur.scope_area_id === '*' ? t('safety.allPlant') : areaName(areas, ur.scope_area_id, lang)}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        size="iconSm"
                        variant="ghost"
                        aria-label={t('safety.revoke')}
                        onClick={() => removeUserRole.mutate(ur.id)}
                      >
                        <Trash2 className="h-4 w-4 text-bad" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={<KeyRound className="h-7 w-7" />} title={t('safety.noUserRoles')} />
            )}
          </CardBody>
        </Card>

        {/* ── บทบาทและสิทธิ์ ── */}
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-accent" />
                {t('safety.roleList')}
              </span>
            }
          />
          <CardBody className="space-y-4">
            {(roles ?? []).map((role) => (
              <RoleRow
                key={role.id}
                role={role}
                groups={groups}
                onToggle={(code, on) => {
                  const next = on
                    ? [...role.perm_codes, code]
                    : role.perm_codes.filter((c) => c !== code);
                  setPerms.mutate({ roleId: role.id, permCodes: next });
                }}
              />
            ))}
          </CardBody>
        </Card>

        {/* ── ค่าตั้งของงานแก้ไข ── */}
        <Card>
          <CardHeader title={t('safety.dueDays')} />
          <CardBody className="space-y-1">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ['due_days_critical', t('safety.sevCritical')],
                  ['due_days_high', t('safety.sevHigh')],
                  ['due_days_medium', t('safety.sevMedium')],
                  ['due_days_low', t('safety.sevLow')],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <Select
                    value={String(settings?.[key] ?? 7)}
                    onChange={(e) => saveSettings.mutate({ [key]: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 5, 7, 14, 30, 60, 90].map((n) => (
                      <option key={n} value={n}>
                        {n} {t('safety.days')}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
            <SwitchRow
              label={t('safety.requireAfterPhoto')}
              hint={t('safety.requireAfterPhotoHint')}
              checked={settings?.require_after_photo ?? true}
              onCheckedChange={(v) => saveSettings.mutate({ require_after_photo: v })}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function RoleRow({
  role,
  groups,
  onToggle,
}: {
  role: Role;
  groups: [string, Permission[]][];
  onToggle: (code: string, on: boolean) => void;
}) {
  const { t, lang } = useI18n();
  const locked = role.role_code === 'admin';

  return (
    <div className="rounded-md border">
      <div className="flex items-start justify-between gap-3 border-b bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">
            {lang === 'en' ? role.role_name_en || role.role_name : role.role_name}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {locked ? t('safety.adminAllPerms') : role.description}
          </p>
        </div>
        <Badge tone="neutral">{t('safety.permCount', { n: role.perm_codes.length })}</Badge>
      </div>

      <div className="space-y-2.5 p-3">
        {groups.map(([group, perms]) => (
          <div key={group}>
            <div className="label-micro mb-1">{group}</div>
            <div className="flex flex-wrap gap-1.5">
              {perms.map((p) => {
                const on = role.perm_codes.includes(p.perm_code);
                return (
                  <button
                    key={p.perm_code}
                    type="button"
                    disabled={locked}
                    onClick={() => onToggle(p.perm_code, !on)}
                    className={cn(
                      'press focusable rounded-full border px-2.5 py-1 text-[11px] font-medium disabled:opacity-60',
                      on
                        ? 'border-accent/50 bg-accent/15 text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground',
                    )}
                    title={p.perm_code}
                  >
                    {lang === 'en' ? p.perm_name_en || p.perm_name : p.perm_name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
