import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { MailCheck } from "lucide-react";

import { authOptions } from "@/lib/auth";

import { AcceptInvitationClient } from "./accept-client";

export const metadata: Metadata = {
  title: "قبول دعوة الانضمام",
  description: "قبول دعوة الانضمام إلى طاقم مركز تعليمي داخل منصة صَرْح.",
};
export const dynamic = "force-dynamic";

/**
 * `/invitations/accept?token=…` — the link the invitation email points at.
 *
 * Deliberately outside every portal: an invited TEACHER may still be a PARENT
 * account with no teacher tier, so a portal-guarded route would bounce them
 * before they could accept. Signing in is still required, and the browser is
 * sent back here (token intact) afterwards; the server then checks the stored
 * email and its verification state before any membership is created.
 */
export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const raw = searchParams?.token;
  const token = typeof raw === "string" ? raw.trim() : "";
  const signedIn = Boolean((await getServerSession(authOptions))?.user);

  if (!signedIn) {
    const callback =
      token.length > 0
        ? `/invitations/accept?token=${encodeURIComponent(token)}`
        : "/invitations/accept";
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(callback)}`);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-6 px-5 py-16">
      <div className="rounded-3xl border border-sarh-navy/10 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-sarh-navy">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sarh-teal/10 text-sarh-tealInk">
            <MailCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-bold text-sarh-navy dark:text-white">
              قبول دعوة الانضمام
            </h1>
            <p className="text-xs text-sarh-inkMute dark:text-slate-400">
              يتطلب القبول تسجيل الدخول بالبريد الذي وصلته الدعوة بعد تأكيده.
            </p>
          </div>
        </div>

        <div className="mt-6">
          {token.length > 0 ? (
            <AcceptInvitationClient token={token} />
          ) : (
            <p className="rounded-xl border border-sarh-rose/30 bg-sarh-rose/10 px-3 py-2 text-xs font-semibold text-sarh-roseInk">
              رابط الدعوة ناقص — افتح الرابط كاملاً من رسالة البريد.
            </p>
          )}
        </div>

        <p className="mt-6 text-[11px] text-sarh-inkMute dark:text-slate-400">
          <Link href="/" className="underline underline-offset-4">
            العودة إلى الصفحة الرئيسية
          </Link>
        </p>
      </div>
    </main>
  );
}
