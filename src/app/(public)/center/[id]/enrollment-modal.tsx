"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowRight,
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CreditCard,
  Landmark,
  Plus,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FileInput } from "@/components/ui/file-input";
import { Modal } from "@/components/ui/modal";
import { useLanguage } from "@/lib/i18n/language-provider";
import { cn, formatSarh } from "@/lib/utils";
import type { Center } from "@/lib/data/centers";

/* ------------------------------------------------------------------ */
/* Zod schema — Arabic messages (Agent.md §8)                          */
/* ------------------------------------------------------------------ */
const REQUIRED = "هذا الحقل مطلوب";
const SELECT_OPTION = "الرجاء اختيار أحد الخيارات";
const INVALID_AMOUNT = "المبلغ يجب أن يكون رقماً صحيحاً";

const enrollmentSchema = z.object({
  childMode: z.enum(["existing", "new"]),
  studentId: z.string().trim().min(1, { message: REQUIRED }),
  childName: z.string().trim().min(1, { message: REQUIRED }),
  dateOfBirth: z.string().trim().min(1, { message: REQUIRED }),
  programId: z.string().trim().min(1, { message: REQUIRED }),
  gradeLevel: z.string().trim().min(1, { message: REQUIRED }),
  paymentMethod: z.string().trim().min(1, { message: SELECT_OPTION }),
  amount: z
    .string()
    .trim()
    .min(1, { message: REQUIRED })
    .regex(/^\d{1,6}(\.\d{1,2})?$/, { message: INVALID_AMOUNT }),
  receipt: z.instanceof(File),
});

export type EnrollmentValues = z.infer<typeof enrollmentSchema>;

/* Saved children of the signed-in parent (offline-friendly demo data). */
const SAVED_CHILDREN = [
  { id: "child-sara", name: "سارة العلي", dateOfBirth: "2019-04-12" },
  { id: "child-mohammed", name: "محمد العلي", dateOfBirth: "2011-09-03" },
];

const STEP_KEYS = ["stepChild", "stepProgram", "stepPayment"] as const;

/* ------------------------------------------------------------------ */
/* Multi-step enrollment modal                                         */
/* ------------------------------------------------------------------ */
interface EnrollmentModalProps {
  open: boolean;
  onClose: () => void;
  center: Center;
  /** Pre-selected program (when launched from a program card). */
  initialProgramId?: string;
}

