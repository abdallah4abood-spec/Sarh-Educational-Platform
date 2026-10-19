"use client";

import {
  type InputHTMLAttributes,
  type ReactNode,
  useId,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import type { UseFormRegisterReturn } from "react-hook-form";
import {
  Building2,
  Check,
  ClipboardCheck,
  Eye,
  EyeOff,
  GraduationCap,
  HeartHandshake,
  Lock,
  ShieldCheck,
  Sparkles,
  Users,
  WifiOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Shared chrome for the whole /auth/* suite.
 *
 * Everything the four screens (sign in, sign up, forgot, reset) have in common
 * lives here so they stay visually identical halves of one product:
 *
 *   - `AuthSplit`      the two-column frame. The form column is rendered at the
 *                      *inline start*, which is the RIGHT side in this RTL
 *                      Arabic layout, with the brand panel opposite it.
 *   - `AuthVisualPanel` brand, local illustration and the feature badges.
 *   - `AuthHeading`    brand card + page title + lead.
 *   - `RoleTabs`       account-type selector shared by sign in and sign up.
 *   - `TextField` / `PasswordField` / `PasswordStrengthMeter`.
 *   - `AuthNotice`     inline success/error banners.
 *
 * No demo or quick-login affordances live here on purpose: every screen does
 * real authentication against the database.
 */

/** Clickable SARH wordmark — always routes back to the public homepage. */
export function BrandCard() {
  return (
    <Link
      href="/"
      aria-label="صَرْح — الصفحة الرئيسية"
      className="group flex items-center gap-3 rounded-xl border border-sarh-borderLight bg-sarh-cardLight/80 p-3 shadow-soft transition-colors hover:border-sarh-teal hover:bg-sarh-teal/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal dark:border-sarh-borderDark dark:bg-sarh-cardDark/80"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-sarh-teal text-xl font-bold leading-none text-white shadow-teal-glow">
        صَ
      </span>
      <span className="flex flex-col">
        <span className="text-lg font-bold text-sarh-navy transition-colors group-hover:text-sarh-teal dark:text-white">
          صَرْح
        </span>
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          منصة ربط الأهالي بالمراكز التعليمية
        </span>
      </span>
    </Link>
  );
}

/** Page title block used at the top of every form column. */
export function AuthHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4">
      <BrandCard />
      <div>
        <h1 className="text-3xl font-bold text-sarh-navy dark:text-white sm:text-4xl">
          {title}
        </h1>
        <p className="mt-1.5 text-sm leading-7 text-slate-500 dark:text-slate-400">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

/**
 * Gaza learning-centre scene, drawn inline so it inherits the brand palette
 * and ships no binary asset. Purely decorative — the caption below carries
 * the meaning for assistive tech.
 */
function GazaLearningIllustration() {
  return (
    <svg
      viewBox="0 0 420 260"
      role="img"
      aria-hidden="true"
      className="h-auto w-full max-w-md"
    >
      <defs>
        <linearGradient id="sarh-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0F2C59" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#0F2C59" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sarh-dome" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00A99D" />
          <stop offset="100%" stopColor="#F2994A" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="420" height="260" fill="url(#sarh-sky)" />

      {/* sun */}
      <circle cx="352" cy="52" r="26" fill="#F2994A" opacity="0.85" />
      <circle cx="352" cy="52" r="42" fill="#F2994A" opacity="0.12" />

      {/* main hall with a dome */}
      <rect
        x="118"
        y="118"
        width="184"
        height="98"
        rx="10"
        fill="#0B2144"
        stroke="#00A99D"
        strokeOpacity="0.55"
      />
      <path
        d="M150 118a60 54 0 0 1 120 0z"
        fill="url(#sarh-dome)"
        opacity="0.9"
      />
      <rect
        x="204"
        y="46"
        width="4"
        height="22"
        rx="2"
        fill="#F2994A"
        opacity="0.9"
      />

      {/* windows */}
      {[136, 176, 244, 284].map((x) => (
        <rect
          key={x}
          x={x}
          y="146"
          width="18"
          height="18"
          rx="4"
          fill="#00A99D"
          opacity="0.35"
        />
      ))}
      {/* door */}
      <path
        d="M196 216v-40a14 14 0 0 1 28 0v40z"
        fill="#00A99D"
        opacity="0.75"
      />

      {/* olive tree */}
      <rect x="74" y="168" width="6" height="48" rx="3" fill="#F2994A" opacity="0.7" />
      <circle cx="77" cy="158" r="24" fill="#00A99D" opacity="0.35" />
      <circle cx="58" cy="170" r="15" fill="#00A99D" opacity="0.25" />
      <circle cx="96" cy="170" r="15" fill="#00A99D" opacity="0.25" />

      {/* children at the entrance */}
      {[
        { x: 158, fill: "#F2994A" },
        { x: 186, fill: "#00A99D" },
        { x: 246, fill: "#00A99D" },
        { x: 274, fill: "#F2994A" },
      ].map(({ x, fill }) => (
        <g key={x}>
          <circle cx={x} cy="196" r="7.5" fill="#E8EEF7" opacity="0.9" />
          <rect
            x={x - 6.5}
            y="205"
            width="13"
            height="20"
            rx="6"
            fill={fill}
            opacity="0.85"
          />
        </g>
      ))}

      {/* open book */}
      <g transform="translate(150 232)">
        <path
          d="M0 8c14-8 28-8 42 0 14-8 28-8 42 0v12c-14-8-28-8-42 0-14-8-28-8-42 0z"
          fill="#E8EEF7"
          opacity="0.75"
        />
        <path d="M42 8v12" stroke="#0F2C59" strokeWidth="2" opacity="0.5" />
      </g>
    </svg>
  );
}

/**
 * Decorative navy/gold/teal panel shown beside the form on wide screens.
 * Sits at the inline *end* — the LEFT side in the RTL Arabic layout.
 */
export function AuthVisualPanel({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const { t } = useLanguage();

  const highlights: { icon: LucideIcon; text: string; body: string }[] = [
    {
      icon: HeartHandshake,
      text: t("badgeDailyFollow"),
      body: t("badgeDailyFollowHint"),
    },
    {
      icon: ShieldCheck,
      text: t("badgeVerifiedCenters"),
      body: t("badgeVerifiedCentersHint"),
    },
    {
      icon: WifiOff,
      text: t("offlineReady"),
      body: t("badgeOfflineHint"),
    },
    {
      icon: Sparkles,
      text: t("badgeAi"),
      body: t("badgeAiHint"),
    },
    {
      icon: Building2,
      text: t("badgeGaza"),
      body: t("badgeGazaHint"),
    },
  ];

  return (
    <aside
      aria-hidden="true"
      className="relative hidden overflow-hidden bg-sarh-navy p-10 text-white lg:flex lg:flex-col lg:justify-between"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,169,157,0.5),transparent_52%),radial-gradient(circle_at_80%_78%,rgba(242,153,74,0.42),transparent_52%)]" />
      <div className="pointer-events-none absolute start-0 top-16 h-56 w-56 rounded-full bg-sarh-teal/20 blur-3xl" />
      <div className="pointer-events-none absolute end-0 bottom-16 h-64 w-64 rounded-full bg-sarh-gold/20 blur-3xl" />

      <div className="relative">
        <span className="sarh-badge bg-white/10 text-white ring-1 ring-inset ring-white/20">
          <Sparkles className="h-3.5 w-3.5" />
          {t("brand")}
        </span>
        <h2 className="mt-6 max-w-md text-3xl font-bold leading-snug md:text-4xl">
          {title}
        </h2>
        <p className="mt-4 max-w-md text-sm leading-8 text-white/75 md:text-base">
          {subtitle}
        </p>
      </div>

      <div className="relative my-8 flex justify-center">
        <GazaLearningIllustration />
      </div>

      <p className="relative -mt-4 mb-6 text-center text-[11px] font-medium tracking-wide text-white/55">
        {t("illustrationCaption")}
      </p>

      <ul className="relative space-y-4">
        {highlights.map(({ icon: Icon, text, body }) => (
          <li key={text} className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 text-sarh-teal ring-1 ring-inset ring-white/15">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">
                {text}
              </span>
              <span className="block text-xs leading-6 text-white/60">
                {body}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="relative mt-8 text-xs text-white/50">
        {t("platformTagline")}
      </p>
    </aside>
  );
}

/**
 * The two-column auth frame.
 *
 * `children` is the form column and is rendered FIRST, so it lands at the
 * inline start — the right-hand side in this RTL layout, which is where the
 * Arabic reader's eye starts. The brand panel follows it, so it takes the
 * remaining (left) side. On small screens the panel is hidden and the form
 * fills the viewport, mobile-first.
 */
export function AuthSplit({
  visual,
  children,
}: {
  visual: { title: string; subtitle: string };
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-sarh-bgLight dark:bg-sarh-bgDark lg:grid-cols-2">
      <main className="flex items-center justify-center px-5 py-10 sm:px-8">
        <section className="sarh-view-enter w-full max-w-md">{children}</section>
      </main>
      <AuthVisualPanel title={visual.title} subtitle={visual.subtitle} />
    </div>
  );
}

/** Inline banner for success / info / error feedback. */
export function AuthNotice({
  tone,
  children,
}: {
  tone: "success" | "info" | "error";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "mb-4 flex flex-wrap items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium",
        tone === "success" && "bg-sarh-teal/10 text-sarh-teal",
        tone === "info" && "bg-sarh-gold/15 text-[#C9741F] dark:text-sarh-gold",
        tone === "error" &&
          "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300"
      )}
    >
      {children}
    </p>
  );
}

/** “أو استمر بحساب آخر” rule placed between the two auth actions. */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-sarh-borderLight dark:bg-sarh-borderDark" />
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span className="h-px flex-1 bg-sarh-borderLight dark:bg-sarh-borderDark" />
    </div>
  );
}

