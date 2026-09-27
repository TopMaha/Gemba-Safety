import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import * as api from '@/lib/api';
import { buildTree, fullPath as fullPathOf } from '@/lib/areaTree';
import { useI18n } from '@/lib/i18n';
import { getSession, isAdmin, subscribeSession, syncSession } from '@/lib/session';
import { resolveAccess, type Access } from '@/lib/permissions';
import type { GembaPlan, SafetyFinding, WalkRecord } from '@/lib/types';

/** ── เซสชัน ─────────────────────────────────────────────── */
export function useSession() {
  const session = useSyncExternalStore(subscribeSession, getSession, () => null);
  const admin = useSyncExternalStore(subscribeSession, isAdmin, () => false);
  return { session, admin };
}

/** ── ข้อมูลหลัก ─────────────────────────────────────────── */
export const useManagers = () => useQuery({ queryKey: ['managers'], queryFn: api.getManagers });
export const useAreas = () => useQuery({ queryKey: ['areas'], queryFn: api.getAreas });
export const useThemes = () => useQuery({ queryKey: ['themes'], queryFn: api.getThemes });
export const usePlans = () => useQuery({ queryKey: ['plans'], queryFn: api.getPlans });
export const useRecords = () => useQuery({ queryKey: ['records'], queryFn: api.getRecords });
export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
export const useWeeklyFocus = () => useQuery({ queryKey: ['focus'], queryFn: () => api.getActiveFocus() });
export const useFocusList = () => useQuery({ queryKey: ['focusList'], queryFn: api.getWeeklyFocusList });
export const useLoginHistory = () => useQuery({ queryKey: ['loginHistory'], queryFn: api.getLoginHistory });
export const useChangeHistory = (recordId?: string) =>
  useQuery({ queryKey: ['changes', recordId ?? 'all'], queryFn: () => api.getChangeHistory(recordId) });

/** โหลดข้อมูลชุดหลักพร้อมกัน — ใช้ในหน้าที่ต้องใช้หลายตาราง */
export function useCoreData() {
  const managers = useManagers();
  const areas = useAreas();
  const themes = useThemes();
  const plans = usePlans();
  const records = useRecords();
  const { lang } = useI18n();

  const tree = useMemo(() => buildTree(areas.data ?? [], lang), [areas.data, lang]);
  const pathOf = useCallback(
    (areaId: string) => fullPathOf(areas.data ?? [], areaId, lang),
    [areas.data, lang],
  );
  // ผู้เดินตรวจ = คนที่ Super Admin เปิดสิทธิ์ไว้ (can_login) เท่านั้น ไม่ใช่พนักงานทั้งโรงงาน
  // เป้า "Plan = N คน" ในแดชบอร์ดและอันดับผลงานนับจากกลุ่มนี้
  const walkers = useMemo(() => (managers.data ?? []).filter((m) => m.is_active && m.can_login), [managers.data]);

  return {
    managers: managers.data ?? [],
    walkers,
    areas: areas.data ?? [],
    themes: themes.data ?? [],
    plans: plans.data ?? [],
    records: records.data ?? [],
    tree,
    pathOf,
    isLoading: managers.isLoading || areas.isLoading || themes.isLoading || plans.isLoading || records.isLoading,
  };
}

/** ── การเขียนข้อมูล ─────────────────────────────────────── */
function useActor() {
  const { session } = useSession();
  const { admin } = useSession();
  return admin && !session ? 'ผู้ดูแลระบบ' : session?.full_name ?? 'ผู้ดูแลระบบ';
}

export function useInvalidate() {
  const qc = useQueryClient();
  return useCallback((keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })), [qc]);
}

export function useCreatePlan() {
  const actor = useActor();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: api.PlanInput) => api.createPlan(input, actor),
    onSuccess: () => invalidate(['plans', 'changes']),
  });
}

export function useUpdatePlan() {
  const actor = useActor();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<GembaPlan> }) => api.updatePlan(id, patch, actor),
    onSuccess: () => invalidate(['plans', 'changes']),
  });
}

