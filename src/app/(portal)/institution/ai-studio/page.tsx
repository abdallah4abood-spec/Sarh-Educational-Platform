import type { Metadata } from "next";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import {
  loadInstitutionCommissions,
  loadInstitutionHeader,
  loadInstitutionRoster,
  loadInstitutionSubjects,
  resolveInstitutionId,
} from "@/lib/db/institution";

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
export default async function AiStudioPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const institutionId = userId ? await resolveInstitutionId(userId) : null;

  const [header, roster, commissions, subjects] = institutionId
    ? await Promise.all([
        loadInstitutionHeader(institutionId),
        loadInstitutionRoster(institutionId),
        loadInstitutionCommissions(institutionId, 100),
        loadInstitutionSubjects(institutionId),
      ])
    : [null, [], [], []];

  return (
    <AiStudioClient
      institutionId={institutionId ?? ""}
      institutionName={header?.name ?? "بوابة المؤسسة"}
      roster={roster}
      commissions={commissions}
      subjects={subjects}
    />
  );
}
