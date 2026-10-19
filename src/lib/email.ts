import { siteConfig } from "@/lib/config/site";

/**
 * SARH — transactional email over the Resend HTTP API.
 *
 * The REST endpoint is called with `fetch` instead of the `resend` SDK on
 * purpose: it keeps the dependency tree of a Next.js server bundle tiny and
 * works identically in Node and in an edge runtime.
 *
 * Everything degrades gracefully — if `RESEND_API_KEY` is absent (a fresh
 * clone, CI, offline dev) the message is logged instead of thrown, so signup
 * still completes and the verification link stays discoverable in the server
 * log.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** `EMAIL_FROM` must be a Resend-verified sender; the sandbox default works. */
export function emailFrom(): string {
  return process.env.EMAIL_FROM || "SARH <onboarding@resend.dev>";
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface SendEmailResult {
  sent: boolean;
  /** Stable code so callers can react without parsing a provider message. */
  code?: "NOT_CONFIGURED" | "PROVIDER_ERROR" | "NETWORK_ERROR";
  error?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo,
}: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY is not set — skipped "${subject}" to ${to}`
    );
    return { sent: false, code: "NOT_CONFIGURED" };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom(),
        to: [to],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      // A slow mail provider must never hang a signup request.
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        `[email] Resend rejected "${subject}" to ${to}: ${response.status} ${detail.slice(0, 300)}`
      );
      return {
        sent: false,
        code: "PROVIDER_ERROR",
        error: `HTTP ${response.status}`,
      };
    }

    return { sent: true };
  } catch (error) {
    console.error(`[email] failed to send "${subject}" to ${to}:`, error);
    return {
      sent: false,
      code: "NETWORK_ERROR",
      error: error instanceof Error ? error.message : "unknown",
    };
  }
}

/** Bilingual, inline-styled email — email clients ignore external CSS. */
function layout(title: string, bodyHtml: string, footer: string): string {
  return `<!doctype html>
<html dir="rtl" lang="ar">
  <body style="margin:0;padding:24px;background:#F8FAFC;font-family:'Readex Pro',Tajawal,Arial,sans-serif;color:#0F2C59;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;">
      <tr>
        <td style="padding:28px 28px 8px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#00A99D;">صَرْح</p>
          <h1 style="margin:12px 0 0;font-size:20px;line-height:1.6;">${title}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 28px 28px;font-size:14px;line-height:1.9;">${bodyHtml}</td>
      </tr>
      <tr>
        <td style="padding:16px 28px 24px;border-top:1px solid #E2E8F0;font-size:12px;color:#64748D;">${footer}</td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Escapes untrusted form input before it is interpolated into the HTML body —
 * the contact form is public, so every field is attacker-controlled.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function button(url: string, label: string): string {
  return `<p style="margin:20px 0;">
    <a href="${url}" style="display:inline-block;background:#00A99D;color:#FFFFFF;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;">${label}</a>
  </p>`;
}

/**
 * Contact-form notification, delivered to the platform support inbox with the
 * visitor's address as `reply_to` so replying reaches them directly.
 *
 * Returns `{ sent: false }` instead of throwing for every failure mode
 * (unconfigured key, provider rejection, network error), because a mail outage
 * must never turn a public form submission into a 5xx.
 */
export async function sendContactEmail(input: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<SendEmailResult> {
  const { name, email, subject, message } = input;

  return sendEmail({
    to: siteConfig.supportEmail,
    replyTo: email,
    subject: `[${siteConfig.name}] ${subject}`,
    text: [
      "رسالة جديدة من نموذج التواصل في صَرْح",
      "",
      `الاسم: ${name}`,
      `البريد: ${email}`,
      `الموضوع: ${subject}`,
      "",
      message,
      "",
      `— ${siteConfig.name} · ${siteConfig.location}`,
    ].join("\n"),
    html: layout(
      escapeHtml(subject),
      `<p style="margin:0;">رسالة جديدة من نموذج التواصل في <strong>صَرْح</strong>:</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 0;font-size:14px;line-height:1.9;">
         <tr><td style="padding:0 12px 4px 0;color:#64748D;">الاسم</td><td dir="auto">${escapeHtml(name)}</td></tr>
         <tr><td style="padding:0 12px 4px 0;color:#64748D;">البريد</td><td dir="ltr" style="text-align:left;">${escapeHtml(email)}</td></tr>
         <tr><td style="padding:0 12px 4px 0;color:#64748D;">الموضوع</td><td dir="auto">${escapeHtml(subject)}</td></tr>
       </table>
       <p style="margin:20px 0 0;padding:14px 16px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;white-space:pre-wrap;direction:auto;">${escapeHtml(message)}</p>`,
      `أُرسلت عبر نموذج التواصل في ${siteConfig.name} · ${siteConfig.appUrl}`
    ),
  });
}

/**
 * Password-recovery email (AR + EN in one message).
 *
 * Deliberately worded so it is useless to anyone who did not ask for it: the
 * link is the only action, and the copy tells the reader to ignore the message
 * if the request was not theirs.
 */
export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  url: string;
}): Promise<SendEmailResult> {
  const { to, name, url } = input;
  const safeName = name.trim() || to;

  return sendEmail({
    to,
    subject: "إعادة تعيين كلمة المرور في صَرْح | Reset your SARH password",
    text: [
      `مرحباً ${safeName}،`,
      "وصلنا طلب لإعادة تعيين كلمة المرور في منصة صَرْح. افتح الرابط التالي لتعيين كلمة مرور جديدة:",
      url,
      "الرابط صالح لمدة ساعة واحدة فقط. إن لم تطلب هذا التغيير فتجاهل الرسالة وستبقى كلمة مرورك كما هي.",
      "",
      `Hello ${safeName},`,
      "We received a request to reset your SARH password. Open this link to choose a new one:",
      url,
      "The link is valid for one hour. If you did not request this, ignore this message — your password will not change.",
      "",
      `— ${siteConfig.name} · ${siteConfig.supportEmail}`,
    ].join("\n"),
    html: layout(
      "إعادة تعيين كلمة المرور · Reset your password",
      `<p style="margin:0;">مرحباً ${escapeHtml(safeName)}،</p>
       <p style="margin:8px 0 0;">وصلنا طلب لإعادة تعيين كلمة المرور لحسابك في <strong>صَرْح</strong>. اضغط الزر التالي لتعيين كلمة مرور جديدة:</p>
       ${button(url, "تعيين كلمة مرور جديدة")}
       <p style="margin:0;color:#64748D;font-size:12px;">الرابط صالح لمدة ساعة واحدة فقط. إن لم تطلب هذا التغيير فتجاهل هذه الرسالة وستبقى كلمة مرورك كما هي.</p>
       <hr style="border:none;border-top:1px solid #E2E8F0;margin:20px 0;" />
       <p style="margin:0;direction:ltr;text-align:left;">Hello ${escapeHtml(safeName)}, a password reset was requested for your <strong>SARH</strong> account. Use the button above to choose a new password. The link expires in one hour. If you did not request this, you can safely ignore this message.</p>`,
      `${siteConfig.name} · ${siteConfig.location} · ${siteConfig.supportEmail}`
    ),
  });
}