export function EnrollmentModal({
  open,
  onClose,
  center,
  initialProgramId,
}: EnrollmentModalProps) {
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const initializedRef = useRef(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    trigger,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EnrollmentValues>({
    resolver: zodResolver(enrollmentSchema),
    mode: "onBlur",
    defaultValues: {
      childMode: "existing",
      studentId: "",
      childName: "",
      dateOfBirth: "",
      programId: "",
      gradeLevel: "",
      paymentMethod: "",
      amount: "",
    },
  });

  // Fresh state every time the dialog opens (guard keeps it render-safe).
  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;
    setStep(0);
    setDone(false);
    reset({
      childMode: "existing",
      studentId: "",
      childName: "",
      dateOfBirth: "",
      programId: initialProgramId ?? "",
      gradeLevel: "",
      paymentMethod: "",
      amount: "",
    });
  }, [open, initialProgramId, reset]);

  const childMode = watch("childMode");
  const selectedProgramId = watch("programId");
  const receipt = watch("receipt");
  const selectedProgram = center.programs.find(
    (program) => program.id === selectedProgramId
  );

  const gradeOptions =
    center.type === "KINDERGARTEN"
      ? ["5 سنوات", "6 سنوات", "7 سنوات"]
      : ["الصف العاشر", "الصف الحادي عشر", "الصف الثاني عشر"];

  /** Keep hidden fields consistent so the full schema always validates. */
  const normaliseStepZero = () => {
    const mode = getValues("childMode");
    if (mode === "new") {
      setValue("studentId", `new-${Date.now()}`, { shouldDirty: true });
      return;
    }
    const child = SAVED_CHILDREN.find(
      (item) => item.id === getValues("studentId")
    );
    if (child) {
      setValue("childName", child.name, { shouldDirty: true });
      setValue("dateOfBirth", child.dateOfBirth, { shouldDirty: true });
    }
  };

  const goNext = async () => {
    if (step === 0) {
      const fields: (keyof EnrollmentValues)[] =
        childMode === "new"
          ? ["childName", "dateOfBirth"]
          : ["studentId"];
      const ok = await trigger(fields);
      if (!ok) return;
      normaliseStepZero();
      setStep(1);
      return;
    }

    if (step === 1) {
      const ok = await trigger(["programId", "gradeLevel"]);
      if (!ok) return;
      setStep(2);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    // Re-check the earlier steps and jump back to the first invalid one.
    const earlierFields: (keyof EnrollmentValues)[] =
      getValues("childMode") === "new"
        ? ["childName", "dateOfBirth"]
        : ["studentId"];
    const stepZeroOk = await trigger(earlierFields);
    if (!stepZeroOk) {
      setStep(0);
      return;
    }
    const stepOneOk = await trigger(["programId", "gradeLevel"]);
    if (!stepOneOk) {
      setStep(1);
      return;
    }
    await handleSubmit(onSubmit)(event);
  };

  const onSubmit = async () => {
    // Optimistic confirmation — the booking is confirmed for the parent now
    // and the enrollment record is persisted server-side by Phase 2's API.
    await new Promise((resolve) => setTimeout(resolve, 900));
    setDone(true);
  };

  const errorText = (name: keyof EnrollmentValues, fallback: string) =>
    errors[name] ? (
      <p role="alert" className="mt-1.5 text-xs font-medium text-red-500">
        {fallback}
      </p>
    ) : null;

  const stepIndicator = (
    <p className="mt-1 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
      <span className="rounded-full bg-sarh-teal/10 px-2 py-0.5 text-sarh-teal ring-1 ring-inset ring-sarh-teal/30">
        {t("step")} {step + 1} {t("of")} 3
      </span>
      <span>{t(STEP_KEYS[step])}</span>
    </p>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("enrollTitle")}
      headerExtra={done ? null : stepIndicator}
      closeLabel={t("close")}
      size="lg"
    >
      {done ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-sarh-teal/10 text-sarh-teal ring-1 ring-inset ring-sarh-teal/30">
            <BadgeCheck className="h-8 w-8" aria-hidden="true" />
          </span>
          <h3 className="text-lg font-bold text-sarh-navy dark:text-white">
            {t("bookingSuccess")}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {center.name} — {selectedProgram?.name ?? ""}
          </p>
          <Button onClick={onClose} className="mt-2">
            {t("close")}
          </Button>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)} noValidate>
          {/* Stepper */}
          <ol className="mb-6 flex items-center gap-2">
            {STEP_KEYS.map((key, index) => (
              <li key={key} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors",
                    index <= step
                      ? "bg-sarh-teal text-white shadow-teal-glow"
                      : "bg-slate-500/10 text-slate-400 ring-1 ring-inset ring-slate-500/25"
                  )}
                  aria-current={index === step ? "step" : undefined}
                >
                  {index + 1}
                </span>
                <span
                  className={cn(
                    "hidden text-xs font-semibold sm:block",
                    index === step
                      ? "text-sarh-teal"
                      : "text-slate-400"
                  )}
                >
                  {t(key)}
                </span>
                {index < STEP_KEYS.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-px flex-1",
                      index < step ? "bg-sarh-teal" : "bg-sarh-borderLight dark:bg-sarh-borderDark"
                    )}
                  />
                ) : null}
              </li>
            ))}
          </ol>

          {/* ---------------- Step 1: child ---------------- */}
          {step === 0 ? (
            <fieldset className="space-y-4">
              <legend className="mb-2 text-sm font-bold text-sarh-navy dark:text-white">
                {t("stepChild")}
              </legend>

              <div className="space-y-2">
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                    childMode === "existing"
                      ? "border-sarh-teal bg-sarh-teal/5 ring-1 ring-sarh-teal/40"
                      : "border-sarh-borderLight hover:border-sarh-teal/50 dark:border-sarh-borderDark"
                  )}
                >
                  <input
                    type="radio"
                    value="existing"
                    className="h-4 w-4 accent-[#00A99D]"
                    {...register("childMode")}
                  />
                  <span className="flex items-center gap-2 text-sm font-semibold text-sarh-navy dark:text-slate-100">
                    <UserRound className="h-4 w-4 text-sarh-teal" aria-hidden="true" />
                    {t("selectChild")}
                  </span>
                </label>

                {childMode === "existing" ? (
                  <div className="space-y-2 ps-4">
                    {SAVED_CHILDREN.map((child) => (
                      <label
                        key={child.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors",
                          watch("studentId") === child.id
                            ? "border-sarh-teal bg-sarh-teal/5 text-sarh-navy ring-1 ring-sarh-teal/40 dark:text-slate-100"
                            : "border-sarh-borderLight text-slate-600 hover:border-sarh-teal/50 dark:border-sarh-borderDark dark:text-slate-300"
                        )}
                      >
                        <input
                          type="radio"
                          value={child.id}
                          className="h-4 w-4 accent-[#00A99D]"
                          {...register("studentId")}
                        />
                        <span className="font-semibold">{child.name}</span>
                        <span className="text-xs text-slate-400">
                          {child.dateOfBirth}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
                {errors.studentId && childMode === "existing"
                  ? errorText("studentId", t("required"))
                  : null}

                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                    childMode === "new"
                      ? "border-sarh-gold bg-sarh-gold/5 ring-1 ring-sarh-gold/40"
                      : "border-sarh-borderLight hover:border-sarh-gold/60 dark:border-sarh-borderDark"
                  )}
                >
                  <input
                    type="radio"
                    value="new"
                    className="h-4 w-4 accent-[#F2994A]"
                    {...register("childMode")}
                  />
                  <span className="flex items-center gap-2 text-sm font-semibold text-sarh-navy dark:text-slate-100">
                    <Plus className="h-4 w-4 text-sarh-gold" aria-hidden="true" />
                    {t("addNewChild")}
                  </span>
                </label>
              </div>

              {childMode === "new" ? (
                <div className="grid gap-4 rounded-xl border border-dashed border-sarh-borderLight p-4 dark:border-sarh-borderDark sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="childName"
                      className="mb-1.5 block text-sm font-medium text-sarh-navy dark:text-slate-200"
                    >
                      {t("childFullName")}
                    </label>
                    <input
                      id="childName"
                      type="text"
                      className="sarh-input"
                      placeholder="مثال: سارة العلي"
                      {...register("childName")}
                    />
                    {errorText("childName", errors.childName?.message ?? t("required"))}
                  </div>
                  <div>
                    <label
                      htmlFor="dateOfBirth"
                      className="mb-1.5 block text-sm font-medium text-sarh-navy dark:text-slate-200"
                    >
                      {t("dateOfBirth")}
                    </label>
                    <input
                      id="dateOfBirth"
                      type="date"
                      dir="ltr"
                      className="sarh-input"
                      {...register("dateOfBirth")}
                    />
                    {errorText("dateOfBirth", errors.dateOfBirth?.message ?? t("required"))}
                  </div>
                </div>
              ) : null}
            </fieldset>
          ) : null}

          {/* ---------------- Step 2: program & grade ---------------- */}
          {step === 1 ? (
            <fieldset className="space-y-4">
              <legend className="mb-2 text-sm font-bold text-sarh-navy dark:text-white">
                {t("stepProgram")}
              </legend>

              <div>
                <label
                  htmlFor="programId"
                  className="mb-1.5 block text-sm font-medium text-sarh-navy dark:text-slate-200"
                >
                  {t("program")}
                </label>
                <select
                  id="programId"
                  className="sarh-input"
                  {...register("programId", {
                    onChange: (event) => {
                      const program = center.programs.find(
                        (item) => item.id === event.target.value
                      );
                      if (program) {
                        setValue("amount", String(program.fee), {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }
                    },
                  })}
                >
                  <option value="">{t("selectOption")}</option>
                  {center.programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name} — {program.grades} — {formatSarh(program.fee)}
                    </option>
                  ))}
                </select>
                {errorText("programId", errors.programId?.message ?? t("required"))}
              </div>

              <div>
                <label
                  htmlFor="gradeLevel"
                  className="mb-1.5 block text-sm font-medium text-sarh-navy dark:text-slate-200"
                >
                  {t("gradeLevel")}
                </label>
                <select id="gradeLevel" className="sarh-input" {...register("gradeLevel")}>
                  <option value="">{t("selectOption")}</option>
                  {gradeOptions.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
                {errorText("gradeLevel", errors.gradeLevel?.message ?? t("required"))}
              </div>
            </fieldset>
          ) : null}

          {/* ---------------- Step 3: payment receipt ---------------- */}
          {step === 2 ? (
            <fieldset className="space-y-4">
              <legend className="mb-2 text-sm font-bold text-sarh-navy dark:text-white">
                {t("stepPayment")}
              </legend>

              <div>
                <span className="mb-2 block text-sm font-medium text-sarh-navy dark:text-slate-200">
                  {t("paymentMethod")}
                </span>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { value: "bank", label: t("bankTransfer"), icon: Landmark },
                    { value: "jawwal", label: t("jawwalPay"), icon: CreditCard },
                  ].map(({ value, label, icon: Icon }) => (
                    <label
                      key={value}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors",
                        watch("paymentMethod") === value
                          ? "border-sarh-teal bg-sarh-teal/5 ring-1 ring-sarh-teal/40"
                          : "border-sarh-borderLight hover:border-sarh-teal/50 dark:border-sarh-borderDark"
                      )}
                    >
                      <input
                        type="radio"
                        value={value}
                        className="h-4 w-4 accent-[#00A99D]"
                        {...register("paymentMethod")}
                      />
                      <Icon className="h-4 w-4 text-sarh-teal" aria-hidden="true" />
                      <span className="text-sm font-semibold text-sarh-navy dark:text-slate-100">
                        {label}
                      </span>
                    </label>
                  ))}
                </div>
                {errors.paymentMethod ? errorText("paymentMethod", t("selectOption")) : null}
              </div>

              <div>
                <label
                  htmlFor="amount"
                  className="mb-1.5 block text-sm font-medium text-sarh-navy dark:text-slate-200"
                >
                  {t("amount")}
                </label>
                <input
                  id="amount"
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  className="sarh-input"
                  placeholder="320"
                  {...register("amount")}
                />
                {errorText(
                  "amount",
                  errors.amount?.type === "too_small" || errors.amount?.type === "invalid_type"
                    ? t("required")
                    : t("invalidAmount")
                )}
              </div>

              <FileInput
                value={receipt ?? null}
                onChange={(file) =>
                  setValue("receipt", file as File, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                label={t("uploadReceipt")}
                hint={t("uploadHint")}
                errorMessage={t("imageTooBig")}
              />
              {errors.receipt ? errorText("receipt", t("required")) : null}
            </fieldset>
          ) : null}

          {/* ---------------- Actions ---------------- */}
          <div className="mt-7 flex items-center justify-between gap-3 border-t border-sarh-borderLight pt-5 dark:border-sarh-borderDark">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0 || isSubmitting}
              className={cn(step === 0 && "invisible")}
            >
              <ArrowRight className="h-4 w-4 rtl:hidden" aria-hidden="true" />
              <ArrowLeft className="hidden h-4 w-4 rtl:block" aria-hidden="true" />
              {t("back")}
            </Button>

            {step < 2 ? (
              <Button
                onClick={() => void goNext()}
                disabled={isSubmitting}
                icon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
              >
                {t("next")}
              </Button>
            ) : (
              <Button
                type="submit"
                loading={isSubmitting}
                icon={<CalendarDays className="h-4 w-4" aria-hidden="true" />}
              >
                {isSubmitting ? t("submitting") : t("confirmBooking")}
              </Button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