export function useCreateRecord() {
  const actor = useActor();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: api.RecordInput) => api.createRecord(input, actor),
    onSuccess: () => invalidate(['records', 'plans', 'changes']),
  });
}

export function useUpdateRecord() {
  const actor = useActor();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<WalkRecord> }) => api.updateRecord(id, patch, actor),
    onSuccess: () => invalidate(['records', 'plans', 'changes']),
  });
}

export function useSaveManager() {
  const actor = useActor();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.saveManager>[0]) => api.saveManager(input, actor),
    onSuccess: () => invalidate(['managers', 'changes']),
  });
}

export function useSaveArea() {
  const actor = useActor();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.saveArea>[0]) => api.saveArea(input, actor),
    onSuccess: () => invalidate(['areas', 'changes']),
  });
}

export function useSaveTheme() {
  const actor = useActor();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.saveTheme>[0]) => api.saveTheme(input, actor),
    onSuccess: () => invalidate(['themes', 'changes']),
  });
}

export function useSaveFocus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: api.saveWeeklyFocus,
    onSuccess: () => invalidate(['focus', 'focusList']),
  });
}

export function useSaveSettings() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: api.saveSettings, onSuccess: () => invalidate(['settings']) });
}

/**
 * ตรวจกับเซิร์ฟเวอร์ว่าโทเคนผู้ดูแลที่ถืออยู่ยังใช้ได้จริง
 *
 * ค่าใน localStorage ปลอมได้ ถ้าเชื่อค่านั้นอย่างเดียวก็จะเปิดหน้าตั้งค่าให้คนที่
 * ไม่รู้รหัสผู้ดูแล (เขียนอะไรไม่ได้เพราะ Worker ปฏิเสธ แต่ก็ไม่ควรเห็นตั้งแต่แรก)
 * เรียกจากหน้าที่เป็นงานผู้ดูแลเท่านั้น ไม่ต้องยิงทุกหน้า
 */
export function useAdminGuard() {
  const { admin } = useSession();

  useEffect(() => {
    if (!admin) return;
    void api.verifyAdminSession();
  }, [admin]);
}

/**
 * Admin ปิดบัญชี/สิทธิ์แล้วต้องมีผลทันที
 * ตรวจสถานะผู้ใช้ทุกครั้งที่ข้อมูล managers ถูกโหลดใหม่
 */
export function useSessionGuard() {
  const { session } = useSession();
  const { data: managers } = useManagers();

  useEffect(() => {
    if (!session || !managers) return;
    syncSession(managers.find((m) => m.id === session.manager_id));
  }, [session, managers]);
}

/* ══════════════════════════════════════════════════════════════════════════
   งานความปลอดภัย
   ══════════════════════════════════════════════════════════════════════════ */

export const useFindings = () => useQuery({ queryKey: ['findings'], queryFn: api.getFindings });
export const useChecklist = () => useQuery({ queryKey: ['checklist'], queryFn: api.getChecklist });
export const useRoles = () => useQuery({ queryKey: ['roles'], queryFn: api.getRoles });
export const usePermissionList = () => useQuery({ queryKey: ['permissions'], queryFn: api.getPermissions });
export const useUserRoles = () => useQuery({ queryKey: ['userRoles'], queryFn: api.getUserRoles });

export const useFindingEvents = (findingId?: string) =>
  useQuery({ queryKey: ['findingEvents', findingId ?? 'all'], queryFn: () => api.getFindingEvents(findingId) });

export const useChecklistResults = (recordId?: string) =>
  useQuery({ queryKey: ['checklistResults', recordId ?? 'all'], queryFn: () => api.getChecklistResults(recordId) });

export const useNotifications = () => {
  const { session } = useSession();
  return useQuery({
    queryKey: ['notifications', session?.manager_id ?? '-'],
    queryFn: () => api.getNotifications(session?.manager_id),
    enabled: Boolean(session),
  });
};

