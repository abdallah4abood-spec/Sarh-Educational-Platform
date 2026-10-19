import type { Metadata } from "next";

import {
  loadFinanceStats,
  loadPaymentReceipts,
  loadPendingInstitutionApprovals,
} from "@/lib/db/finance";

import { FinanceClient } from "./finance-client";

export const metadata: Metadata = {
  title: "المركز المالي ومطابقة الإيصالات",
  description:
    "مركز التحكم المالي لمدير النظام: إيرادات المنصة وعمولات التسجيل، مطابقة إيصالات الدفع عبر خدمة OCR الذكية، وطابور اعتماد المؤسسات — بأرقام جدولية (tabular-nums).",
};

/**
 * Admin Finance Hub (Design.md Prompt 5 / §47) — Stripe-inspired
 * analytical workspace. Guarded by `middleware.ts` (RBAC: SUPER_ADMIN).
 *
 * The server page owns the reads: KPIs computed from the ledger, the pending
 * receipt queue and the institution approval queue all come from PostgreSQL,
 * and approve/reject decisions persist through the admin API routes.
 */
export default async function AdminFinancePage() {
  const [stats, receipts, approvals] = await Promise.all([
    loadFinanceStats(),
    loadPaymentReceipts(),
    loadPendingInstitutionApprovals(),
  ]);

  return (
    <FinanceClient stats={stats} receipts={receipts} approvals={approvals} />
  );
}