/** Account verification email (AR + EN in one message). */
export async function sendVerificationEmail(input: {
  to: string;
  name: string;
  url: string;
}): Promise<SendEmailResult> {
  const { to, name, url } = input;
  const safeName = name.trim() || to;

  return sendEmail({
    to,
    subject: "تأكيد بريدك الإلكتروني في صَرْح | Verify your SARH email",
    text: [
      `مرحباً ${safeName}،`,
      "لتأكيد بريدك الإلكتروني في منصة صَرْح افتح الرابط التالي:",
      url,
      "",
      `Hello ${safeName},`,
      "Verify your SARH email address by opening this link:",
      url,
      "",
      `— ${siteConfig.name} · ${siteConfig.supportEmail}`,
    ].join("\n"),
    html: layout(
      "تأكيد البريد الإلكتروني · Verify your email",
      `<p style="margin:0;">مرحباً ${safeName}،</p>
       <p style="margin:8px 0 0;">شكراً لتسجيلك في <strong>صَرْح</strong>. اضغط الزر التالي لتأكيد بريدك الإلكتروني وتفعيل بوابة حسابك:</p>
       ${button(url, "تأكيد البريد الإلكتروني")}
       <p style="margin:0;color:#64748D;font-size:12px;">الرابط صالح لمدة ٢٤ ساعة. إن لم تُنشئ هذا الحساب تجاهل هذه الرسالة.</p>
       <hr style="border:none;border-top:1px solid #E2E8F0;margin:20px 0;" />
       <p style="margin:0;direction:ltr;text-align:left;">Hello ${safeName}, confirm your <strong>SARH</strong> email address with the button above. The link expires in 24 hours. If you did not sign up, please ignore this message.</p>`,
      `${siteConfig.name} · ${siteConfig.location} · ${siteConfig.supportEmail}`
    ),
  });
}
