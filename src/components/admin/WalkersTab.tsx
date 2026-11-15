import { useMemo, useState } from 'react';
import { ChevronDown, ClipboardPaste, Plus, Search, UserMinus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/field';
import { Avatar, EmptyState, SkeletonList } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useCoreData, useSaveManager } from '@/hooks/useData';
import { managerLabel, useI18n } from '@/lib/i18n';
import { codeKey } from '@/lib/planImport';
import type { Manager } from '@/lib/types';

/**
 * ── รายชื่อผู้ที่ต้องเดินตรวจ (เฉพาะโหมดผู้ดูแล) ──────────────────────────────
 *
 * "ผู้เดินตรวจ" คือพนักงานที่เปิด can_login — ล็อกอินได้ ถูกวางแผนได้ และถูกนับเป้าในแดชบอร์ด
 * หน้านี้ทำแค่เรื่องเดียว: เพิ่ม/เอาออกจากรายชื่อนี้ (ทะเบียนเต็มสี่ร้อยคนอยู่ที่แท็บผู้ใช้งาน)
 * เอาออก = ปิด can_login เท่านั้น ไม่ลบคน ประวัติการเดินและใบแจ้งเดิมยังอยู่ครบ
 */
export function WalkersTab() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const { managers, isLoading } = useCoreData();
  const save = useSaveManager();
  const [term, setTerm] = useState('');
  const [paste, setPaste] = useState('');
  const [removing, setRemoving] = useState<Manager | null>(null);
  const [busy, setBusy] = useState(false);

  const walkers = useMemo(
    () =>
      managers
        .filter((m) => m.can_login)
        .sort((a, b) => a.department.localeCompare(b.department) || a.full_name.localeCompare(b.full_name, 'th')),
    [managers],
  );

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    const key = codeKey(q);
    return managers
      .filter((m) => m.is_active)
      .filter((m) => {
        const text = `${m.manager_code} ${m.full_name} ${m.full_name_en ?? ''} ${m.department}`.toLowerCase();
        return text.includes(q) || (key.length >= 2 && codeKey(m.manager_code).includes(key));
      })
      .slice(0, 8);
  }, [managers, term]);

  /** รหัสที่วางมาหลายคน — แยกเป็นเจอ/ไม่เจอ/เป็นผู้เดินตรวจอยู่แล้ว */
  const pasted = useMemo(() => {
    const codes = [...new Set(paste.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean))];
    const found: Manager[] = [];
    const missing: string[] = [];
    for (const c of codes) {
      const m = managers.find((x) => codeKey(x.manager_code) === codeKey(c));
      if (!m || !m.is_active) missing.push(c);
      else if (!m.can_login && !found.includes(m)) found.push(m);
    }
    return { found, missing };
  }, [paste, managers]);

  const add = async (list: Manager[]) => {
    setBusy(true);
    try {
      for (const m of list) await save.mutateAsync({ id: m.id, can_login: true });
      toast(t('team.added', { n: list.length }));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    await save.mutateAsync({ id: removing.id, can_login: false });
    toast(t('team.removed', { name: managerLabel(removing, lang) }));
    setRemoving(null);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Users className="h-4 w-4 text-accent" />
              {t('team.walkersTitle')}
            </span>
          }
          hint={t('team.walkersHint')}
          right={<Badge tone="accent" size="md">{t('team.walkersCount', { n: walkers.length })}</Badge>}
        />
        <CardBody className="space-y-3">
          {/* ค้นหาแล้วเพิ่มทีละคน */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={t('team.searchPeople')}
              aria-label={t('team.addWalker')}
              className="pl-9"
            />
          </div>
          {term.trim() ? (
            matches.length ? (
              <ul className="divide-y overflow-hidden rounded-md border">
                {matches.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                    <Avatar name={managerLabel(m, lang)} src={m.avatar_url} seed={m.id} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{managerLabel(m, lang)}</div>
                      <div className="num truncate text-[11px] text-muted-foreground">{m.manager_code} · {m.department}</div>
                    </div>
                    {m.can_login ? (
                      <Badge tone="ok">{t('team.already')}</Badge>
                    ) : (
                      <Button size="sm" variant="accent" className="h-10" disabled={busy} onClick={() => add([m])}>
                        <Plus className="h-4 w-4" />
                        {t('common.add')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-1 text-[12px] text-muted-foreground">{t('team.noMatch')}</p>
            )
          ) : null}

          {/* วางรหัสหลายคนจาก Excel */}
          <details className="group rounded-md border">
            <summary className="focusable flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-md px-3 text-[13px] font-medium">
              <ClipboardPaste className="h-4 w-4 text-accent" aria-hidden />
              <span className="flex-1">{t('team.pasteCodes')}</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-2 border-t px-3 pb-3 pt-2.5">
              <p className="text-[12px] text-muted-foreground">{t('team.pasteCodesHint')}</p>
              <Textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={'T-815\nM-089\nPST742'}
                className="num min-h-[96px]"
                aria-label={t('team.pasteCodes')}
              />
              {pasted.missing.length ? (
                <p role="alert" className="text-[12px] text-bad">{t('team.notFound', { codes: pasted.missing.join(', ') })}</p>
              ) : null}
              <div className="flex justify-end">
                <Button
                  variant="accent"
                  className="h-11"
                  disabled={busy || !pasted.found.length}
                  onClick={async () => {
                    await add(pasted.found);
                    setPaste('');
                  }}
                >
                  <Plus className="h-4 w-4" />
                  {t('team.addN', { n: pasted.found.length })}
                </Button>
              </div>
            </div>
          </details>
        </CardBody>
      </Card>

      {/* รายชื่อปัจจุบัน */}
      {isLoading ? (
        <SkeletonList rows={4} />
      ) : walkers.length ? (
        <Card>
          <ul className="divide-y">
            {walkers.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar name={managerLabel(m, lang)} src={m.avatar_url} seed={m.id} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium">{managerLabel(m, lang)}</span>
                    {!m.is_active ? <Badge tone="bad">{t('team.inactive')}</Badge> : null}
                  </div>
                  <div className="num truncate text-[11px] text-muted-foreground">
                    {m.manager_code} · {m.department}
                    {m.position ? ` · ${m.position}` : ''}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11 shrink-0 px-2.5 text-muted-foreground hover:text-bad"
                  onClick={() => setRemoving(m)}
                  aria-label={`${t('team.remove')} ${managerLabel(m, lang)}`}
                >
                  <UserMinus className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('team.remove')}</span>
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState icon={<Users className="h-8 w-8" />} title={t('team.noWalkers')} />
      )}

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent
          title={t('team.removeTitle')}
          footer={
            <>
              <Button variant="outline" onClick={() => setRemoving(null)}>{t('common.cancel')}</Button>
              <Button variant="danger" onClick={confirmRemove} disabled={save.isPending}>
                <UserMinus className="h-4 w-4" />
                {t('team.remove')}
              </Button>
            </>
          }
        >
          <p className="text-[13px] leading-relaxed">
            {t('team.removeBody', { name: removing ? managerLabel(removing, lang) : '' })}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
