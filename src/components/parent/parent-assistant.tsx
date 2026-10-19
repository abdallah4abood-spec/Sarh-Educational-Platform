"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Send, Sparkles, UserRound, X } from "lucide-react";

import { useLanguage } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

/**
 * Bilingual chrome for the assistant. The parent portal predates the shared
 * dictionary and hard-codes its Arabic copy; keeping these few strings local
 * follows that convention while still respecting the AR/EN toggle, which is
 * also what decides the language the answer comes back in.
 */
const COPY = {
  ar: {
    launcher: "المساعد الذكي",
    title: "مساعد صَرْح",
    subtitle: "مواعيد، أنشطة، رسوم، وسياسة المركز",
    greeting:
      "أهلاً بك! أنا مساعد منصة صَرْح. اسألني عن مواعيد الدوام، الأنشطة، الرسوم، الحضور، أو سياسة الاستلام.",
    placeholder: "اكتب سؤالك…",
    send: "إرسال",
    close: "إغلاق",
    you: "أنت",
    assistant: "المساعد",
    thinking: "يكتب الجواب…",
    starters: [
      "ما موعد بداية الدوام الصباحي؟",
      "هل تُقدَّم وجبات في المركز؟",
      "كيف أتابع حضور طفلي؟",
    ],
    failure: "تعذّر الوصول إلى المساعد الآن. حاول مرة أخرى بعد قليل.",
  },
  en: {
    launcher: "Smart assistant",
    title: "SARH assistant",
    subtitle: "Timings, activities, fees and center policy",
    greeting:
      "Welcome! I am the SARH assistant. Ask me about the morning timings, the daily activities, fees, attendance or the pickup policy.",
    placeholder: "Type your question…",
    send: "Send",
    close: "Close",
    you: "You",
    assistant: "Assistant",
    thinking: "Writing the answer…",
    starters: [
      "When does the morning start?",
      "Are meals served at the center?",
      "How do I follow my child's attendance?",
    ],
    failure: "The assistant is unreachable right now. Please try again shortly.",
  },
} as const;

/**
 * The parent-portal assistant (Agent.md §5 — AI Parent Chatbot).
 *
 * A floating panel rather than a page: the parent asks "when does the day
 * start?" while looking at the child's feed, so the answer has to arrive
 * without navigating away. It posts to `/api/parent/ai-chat`, which is guarded
 * by the RBAC middleware and forwards to the FastAPI microservice — the panel
 * itself never holds a service URL or a key.
 *
 * The scrollable message list carries `data-lenis-prevent`, so the wheel scrolls
 * the conversation instead of the page behind it.
 */
