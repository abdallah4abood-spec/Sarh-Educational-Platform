import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import {
  loadInstitutionCommissions,
  loadInstitutionHeader,
  loadInstitutionRoster,
  loadInstitutionSubjects,
} from "@/lib/db/institution";
import {
  hasCapability,
  requestedInstitutionId,
  resolveInstitutionAccess,
} from "@/lib/institution-access";

import { AiStudioClient } from "./ai-studio-client";

export const metadata: Metadata = {
  title: "استوديو المعلم والذكاء الاصطناعي",
  description:
    "تسجيل الحضور بضغطة واحدة مع حفظ محلي فوري (Dexie/IndexedDB) ومزامنة في الخلفية، وتوليد اختبارات تفاعلية عبر خدمة FastAPI، وجدول عمولات التسجيل.",
};

/**
 * AI Teacher Studio (Design.md Prompt 4) — Institution portal screen.
 * Guarded by `middleware.ts` (RBAC: INSTITUTION_TEACHER only).
 *
 * The server page owns every read: the roster, the commission ledger and the
 * subject options all come from PostgreSQL scoped to the signed-in centre, and
 * the client shell only composes them.
 */
export default async function AiStudioPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const requested = requestedInstitutionId(searchParams);
  const access = userId
    ? await resolveInstitutionAccess(userId, requested)
    : null;
  if (requested && !access) notFound();

  const canViewCommissions = access
    ? hasCapability(access, "commissions.read")
    : false;
  const [header, roster, subjects] = access
    ? await Promise.all([
        loadInstitutionHeader(access),
        loadInstitutionRoster(access),
        loadInstitutionSubjects(access),
      ])
    : [null, [], []];
  const commissions =
    access && canViewCommissions
      ? await loadInstitutionCommissions(access, 100)
      : [];

  return (
    <AiStudioClient
      institutionId={access?.institutionId ?? ""}
      institutionName={header?.name ?? "بوابة المؤسسة"}
      roster={roster}
      commissions={commissions}
      subjects={subjects}
      canViewCommissions={canViewCommissions}
    />
  );
}
