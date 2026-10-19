"use client";

import { useRef, useState } from "react";
import { Loader2, Send, Sparkles, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Parent AI assistant — the client half of `POST /api/parent/ai-chat`.
 *
 * The route already existed; this is its consumer. Everything that can fail is
 * surfaced in Arabic using the *route's own* message, so a parent never sees a
 * generic “something went wrong” when the platform can say precisely whether
 * the assistant is unconfigured, slow, or unavailable.
 *
 * History sent upstream is capped at the last 8 turns — the same cap the route
 * validates — which keeps the prompt small enough for the microservice timeout
 * on a slow connection.
 */

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const STARTERS = [
  "اشرح لي درس الكسور لابني بأسلوب مبسّط",
  "كيف أساعد طفلي على تنظيم وقت الواجبات؟",
  "أفكار أنشطة منزلية تدعم مهارات القراءة",
];

let sequence = 0;
function nextId(prefix: string) {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export function AssistantChat({ childName }: { childName?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const listEnd = useRef<HTMLDivElement | null>(null);

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    const userMessage: ChatMessage = {
      id: nextId("user"),
      role: "user",
      text: trimmed,
    };
    const history = messages.slice(-8).map((message) => ({
      role: message.role,
      text: message.text,
    }));

    setMessages((previous) => [...previous, userMessage]);
    setInput("");
    setError(null);
    setSuggestions([]);
    setPending(true);

    try {
      const response = await fetch("/api/parent/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, language: "ar", history }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; reply?: string; suggestions?: string[]; message?: string }
        | null;

      if (!response.ok || !payload?.success || !payload.reply) {
        setError(
          payload?.message ?? "تعذّر الوصول إلى المساعد الذكي. حاول بعد قليل."
        );
        return;
      }

      setMessages((previous) => [
        ...previous,
        { id: nextId("assistant"), role: "assistant", text: payload.reply! },
      ]);
      setSuggestions((payload.suggestions ?? []).slice(0, 3));
    } catch {
      setError("انقطع الاتصال أثناء إرسال سؤالك. تحقّق من الشبكة وحاول مرة أخرى.");
    } finally {
      setPending(false);
      // Keep the newest turn in view without a layout jump.
      requestAnimationFrame(() =>
        listEnd.current?.scrollIntoView({ block: "nearest" })
      );
    }
  };

  return (
    <div className="sarh-card flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-sarh-borderLight px-5 py-4 dark:border-sarh-borderDark">
        <Sparkles className="h-4 w-4 text-sarh-gold" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-sarh-navy dark:text-white">
            مساعد صَرْح الذكي
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {childName
              ? `يجيب على أسئلتك حول ${childName} والدروس المدرسية`
              : "يجيب على أسئلتك حول أبنائك والدروس المدرسية"}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm leading-7 text-slate-500 dark:text-slate-400">
              اطرح أي سؤال تعليمي، وسيساعدك المساعد على شرح المفهوم لطفلك بأسلوب
              مبسّط — ولا يمكنه تعديل أي بيانات في حسابك.
            </p>
            <ul className="flex flex-wrap gap-2">
              {STARTERS.map((starter) => (
                <li key={starter}>
                  <button
                    type="button"
                    onClick={() => void ask(starter)}
                    className="rounded-full border border-sarh-borderLight px-3 py-1.5 text-[11px] font-bold text-sarh-navy transition-colors hover:border-sarh-teal/50 hover:bg-sarh-teal/5 dark:border-sarh-borderDark dark:text-slate-200"
                  >
                    {starter}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <ul className="space-y-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn(
                "flex items-start gap-2.5",
                message.role === "user" && "flex-row-reverse"
              )}
            >
              <span
                className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                  message.role === "user"
                    ? "bg-sarh-navy/10 text-sarh-navy dark:bg-white/10 dark:text-white"
                    : "bg-sarh-teal/10 text-sarh-tealDeep dark:text-sarh-teal"
                )}
              >
                {message.role === "user" ? (
                  <User className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                )}
              </span>
              <p
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-7",
                  message.role === "user"
                    ? "bg-sarh-teal text-white"
                    : "bg-sarh-muted text-slate-700 dark:bg-white/5 dark:text-slate-200"
                )}
              >
                {message.text}
              </p>
            </li>
          ))}
        </ul>

        {pending ? (
          <p className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            المساعد يفكّر…
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-rose-500/10 px-4 py-3 text-xs font-medium leading-6 text-rose-600 dark:text-rose-300"
          >
            {error}
          </p>
        ) : null}

        {suggestions.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => void ask(suggestion)}
                  className="rounded-full bg-sarh-teal/10 px-3 py-1.5 text-[11px] font-bold text-sarh-tealDeep transition-colors hover:bg-sarh-teal/20 dark:text-sarh-teal"
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div ref={listEnd} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(input);
        }}
        className="flex items-end gap-2 border-t border-sarh-borderLight p-4 dark:border-sarh-borderDark"
      >
        <label htmlFor="assistant-message" className="sr-only">
          سؤالك للمساعد الذكي
        </label>
        <textarea
          id="assistant-message"
          rows={1}
          value={input}
          maxLength={600}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void ask(input);
            }
          }}
          placeholder="اكتب ما تحتاج شرحه…"
          className="sarh-input max-h-40 min-h-11 flex-1 resize-y text-start"
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={pending || input.trim().length === 0}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          إرسال
        </Button>
      </form>
    </div>
  );
}
