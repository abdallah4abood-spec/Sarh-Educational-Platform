/**
 * Directory hero illustrations.
 *
 * Both are hand-built flat SVG rather than bitmap art: they must sit on the
 * warm beige hero panel without a white box around them, scale to any viewport
 * without shipping three resolutions, and stay crisp when the page is zoomed.
 *
 * They are deliberately decorative (`aria-hidden`) — the hero already carries
 * the headline and lead paragraph in real text, so a screen reader gains
 * nothing from a description of the artwork.
 */

const SKIN = "#F7CDA4";
const SKIN_SHADE = "#EFB98C";
const NAVY = "#123458";
const TEAL = "#00A99D";
const GOLD = "#F2994A";

/** Boy carrying a stack of books — the centres & schools hero. */
export function BoyWithBooksIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 420" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="dir-hero-blob" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#DFF3F1" />
          <stop offset="100%" stopColor="#FBEFDF" />
        </linearGradient>
        <linearGradient id="dir-hero-shirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#EEF4F3" />
        </linearGradient>
      </defs>

      {/* Soft mint blob + ground */}
      <circle cx="180" cy="200" r="152" fill="url(#dir-hero-blob)" />
      <ellipse cx="180" cy="396" rx="128" ry="16" fill="#E9DFD2" opacity="0.85" />

      {/* Backpack straps */}
      <rect x="137" y="214" width="14" height="66" rx="7" fill={TEAL} opacity="0.9" />
      <rect x="209" y="214" width="14" height="66" rx="7" fill={TEAL} opacity="0.9" />

      {/* Neck + shirt */}
      <rect x="170" y="172" width="20" height="28" rx="9" fill={SKIN_SHADE} />
      <path
        d="M132 250c0-26 20-46 48-46s48 20 48 46v84c0 12-9 20-21 20h-54c-12 0-21-8-21-20z"
        fill="url(#dir-hero-shirt)"
        stroke="#E4DED3"
      />
      {/* Collar */}
      <path d="M162 205l18 20 18-20" fill="none" stroke={TEAL} strokeWidth="7" strokeLinecap="round" />

      {/* Arms holding the books */}
      <rect x="110" y="240" width="28" height="58" rx="14" fill={SKIN} />
      <rect x="222" y="240" width="28" height="58" rx="14" fill={SKIN} />

      {/*
       * Book pile. Three slabs with real gaps between them — an earlier pass
       * tucked a pale "page block" under each cover, but against a white shirt
       * the page blocks vanished and the pile collapsed into one flat bar.
       * Clear gaps and a per-book offset are what make it read as a stack.
       */}
      <ellipse cx="180" cy="374" rx="96" ry="10" fill="#D9CDBC" opacity="0.55" />
      <g transform="rotate(-3 180 348)">
        <rect x="112" y="286" width="136" height="22" rx="5" fill={TEAL} />
        <rect x="120" y="286" width="5" height="22" fill="#0B7F76" />
        <rect x="104" y="316" width="152" height="22" rx="5" fill={GOLD} />
        <rect x="112" y="316" width="5" height="22" fill="#CE7A2C" />
        <rect x="116" y="346" width="128" height="22" rx="5" fill={NAVY} />
        <rect x="124" y="346" width="5" height="22" fill="#071B33" />
      </g>

      {/* Hands resting on top of the pile, tying the arms to the books. */}
      <circle cx="126" cy="288" r="13" fill={SKIN} />
      <circle cx="234" cy="288" r="13" fill={SKIN} />

      {/* Legs + shoes */}
      <rect x="143" y="352" width="26" height="44" rx="12" fill={NAVY} />
      <rect x="191" y="352" width="26" height="44" rx="12" fill={NAVY} />
      <ellipse cx="156" cy="398" rx="20" ry="9" fill="#0C2547" />
      <ellipse cx="204" cy="398" rx="20" ry="9" fill="#0C2547" />

      {/* Head */}
      <circle cx="180" cy="132" r="52" fill={SKIN} />
      <circle cx="128" cy="138" r="9" fill={SKIN_SHADE} />
      <circle cx="232" cy="138" r="9" fill={SKIN_SHADE} />

      {/* Hair */}
      <path
        d="M128 122c2-32 26-54 52-54s50 22 52 54c-10-16-22-20-32-20-16 0-22 8-36 8-14 0-24 2-36 12z"
        fill={NAVY}
      />
      <path d="M128 120c-7 9-7 22-2 30 2-13 6-22 12-28z" fill={NAVY} />
      <path d="M232 120c7 9 7 22 2 30-2-13-6-22-12-28z" fill={NAVY} />

      {/* Face */}
      <circle cx="162" cy="136" r="5.5" fill="#2C3E50" />
      <circle cx="198" cy="136" r="5.5" fill="#2C3E50" />
      <path d="M152 120c7-5 15-5 21 0" fill="none" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />
      <path d="M187 120c7-5 15-5 21 0" fill="none" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />
      <circle cx="147" cy="153" r="7" fill="#F5A8A0" opacity="0.55" />
      <circle cx="213" cy="153" r="7" fill="#F5A8A0" opacity="0.55" />
      <path d="M167 157c8 9 19 9 26 0" fill="none" stroke="#B4523A" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/** Girl colouring with pencils — the kindergartens hero. */
