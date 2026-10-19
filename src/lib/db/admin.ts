import type { ActivityType } from "@prisma/client";

import type {
  ActivityPoint,
  AdminInstitutionRow,
  AdminUserRow,
} from "@/lib/data/portal";
import type { ApprovalRow } from "@/lib/data/finance";
import { prisma } from "@/lib/prisma";

/**
 * Super Admin reads (`/admin/**`) — platform-wide control.
 *
 * These queries deliberately run *unscoped*: the admin tier is the one tier
 * whose job is the whole platform. Everything else in `src/lib/db` is scoped
 * to the signed-in account; this module is the single place where that rule is
 * inverted, so the exception is easy to audit.
 */

function isoDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(offsetDays = 0): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - offsetDays);
  return date;
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export interface TierCount {
  tier: string;
  extra: string[];
  count: number;
}

export interface AdminLiveCounts {
  users: number;
  verifiedUsers: number;
  unverifiedUsers: number;
  byTier: TierCount[];
  institutions: number;
  pendingPayments: number;
  /** Always `db` — these figures are read live, never from a snapshot. */
  source: "db";
}

/** Live platform counts for the admin header tiles. */
export async function loadAdminLiveCounts(): Promise<AdminLiveCounts> {
  const [users, verified, rows, institutions, pendingPayments] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerified: { not: null } } }),
      prisma.user.findMany({ select: { role: true, roles: true } }),
      prisma.institution.count(),
      prisma.paymentTransaction.count({ where: { status: "PENDING" } }),
    ]);

  const grouped = new Map<string, TierCount>();
  for (const row of rows) {
    const key = `${row.role}|${[...row.roles].sort().join(",")}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.set(key, { tier: row.role, extra: [...row.roles], count: 1 });
    }
  }

  return {
    users,
    verifiedUsers: verified,
    unverifiedUsers: Math.max(users - verified, 0),
    byTier: [...grouped.values()].sort((a, b) => b.count - a.count),
    institutions,
    pendingPayments,
    source: "db",
  };
}

/** All accounts, newest first — the `/admin/users` table. */
export async function loadAdminUsers(take = 50): Promise<AdminUserRow[]> {
  const rows = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      fullName: true,
      email: true,
      phoneNumber: true,
      role: true,
      roles: true,
      emailVerified: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.fullName,
    email: row.email,
    phone: row.phoneNumber,
    tier: row.role,
    extraTiers: [...row.roles],
    status: row.emailVerified ? "ACTIVE" : "UNVERIFIED",
    joinedAt: isoDay(row.createdAt),
  }));
}

/* ------------------------------------------------------------------ */
/* Institutions                                                        */
/* ------------------------------------------------------------------ */

const TYPE_LABEL = {
  KINDERGARTEN: "روضة أطفال",
  EDUCATIONAL_CENTER: "مركز تعليمي",
} as const;

/** Trust state + verified commission, for the admin institution table. */
export async function loadAdminInstitutions(
  take = 50
): Promise<AdminInstitutionRow[]> {
  const rows = await prisma.institution.findMany({
    orderBy: { rating: "desc" },
    take,
    include: {
      owner: { select: { fullName: true } },
      students: { select: { status: true, commissionFee: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: TYPE_LABEL[row.type],
    zone: row.zone,
    owner: row.owner.fullName,
    rating: row.rating,
    students: row.students.length,
    state:
      row.trustStatus === "VERIFIED"
        ? "VERIFIED"
        : row.trustStatus === "REJECTED"
          ? "SUSPENDED"
          : "PENDING",
    commission: row.students
      .filter((enrollment) => enrollment.status === "VERIFIED")
      .reduce((sum, enrollment) => sum + enrollment.commissionFee, 0),
  }));
}

/**
 * Trust & Verification queue: every centre that has asked to be reviewed,
 * newest request first. UNVERIFIED centres that never requested are omitted —
 * they are not waiting on the platform.
 */
export async function loadTrustQueue(take = 24): Promise<ApprovalRow[]> {
  const rows = await prisma.institution.findMany({
    where: { trustRequestedAt: { not: null } },
    include: { owner: { select: { fullName: true } } },
    orderBy: { trustRequestedAt: "desc" },
    take,
  });

  return rows.map((row) => ({
    id: row.id,
    institutionName: row.name,
    type: TYPE_LABEL[row.type],
    zone: row.zone,
    ownerName: row.owner.fullName,
    submittedAt: isoDay(row.trustRequestedAt ?? row.createdAt),
    status:
      row.trustStatus === "VERIFIED"
        ? "VERIFIED"
        : row.trustStatus === "REJECTED"
          ? "REJECTED"
          : "PENDING",
  }));
}

/* ------------------------------------------------------------------ */
/* Activity & totals                                                   */
/* ------------------------------------------------------------------ */

const FRIDAY_FIRST_WEEK = [
  "الجمعة",
  "السبت",
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
];

/** Platform activity per day for the last week — the overview chart. */
export async function loadActivitySeries(days = 7): Promise<ActivityPoint[]> {
  const from = startOfDay(days - 1);

  const rows = await prisma.activityEvent.findMany({
    where: { createdAt: { gte: from } },
    select: { createdAt: true },
  });

  const buckets = new Map<string, number>();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    buckets.set(isoDay(startOfDay(offset)), 0);
  }
  for (const row of rows) {
    const key = isoDay(row.createdAt);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()].map(([key, value]) => ({
    // The label is read from the bucket's own date so the chart can never
    // disagree with the window it is plotting.
    day: FRIDAY_FIRST_WEEK[new Date(`${key}T12:00:00`).getDay()],
    value,
  }));
}

export interface AdminTotals {
  institutions: number;
  trustRequests: number;
  monthlyVerifications: number;
  /** Relative change vs the previous period, e.g. 0.12 = +12%. */
  verificationTrend: number;
}

export async function loadAdminTotals(): Promise<AdminTotals> {
  const since30 = startOfDay(30);
  const since60 = startOfDay(60);

  const [
    institutions,
    trustRequests,
    monthlyVerifications,
    previousVerifications,
  ] = await Promise.all([
    prisma.institution.count(),
    prisma.institution.count({ where: { trustStatus: "PENDING" } }),
    prisma.activityEvent.count({
      where: { type: "VERIFICATION", createdAt: { gte: since30 } },
    }),
    prisma.activityEvent.count({
      where: {
        type: "VERIFICATION",
        createdAt: { gte: since60, lt: since30 },
      },
    }),
  ]);

  return {
    institutions,
    trustRequests,
    monthlyVerifications,
    verificationTrend:
      previousVerifications === 0
        ? monthlyVerifications > 0
          ? 1
          : 0
        : (monthlyVerifications - previousVerifications) / previousVerifications,
  };
}

/** Recent platform events for the admin overview's activity list. */
export async function loadRecentActivity(take = 8) {
  const rows = await prisma.activityEvent.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { institution: { select: { name: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type as ActivityType,
    label: row.label,
    amount: row.amount,
    institutionName: row.institution?.name ?? null,
    at: `${String(row.createdAt.getHours()).padStart(2, "0")}:${String(
      row.createdAt.getMinutes()
    ).padStart(2, "0")}`,
  }));
}
