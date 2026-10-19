import { prisma } from "@/lib/prisma";
import type {
  ApprovalRow,
  FinanceStats,
  PaymentReceipt,
  PaymentStatus,
} from "@/lib/data/finance";

/**
 * Financial Centre reads (`/admin/finance`, receipts, OCR reconciliation).
 *
 * Every figure is computed from `PaymentTransaction`, `Enrollment` and
 * `Institution` rows — there is no stored platform total to drift out of sync
 * with the ledger, and no bundled snapshot to fall back on. If the database is
 * unreachable the pages fail loudly, which for money is the honest outcome.
 */

type ReceiptRow = Awaited<ReturnType<typeof queryReceipts>>[number];

function queryReceipts(status?: PaymentStatus) {
  return prisma.paymentTransaction.findMany({
    where: status ? { status } : undefined,
    include: {
      user: { select: { fullName: true } },
      institution: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
}

/**
 * `ocrData` is untyped Json written by the AI microservice; read it
 * defensively so a malformed row degrades one field, not the whole page.
 */
function fromOcr(ocrData: unknown): {
  transactionId?: string;
  method?: string;
  confidence?: number;
} {
  if (!ocrData || typeof ocrData !== "object" || Array.isArray(ocrData)) {
    return {};
  }
  const data = ocrData as Record<string, unknown>;
  return {
    transactionId:
      typeof data.transactionId === "string" ? data.transactionId : undefined,
    method: typeof data.method === "string" ? data.method : undefined,
    confidence:
      typeof data.confidence === "number" ? data.confidence : undefined,
  };
}

function toReceipt(row: ReceiptRow): PaymentReceipt {
  const ocr = fromOcr(row.ocrData);
  return {
    id: row.id,
    payerName: row.user.fullName,
    amount: row.amount,
    currency: "ILS",
    transactionId: ocr.transactionId ?? `TRX-${row.id.slice(0, 5).toUpperCase()}`,
    date: row.createdAt.toISOString().slice(0, 10),
    method: ocr.method === "جوّال باي" ? "جوّال باي" : "تحويل بنكي",
    institutionName: row.institution?.name ?? "منصة صَرْح",
    status: row.status,
    confidence: ocr.confidence ?? 0.9,
    image: row.receiptUrl,
  };
}

export async function loadPaymentReceipts(
  status?: PaymentStatus
): Promise<PaymentReceipt[]> {
  const rows = await queryReceipts(status);
  return rows.map(toReceipt);
}

/** One receipt for the OCR reconciler's focused workspace. */
export async function loadReceipt(
  id: string
): Promise<PaymentReceipt | null> {
  const row = await prisma.paymentTransaction.findUnique({
    where: { id },
    include: {
      user: { select: { fullName: true } },
      institution: { select: { name: true } },
    },
  });
  return row ? toReceipt(row) : null;
}

/**
 * Platform head-line figures for the Financial Centre tiles.
 *
 *   totalRevenue         — every VERIFIED receipt on the platform
 *   collectedCommissions — commission on enrollments finance has verified
 *   pendingApprovals     — receipts waiting on a reviewer
 *   activeCenters        — institutions already verified in the directory
 */
export async function loadFinanceStats(): Promise<FinanceStats> {
  const [revenue, commissions, pendingApprovals, activeCenters] =
    await Promise.all([
      prisma.paymentTransaction.aggregate({
        where: { status: "VERIFIED" },
        _sum: { amount: true },
      }),
      prisma.enrollment.aggregate({
        where: { status: "VERIFIED" },
        _sum: { commissionFee: true },
      }),
      prisma.paymentTransaction.count({ where: { status: "PENDING" } }),
      prisma.institution.count({ where: { trustStatus: "VERIFIED" } }),
    ]);

  return {
    totalRevenue: revenue._sum.amount ?? 0,
    collectedCommissions: commissions._sum.commissionFee ?? 0,
    pendingApprovals,
    activeCenters,
  };
}

/**
 * The approval queue shown beside the receipts: centres whose trust request
 * is still PENDING. Reacting to one here and in `/admin/trust` is the same
 * write, so the two screens cannot disagree.
 */
export async function loadPendingInstitutionApprovals(): Promise<ApprovalRow[]> {
  const rows = await prisma.institution.findMany({
    where: { trustStatus: "PENDING" },
    include: { owner: { select: { fullName: true } } },
    orderBy: { trustRequestedAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    institutionName: row.name,
    type: row.type === "KINDERGARTEN" ? "روضة أطفال" : "مركز تعليمي",
    zone: row.zone,
    ownerName: row.owner.fullName,
    submittedAt: (row.trustRequestedAt ?? row.createdAt)
      .toISOString()
      .slice(0, 10),
    status: "PENDING",
  }));
}
