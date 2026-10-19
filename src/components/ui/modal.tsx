"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { useSmoothScroll } from "@/components/providers/smooth-scroll-provider";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Rendered inside the header bar, e.g. a step indicator. */
  headerExtra?: ReactNode;
  closeLabel?: string;
  size?: "md" | "lg";
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * SARH modal — backdrop blur (Design.md: `blur(12px) saturate(160%)`),
 * 24px radius, RTL-aware focus loop and `aria-modal` keyboard control.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  headerExtra,
  closeLabel = "Close",
  size = "md",
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { lock } = useSmoothScroll();

  useEffect(() => setMounted(true), []);

  // Lock scrolling while the modal is open — through Lenis when it is driving
  // the page (a plain `overflow: hidden` would not stop its rAF loop) and
  // through the classic overflow lock otherwise.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    lock(true);
    return () => {
      document.body.style.overflow = previous;
      lock(false);
    };
  }, [open, lock]);

  // Move focus into the panel when it opens.
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panelRef.current)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  /** Keep Tab / Shift+Tab inside the dialog (RTL or LTR). */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose]
  );

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
          onKeyDown={handleKeyDown}
        >
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-[12px] saturate-[160%]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            // `data-lenis-prevent` keeps wheel events inside the panel instead
            // of letting Lenis scroll the page behind the dialog.
            data-lenis-prevent
            className={cn(
              "relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-3xl",
              "bg-sarh-cardLight shadow-soft-lg outline-none",
              "dark:bg-sarh-cardDark",
              "sm:rounded-3xl",
              size === "md" ? "sm:max-w-lg" : "sm:max-w-2xl"
            )}
          >
            <header
              className={cn(
                "sticky top-0 z-10 flex items-start justify-between gap-4 border-b p-5",
                "border-sarh-borderLight bg-sarh-cardLight/90 backdrop-blur-md",
                "dark:border-sarh-borderDark dark:bg-sarh-cardDark/90"
              )}
            >
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-sarh-navy dark:text-white">
                  {title}
                </h2>
                {headerExtra}
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label={closeLabel}
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500",
                  "transition-colors hover:bg-sarh-teal/10 hover:text-sarh-teal",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-sarh-teal"
                )}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </header>

            <div className="p-5">{children}</div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
