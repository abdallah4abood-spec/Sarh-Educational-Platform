"use client";

import Image from "next/image";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Images,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Phone,
  Share2,
  Star,
  UsersRound,
} from "lucide-react";

import { EnrollmentModal } from "./enrollment-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/language-provider";
import { ageRangeOf, type Center } from "@/lib/data/centers";
import { cn, formatSarh } from "@/lib/utils";

type TabKey = "overview" | "programs" | "gallery";

const SPRING = { type: "spring", stiffness: 300, damping: 30 } as const;

/**
 * Interactive half of the Center Profile (Design.md Prompt 2):
 * hero action bar (WhatsApp / call / share / book) + the tabbed content
 * interface that launches the multi-step Enrollment Modal.
 */
export function CenterProfile({ center }: { center: Center }) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<TabKey>("overview");
  const [modalOpen, setModalOpen] = useState(false);
  const [initialProgramId, setInitialProgramId] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);

  const openEnrollment = (programId?: string) => {
    setInitialProgramId(programId);
    setModalOpen(true);
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: center.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* the user dismissed the native share sheet */
    }
  };

  const tabs: { key: TabKey; label: string; icon: typeof Building2 }[] = [
    { key: "overview", label: t("overview"), icon: Building2 },
    { key: "programs", label: t("programs"), icon: CalendarCheck },
    { key: "gallery", label: t("gallery"), icon: Images },
  ];

  const stats = [
    { icon: UsersRound, label: t("studentsEnrolled"), value: String(center.studentsEnrolled) },
    { icon: Clock, label: t("yearsOfExperience"), value: String(center.yearsOfExperience) },
    { icon: CalendarCheck, label: t("ageRange"), value: ageRangeOf(center.type) },
    {
      icon: Star,
      label: t("ratingLabel"),
      value: `${center.rating.toFixed(1)} (${center.reviewsCount})`,
    },
  ];

  return (
    <>
      {/* ================= Hero action bar ================= */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-5 sm:px-6">
        <Button
          onClick={() => openEnrollment()}
          icon={<CalendarCheck className="h-4 w-4" aria-hidden="true" />}
          className="shadow-teal-glow"
        >
          {t("bookNow")}
        </Button>

        <a
          href={`https://wa.me/${center.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-sarh-borderLight px-4 text-sm font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal dark:border-sarh-borderDark dark:text-slate-100"
        >
          <MessageCircle className="h-4 w-4 text-sarh-teal" aria-hidden="true" />
          {t("contactWhatsApp")}
        </a>

        <a
          href={`tel:${center.phone}`}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-sarh-borderLight px-4 text-sm font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal dark:border-sarh-borderDark dark:text-slate-100"
        >
          <Phone className="h-4 w-4 text-sarh-teal" aria-hidden="true" />
          {t("call")}
        </a>

        <button
          type="button"
          onClick={() => void share()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-sarh-borderLight px-4 text-sm font-semibold text-sarh-navy transition-colors hover:border-sarh-gold hover:text-sarh-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-gold dark:border-sarh-borderDark dark:text-slate-100"
        >
          <Share2 className="h-4 w-4 text-sarh-gold" aria-hidden="true" />
          {copied ? t("copied") : t("share")}
        </button>
      </div>

      {/* ================= Tabs ================= */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div
          role="tablist"
          aria-label={t("programs")}
          className="flex gap-1 overflow-x-auto border-b border-sarh-borderLight dark:border-sarh-borderDark"
        >
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`tab-${key}`}
              aria-selected={tab === key}
              aria-controls={`panel-${key}`}
              onClick={() => setTab(key)}
              className={cn(
                "relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-semibold transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal",
                tab === key
                  ? "text-sarh-teal"
                  : "text-slate-500 hover:text-sarh-teal dark:text-slate-400"
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
              {tab === key ? (
                <motion.span
                  layoutId="tab-underline"
                  className="absolute inset-x-0 -bottom-px h-0.5 bg-sarh-teal shadow-teal-glow"
                  transition={SPRING}
                />
              ) : null}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={SPRING}
            className="py-8"
          >
            {/* -------- Tab 1: overview & services -------- */}
            {tab === "overview" ? (
              <div className="grid gap-8 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <h2 className="mb-3 text-xl font-bold text-sarh-navy dark:text-white">
                    {t("aboutThisCenter")}
                  </h2>
                  <p className="text-sm leading-8 text-slate-600 dark:text-slate-300">
                    {center.description}
                  </p>

                  <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {stats.map(({ icon: Icon, label, value }) => (
                      <div
                        key={label}
                        className="sarh-card flex flex-col gap-1 p-4"
                      >
                        <Icon
                          className="h-4 w-4 text-sarh-teal"
                          aria-hidden="true"
                        />
                        <span className="text-lg font-bold text-sarh-navy dark:text-white">
                          {value}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="sarh-card h-fit p-5">
                  <h3 className="mb-4 text-base font-bold text-sarh-navy dark:text-white">
                    {t("facilities")}
                  </h3>
                  <ul className="space-y-3">
                    {center.facilities.map((facility) => (
                      <li
                        key={facility}
                        className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"
                      >
                        <CheckCircle2
                          className="h-4 w-4 shrink-0 text-sarh-teal"
                          aria-hidden="true"
                        />
                        {facility}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            {/* -------- Tab 2: programs & class groups -------- */}
            {tab === "programs" ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {center.programs.map((program) => (
                  <article
                    key={program.id}
                    className="sarh-card flex flex-col gap-3 p-5 transition-shadow duration-200 hover:shadow-teal-gold-glow"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-bold text-sarh-navy dark:text-white">
                        {program.name}
                      </h3>
                      <Badge variant="teal">{program.grades}</Badge>
                    </div>

                    <p className="flex items-baseline gap-2 text-sm text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-[#C9741F] dark:text-sarh-gold">
                        {formatSarh(program.fee)}
                      </span>
                      / {t("month")}
                    </p>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEnrollment(program.id)}
                      className="mt-auto self-start"
                      icon={
                        <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                      }
                    >
                      {t("bookNow")}
                    </Button>
                  </article>
                ))}
              </div>
            ) : null}

            {/* -------- Tab 3: gallery & map -------- */}
            {tab === "gallery" ? (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
                  {center.gallery.map((image, index) => (
                    <div
                      key={`${center.id}-${index}`}
                      className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-sarh-mist shadow-soft dark:bg-sarh-cardDark"
                    >
                      <Image
                        src={image}
                        alt={`${center.name} — ${index + 1}`}
                        fill
                        sizes="(max-width: 1024px) 50vw, 33vw"
                        placeholder="blur"
                        className="object-cover"
                      />
                    </div>
                  ))}
                </div>

                <div className="sarh-card grid min-h-[220px] place-items-center bg-gradient-to-br from-sarh-teal/10 to-sarh-gold/10 p-6 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-full bg-sarh-teal/15 text-sarh-teal ring-1 ring-inset ring-sarh-teal/30">
                      <MapPin className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <p className="text-sm font-semibold text-sarh-navy dark:text-white">
                      {t("mapPlaceholder")}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {center.address}
                    </p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-sarh-navy ring-1 ring-inset ring-sarh-borderLight dark:bg-black/30 dark:text-slate-100 dark:ring-white/15">
                      <MapIcon className="h-3.5 w-3.5 text-sarh-gold" aria-hidden="true" />
                      {center.zone}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <EnrollmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        center={center}
        initialProgramId={initialProgramId}
      />
    </>
  );
}