export function ParentAssistant() {
  const { lang } = useLanguage();
  const copy = COPY[lang];

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Landing in an open panel should put the caret in the field.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, pending, open]);

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    const history = messages.slice(-6);
    setMessages((previous) => [...previous, { role: "user", text: trimmed }]);
    setInput("");
    setSuggestions([]);
    setFailure(null);
    setPending(true);

    try {
      const response = await fetch("/api/parent/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, language: lang, history }),
      });
      const data = (await response.json().catch(() => null)) as
        | { success?: boolean; reply?: string; suggestions?: string[]; message?: string }
        | null;

      if (!response.ok || data?.success !== true || !data.reply) {
        setFailure(data?.message ?? copy.failure);
        return;
      }

      setMessages((previous) => [
        ...previous,
        { role: "assistant", text: data.reply as string },
      ]);
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
    } catch {
      setFailure(copy.failure);
    } finally {
      setPending(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void ask(input);
  };

  const starters = messages.length === 0 ? copy.starters : suggestions;

  return (
    <>
      {/* Launcher */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="parent-assistant-panel"
        className={cn(
          "fixed bottom-4 end-4 z-50 inline-flex items-center gap-2 rounded-full",
          "bg-sarh-teal px-4 py-3 text-sm font-bold text-white shadow-teal-glow",
          "transition-transform hover:scale-[1.03] focus:outline-none",
          "focus-visible:ring-2 focus-visible:ring-sarh-teal focus-visible:ring-offset-2",
          "motion-reduce:transition-none"
        )}
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {open ? copy.close : copy.launcher}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id="parent-assistant-panel"
            role="dialog"
            aria-label={copy.title}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={cn(
              "fixed bottom-20 end-4 z-50 flex h-[min(32rem,70vh)] w-[min(24rem,calc(100vw-2rem))]",
              "flex-col overflow-hidden rounded-2xl border border-sarh-borderLight bg-sarh-cardLight",
              "shadow-soft-lg dark:border-sarh-borderDark dark:bg-sarh-cardDark"
            )}
          >
            {/* Header */}
            <header className="flex items-start justify-between gap-3 border-b border-sarh-borderLight p-4 dark:border-sarh-borderDark">
              <div className="flex items-start gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sarh-teal/15 text-sarh-teal">
                  <Bot className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-bold text-sarh-navy dark:text-white">
                    {copy.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {copy.subtitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={copy.close}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-sarh-teal/10 hover:text-sarh-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            {/* Conversation */}
            <div
              ref={listRef}
              data-lenis-prevent
              aria-live="polite"
              className="flex-1 space-y-3 overflow-y-auto p-4"
            >
              <p className="rounded-2xl bg-sarh-teal/10 p-3 text-sm leading-7 text-sarh-navy dark:text-slate-100">
                {copy.greeting}
              </p>

              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={cn(
                    "flex items-start gap-2",
                    message.role === "user" && "flex-row-reverse"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                      message.role === "user"
                        ? "bg-sarh-navy/10 text-sarh-navy dark:bg-white/10 dark:text-white"
                        : "bg-sarh-teal/15 text-sarh-teal"
                    )}
                  >
                    {message.role === "user" ? (
                      <UserRound className="h-3.5 w-3.5" />
                    ) : (
                      <Bot className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <p
                    className={cn(
                      "max-w-[85%] rounded-2xl p-3 text-sm leading-7",
                      message.role === "user"
                        ? "bg-sarh-navy text-white dark:bg-white/10"
                        : "bg-slate-100 text-sarh-navy dark:bg-white/5 dark:text-slate-100"
                    )}
                  >
                    <span className="sr-only">
                      {message.role === "user" ? copy.you : copy.assistant}:{" "}
                    </span>
                    {message.text}
                  </p>
                </div>
              ))}

              {pending ? (
                <p className="flex items-center gap-2 text-xs font-semibold text-sarh-teal">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 animate-pulse rounded-full bg-sarh-teal motion-reduce:animate-none"
                  />
                  {copy.thinking}
                </p>
              ) : null}

              {failure ? (
                <p
                  role="alert"
                  className="rounded-xl border border-sarh-gold/40 bg-sarh-gold/10 p-3 text-xs leading-6 text-[#8a5a12] dark:text-sarh-gold"
                >
                  {failure}
                </p>
              ) : null}
            </div>

            {/* Suggested questions — the opening set, then the follow-ups */}
            {starters.length > 0 && !pending ? (
              <div className="flex flex-wrap gap-2 border-t border-sarh-borderLight px-4 pt-3 dark:border-sarh-borderDark">
                {starters.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => void ask(starter)}
                    className="rounded-full border border-sarh-borderLight px-3 py-1.5 text-xs font-semibold text-sarh-navy transition-colors hover:border-sarh-teal hover:text-sarh-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal dark:border-sarh-borderDark dark:text-slate-200"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            ) : null}

            {/* Composer */}
            <form onSubmit={onSubmit} className="flex items-center gap-2 p-4">
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={copy.placeholder}
                aria-label={copy.placeholder}
                maxLength={600}
                className={cn(
                  "h-11 flex-1 rounded-xl border border-sarh-borderLight bg-white/70 px-3 text-sm",
                  "text-sarh-navy outline-none transition-colors focus:border-sarh-teal",
                  "dark:border-sarh-borderDark dark:bg-white/5 dark:text-white"
                )}
              />
              <button
                type="submit"
                disabled={pending || input.trim().length === 0}
                aria-label={copy.send}
                className="sarh-btn-primary h-11 rounded-xl px-4 shadow-teal-glow hover:brightness-110 disabled:opacity-50"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
