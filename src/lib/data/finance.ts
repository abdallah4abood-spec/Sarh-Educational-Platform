/**
 * Super Admin — Financial Hub view contracts (Design.md Prompt 5).
 *
 * Mirrors the Prisma models (`PaymentTransaction`, `Institution`); the rows
 * come from `src/lib/db/finance.ts` and `src/lib/db/admin.ts`, which read
 * PostgreSQL. Receipt files are referenced by public URL
 * (`public/finance/`) rather than bundled imports, because a receipt is
 * uploaded by a user at runtime and a database column can only hold a path.
 */

export type PaymentStatus = "PENDING" | "VERIFIED" | "REJECTED";

export interface FinanceStats {
  /** إجمالي إيرادات المنصة (ILS) */
  totalRevenue: number;
  /** إجمالي العمولات المحصلة (ILS) */
  collectedCommissions: number;
  /** الطلبات بانتظار الاعتماد */
  pendingApprovals: number;
  /** المراكز النشطة */
  activeCenters: number;
}

export interface PaymentReceipt {
  id: string;
  payerName: string;
  amount: number;
  currency: "ILS";
  /** Bank transaction reference extracted by OCR. */
  transactionId: string;
  /** YYYY-MM-DD */
  date: string;
  method: "تحويل بنكي" | "جوّال باي";
  institutionName: string;
  status: PaymentStatus;
  /** Stored OCR confidence (0–1) from the AI microservice. */
  confidence: number;
  /** Public URL of the stored receipt image (`PaymentTransaction.receiptUrl`). */
  image: string;
}

export interface ApprovalRow {
  id: string;
  institutionName: string;
  type: "روضة أطفال" | "مركز تعليمي";
  zone: string;
  ownerName: string;
  /** YYYY-MM-DD */
  submittedAt: string;
  status: PaymentStatus;
}
