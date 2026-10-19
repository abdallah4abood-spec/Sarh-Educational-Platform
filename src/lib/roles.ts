import type { Role } from "@prisma/client";

import type { DictionaryKey } from "@/lib/i18n/dictionary";

/**
 * SARH (صَرْح) — role & portal registry.
 *
 * ONE place decides which tier owns which URL prefix. It is imported by the
 * edge middleware (route guards), the NextAuth callbacks (JWT claims), the
 * sign-in flow (auto-routing), the public navbar and the dashboard shell (role
 * switcher + sidebar). A renamed route therefore cannot leave one of them
 * pointing at a 404 or, worse, at a portal the tier must not reach.
 *
 * The tier model is deliberately flat and isolated — one tier per portal:
 *
 *   PARENT               → /parent/**       family portal
 *   TEACHER              → /teacher/**      class execution
 *   SUPERVISOR           → /supervisor/**   oversight & approval
 *   INSTITUTION_TEACHER  → /institution/**  multi-tenant center administration
 *   SUPER_ADMIN          → /admin/**        platform-wide control
 *
 * `SUPER_ADMIN` is the platform role: it is allowed into *every* portal so an
 * operator can inspect or unblock any tier without impersonating an account.
 * No other tier is allowed anywhere but its own portal — a teacher cannot read
 * the center's billing, and a center cannot audit platform finance.
 */

export type PortalId =
  | "parent"
  | "teacher"
  | "supervisor"
  | "institution"
  | "admin";

export interface PortalDef {
  id: PortalId;
  /** URL prefix owned by this portal, e.g. `/teacher`. */
  prefix: string;
  /** Overview route the tier lands on — always the portal's dashboard. */
  home: string;
  /** The one tier this portal belongs to. */
  role: Role;
  /** Tiers allowed inside. `PLATFORM_ADMIN_ROLE` is always allowed as well. */
  roles: Role[];
  /** Arabic label used in the role switcher, sidebar caption and footer. */
  label: string;
  /** One-line purpose, rendered under the switcher entry. */
  purpose: string;
  /** Dictionary key of the same label, used by the localized chrome. */
  navKey: DictionaryKey;
  /** Sidebar caption under the brand mark. */
  caption: string;
}

/**
 * Tier order used everywhere the portals are listed (switcher, public navbar,
 * footer). Parents first — they are the audience the platform exists for —
 * then the staff tiers from execution up to platform administration.
 */
export const PORTALS: readonly PortalDef[] = [
  {
    id: "parent",
    prefix: "/parent",
    home: "/parent",
    role: "PARENT",
    roles: ["PARENT"],
    label: "بوابة الأهالي",
    purpose: "متابعة الأبناء والحضور والرسوم والتقارير",
    navKey: "nav_parent",
    caption: "بوابة ولي الأمر",
  },
  {
    id: "teacher",
    prefix: "/teacher",
    home: "/teacher",
    role: "TEACHER",
    roles: ["TEACHER"],
    label: "بوابة المعلمين",
    purpose: "الفصول والحضور والتحضير وأدوات الذكاء الاصطناعي",
    navKey: "nav_teacher",
    caption: "بوابة المعلم",
  },
  {
    id: "supervisor",
    prefix: "/supervisor",
    home: "/supervisor",
    role: "SUPERVISOR",
    roles: ["SUPERVISOR"],
    label: "بوابة المشرفين",
    purpose: "مراجعة الخطط وتقييم الأداء والجودة التعليمية",
    navKey: "nav_supervisor",
    caption: "بوابة المشرف",
  },
  {
    id: "institution",
    prefix: "/institution",
    home: "/institution",
    role: "INSTITUTION_TEACHER",
    roles: ["INSTITUTION_TEACHER"],
    label: "بوابة المؤسسات",
    purpose: "إدارة الطاقم والفصول والرسوم وملف المركز",
    navKey: "nav_institution",
    caption: "بوابة إدارة المؤسسة",
  },
  {
    id: "admin",
    prefix: "/admin",
    home: "/admin",
    role: "SUPER_ADMIN",
    roles: ["SUPER_ADMIN"],
    label: "لوحة الإدارة",
    purpose: "التوثيق والمطابقة المالية وإدارة المستخدمين",
    navKey: "nav_admin",
    caption: "لوحة تحكم الإدارة",
  },
];

/** The platform-wide tier: implicitly allowed into every portal. */
export const PLATFORM_ADMIN_ROLE: Role = "SUPER_ADMIN";

