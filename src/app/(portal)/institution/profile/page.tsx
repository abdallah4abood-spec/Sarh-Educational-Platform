import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Gauge,
  Globe,
  MapPin,
  Phone,
  Star,
  Store,
  X,
} from "lucide-react";

import { Meter, PageHeader, Panel, StatCard } from "@/components/portal/primitives";
import { StatusPill } from "@/components/portal/status-pill";
import { authOptions } from "@/lib/auth";
import {
  loadDirectoryChecklist,
  loadInstitutionProfile,
  resolveInstitutionId,
} from "@/lib/db/institution";

export const metadata: Metadata = {
  title: "ملف المركز في الدليل",
  description:
    "اكتمال ملف المركز في الدليل العام: بيانات التواصل والموقع والصور والرسوم والتراخيص، وكيف يظهر المركز لأولياء الأمور على منصة صَرْح.",
};

/**
 * Institution → Public directory profile.
 *
 * The one screen where a center's private workspace meets its public listing:
 * it shows the same fields the directory card renders, and marks what is still
 * missing before the «موثّق» badge can appear.
 */
export default async function InstitutionProfilePage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const institutionId = userId ? await resolveInstitutionId(userId) : null;
  const [checklist, loaded] = institutionId
    ? await Promise.all([
        loadDirectoryChecklist(institutionId),
        loadInstitutionProfile(institutionId),
      ])
    : [[], null];

  // A centre that is not attached yet still gets a well-formed page rather
  // than a crash: every field falls back to its empty value.
  const profile = loaded ?? {
    name: "المؤسسة",
    zone: "—",
    phone: "—",
    verified: false,
    rating: 0,
    reviews: 0,
    occupancy: 0,
    description: "",
    trustNote: "",
  };

  const done = checklist.filter((item) => item.done).length;
  const completion = checklist.length
    ? Math.round((done / checklist.length) * 100)
    : 0;
  const missing = checklist.filter((item) => !item.done);

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb={["بوابة المؤسسة", "ملف الدليل"]}
        title="ملف المركز في الدليل"
        lead="هكذا يظهر مركزك لأولياء الأمور في دليل صَرْح العام — أكمل البنود الناقصة لتظهر شارة التوثيق."
        icon={Store}
        actions={
          <Link
            href="/explore/centers"
            className="inline-flex items-center gap-1.5 rounded-xl bg-sarh-teal px-4 py-2.5 text-xs font-bold text-white shadow-teal-glow"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            عرض الدليل العام
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="اكتمال الملف"
          value={`${completion}%`}
          hint={`${done} من ${checklist.length} بنود`}
          icon={Gauge}
          accent="teal"
        />
        <StatCard
          label="تقييم المركز"
          value={String(profile.rating)}
          hint={`من ${profile.reviews} تسجيلاً موثّقاً`}
          icon={Star}
          accent="gold"
        />
        <StatCard
          label="نسبة الإشغال"
          value={`${Math.round(profile.occupancy * 100)}%`}
          hint="مقاعد محجوزة عبر المنصة"
          icon={Store}
          accent="navy"
        />
        <StatCard
          label="بنود ناقصة"
          value={String(missing.length)}
          hint="تحتاج تحديثاً من إدارة المركز"
          icon={Globe}
          accent={missing.length > 0 ? "rose" : "teal"}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Panel
          title="بطاقة الدليل العامة"
          description="كما يراها أولياء الأمور"
          icon={Store}
        >
          <div className="rounded-2xl border border-sarh-borderLight p-5 dark:border-sarh-borderDark">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-bold text-sarh-navy dark:text-white">
                {profile.name}
              </h3>
              {profile.verified ? (
                <StatusPill tone="teal">موثّق</StatusPill>
              ) : (
                <StatusPill tone="gold">قيد التوثيق</StatusPill>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 fill-sarh-gold text-sarh-gold" aria-hidden="true" />
                <span dir="ltr">
                  {profile.rating} ({profile.reviews})
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-sarh-teal" aria-hidden="true" />
                {profile.zone}
              </span>
              <span className="inline-flex items-center gap-1.5" dir="ltr">
                <Phone className="h-3.5 w-3.5 text-sarh-teal" aria-hidden="true" />
                {profile.phone}
              </span>
            </div>

            <div className="mt-4">
              <Meter
                label="نسبة الإشغال"
                value={profile.occupancy * 100}
                accent="teal"
              />
            </div>
          </div>

          <p className="mt-4 text-xs leading-6 text-slate-500 dark:text-slate-400">
            يظهر الملف في <strong>المراكز التعليمية</strong> بدليل صَرْح، وتُحدَّث
            بياناته من هذه الصفحة فقط — كي لا يقرأ ولي الأمر رقماً قديماً.
          </p>
        </Panel>

        <Panel
          title="بنود الملف"
          description={`${completion}% مكتمل`}
          icon={Gauge}
        >
          <ul className="space-y-3">
            {checklist.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-3 rounded-xl border border-sarh-borderLight p-3 dark:border-sarh-borderDark"
              >
                <span
                  className={
                    item.done
                      ? "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sarh-teal text-white"
                      : "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sarh-gold text-white"
                  }
                >
                  {item.done ? (
                    <Check className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <X className="h-3 w-3" aria-hidden="true" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-sarh-navy dark:text-slate-200">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-6 text-slate-500 dark:text-slate-400">
                    {item.hint}
                  </span>
                </span>
                <span className="ms-auto shrink-0">
                  <StatusPill tone={item.done ? "teal" : "gold"}>
                    {item.done ? "مكتمل" : "ناقص"}
                  </StatusPill>
                </span>
              </li>
            ))}
          </ul>

          {missing.length > 0 ? (
            <Link
              href="/contact"
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-sarh-teal hover:underline"
            >
              تواصل مع فريق صَرْح لإكمال البنود الناقصة
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