/** ใบแจ้งใบเดียวจากสำเนาในเครื่อง — ไม่ยิง API แยก หน้ารายละเอียดจึงเปิดได้ตอนออฟไลน์ */
export function useFinding(id: string | undefined): SafetyFinding | undefined {
  const { data } = useFindings();
  return useMemo(() => data?.find((f) => f.id === id), [data, id]);
}

/**
 * สิทธิ์ของผู้ใช้ที่กำลังใช้งานอยู่
 *
 * ผู้ดูแลระบบที่เข้าทาง /admin ได้ทุกสิทธิ์เสมอ เพราะเป็นคนที่ถือรหัสผู้ดูแล
 * ซึ่งเซิร์ฟเวอร์ตรวจแล้วว่าถูกต้อง (ดู admin_sessions ฝั่ง Worker)
 */
export function useAccess(): Access {
  const { session, admin } = useSession();
  const { data: roles } = useRoles();
  const { data: userRoles } = useUserRoles();
  const { data: settings } = useSettings();
  const { data: areas } = useAreas();

  return useMemo(() => {
    const base = resolveAccess({
      managerId: session?.manager_id ?? (admin ? 'admin' : null),
      roles: roles ?? [],
      userRoles: userRoles ?? [],
      settings,
      areas: areas ?? [],
    });
    if (!admin) return base;
    const all = new Set((roles ?? []).find((r) => r.role_code === 'admin')?.perm_codes ?? []);
    return { ...base, perms: all, scopes: ['*'], can: () => true, canSeeArea: () => true };
  }, [session, admin, roles, userRoles, settings, areas]);
}

/** ผู้ทำรายการสำหรับใบแจ้ง — ต้องรู้ทั้ง id (ผูกคน) และชื่อ (แสดงในไทม์ไลน์) */
function useActorRef(): api.Actor {
  const { session, admin } = useSession();
  return useMemo(
    () => ({
      id: session?.manager_id ?? null,
      name: session?.full_name ?? (admin ? 'ผู้ดูแลระบบ' : ''),
    }),
    [session, admin],
  );
}

/** ทุกคำสั่งที่แตะใบแจ้งต้องล้างสามคีย์นี้ — ใบ · ไทม์ไลน์ · กล่องแจ้งเตือน */
const FINDING_KEYS = ['findings', 'findingEvents', 'notifications'];

export function useCreateFinding() {
  const actor = useActorRef();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: api.FindingInput) => api.createFinding(input, actor),
    onSuccess: () => invalidate([...FINDING_KEYS, 'checklistResults']),
  });
}

export function useUpdateFinding() {
  const actor = useActorRef();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<SafetyFinding> }) =>
      api.updateFinding(id, patch, actor),
    onSuccess: () => invalidate([...FINDING_KEYS, 'changes']),
  });
}

export function useFindingAction() {
  const actor = useActorRef();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action, input }: { id: string; action: api.FindingAction; input: api.FindingActionInput }) =>
      api.actOnFinding(id, action, input, actor),
    onSuccess: () => invalidate(FINDING_KEYS),
  });
}

export function useMarkNotificationsRead() {
  const { session } = useSession();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api.markNotificationsRead(session?.manager_id ?? ''),
    onSuccess: () => invalidate(['notifications']),
  });
}

export function useSaveChecklistItem() {
  const actor = useActor();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.saveChecklistItem>[0]) => api.saveChecklistItem(input, actor),
    onSuccess: () => invalidate(['checklist', 'changes']),
  });
}

export function useSetRolePermissions() {
  const actor = useActor();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ roleId, permCodes }: { roleId: string; permCodes: string[] }) =>
      api.setRolePermissions(roleId, permCodes, actor),
    onSuccess: () => invalidate(['roles', 'changes']),
  });
}

export function useAddUserRole() {
  const actor = useActor();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: Parameters<typeof api.addUserRole>[0]) => api.addUserRole(input, actor),
    onSuccess: () => invalidate(['userRoles', 'changes']),
  });
}

export function useRemoveUserRole() {
  const actor = useActor();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.removeUserRole(id, actor),
    onSuccess: () => invalidate(['userRoles', 'changes']),
  });
}