/** Google OAuth trigger (Google One Tap / Gmail accounts). */
export function GoogleAuthButton({
  label,
  loading,
  onClick,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="google"
      className="w-full"
      loading={loading}
      onClick={onClick}
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.08c1.93-1.99 3.06-4.44 3.06-7.16z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.9 7.12-2.48l-3.08-2.77c-.98.66-2.23 1.06-3.7 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.78 14.09c-.22-1.62.51-3.03 1.94-3.83v-2.77H2.18c.84 2.34 3.01 3.96 5.82 3.96h2.37l.84-3.08z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.58c1.62 0 3.06.56 4.1 1.44v2.84H5.78c.84-2.34 3.01-3.96 5.82-3.96h2.61z"
          fill="#EA4335"
        />
      </svg>
      {label}
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/* Account-type selector                                                      */
/* -------------------------------------------------------------------------- */

export type AuthRole =
  | "PARENT"
  | "INSTITUTION_TEACHER"
  | "TEACHER"
  | "SUPERVISOR";

const ROLE_OPTIONS: {
  value: AuthRole;
  labelKey:
    | "roleParent"
    | "roleInstitution"
    | "roleTeacher"
    | "roleSupervisor";
  hintKey:
    | "roleParentHint"
    | "roleInstitutionHint"
    | "roleTeacherHint"
    | "roleSupervisorHint";
  icon: LucideIcon;
  accent: "teal" | "gold" | "navy" | "tealDeep";
}[] = [
  {
    value: "PARENT",
    labelKey: "roleParent",
    hintKey: "roleParentHint",
    icon: Users,
    accent: "teal",
  },
  {
    value: "INSTITUTION_TEACHER",
    labelKey: "roleInstitution",
    hintKey: "roleInstitutionHint",
    icon: Building2,
    accent: "gold",
  },
  {
    value: "TEACHER",
    labelKey: "roleTeacher",
    hintKey: "roleTeacherHint",
    icon: GraduationCap,
    accent: "navy",
  },
  {
    // Oversight is its own tier: a supervisor reviews and approves, and never
    // inherits a teacher's ability to edit the record they are auditing.
    value: "SUPERVISOR",
    labelKey: "roleSupervisor",
    hintKey: "roleSupervisorHint",
    icon: ClipboardCheck,
    accent: "tealDeep",
  },
];

const ACCENTS = {
  teal: {
    active:
      "border-sarh-teal bg-sarh-teal/10 text-sarh-teal dark:bg-sarh-teal/15",
    ring: "border-sarh-teal bg-sarh-teal text-white",
  },
  gold: {
    active: "border-sarh-gold bg-sarh-gold/12 text-[#C9741F] dark:text-sarh-gold",
    ring: "border-sarh-gold bg-sarh-gold text-white",
  },
  navy: {
    active:
      "border-sarh-navy/40 bg-sarh-navy/8 text-sarh-navy dark:border-slate-500 dark:bg-slate-700/40 dark:text-slate-100",
    ring: "border-sarh-navy bg-sarh-navy text-white dark:border-slate-500 dark:bg-slate-600",
  },
  tealDeep: {
    active:
      "border-sarh-tealDeep bg-sarh-tealDeep/10 text-sarh-tealDeep dark:bg-sarh-tealDeep/20 dark:text-sarh-teal",
    ring: "border-sarh-tealDeep bg-sarh-tealDeep text-white",
  },
} as const;

/**
 * Account-type selector.
 *
 * Rendered as a segmented tab strip, but exposed to assistive tech as a
 * radiogroup: choosing an option changes one value, it does not swap the
 * panel, so `role="tab"` without a tabpanel would misdescribe it. Arrow keys
 * move between the options and only the selected one is tabbable, exactly like
 * a native tab strip.
 */
export function RoleTabs({
  value,
  onChange,
  legend,
}: {
  value: AuthRole;
  onChange: (role: AuthRole) => void;
  legend: string;
}) {
  const { t } = useLanguage();
  const groupId = useId();

  /** Roving focus: arrow keys select and move, as a native tab strip does. */
  const move = (delta: number, from: number) => {
    const next = (from + delta + ROLE_OPTIONS.length) % ROLE_OPTIONS.length;
    const option = ROLE_OPTIONS[next];
    onChange(option.value);
    document.getElementById(`${groupId}-${option.value}`)?.focus();
  };

  return (
    <fieldset role="radiogroup" aria-label={legend}>
      <legend className="mb-2 block text-sm font-medium text-sarh-navy dark:text-slate-200">
        {legend}
      </legend>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {ROLE_OPTIONS.map((option, index) => {
          const active = value === option.value;
          const accent = ACCENTS[option.accent];
          const Icon = option.icon;

          return (
            <button
              key={option.value}
              id={`${groupId}-${option.value}`}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  move(1, index);
                } else if (
                  event.key === "ArrowLeft" ||
                  event.key === "ArrowUp"
                ) {
                  event.preventDefault();
                  move(-1, index);
                }
              }}
              className={cn(
                "flex flex-col items-start gap-2 rounded-xl border p-3 text-start transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal",
                active
                  ? accent.active
                  : // `bg-muted` is one theme-aware token, so the hover surface
                    // cannot be overridden by a light-mode value in dark mode.
                    "border-sarh-borderLight hover:border-sarh-teal/50 hover:bg-muted dark:border-sarh-borderDark"
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 transition-colors",
                    active
                      ? accent.ring
                      : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800"
                  )}
                >
                  {active ? (
                    <Check className="h-2.5 w-2.5" aria-hidden="true" />
                  ) : null}
                </span>
              </span>
              <span className="block text-sm font-semibold text-sarh-navy dark:text-white">
                {t(option.labelKey)}
              </span>
              <span className="block text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                {t(option.hintKey)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <ChevronHint />
        {t("signInRoleHint")}
      </p>
    </fieldset>
  );
}

/** Tiny “arrow keys work” affordance for the selector above. */
function ChevronHint() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="h-3 w-3"
      aria-hidden="true"
    >
      <path d="M9 6l-4 6 4 6M15 6l4 6-4 6" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                     */
/* -------------------------------------------------------------------------- */

const INPUT_BASE = "sarh-input text-start";

interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id"> {
  id: string;
  label: string;
  icon?: LucideIcon;
  error?: string;
  hint?: string;
  registration?: UseFormRegisterReturn;
  trailing?: ReactNode;
}

/** Labelled input with an inline leading icon, error text and optional hint. */
export function TextField({
  id,
  label,
  icon: Icon,
  error,
  hint,
  registration,
  trailing,
  dir = "ltr",
  ...rest
}: TextFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-sarh-navy dark:text-slate-200"
      >
        {label}
      </label>
      <div className="relative">
        {Icon ? (
          <Icon
            className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
        ) : null}
        <input
          id={id}
          dir={dir}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${id}-error` : hint ? `${id}-hint` : undefined
          }
          className={cn(
            INPUT_BASE,
            Icon && "ps-10",
            trailing ? "pe-11" : undefined,
            error &&
              "border-red-400 focus:border-red-500 focus:ring-red-500/25"
          )}
          {...registration}
          {...rest}
        />
        {trailing}
      </div>
      {error ? (
        <p
          id={`${id}-error`}
          className="mt-1.5 text-xs font-medium text-red-500"
        >
          {error}
        </p>
      ) : hint ? (
        <p
          id={`${id}-hint`}
          className="mt-1.5 text-[11px] leading-5 text-slate-500 dark:text-slate-400"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Password input with a show/hide toggle bound to a single visibility flag. */
export function PasswordField({
  id,
  label,
  error,
  hint,
  registration,
  autoComplete = "current-password",
  placeholder,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  registration: UseFormRegisterReturn;
  autoComplete?: string;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      id={id}
      label={label}
      icon={Lock}
      type={visible ? "text" : "password"}
      autoComplete={autoComplete}
      placeholder={placeholder}
      error={error}
      hint={hint}
      registration={registration}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
          aria-pressed={visible}
          className="absolute inset-y-0 end-2 my-auto grid h-8 w-8 place-items-center rounded-md text-slate-500 transition-colors hover:bg-sarh-teal/10 hover:text-sarh-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      }
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Password strength                                                          */
/* -------------------------------------------------------------------------- */

export interface PasswordStrength {
  /** 0–4; 0 means “does not meet the minimum rules yet”. */
  score: 0 | 1 | 2 | 3 | 4;
  /** The three rules the server enforces as well. */
  checks: { length: boolean; letter: boolean; number: boolean };
  meetsMinimum: boolean;
}

/** Passwords that show up in every breach dump; treated as weak regardless. */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "qwerty123",
  "iloveyou",
  "admin123",
  "sarh1234",
  "aaaaaaaa",
]);

/**
 * Scores a password for the live meter. The *minimum* rules here mirror
 * `/api/auth/reset-password` and `/api/auth/signup` exactly (8+ characters,
 * a letter and a digit, Arabic letters and Arabic-Indic digits accepted), so
 * the meter can never promise something the API then rejects.
 */
export function scorePassword(password: string): PasswordStrength {
  const length = password.length >= 8;
  const letter = /[A-Za-z\u0600-\u06FF]/.test(password);
  const number = /[0-9\u0660-\u0669]/.test(password);
  const meetsMinimum = length && letter && number;

  let points = 0;
  if (meetsMinimum) points += 1;
  if (password.length >= 12) points += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1;
  if (/[^A-Za-z0-9\u0600-\u06FF]/.test(password)) points += 1;
  if (password.length >= 16) points += 1;

  if (COMMON_PASSWORDS.has(password.toLowerCase())) points = 1;

  return {
    score: Math.min(points, 4) as PasswordStrength["score"],
    checks: { length, letter, number },
    meetsMinimum,
  };
}

const STRENGTH_LABEL_KEYS = [
  "strengthWeak",
  "strengthWeak",
  "strengthFair",
  "strengthGood",
  "strengthStrong",
] as const;

const STRENGTH_COLORS = [
  "bg-red-400",
  "bg-red-400",
  "bg-sarh-gold",
  "bg-sarh-teal/70",
  "bg-sarh-teal",
] as const;

/**
 * Live strength meter: a four-segment bar, the score in words, and a checklist
 * of the rules the API enforces.
 */
export function PasswordStrengthMeter({
  password,
  showChecklist = true,
}: {
  password: string;
  showChecklist?: boolean;
}) {
  const { t } = useLanguage();
  const strength = useMemo(() => scorePassword(password), [password]);
  const label = t(STRENGTH_LABEL_KEYS[strength.score]);

  return (
    <div className="mt-2.5" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
          {t("passwordStrength")}
        </span>
        <span
          className={cn(
            "text-[11px] font-bold",
            strength.score <= 1
              ? "text-red-500"
              : strength.score === 2
                ? "text-sarh-gold"
                : "text-sarh-teal"
          )}
        >
          {label}
        </span>
      </div>
      <div
        className="mt-1.5 grid grid-cols-4 gap-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={strength.score}
        aria-label={t("passwordStrength")}
      >
        {[0, 1, 2, 3].map((segment) => (
          <span
            key={segment}
            className={cn(
              "h-1.5 rounded-full transition-colors duration-300",
              segment < strength.score
                ? STRENGTH_COLORS[strength.score]
                : "bg-slate-200 dark:bg-slate-700"
            )}
          />
        ))}
      </div>

      {showChecklist ? (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {(
            [
              ["passwordRuleLength", strength.checks.length],
              ["passwordRuleLetter", strength.checks.letter],
              ["passwordRuleNumber", strength.checks.number],
            ] as const
          ).map(([key, passed]) => (
            <li
              key={key}
              className={cn(
                "flex items-center gap-1 text-[11px] transition-colors",
                passed
                  ? "text-sarh-teal"
                  : "text-slate-400 dark:text-slate-500"
              )}
            >
              <Check
                className={cn(
                  "h-3 w-3",
                  passed ? "opacity-100" : "opacity-40"
                )}
                aria-hidden="true"
              />
              {t(key)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
