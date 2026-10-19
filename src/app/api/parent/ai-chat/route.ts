import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { siteConfig } from "@/lib/config/site";

/**
 * POST /api/parent/ai-chat — the parent-portal assistant.
 *
 * Server-side proxy on purpose: the FastAPI microservice address never has to be
 * reachable from the browser, the question is answered by a route that the RBAC
 * middleware already protects, and the portal gets one stable contract whether
 * the AI service is up, down or unconfigured.
 *
 * `middleware.ts` guards `/api/parent/*` (session + verified email + PARENT
 * role). The session is checked again here — defence in depth, so this handler
 * cannot silently become public if that matcher is ever edited.
 */
const chatSchema = z.object({
  message: z.string().trim().min(1, { message: "اكتب سؤالك أولاً" }).max(600),
  language: z.enum(["ar", "en"]).default("ar"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string().trim().min(1).max(1000),
      })
    )
    .max(8)
    .default([]),
});

/** Private dependency URL; `NEXT_PUBLIC_FASTAPI_URL` is the dev default. */
function aiServiceBaseUrl(): string {
  return (process.env.FASTAPI_URL || siteConfig.fastApiUrl).replace(/\/$/, "");
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "PARENT") {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED", message: "يجب تسجيل الدخول كولي أمر" },
      { status: 401 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, code: "INVALID_INPUT", message: "صيغة الطلب غير صحيحة" },
      { status: 400 }
    );
  }

  const parsed = chatSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_INPUT",
        message: parsed.error.issues[0]?.message ?? "صيغة الطلب غير صحيحة",
      },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(`${aiServiceBaseUrl()}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...parsed.data,
        // Gives the assistant the child's name for a warmer, specific answer.
        studentName: session.user.name ?? undefined,
      }),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(
        `[ai-chat] microservice answered ${response.status} for user ${session.user.id}`
      );
      return NextResponse.json(
        {
          success: false,
          code: "AI_SERVICE_ERROR",
          message: "المساعد الذكي غير متاح حالياً. حاول بعد قليل أو راسل الدعم.",
        },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      reply?: string;
      suggestions?: string[];
      source?: string;
    };

    if (!data.reply) {
      return NextResponse.json(
        {
          success: false,
          code: "AI_EMPTY_REPLY",
          message: "لم يصل جواب من المساعد الذكي. حاول مرة أخرى.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        reply: data.reply,
        suggestions: Array.isArray(data.suggestions) ? data.suggestions.slice(0, 3) : [],
        source: data.source ?? "knowledge_base",
      },
      { status: 200 }
    );
  } catch (error) {
    // The Python service is optional in development — say so instead of 500.
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.warn(`[ai-chat] ${timedOut ? "timeout" : "unreachable"} at ${aiServiceBaseUrl()}`);

    return NextResponse.json(
      {
        success: false,
        code: timedOut ? "AI_TIMEOUT" : "AI_UNAVAILABLE",
        message: timedOut
          ? "المساعد الذكي تأخر في الرد. جرّب سؤالاً أقصر."
          : "المساعد الذكي غير مُشغَّل الآن. يمكنك مراسلة الدعم من صفحة «تواصل معنا».",
      },
      { status: timedOut ? 504 : 503 }
    );
  }
}