const BY_ID = new Map<PortalId, PortalDef>(PORTALS.map((p) => [p.id, p]));

/** Home route per tier — what `router.push` uses right after sign-in. */
export const ROLE_HOME: Record<Role, string> = {
  PARENT: "/parent",
  INSTITUTION_TEACHER: "/institution",
  TEACHER: "/teacher",
  SUPERVISOR: "/supervisor",
  SUPER_ADMIN: "/admin",
};

/** Which portal a tier owns. */
export const ROLE_PORTAL: Record<Role, PortalId> = {
  PARENT: "parent",
  INSTITUTION_TEACHER: "institution",
  TEACHER: "teacher",
  SUPERVISOR: "supervisor",
  SUPER_ADMIN: "admin",
};

/** Human label per tier (used in badges, dropdowns and tables). */
export const ROLE_LABEL: Record<Role, string> = {
  PARENT: "ولي أمر",
  INSTITUTION_TEACHER: "إدارة مؤسسة",
  TEACHER: "معلم",
  SUPERVISOR: "مشرف تعليمي",
  SUPER_ADMIN: "إدارة النظام",
};

/** Sidebar caption per tier, for the switcher entry description. */
export const ROLE_DESCRIPTION: Record<Role, string> = {
  PARENT: "متابعة الأبناء والحضور والرسوم",
  INSTITUTION_TEACHER: "إدارة المركز والطاقم والفصول",
  TEACHER: "الحضور والتحضير وأدوات الذكاء الاصطناعي",
  SUPERVISOR: "مراجعة الخطط وتقييم الأداء",
  SUPER_ADMIN: "التوثيق والمالية والمستخدمون",
};

/** Tiers granted on top of a primary role by the sign-up form. */
export const SELF_SERVICE_ROLES: Role[] = [
  "PARENT",
  "TEACHER",
  "SUPERVISOR",
  "INSTITUTION_TEACHER",
];

/** Staff tiers that may open the teachers' academy and teaching workspaces. */
export const TEACHING_STAFF_ROLES: Role[] = ["TEACHER", "SUPERVISOR"];

export function portalById(id: PortalId): PortalDef {
  const portal = BY_ID.get(id);
  if (!portal) throw new Error(`Unknown portal: ${id}`);
  return portal;
}

/** The portal whose prefix contains `pathname`, if any. */
export function portalForPath(pathname: string): PortalDef | undefined {
  return PORTALS.find(
    (portal) =>
      pathname === portal.prefix || pathname.startsWith(`${portal.prefix}/`)
  );
}

/**
 * Merges a primary role with the extra tiers stored on the account.
 *
 *   effectiveRoles("TEACHER", ["SUPERVISOR"]) → ["TEACHER", "SUPERVISOR"]
 *   effectiveRoles("PARENT", [])              → ["PARENT"]
 */
export function effectiveRoles(
  primary: Role | undefined | null,
  extra: readonly Role[] | undefined | null
): Role[] {
  const merged: Role[] = [];
  if (primary) merged.push(primary);
  for (const role of extra ?? []) {
    if (role && !merged.includes(role)) merged.push(role);
  }
  return merged;
}

/** True when any of `roles` may enter the portal. */
export function canEnterPortal(
  portal: PortalDef | PortalId,
  roles: readonly Role[]
): boolean {
  const target = typeof portal === "string" ? portalById(portal) : portal;
  if (roles.includes(PLATFORM_ADMIN_ROLE)) return true;
  return roles.some((role) => target.roles.includes(role));
}

/** Every portal the given tiers may enter, in tier order. */
export function portalsForRoles(roles: readonly Role[]): PortalDef[] {
  return PORTALS.filter((portal) => canEnterPortal(portal, roles));
}

/**
 * Landing route for a tier set: the first portal the account may enter.
 *
 * Used by the middleware when a signed-in user hits a portal they cannot
 * enter, and by the sign-in flow once the database role is known.
 */
export function homeForRoles(roles: readonly Role[]): string {
  const portal = portalsForRoles(roles)[0];
  return portal ? portal.home : "/";
}

/** Safe home route for a possibly-unknown role value. */
export function dashboardFor(role: Role | undefined | null): string {
  if (!role) return "/";
  return ROLE_HOME[role] ?? "/";
}

/** Portal that owns a tier. */
export function portalForRole(role: Role | undefined | null): PortalDef {
  return portalById(ROLE_PORTAL[role ?? "PARENT"] ?? "parent");
}
