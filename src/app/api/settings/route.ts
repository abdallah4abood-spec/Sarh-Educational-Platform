import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { requireLiveSuperAdmin } from "@/lib/admin-access";
import { authOptions } from "@/lib/auth";
import {
  loadSiteSettings,
  saveSiteSettings,
} from "@/lib/config/site-settings";

/**
 * /api/settings — the platform contact details shown in the footer and on the
 * contact page.
 *
 *   GET    → public. Anyone (including a signed-out visitor) may read the
 *            contact block, so a public page never needs a session.
 *   PATCH  → SUPER_ADMIN only. Partial update.
 *   POST   → SUPER_ADMIN only. Alias of PATCH so `<form method="post">` and
 *            simple clients work too.
 *
 * The route guards itself instead of relying on `middleware.ts`, because
 * `/api/settings` is deliberately outside the `/api/admin` prefix: its GET has
 * to stay public.
 */

export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  supportPhone: z
    .string()
    .trim()
    .min(6, { message: "رقم الهاتف قصير جداً" })
    .max(32, { message: "رقم الهاتف طويل جداً" })
    .optional(),
  supportWhatsapp: z
    .string()
    .trim()
    .min(6, { message: "رقم واتساب قصير جداً" })
    .max(32, { message: "رقم واتساب طويل جداً" })
    .optional(),
  supportEmail: z
    .string()
    .trim()
    .email({ message: "صيغة البريد الإلكتروني غير صحيحة" })
    .max(120)
    .optional(),
  siteLocation: z
    .string()
    .trim()
    .min(2, { message: "الرجاء إدخال الموقع" })
    .max(120, { message: "الموقع طويل جداً" })
    .optional(),
});

export async function GET() {
  // `loadSiteSettings` already collapses a database outage onto siteConfig;
  // it also reports where each value really came from.
  const { settings, source, dbRowCount, dbAvailable } = await loadSiteSettings();

  return NextResponse.json(
    { success: true, settings, source, dbRowCount, dbAvailable },
    { headers: { "Cache-Control": "no-store" } }
  );
}

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  // Re-read the role from PostgreSQL: a stale JWT must not keep write access
  // to platform settings after the account is demoted.
  return requireLiveSuperAdmin(session);
}

async function updateSettings(request: Request) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_INPUT", message: "صيغة الطلب غير صحيحة" },
      { status: 400 }
    );
  }

  const parsed = settingsSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_INPUT",
        message: parsed.error.issues[0]?.message ?? "بيانات غير صالحة",
      },
      { status: 400 }
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { success: false, code: "INVALID_INPUT", message: "لا يوجد أي تغيير" },
      { status: 400 }
    );
  }

  try {
    const settings = await saveSiteSettings(parsed.data);
    return NextResponse.json({ success: true, settings }, { status: 200 });
  } catch (error) {
    console.error("[settings] save failed:", error);
    return NextResponse.json(
      {
        success: false,
        code: "DB_UNAVAILABLE",
        message: "تعذّر حفظ الإعدادات، تحقق من اتصال قاعدة البيانات.",
      },
      { status: 503 }
    );
  }
}

export async function PATCH(request: Request) {
  return updateSettings(request);
}

export async function POST(request: Request) {
  return updateSettings(request);
}
