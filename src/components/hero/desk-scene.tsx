"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";

gsap.registerPlugin(useGSAP);

/*
 * ==========================================================================
 * The light hero's desk environment.
 * ==========================================================================
 *
 * The 2026 identity is a bright desk in soft morning daylight, so the hero
 * needs objects *on* that desk: a plant, a laptop, a stack of workbooks and a
 * notebook. They are drawn as inline SVG rather than loaded as a photograph for
 * three reasons — the hero stays crisp on any display, it adds zero image
 * weight to the critical path (the whole scene is a few kB of paths), and the
 * props can be animated individually by GSAP instead of being baked into one
 * flat image.
 *
 * Everything here is decorative and `aria-hidden`: the scene never carries
 * meaning that the copy or the dashboard card does not already state. The whole
 * layer is `pointer-events-none` so it can sit underneath the interactive
 * dashboard card without swallowing clicks.
 *
 * Placement: the props are pinned to the *logical* `start`/`end` edges, so the
 * composition mirrors correctly when the language switcher flips the document
 * to LTR. They only appear from `xl` up, where the page has margins wide enough
 * to hold them outside the content column — below that the hero stays clean,
 * which is what makes the mobile-first layout work.
 */

const LEAVES: { rotate: number; scale: number; fill: string }[] = [
  { rotate: -84, scale: 0.86, fill: "#57A268" },
  { rotate: -58, scale: 1.05, fill: "#8FCB96" },
  { rotate: -26, scale: 0.95, fill: "#6FB77E" },
  { rotate: 14, scale: 1.12, fill: "#7FC08B" },
  { rotate: 48, scale: 0.98, fill: "#8FCB96" },
  { rotate: 76, scale: 0.84, fill: "#57A268" },
];

/** Potted plant — the tallest prop, standing at the back of the desk. */
function Plant({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 180 240"
      className={className}
      role="presentation"
      aria-hidden="true"
    >
      <g transform="translate(90 158)">
        {LEAVES.map((leaf) => (
          <g key={leaf.rotate} transform={`rotate(${leaf.rotate}) scale(${leaf.scale})`}>
            <path
              d="M2 0 Q34 -20 66 -3 Q36 17 2 0 Z"
              fill={leaf.fill}
              stroke="#4F9459"
              strokeOpacity="0.28"
              strokeWidth="1.2"
            />
            <path
              d="M6 -1 Q34 -6 60 -3"
              stroke="#4F9459"
              strokeOpacity="0.35"
              strokeWidth="1.4"
              fill="none"
            />
          </g>
        ))}
      </g>

      {/* Pot + rim */}
      <path
        d="M46 168 L134 168 L124 226 Q122 234 112 234 L68 234 Q58 234 56 226 Z"
        fill="#FFFFFF"
        stroke="#E7DFD4"
        strokeWidth="2.5"
      />
      <rect
        x="36"
        y="154"
        width="108"
        height="22"
        rx="11"
        fill="#FFFFFF"
        stroke="#E7DFD4"
        strokeWidth="2.5"
      />
      <rect x="50" y="160" width="80" height="6" rx="3" fill="#EADFD1" />
    </svg>
  );
}

/** Open laptop, its screen standing in for a dashboard. */
function Laptop({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 190"
      className={className}
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sarh-laptop-screen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F3FBF9" />
          <stop offset="100%" stopColor="#E7F5F3" />
        </linearGradient>
      </defs>

      <rect x="58" y="6" width="204" height="134" rx="12" fill="#EEF3F8" stroke="#DCE5EE" strokeWidth="2" />
      <rect x="70" y="18" width="180" height="110" rx="8" fill="url(#sarh-laptop-screen)" />

      {/* A hint of the product: a teal heading, two text rows, one accent tile. */}
      <rect x="84" y="34" width="58" height="7" rx="3.5" fill="#00A99D" opacity="0.85" />
      <rect x="84" y="54" width="150" height="5" rx="2.5" fill="#C9D6E2" />
      <rect x="84" y="66" width="116" height="5" rx="2.5" fill="#C9D6E2" />
      <rect x="84" y="86" width="42" height="28" rx="7" fill="#F2994A" opacity="0.28" />
      <rect x="134" y="86" width="42" height="28" rx="7" fill="#00A99D" opacity="0.22" />
      <rect x="184" y="86" width="42" height="28" rx="7" fill="#0F2C59" opacity="0.08" />

      <path
        d="M24 138 H296 Q312 138 314 150 L318 162 Q320 174 306 174 H14 Q0 174 2 162 L6 150 Q8 138 24 138 Z"
        fill="#E7EDF4"
        stroke="#D9E2EC"
        strokeWidth="2"
      />
      <rect x="140" y="146" width="40" height="5" rx="2.5" fill="#C6D3E0" />
    </svg>
  );
}

