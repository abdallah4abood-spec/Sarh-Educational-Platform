/**
 * SARH (صَرْح) — Tailwind CSS Design System Configuration
 * Tokens are 1:1 with Design.md / Agent.md brand specifications.
 * Direction: RTL-first (dir="rtl") with LTR fallback.
 * Theming: `.dark` class strategy driven by next-themes.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sarh: {
          teal: "#00A99D", // Primary Brand: Growth, Primary Actions, Active States
          tealDeep: "#00837A", // Pressed / Active States (Design.md §1)
          tealSoft: "rgba(0,169,157,0.1)", // Subdued tag fills (Design.md §1)
          gold: "#F2994A", // Secondary / Accent: Highlights, Notifications, Badges
          orange: "#F2994A", // Alias used by the 2026 desk-light identity
          orangeDeep: "#E07B2A", // Accent pressed / text-on-light state
          navy: "#0F2C59", // Deep Navy: Primary Text (Light Mode), Dark Mode Surfaces
          navyDark: "#081325", // Root background surface (dark)
          // ---- Warm "desk" light surfaces (default theme, see globals.css) ----
          bgLight: "#FAF7F2", // Light Mode Background: bright desk, soft morning light
          cream: "#FAF7F2", // Same surface, expressive name for new components
          beige: "#FDF3E7", // Soft beige inner boxes (teacher summary, notes)
          beigeDeep: "#F6E9D8", // Beige border / divider
          mist: "#EFF6F5", // Faint mint wash for teal-adjacent surfaces
          bgDark: "#081325", // Dark Mode Root Background Surface
          cardLight: "#FFFFFF", // Light Mode Card Surface
          cardDark: "#0F1E36", // Dark Mode Card Surface
          borderLight: "#EDE5DA", // Light Mode Border Color (warm)
          borderDark: "#1E293B", // Dark Mode Border Color
          ink: "#0D253D", // High contrast body text (Design.md §1)
          inkMute: "#64748D", // Captions and helpers (Design.md §1)
        },
        // Semantic, theme-aware aliases so components never hard-code hex values.
        background: "var(--sarh-bg)",
        foreground: "var(--sarh-fg)",
        muted: {
          DEFAULT: "var(--sarh-muted)",
          foreground: "var(--sarh-muted-fg)",
        },
        card: {
          DEFAULT: "var(--sarh-card)",
          foreground: "var(--sarh-card-fg)",
        },
        border: "var(--sarh-border)",
        primary: {
          DEFAULT: "#00A99D",
          foreground: "#FFFFFF",
        },
        accent: {
          DEFAULT: "#F2994A",
          foreground: "#FFFFFF",
        },
      },
      fontFamily: {
        arabic: ["var(--font-readex)", "Tajawal", "sans-serif"],
        readex: ["var(--font-readex)", "Tajawal", "sans-serif"],
        tajawal: ["Tajawal", "var(--font-readex)", "sans-serif"],
        sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
        jakarta: ["var(--font-jakarta)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "16px", // Cards  → rounded-2xl
        button: "8px", // Buttons → rounded-lg
        modal: "24px", // Modals  → rounded-3xl
        // Design.md §1 — added WITHOUT overriding Tailwind's default
        // sm/md/lg radii so completed pages keep their exact shapes.
        xs: "4px",
        pill: "9999px",
      },
      boxShadow: {
        // Design.md §1 elevation tokens
        "card-float":
          "rgba(0, 55, 112, 0.08) 0px 8px 24px, rgba(0, 55, 112, 0.04) 0px 2px 6px",
        subtle:
          "rgba(0, 0, 0, 0.04) 0px 2px 6px 0px, rgba(0, 0, 0, 0.08) 0px 4px 12px 0px",
        "glow-teal": "0 0 20px rgba(0, 169, 157, 0.35)",
        "glow-gold": "0 0 20px rgba(242, 153, 74, 0.35)",
        soft: "0 4px 20px -2px rgba(15, 44, 89, 0.08)",
        "soft-lg": "0 12px 34px -6px rgba(15, 44, 89, 0.16)",
        "teal-glow": "0 8px 26px -6px rgba(0, 169, 157, 0.45)",
        "gold-glow": "0 8px 26px -6px rgba(242, 153, 74, 0.45)",
        "teal-gold-glow":
          "0 10px 30px -8px rgba(0, 169, 157, 0.45), 0 10px 30px -8px rgba(242, 153, 74, 0.30)",
      },
      backdropBlur: {
        glass: "12px",
        "glass-lg": "20px",
      },
      backgroundImage: {
        "sarh-teal-gold": "linear-gradient(135deg, #00A99D 0%, #F2994A 100%)",
        "sarh-gold-teal": "linear-gradient(135deg, #F2994A 0%, #00A99D 100%)",
        // The light hero environment: a bright desk under soft morning daylight,
        // cool near the "window" and warm toward the opposite corner.
        "sarh-desk":
          "linear-gradient(160deg, #FFFFFF 0%, #FAF7F2 42%, #F4F7F7 72%, #FDF3E7 100%)",
        "sarh-desk-soft":
          "radial-gradient(115% 85% at 88% 6%, #FFFFFF 0%, rgba(255,255,255,0) 55%), radial-gradient(90% 70% at 4% 96%, #FDF3E7 0%, rgba(253,243,231,0) 60%)",
      },
      keyframes: {
        "ai-glow": {
          "0%, 100%": { boxShadow: "0 0 12px 0 rgba(0, 169, 157, 0.55)" },
          "50%": { boxShadow: "0 0 26px 6px rgba(242, 153, 74, 0.55)" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        // ---- Micro-interaction primitives (React Bits-style, CSS-only) ----
        /** Idle float for the glass dashboard card and the hero stat chip. */
        "float-soft": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        /** Slower, wider drift for background plants and desk props. */
        "float-drift": {
          "0%, 100%": { transform: "translate3d(0,0,0) rotate(0deg)" },
          "50%": { transform: "translate3d(0,-14px,0) rotate(1.6deg)" },
        },
        /** "مباشر الآن" status dot: a swelling ring that never distracts. */
        "pulse-ring": {
          "0%": { transform: "scale(0.85)", opacity: "0.7" },
          "70%": { transform: "scale(2.1)", opacity: "0" },
          "100%": { transform: "scale(2.1)", opacity: "0" },
        },
      },
      animation: {
        "ai-glow": "ai-glow 1.6s ease-in-out infinite",
        "fade-up": "fade-up 0.35s ease-out both",
        shimmer: "shimmer 1.6s linear infinite",
        "float-soft": "float-soft 6s ease-in-out infinite",
        "float-drift": "float-drift 9s ease-in-out infinite",
        "pulse-ring": "pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
