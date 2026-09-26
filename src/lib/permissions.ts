import type { Area, AppSettings, PermCode, Role, SafetyFinding, UserRole } from './types';

/**
 * ── สิทธิ์ผู้ใช้งาน ────────────────────────────────────────────────────────
 *
 * สิทธิ์ที่คนหนึ่งมี = ผลรวมของทุกบทบาทที่ถืออยู่ในตาราง user_roles
 * ถ้ายังไม่ถูกใส่ในตารางนั้นเลย จะได้บทบาทตั้งต้นตาม settings.default_role_code
 * เพื่อให้ระบบเดินได้ทันทีตั้งแต่วันแรกโดยไม่ต้องรอกรอกทะเบียนสิทธิ์ให้ครบ 393 คน
 *
 * ⚠️ สิ่งที่ไฟล์นี้ทำคือ "ตัดสินว่าจะแสดงปุ่มไหม" เท่านั้น ไม่ใช่ด่านกันจริง
 *    ด่านจริงอยู่ที่ Worker — งานที่แก้กติกาของระบบ (ทะเบียนผู้ใช้ · สิทธิ์ · พื้นที่ ·
 *    หมวด · เช็คลิสต์ · ตั้งค่า) ต้องมีเซสชันผู้ดูแลเสมอ ส่วนใบแจ้งปัญหา Worker
 *    บังคับลำดับสถานะให้ (เช่น ตรวจรับได้เฉพาะใบที่แก้เสร็จแล้ว)
 */

export interface Access {
  /** บทบาทที่ถืออยู่จริง */
  roles: Role[];
  /** รหัสสิทธิ์ทั้งหมดที่ได้จากบทบาทเหล่านั้น */
  perms: Set<string>;
  /** ขอบเขตพื้นที่ — '*' คือทั้งโรงงาน */
  scopes: string[];
  /** ได้บทบาทมาจากค่าตั้งต้นเพราะยังไม่ถูกใส่ทะเบียนสิทธิ์ */
  isDefault: boolean;
  can: (perm: PermCode) => boolean;
  /** เห็นข้อมูลของพื้นที่นี้ไหม (นับพื้นที่ลูกที่อยู่ใต้ขอบเขตด้วย) */
  canSeeArea: (areaId: string) => boolean;
}

const EMPTY: Access = {
  roles: [],
  perms: new Set(),
  scopes: [],
  isDefault: false,
  can: () => false,
  canSeeArea: () => false,
};

export interface AccessInput {
  managerId: string | null | undefined;
  roles: Role[];
  userRoles: UserRole[];
  settings: Pick<AppSettings, 'default_role_code'> | undefined;
  areas: Area[];
}

export function resolveAccess({ managerId, roles, userRoles, settings, areas }: AccessInput): Access {
  if (!managerId) return EMPTY;

  const mine = userRoles.filter((ur) => ur.manager_id === managerId);
  const isDefault = mine.length === 0;

  const held = isDefault
    ? roles.filter((r) => r.role_code === (settings?.default_role_code ?? 'inspector'))
    : mine
        .map((ur) => roles.find((r) => r.id === ur.role_id || r.role_code === ur.role_code))
        .filter((r): r is Role => Boolean(r));

  const perms = new Set<string>();
  for (const r of held) for (const p of r.perm_codes) perms.add(p);

  // ยังไม่ถูกจำกัดขอบเขต = เห็นทั้งโรงงาน
  const scopes = isDefault ? ['*'] : [...new Set(mine.map((ur) => ur.scope_area_id || '*'))];
  const allAreas = scopes.includes('*') || perms.has('finding.view_all');

  return {
    roles: held,
    perms,
    scopes,
    isDefault,
    can: (perm) => perms.has(perm),
    canSeeArea: (areaId) => allAreas || inScope(areas, areaId, scopes),
  };
}

/** พื้นที่นี้อยู่ใต้ขอบเขตที่ได้รับไหม — ไล่ขึ้นไปตามสายพ่อแม่ */
function inScope(areas: Area[], areaId: string, scopes: string[]): boolean {
  let cursor: string | null = areaId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    if (scopes.includes(cursor)) return true;
    seen.add(cursor);
    cursor = areas.find((a) => a.id === cursor)?.parent_id ?? null;
  }
  return false;
}

/* ══════════════════════════════════════════════════════════════════════════
   สิ่งที่ทำได้กับใบแจ้งหนึ่งใบ

   นอกจากสิทธิ์ตามบทบาทแล้ว ยังมีสองกติกาที่ผูกกับตัวบุคคล
     1. ผู้ที่ถูกมอบหมาย (ผู้จัดการ/หัวหน้างาน) แก้ไขและรายงานผลใบของตัวเองได้เสมอ
        ไม่งั้นต้องไปเปิดสิทธิ์ให้ทีละคน ซึ่งขัดกับวิธีทำงานจริงหน้างาน
     2. ผู้แจ้งเป็นคนตรวจรับงานของตัวเองได้ เพราะเป็นคนที่รู้ว่าปัญหาหายจริงหรือยัง
   ══════════════════════════════════════════════════════════════════════════ */

export interface FindingAbilities {
  assign: boolean;
  start: boolean;
  fix: boolean;
  verify: boolean;
  reject: boolean;
  cancel: boolean;
  edit: boolean;
  comment: boolean;
  reopen: boolean;
}

const NONE: FindingAbilities = {
  assign: false, start: false, fix: false, verify: false, reject: false,
  cancel: false, edit: false, comment: false, reopen: false,
};

export function findingAbilities(
  f: SafetyFinding | undefined,
  access: Access,
  managerId: string | null | undefined,
): FindingAbilities {
  if (!f || !managerId) return NONE;

  const mineToFix = f.assigned_manager_id === managerId || f.assigned_supervisor_id === managerId;
  const isReporter = f.reported_by === managerId;
  const live = f.status !== 'closed' && f.status !== 'cancelled';

  return {
    assign: access.can('finding.assign') && live,
    start: (mineToFix || access.can('finding.assign')) && ['open', 'assigned'].includes(f.status),
    fix: (mineToFix || access.can('finding.fix')) && ['open', 'assigned', 'in_progress'].includes(f.status),
    verify: f.status === 'fixed' && (access.can('finding.verify') || isReporter),
    reject: f.status === 'fixed' && (access.can('finding.verify') || isReporter),
    cancel: live && (access.can('finding.cancel') || isReporter),
    edit: live && (access.can('finding.edit') || isReporter),
    comment: access.can('finding.comment'),
    reopen: !live && access.can('finding.verify'),
  };
}