/** Three workbooks stacked on top of one another. */
function WorkbookStack({ className }: { className?: string }) {
  const books = [
    { y: 6, spine: "#00A99D" },
    { y: 50, spine: "#2F6FB5" },
    { y: 94, spine: "#F2994A" },
  ];

  return (
    <svg
      viewBox="0 0 280 150"
      className={className}
      role="presentation"
      aria-hidden="true"
    >
      {books.map((book) => (
        <g key={book.spine} transform={`translate(0 ${book.y})`}>
          <rect
            x="24"
            y="0"
            width="234"
            height="40"
            rx="9"
            fill="#FFFFFF"
            stroke="#E7DFD4"
            strokeWidth="2.5"
          />
          <rect x="24" y="0" width="36" height="40" rx="9" fill={book.spine} />
          <path
            d="M74 13 H240 M74 21 H228 M74 29 H236"
            stroke="#E4EAEF"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <rect x="150" y="0" width="7" height="20" rx="3.5" fill={book.spine} opacity="0.55" />
        </g>
      ))}
    </svg>
  );
}

/** Notebook and pen lying flat on the desk surface. */
function NotebookAndPen({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 250 150"
      className={className}
      role="presentation"
      aria-hidden="true"
    >
      <rect
        x="10"
        y="20"
        width="182"
        height="108"
        rx="11"
        fill="#FFFFFF"
        stroke="#E7DFD4"
        strokeWidth="2.5"
      />
      <path
        d="M36 52 H166 M36 72 H150 M36 92 H160 M36 112 H120"
        stroke="#DCE3EA"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="5 7"
      />
      {[44, 76, 108, 140, 172].map((x) => (
        <circle key={x} cx={x} cy="20" r="5" fill="#F1F4F7" stroke="#DCE3EA" strokeWidth="2" />
      ))}

      {/* Pen — teal barrel, orange cap ring, tucked under the pad's corner. */}
      <g transform="rotate(-18 196 96)">
        <rect x="150" y="88" width="118" height="15" rx="7.5" fill="#00A99D" />
        <rect x="248" y="88" width="18" height="15" rx="7" fill="#0F2C59" />
        <rect x="238" y="88" width="12" height="15" rx="3" fill="#F2994A" />
        <rect x="150" y="88" width="16" height="15" rx="7.5" fill="#8FD8D3" />
      </g>
    </svg>
  );
}

/**
 * The dotted flight path with a small paper plane — the playful "learning is a
 * journey" cue from the reference composition. It is deliberately faint: at
 * 40–60% opacity it reads as texture behind the headline rather than as a
 * competing illustration.
 */
export function PaperPlaneTrail({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 150"
      fill="none"
      className={className}
      role="presentation"
      aria-hidden="true"
    >
      <path
        d="M6 132 C 46 122 54 62 104 52 C 148 43 168 82 208 60"
        stroke="#F2994A"
        strokeOpacity="0.75"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="1 13"
      />
      <g transform="translate(212 40) rotate(14)">
        <path d="M0 14 L40 0 L24 32 L15 18 Z" fill="#F2994A" />
        <path d="M15 18 L38 2" stroke="#FFFFFF" strokeOpacity="0.75" strokeWidth="1.4" />
      </g>
    </svg>
  );
}

/**
 * The full decorative layer laid over the hero's background.
 *
 * The plane drifts the most, the props the least: the further an object is
 * meant to be from the reader, the slower and wider its float, which is what
 * gives the still image a sense of depth without anything actually moving far
 * enough to be distracting.
 */
export function DeskScene() {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;

      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const props = gsap.utils.toArray<HTMLElement>(
          "[data-desk-float]",
          root
        );

        props.forEach((element, index) => {
          const large = index % 2 === 0;
          // Desk props sway from their base (they are standing on something);
          // the plane in the air drifts around its own centre.
          const origin =
            element.dataset.deskOrigin === "center" ? "50% 50%" : "50% 100%";

          gsap.to(element, {
            y: large ? -13 : -7,
            rotate: large ? 1.3 : -1.1,
            duration: 4.6 + index * 0.8,
            delay: index * 0.4,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            transformOrigin: origin,
          });
        });
      });

      return () => mm.revert();
    },
    { scope }
  );

  return (
    <div
      ref={scope}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Soft desktop surface + daylight, so the props look like they rest on
          something rather than floating in a void. */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white/70 via-white/25 to-transparent dark:from-sarh-cardDark/60 dark:via-transparent" />

      <div
        data-desk-float=""
        className="absolute -bottom-4 end-[1%] hidden w-36 xl:block 2xl:w-44"
      >
        <Plant className="h-auto w-full drop-shadow-[0_18px_20px_rgba(15,44,89,0.10)]" />
      </div>

      <div
        data-desk-float=""
        className="absolute bottom-40 end-[3%] hidden w-52 xl:block 2xl:w-60"
      >
        <WorkbookStack className="h-auto w-full drop-shadow-[0_14px_18px_rgba(15,44,89,0.10)]" />
      </div>

      <div
        data-desk-float=""
        className="absolute bottom-0 end-[12%] hidden w-44 2xl:block"
      >
        <NotebookAndPen className="h-auto w-full drop-shadow-[0_12px_16px_rgba(15,44,89,0.10)]" />
      </div>

      <div
        data-desk-float=""
        className="absolute -bottom-2 start-0 hidden w-64 xl:block 2xl:w-80"
      >
        <Laptop className="h-auto w-full drop-shadow-[0_18px_24px_rgba(15,44,89,0.12)]" />
      </div>

      <div
        data-desk-float=""
        data-desk-origin="center"
        className="absolute end-[19%] top-20 hidden w-56 lg:block 2xl:end-[23%] 2xl:w-64"
      >
        <PaperPlaneTrail className="h-auto w-full" />
      </div>
    </div>
  );
}