export function GirlWithPencilsIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 420" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="dir-kg-blob" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FDECCF" />
          <stop offset="100%" stopColor="#E2F4F2" />
        </linearGradient>
      </defs>

      {/* Sun — kept clear of the bun and bow so it reads as a sun in the
          background rather than a second blob on the character's head. */}
      <circle cx="318" cy="52" r="26" fill="#FFD36B" opacity="0.85" />
      <circle cx="184" cy="206" r="150" fill="url(#dir-kg-blob)" />
      <ellipse cx="184" cy="396" rx="126" ry="16" fill="#E9DFD2" opacity="0.85" />

      {/* Hair bun + bow */}
      <circle cx="222" cy="66" r="24" fill="#7B4B27" />
      <path d="M246 58l-22-13v26z" fill={GOLD} />
      <path d="M246 58l22-13v26z" fill={GOLD} />
      <circle cx="246" cy="58" r="5" fill="#E07B2A" />

      {/* Head */}
      <circle cx="178" cy="146" r="52" fill={SKIN} />
      <circle cx="126" cy="152" r="9" fill={SKIN_SHADE} />
      <circle cx="230" cy="152" r="9" fill={SKIN_SHADE} />

      {/* Hair */}
      <path
        d="M126 146c0-36 23-60 52-60s52 24 52 60c-8-14-16-20-26-22-8 13-32 17-49 13-13-2-23 0-29 9z"
        fill="#7B4B27"
      />
      <path d="M126 146c-9 11-9 26-2 36 0-15 2-26 8-32z" fill="#7B4B27" />

      {/* Face */}
      <circle cx="160" cy="148" r="5.5" fill="#2C3E50" />
      <circle cx="196" cy="148" r="5.5" fill="#2C3E50" />
      <path d="M150 133c7-5 15-5 21 0" fill="none" stroke="#5B3A1E" strokeWidth="4" strokeLinecap="round" />
      <path d="M185 133c7-5 15-5 21 0" fill="none" stroke="#5B3A1E" strokeWidth="4" strokeLinecap="round" />
      <circle cx="145" cy="165" r="7" fill="#F5A8A0" opacity="0.6" />
      <circle cx="211" cy="165" r="7" fill="#F5A8A0" opacity="0.6" />
      <path d="M165 167c8 9 19 9 26 0" fill="none" stroke="#B4523A" strokeWidth="4" strokeLinecap="round" />

      {/* Neck + dress */}
      <rect x="168" y="184" width="20" height="26" rx="9" fill={SKIN_SHADE} />
      <path
        d="M126 260c0-28 24-50 52-50s52 22 52 50v56c0 14-11 24-25 24h-54c-14 0-25-10-25-24z"
        fill="#F6C544"
      />
      <path d="M126 260c24 12 80 12 104 0" fill="none" stroke="#E0A92A" strokeWidth="4" />
      <path d="M178 212l-15 15 15 19 15-19z" fill="#FFFFFF" />

      {/* Arms reaching to the page */}
      <rect x="104" y="252" width="28" height="72" rx="14" fill={SKIN} />
      <rect x="226" y="256" width="28" height="68" rx="14" fill={SKIN} />

      {/* Colouring page + hands on the sheet */}
      <g transform="rotate(-3 180 348)">
        <rect x="94" y="312" width="172" height="58" rx="8" fill="#FFFFFF" stroke="#EADFCB" />
        <circle cx="130" cy="336" r="12" fill={TEAL} opacity="0.75" />
        <rect x="156" y="326" width="52" height="8" rx="4" fill={GOLD} />
        <rect x="156" y="342" width="80" height="8" rx="4" fill="#D7E6E4" />
        <path d="M216 340l14-14 10 10-14 14z" fill={TEAL} />
      </g>
      <circle cx="120" cy="318" r="12" fill={SKIN} />
      <circle cx="238" cy="322" r="12" fill={SKIN} />

      {/* Pencils */}
      <g>
        <rect x="240" y="286" width="10" height="58" rx="5" fill="#E2455B" transform="rotate(18 245 315)" />
        <rect x="256" y="292" width="10" height="54" rx="5" fill="#2F80ED" transform="rotate(28 261 319)" />
        <rect x="270" y="298" width="10" height="50" rx="5" fill="#1E9E6A" transform="rotate(38 275 323)" />
      </g>
    </svg>
  );
}
