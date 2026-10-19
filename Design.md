# SARH (صَرْح) --- MASTER DESIGN SYSTEM

## `Design.md` --- Single Source of Truth

> **Purpose:** This document defines the visual language, UI rules,
> design tokens, component behavior, responsive rules, accessibility
> standards, and implementation prompts for the **SARH (صَرْح)** platform.
>
> **Design direction:** SARH combines two complementary design
> principles: - **Airbnb-inspired marketplace UX:** warm, human,
> photo-first discovery, generous whitespace, floating search, soft
> cards, clear trust signals. - **Stripe-inspired product UX:** precise
> financial/data interfaces, disciplined typography, pill CTAs, dense
> tables, dashboard hierarchy, analytical surfaces.
>
> **Important:** SARH does **not** copy Airbnb or Stripe branding. Their
> extracted design principles are used only as references. SARH's own
> brand colors, Arabic typography, RTL behavior, education context, and
> offline-first requirements always take priority.

------------------------------------------------------------------------

# 1. Product Design Philosophy

SARH is an Arabic-first, RTL-first, offline-first Progressive Web App
connecting parents with kindergartens and educational/Tawjihi centers.

The interface must feel:

1.  **Trustworthy** --- parents are dealing with children, payments,
    attendance, grades, and private information.
2.  **Human** --- discovery and parent experiences should feel
    approachable rather than institutional.
3.  **Precise** --- financial, enrollment, attendance, OCR, and academic
    data must be easy to scan and verify.
4.  **Fast** --- the UI must remain useful under low-bandwidth
    conditions and unstable connectivity.
5.  **Modern** --- AI functionality should feel integrated into the
    product, not like a separate experimental tool.
6.  **Arabic-native** --- Arabic is not a translated afterthought.
    Layout, spacing, typography, controls, and information hierarchy are
    designed for RTL first.

### Design split by product area

  -----------------------------------------------------------------------
  Area                    Primary visual          Design behavior
                          influence               
  ----------------------- ----------------------- -----------------------
  Landing / Discovery     Airbnb-inspired         Photo-first, spacious,
                                                  friendly

  Institution cards       Airbnb-inspired         Image, trust badge,
                                                  rating, price, CTA

  Center profile          Airbnb + editorial      Large visual hero +
                                                  structured information

  Parent portal           Airbnb-inspired +       Simple, warm,
                          mobile UX               glanceable

  Daily child feed        Timeline / consumer UX  Visual, calm, easy to
                                                  scan

  Teacher portal          Stripe-inspired         Dense but organized
                                                  operational UI

  AI Studio               Stripe-inspired         Focused controls +
                                                  clear generation states

  Admin dashboard         Stripe-inspired         Analytical, dense,
                                                  precise

  Finance / OCR           Stripe-inspired         Split workspace,
                                                  tables, verification
                                                  states

  Dark mode               Stripe-inspired         Deep navy app shell,
                                                  restrained accents
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 2. Non-Negotiable Design Rules

Every generated page, component, or UI modification MUST follow these
rules.

### 2.1 Brand

-   Primary brand action color: **SARH Teal `#00A99D`**
-   Secondary accent: **SARH Gold `#F2994A`**
-   Primary dark ink: **SARH Navy `#0F2C59`**
-   Do not introduce arbitrary brand colors.
-   Do not use Airbnb Rausch or Stripe Indigo as SARH brand colors.
-   Gradient decoration is allowed only when it uses SARH colors or
    approved semantic colors.

### 2.2 RTL

-   Default document direction: `dir="rtl"`.
-   Arabic is the default language.
-   Use logical CSS/Tailwind properties:
    -   `start-*`
    -   `end-*`
    -   `ms-*`
    -   `me-*`
    -   `ps-*`
    -   `pe-*`
-   Avoid hardcoded `left-*` / `right-*` unless a genuinely directional
    visual element requires it.
-   Icons must remain semantically correct when direction changes.
-   Numbers, currency, dates, and transaction IDs must remain visually
    stable.

### 2.3 No visual noise

Avoid: - excessive gradients - excessive shadows - oversized decorative
icons - unnecessary glassmorphism - multiple competing accent colors -
giant text that pushes functional content below the fold - dense cards
without hierarchy

### 2.4 Interaction

Every interactive element needs: - default state - hover state where
applicable - focus-visible state - pressed/active state - disabled
state - loading state when an async operation exists - error state where
validation/API failure is possible - success state where confirmation
matters

------------------------------------------------------------------------

# 3. Brand Tokens

## 3.1 Color system

``` ts
const sarhColors = {
  teal: '#00A99D',
  tealDeep: '#00837A',
  tealSoft: 'rgba(0, 169, 157, 0.10)',

  gold: '#F2994A',
  goldDeep: '#D97F32',
  goldSoft: 'rgba(242, 153, 74, 0.12)',

  navy: '#0F2C59',
  navyDeep: '#081325',

  bgLight: '#F8FAFC',
  bgDark: '#081325',

  cardLight: '#FFFFFF',
  cardDark: '#0F1E36',

  borderLight: '#E2E8F0',
  borderDark: '#1E293B',

  ink: '#0D253D',
  inkSecondary: '#273951',
  inkMute: '#64748D',

  white: '#FFFFFF',
  black: '#000000',

  success: '#16A34A',
  successSoft: '#DCFCE7',

  warning: '#D97706',
  warningSoft: '#FEF3C7',

  danger: '#DC2626',
  dangerSoft: '#FEE2E2',

  info: '#2563EB',
  infoSoft: '#DBEAFE'
};
```

## 3.2 Color roles

  -----------------------------------------------------------------------
  Token                   Value                   Role
  ----------------------- ----------------------- -----------------------
  `sarh.teal`             `#00A99D`               Primary actions, active
                                                  states, links, selected
                                                  tabs

  `sarh.tealDeep`         `#00837A`               Hover/pressed state

  `sarh.tealSoft`         rgba teal               Soft active backgrounds

  `sarh.gold`             `#F2994A`               AI, highlights,
                                                  progress, secondary
                                                  emphasis

  `sarh.navy`             `#0F2C59`               Main text, navigation,
                                                  dark surfaces

  `sarh.navyDeep`         `#081325`               Dark-mode root
                                                  background

  `sarh.bgLight`          `#F8FAFC`               Light page background

  `sarh.cardLight`        `#FFFFFF`               Light cards

  `sarh.cardDark`         `#0F1E36`               Dark cards

  `sarh.borderLight`      `#E2E8F0`               Light borders

  `sarh.borderDark`       `#1E293B`               Dark borders

  `sarh.inkMute`          `#64748D`               Secondary/caption text
  -----------------------------------------------------------------------

### Brand-color hierarchy

Use color in this order:

1.  Navy for information and trust.
2.  Teal for actions and active state.
3.  Gold for AI/highlight/progress.
4.  Semantic colors only for actual status.
5.  Decorative gradients only where they improve hierarchy.

------------------------------------------------------------------------

# 4. Approved Gradients

Gradients are a controlled visual device, not a default background.

## 4.1 AI gradient

``` css
background:
  linear-gradient(
    135deg,
    rgba(0,169,157,0.14),
    rgba(242,153,74,0.16)
  );
```

Use for: - AI Studio headers - AI-generated summary cards - AI
processing states - selected AI tools

## 4.2 Hero atmospheric gradient

``` css
background:
  radial-gradient(
    circle at 15% 20%,
    rgba(0,169,157,0.18),
    transparent 38%
  ),
  radial-gradient(
    circle at 85% 15%,
    rgba(242,153,74,0.16),
    transparent 34%
  );
```

Use subtly behind: - public landing hero - discovery hero - selected
marketing sections

Never place this gradient behind dense tables.

------------------------------------------------------------------------

# 5. Typography

## 5.1 Font families

### Arabic

Primary:

``` css
font-family:
  'Readex Pro',
  'Tajawal',
  sans-serif;
```

### English / numbers

Primary:

``` css
font-family:
  'Plus Jakarta Sans',
  'Inter',
  system-ui,
  sans-serif;
```

### Rule

Arabic interface copy uses **Readex Pro**.

English labels, technical identifiers, and numeric-heavy UI may use
**Plus Jakarta Sans**.

Do not mix several fonts within the same component unless required for
Arabic/Latin legibility.

------------------------------------------------------------------------

# 6. Type Scale

``` ts
const typography = {
  displayXL: {
    size: '48px',
    weight: 700,
    lineHeight: 1.08,
    tracking: '-0.8px'
  },

  displayLG: {
    size: '40px',
    weight: 700,
    lineHeight: 1.12,
    tracking: '-0.6px'
  },

  headingXL: {
    size: '32px',
    weight: 700,
    lineHeight: 1.18,
    tracking: '-0.4px'
  },

  headingLG: {
    size: '26px',
    weight: 700,
    lineHeight: 1.25,
    tracking: '-0.25px'
  },

  headingMD: {
    size: '22px',
    weight: 600,
    lineHeight: 1.3,
    tracking: '-0.15px'
  },

  headingSM: {
    size: '18px',
    weight: 600,
    lineHeight: 1.4,
    tracking: '0'
  },

  bodyLG: {
    size: '18px',
    weight: 400,
    lineHeight: 1.65
  },

  bodyMD: {
    size: '16px',
    weight: 400,
    lineHeight: 1.6
  },

  bodySM: {
    size: '14px',
    weight: 400,
    lineHeight: 1.5
  },

  caption: {
    size: '13px',
    weight: 500,
    lineHeight: 1.4
  },

  micro: {
    size: '11px',
    weight: 600,
    lineHeight: 1.3
  }
};
```

## 6.1 Typography philosophy

The system combines: - Airbnb's restrained, readable hierarchy. -
Stripe's editorial precision and tight display tracking.

SARH should **not** use extremely thin typography for Arabic UI. Arabic
functional text needs stronger weight for readability.

------------------------------------------------------------------------

# 7. Numeric Typography

All of the following MUST use tabular numerals:

-   prices
-   ILS/USD amounts
-   transaction IDs
-   student counts
-   attendance statistics
-   grades
-   quiz scores
-   percentages
-   commission amounts
-   dashboard KPIs

``` css
font-variant-numeric: tabular-nums;
font-feature-settings: "tnum";
```

Example:

``` tsx
<span className="tabular-nums">
  ₪1,250.00
</span>
```

Never rely on proportional numerals in financial reconciliation screens.

------------------------------------------------------------------------

# 8. Spacing System

Base unit: **4px**, with 8px as the primary rhythm.

``` ts
const spacing = {
  xxs: '2px',
  xs: '4px',
  sm: '8px',
  md: '12px',
  base: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
  section: '64px',
  hero: '96px'
};
```

### Usage

-   `4px`: icon/text micro-gap
-   `8px`: compact controls
-   `12px`: badges and dense rows
-   `16px`: default component spacing
-   `24px`: card internal spacing
-   `32px`: major component spacing
-   `48px`: large section spacing
-   `64px`: standard section separation
-   `96px`: public landing hero/marketing separation

------------------------------------------------------------------------

# 9. Container & Grid

## Public pages

``` css
max-width: 1280px;
margin-inline: auto;
padding-inline: 24px;
```

## Dashboard pages

``` css
max-width: 1440px;
margin-inline: auto;
padding-inline: 24px;
```

## Mobile

``` css
padding-inline: 16px;
```

### Grid philosophy

Public discovery: - 4 cards desktop - 3 cards medium - 2 cards tablet -
1 card mobile

Dashboard: - KPI grid - content grid - data table - secondary panel

Do not force dashboard content into marketplace-style cards.

------------------------------------------------------------------------

# 10. Border Radius

``` ts
const radius = {
  xs: '4px',
  sm: '8px',
  md: '14px',
  lg: '20px',
  xl: '24px',
  pill: '9999px'
};
```

### Rules

  Element            Radius
  ------------------ ----------------------
  Inputs             8px
  Standard buttons   8px
  Cards              14--20px
  Modals             20--24px
  Images             14--20px
  Tags / badges      pill
  Search             pill
  Avatar             50%
  Dashboard table    14px outer container

------------------------------------------------------------------------

# 11. Shadows & Elevation

SARH uses restrained elevation.

``` css
--shadow-subtle:
  0 2px 6px rgba(0,0,0,0.04),
  0 4px 12px rgba(0,0,0,0.08);

--shadow-card:
  0 8px 24px rgba(0,55,112,0.08),
  0 2px 6px rgba(0,55,112,0.04);

--shadow-focus:
  0 0 0 3px rgba(0,169,157,0.16);
```

### Elevation levels

**Level 0** - normal page - no shadow

**Level 1** - standard cards - subtle shadow

**Level 2** - dropdowns - popovers - floating search - sticky action
panels

**Level 3** - modals - critical floating overlays

Avoid deep black shadows.

------------------------------------------------------------------------

# 12. Glassmorphism

Glassmorphism is allowed only for: - sticky public header - floating
search header - mobile bottom navigation when appropriate - temporary
overlays

``` css
backdrop-filter: blur(12px) saturate(160%);
background: rgba(255,255,255,0.82);
border: 1px solid rgba(226,232,240,0.85);
```

Dark:

``` css
background: rgba(15,30,54,0.84);
border-color: rgba(30,41,59,0.9);
```

Never use glassmorphism for every card.

------------------------------------------------------------------------

# 13. Buttons

## 13.1 Primary button

``` tsx
<button className="
  rounded-full
  bg-[#00A99D]
  px-6 py-3
  font-medium
  text-white
  transition-all
  hover:bg-[#00837A]
  active:scale-[0.98]
  focus-visible:outline-none
  focus-visible:ring-2
  focus-visible:ring-[#00A99D]
  focus-visible:ring-offset-2
  disabled:cursor-not-allowed
  disabled:opacity-50
">
  حجز مقعد الآن
</button>
```

Use for: - booking - save - submit - confirm - primary navigation action

## 13.2 Secondary button

White or transparent surface with navy/teal border.

Use for: - secondary actions - cancel - contact - export

## 13.3 Gold AI button

Use Gold only when the action is explicitly AI-related.

Examples: - توليد اختبار بالذكاء الاصطناعي - تلخيص اليوم - استخراج
بيانات الإيصال

Gold must not replace Teal as the general primary CTA.

## 13.4 Destructive button

Use red only for destructive actions: - reject - delete - remove

Never use red as decorative brand color.

------------------------------------------------------------------------

# 14. Search

The public discovery search is one of the main Airbnb-inspired
interactions.

## Search bar

``` text
┌───────────────────────────────────────────────────────────────┐
│ المنطقة │ المرحلة العمرية │ السعر │ التقييم       [ بحث ] │
└───────────────────────────────────────────────────────────────┘
```

Properties: - pill shape - 56--64px height desktop - 52px minimum
mobile - white/light surface - subtle border - floating shadow - teal
search action - filter segments separated by subtle hairlines

Mobile: - collapse to one large pill - tapping opens a full-screen
search/filter sheet

------------------------------------------------------------------------

# 15. Navigation

## Public navbar

Desktop: - SARH logo - الرئيسية - استكشف - المراكز - كيف يعمل صرح -
تسجيل الدخول - primary CTA

The visual treatment should remain light and spacious.

## Parent navbar

Prioritize: - dashboard - children - daily feed - payments - profile

## Institution navbar

Prioritize: - dashboard - attendance - students - enrollments - AI
Studio - reports

## Admin navbar

Prioritize: - overview - approvals - institutions - finance - OCR -
reports - settings

------------------------------------------------------------------------

# 16. Cards

Cards follow the Airbnb-inspired photo-first philosophy for public
discovery, while dashboards use more restrained Stripe-inspired
containers.

## 16.1 Institution card

``` text
┌──────────────────────────────┐
│           COVER IMAGE        │
│  ✓ موثّق              ♡     │
│                              │
├──────────────────────────────┤
│ اسم المؤسسة                 │
│ المنطقة · المرحلة           │
│ ★ 4.9     ₪ السعر           │
│                              │
│       حجز مقعد الآن         │
└──────────────────────────────┘
```

Rules: - image aspect ratio: 4:3 - rounded image corners - floating
verification/rating badges - title 16--18px - metadata 14px - CTA full
width or aligned to card bottom - no excessive borders

## 16.2 Dashboard card

Dashboard cards: - less decorative - stronger information hierarchy -
optional icon - KPI - label - trend/status - compact padding

------------------------------------------------------------------------

# 17. Institution Detail Page

The institution profile is a hybrid of marketplace discovery and
structured education information.

## Hero

-   high-resolution cover
-   soft dark gradient overlay
-   institution logo
-   verified badge
-   institution name
-   location
-   rating
-   contact actions
-   booking CTA

## Content

Tabs:

1.  نظرة عامة
2.  البرامج والشُعب
3.  المرافق والخدمات
4.  الصور
5.  الموقع

## Booking

The booking flow should feel like a clear transaction, not a complicated
form.

Steps:

1.  اختيار الطفل
2.  اختيار البرنامج/الصف
3.  رفع إيصال الدفع
4.  مراجعة الطلب
5.  إرسال

------------------------------------------------------------------------

# 18. Parent Portal

The parent interface prioritizes emotional clarity and quick scanning.

## Dashboard

Top: - greeting - notification state - child switcher

Then: - enrolled children - attendance summary - latest daily activity -
payment status - academic progress

Avoid excessive charts.

Parents should understand the child's current state within 5 seconds.

------------------------------------------------------------------------

# 19. Child Daily Feed

The feed is mobile-first.

## Header

-   child selector
-   age/stage
-   date slider
-   connection state

## Kindergarten mode

Display:

-   attendance
-   meals
-   activities
-   photos
-   teacher notes
-   authorized pickup person

Visual language: - friendly - soft cards - large readable labels -
photography-forward

## Educational / Tawjihi mode

Display:

-   attendance
-   homework
-   grades
-   quiz score
-   AI daily summary
-   teacher notes

The AI summary uses a subtle Teal/Gold accent, not a large flashy
gradient.

------------------------------------------------------------------------

# 20. Offline State

Offline is a first-class state, not an error.

Display a calm banner:

> يعمل بدون إنترنت --- تم الحفظ محلياً

Use: - muted navy/teal - small icon - clear synchronization status

Possible states:

  State            UI
  ---------------- --------------------
  Online           subtle status
  Offline          visible banner
  Saving locally   spinner / progress
  Syncing          sync icon + text
  Synced           success check
  Sync failed      warning + retry

Do not block attendance or local daily-log work just because the network
is unavailable.

------------------------------------------------------------------------

# 21. Institution / Teacher Dashboard

This is the primary Stripe-inspired product surface.

The dashboard should use:

-   compact cards
-   clear KPI hierarchy
-   dense but readable tables
-   strong status badges
-   predictable controls
-   sticky table headers
-   filters above tables

## KPI cards

Examples:

-   إجمالي الطلاب
-   الحضور اليوم
-   الطلبات الجديدة
-   الإيرادات
-   المستحقات
-   الاختبارات المولدة

KPI numbers use tabular numerals.

------------------------------------------------------------------------

# 22. Attendance Tracker

Attendance must be optimized for one-handed and fast operation.

Each student row:

``` text
اسم الطالب       [ حاضر ] [ غائب ] [ ملاحظة ]
```

States: - present = green - absent = red - note/photo = neutral/teal

On interaction: 1. save locally immediately 2. show instant visual
confirmation 3. sync in background 4. show synced state

Never require a page refresh.

------------------------------------------------------------------------

# 23. AI Studio

The AI Studio uses Stripe-style precision with SARH's Gold/Teal
identity.

## Layout

Desktop:

``` text
┌──────────────────────────┬──────────────────────────────────┐
│ AI CONTROLS              │ GENERATED RESULT                 │
│                          │                                  │
│ المادة                   │ الاختبار                         │
│ اسم الدرس                │ السؤال 1                         │
│ الصعوبة                  │ السؤال 2                         │
│                          │ السؤال 3                         │
│ [ توليد بالذكاء الاصطناعي ] │ [تحميل] [طباعة]              │
└──────────────────────────┴──────────────────────────────────┘
```

Mobile: - controls first - result below - sticky generate button only
when useful

## AI processing

During generation: - disable duplicate submission - show progress
state - animate Teal/Gold border subtly - preserve user input - show
clear completion state

Do not use an aggressive neon animation.

------------------------------------------------------------------------

# 24. Financial Dashboard

The financial interface should follow Stripe-inspired information
density.

## KPI cards

-   إجمالي الإيرادات
-   العمولات المحصلة
-   الطلبات المعلقة
-   المؤسسات النشطة

## Table

Columns may include:

-   الطالب
-   المؤسسة
-   المبلغ
-   العمولة
-   الحالة
-   التاريخ
-   رقم المعاملة
-   الإجراء

All monetary values: - `tnum` - right/inline logical alignment -
consistent currency formatting

------------------------------------------------------------------------

# 25. OCR Reconciliation Workspace

The OCR interface is explicitly split-screen on desktop.

``` text
┌───────────────────────────┬─────────────────────────────────┐
│ PAYMENT RECEIPT           │ OCR DATA                        │
│                           │                                 │
│   [receipt image]         │ Amount                         │
│                           │ Transaction ID                 │
│   Zoom controls           │ Payer Name                    │
│                           │ Date                           │
│                           │ Confidence                     │
│                           │                                 │
│                           │ [ تأكيد الاعتماد ] [ رفض ]     │
└───────────────────────────┴─────────────────────────────────┘
```

## Confidence

Use: - green = high confidence - amber = needs review - red =
mismatch/low confidence

The AI extraction never silently approves a financial transaction.

------------------------------------------------------------------------

# 26. Data Tables

Tables follow Stripe-inspired principles.

Rules: - sticky header on long tables - clear column hierarchy - compact
row height - 14--15px body text - tabular numbers - horizontal scroll on
small screens - row hover only where helpful - status represented by
both color and text - filters above the table - pagination when
necessary - empty state when no records exist

Never rely on color alone for status.

------------------------------------------------------------------------

# 27. Status Badges

## Success

``` text
✓ مؤكد
```

Green background + green text.

## Pending

``` text
◷ قيد المراجعة
```

Amber background + amber text.

## Rejected

``` text
× مرفوض
```

Red background + red text.

## Offline

``` text
غير متصل
```

Neutral/amber.

## AI

``` text
AI
```

Teal/Gold treatment.

Badges should be pill-shaped and compact.

------------------------------------------------------------------------

# 28. Forms

Forms should be calm and highly readable.

## Input

-   height: 48--56px
-   radius: 8px
-   white/dark card surface
-   subtle border
-   label above
-   helper/error text below

Focus:

``` css
border-color: #00A99D;
box-shadow: 0 0 0 3px rgba(0,169,157,0.12);
```

Do not use huge glowing outlines.

## Error

Show: - red border - error icon - concise Arabic message

Example:

> يرجى إدخال اسم الطالب.

------------------------------------------------------------------------

# 29. Modals

Modal radius: 20--24px.

Structure:

``` text
عنوان
وصف مختصر
────────────────
المحتوى
────────────────
إلغاء        تأكيد
```

Rules: - backdrop - clear close button - focus trap - keyboard escape -
mobile bottom-sheet option for multi-step workflows - do not exceed
comfortable reading width

------------------------------------------------------------------------

# 30. Toasts & Notifications

Use short messages.

Examples:

> تم حفظ الحضور بنجاح.

> تم حفظ التغيير محلياً وسيتم مزامنته عند عودة الاتصال.

> تم اعتماد الإيصال.

> حدث خطأ أثناء المزامنة. حاول مرة أخرى.

Toasts: - never hide important errors - use icon + text - auto-dismiss
only for non-critical success - allow manual dismissal

------------------------------------------------------------------------

# 31. Images & Photography

Public discovery is photography-led.

Use: - WebP - `next/image` - responsive `sizes` - blur placeholders -
lazy loading below fold

Institution images: - authentic - bright - human - education-focused -
avoid generic corporate stock imagery where possible

Image treatment: - soft radius - minimal overlays - readable text
contrast - no unnecessary dark filters

------------------------------------------------------------------------

# 32. Icons

Use **Lucide React**.

Rules: - consistent stroke width - default 20--24px - 16px for dense
tables - 24px for primary actions - 32px for feature-level navigation

Never mix multiple icon libraries in the same interface.

------------------------------------------------------------------------

# 33. Motion

Motion is subtle and functional.

Use Framer Motion for: - card hover elevation - modal entry - tab
transitions - list insertion - AI generation state - page-level micro
transitions

Recommended:

``` ts
transition={{
  type: 'spring',
  stiffness: 320,
  damping: 24
}}
```

Avoid: - constant floating animations - large page transitions -
excessive bouncing - decorative motion that consumes CPU on low-end
devices

Respect:

``` css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

------------------------------------------------------------------------

# 34. Responsive System

## Breakpoints

``` ts
const breakpoints = {
  mobile: '< 640px',
  tablet: '640–1023px',
  desktop: '1024–1439px',
  wide: '≥ 1440px'
};
```

## Mobile

-   one-column cards
-   collapsed navigation
-   full-screen search/filter
-   bottom-sheet modals
-   sticky primary CTA when needed
-   tables become horizontal scroll or stacked records
-   dashboard sidebars collapse
-   AI Studio becomes vertical

## Tablet

-   2-column public cards
-   compact dashboard
-   navigation remains accessible
-   data tables may scroll horizontally

## Desktop

-   full navigation
-   multi-column discovery
-   dashboard side navigation
-   split OCR workspace
-   sticky panels where appropriate

## Wide

-   content remains capped
-   do not stretch cards excessively
-   increase whitespace rather than font size

------------------------------------------------------------------------

# 35. Touch Targets

Minimum: - primary action: 48×48px - icon action: 40×40px - mobile
controls: 44×44px minimum

Small visual icons may be 16--20px inside a larger hit area.

------------------------------------------------------------------------

# 36. Accessibility

Target WCAG AA.

Requirements: - sufficient text contrast - visible keyboard focus -
semantic HTML - accessible labels - `aria-label` for icon-only
controls - keyboard-accessible dialogs - no color-only status - readable
Arabic line-height - large enough touch targets - reduced-motion support

------------------------------------------------------------------------

# 37. Dark Mode

Dark mode is a full theme, not inverted colors.

## Light

``` text
Background: #F8FAFC
Cards:      #FFFFFF
Text:       #0D253D
Borders:    #E2E8F0
```

## Dark

``` text
Background: #081325
Cards:      #0F1E36
Text:       #FFFFFF
Secondary:  #CBD5E1
Borders:    #1E293B
```

Teal remains the primary action.

Gold remains reserved for AI/highlight contexts.

Avoid pure black `#000000` as the main dark background.

------------------------------------------------------------------------

# 38. Component Inventory

The shared component library should include at minimum:

``` text
SarhLogo
Navbar
MobileNav
Sidebar
SearchBar
SearchFilterSheet
InstitutionCard
InstitutionGrid
VerifiedBadge
RatingBadge
PriceDisplay
PrimaryButton
SecondaryButton
AIButton
IconButton
Badge
StatusBadge
Card
KpiCard
DataTable
DataTableToolbar
Pagination
EmptyState
Skeleton
Modal
BottomSheet
Tabs
Select
Input
Textarea
DatePicker
FileUpload
ImageViewer
ReceiptViewer
ConfidenceBadge
Toast
OfflineBanner
SyncIndicator
ChildSwitcher
DateSlider
AttendanceTracker
DailyFeed
AIQuizGenerator
AIResultCard
CommissionTable
OCRReconciler
```

------------------------------------------------------------------------

# 39. Public Page Design Prompts

## 39.1 Landing page `/`

Build a production-quality Arabic RTL landing page for SARH.

Visual direction: - Airbnb-inspired warmth - large human/education
imagery - white/light background - subtle Teal/Gold atmospheric
accents - clean navigation - clear primary CTA

Hero: - headline - supporting copy - discovery search - primary action

Suggested headline:

> اكتشف المكان المناسب لتعليم طفلك

Secondary:

> صَرْح يربطك بأفضل رياض الأطفال والمراكز التعليمية بطريقة أسهل وأكثر
> وضوحاً.

Do not overload the hero with cards or dashboard widgets.

------------------------------------------------------------------------

## 39.2 Discovery `/explore`

Build a photo-first marketplace directory.

Required: - sticky header - floating search - filters - grid/list
toggle - institution cards - verified badge - rating - price - booking
CTA - skeleton state - empty state

Use Airbnb-inspired card density and photography, but SARH Teal replaces
Airbnb Rausch.

------------------------------------------------------------------------

# 40. Institution Profile `/center/[id]`

Build a hybrid marketplace + education profile.

Hero: - cover image - institution logo - name - verification - rating -
location - WhatsApp - call - share - booking CTA

Content: - overview - programs - services - gallery - location

Booking: - multi-step modal - child selection - program selection -
receipt upload - review - submission

------------------------------------------------------------------------

# 41. Parent Dashboard `/parent/dashboard`

Use: - mobile-first layout - child switcher - quick summary cards -
recent feed - attendance - payment state - academic progress

Prioritize information over decoration.

------------------------------------------------------------------------

# 42. Parent Feed `/parent/feed`

Use: - date slider - child selector - offline banner - daily timeline -
photo gallery - attendance - meals - pickup verification - homework -
grades - AI summary

The feed should feel closer to a consumer mobile product than an
enterprise dashboard.

------------------------------------------------------------------------

# 43. Institution Dashboard `/institution`

Use Stripe-inspired operational hierarchy.

Top: - page title - date - notifications - user menu

KPI: - students - attendance - new enrollments - revenue

Below: - attendance - enrollment table - recent activity - quick actions

------------------------------------------------------------------------

# 44. Attendance `/institution/daily-log`

Optimize for speed.

Required: - search student - class/group filter - one-click attendance -
note/photo action - offline state - sync status - save confirmation

No unnecessary confirmation modal for normal attendance toggles.

------------------------------------------------------------------------

# 45. AI Studio `/institution/ai-studio`

Required controls:

``` text
المادة
اسم الدرس
مستوى الصعوبة
عدد الأسئلة
نوع الأسئلة
```

Primary action:

> توليد اختبار بالذكاء الاصطناعي

Result: - question cards - answer options - regenerate - download -
print

------------------------------------------------------------------------

# 46. Admin Dashboard `/admin`

Visual direction: - Stripe-inspired analytical workspace - compact KPI
cards - data tables - filters - status badges - restrained Teal/Gold
accents

Do not use marketplace-style photography inside the admin core.

------------------------------------------------------------------------

# 47. Admin Finance `/admin/finance`

Required:

### KPI

-   إجمالي الإيرادات
-   العمولات
-   المعلّق
-   المؤسسات النشطة

### OCR workspace

Left: - receipt viewer - zoom - image metadata

Right: - extracted amount - transaction ID - payer - date - confidence -
database match

Actions: - تأكيد الاعتماد - رفض الطلب

------------------------------------------------------------------------

# 48. Admin Approvals `/admin/approvals`

Table:

``` text
المؤسسة | النوع | المنطقة | المالك | الحالة | التاريخ | الإجراء
```

Filters: - pending - verified - rejected

Approval action should update the row immediately without a full page
refresh.

------------------------------------------------------------------------

# 49. Empty States

Every major collection needs an intentional empty state.

Example:

``` text
لا توجد مؤسسات مطابقة
جرّب تغيير المنطقة أو المرحلة العمرية أو نطاق السعر.

[ إعادة ضبط الفلاتر ]
```

Parent feed:

``` text
لا توجد تحديثات لهذا اليوم
ستظهر هنا أنشطة طفلك وتحديثاته عند إضافتها.
```

Admin table:

``` text
لا توجد طلبات معلقة حالياً
```

------------------------------------------------------------------------

# 50. Loading States

Use skeletons instead of blank screens.

Skeleton rules: - preserve final layout dimensions - avoid excessive
shimmer - use light neutral surfaces - support dark mode - never cause
layout shift

AI loading: - explicit text - progress indication - preserve entered
values

------------------------------------------------------------------------

# 51. Error States

Errors must be: - concise - actionable - Arabic - non-technical by
default

Example:

> تعذر تحميل البيانات. تحقق من الاتصال وحاول مرة أخرى.

Technical details may be available behind an expandable diagnostic
section for admins/developers.

------------------------------------------------------------------------

# 52. Offline-First UI Rules

Because SARH targets unstable/low-bandwidth environments:

-   Never block local attendance because of network.
-   Save critical user actions to IndexedDB immediately.
-   Show local-save confirmation.
-   Sync automatically when connection returns.
-   Avoid downloading unnecessary large assets.
-   Compress uploaded images to WebP before upload.
-   Prefer skeletons and cached content to blank states.
-   Keep interaction responsive even when API calls are slow.

------------------------------------------------------------------------

# 53. Performance Rules

All pages must follow:

-   `next/image`
-   WebP
-   responsive image sizes
-   lazy loading
-   blurred placeholders where useful
-   code splitting
-   minimal client components
-   Server Components by default
-   avoid unnecessary animation
-   avoid giant hero video on mobile
-   minimize JavaScript sent to low-end devices

------------------------------------------------------------------------

# 54. Design-to-Code Rules

When implementing any page:

1.  Read this `Design.md`.
2.  Identify the page type:
    -   marketplace
    -   parent
    -   institution
    -   admin
3.  Use only approved tokens.
4.  Use existing shared components before creating new ones.
5.  Follow RTL.
6.  Implement mobile first.
7.  Add dark mode.
8.  Add loading/empty/error states.
9.  Add offline behavior where relevant.
10. Verify keyboard and touch accessibility.
11. Verify numerical typography.
12. Verify no arbitrary colors or radii were introduced.

------------------------------------------------------------------------

# 55. Tailwind Configuration

Recommended foundation:

``` js
module.exports = {
  darkMode: 'class',

  theme: {
    extend: {
      colors: {
        sarh: {
          teal: '#00A99D',
          tealDeep: '#00837A',
          tealSoft: 'rgba(0,169,157,0.1)',

          gold: '#F2994A',
          goldDeep: '#D97F32',
          goldSoft: 'rgba(242,153,74,0.12)',

          navy: '#0F2C59',
          navyDeep: '#081325',

          bgLight: '#F8FAFC',
          bgDark: '#081325',

          cardLight: '#FFFFFF',
          cardDark: '#0F1E36',

          borderLight: '#E2E8F0',
          borderDark: '#1E293B',

          ink: '#0D253D',
          inkMute: '#64748D',

          success: '#16A34A',
          warning: '#D97706',
          danger: '#DC2626',
          info: '#2563EB'
        }
      },

      borderRadius: {
        xs: '4px',
        sm: '8px',
        md: '14px',
        lg: '20px',
        xl: '24px',
        pill: '9999px'
      },

      boxShadow: {
        subtle:
          'rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.08) 0 4px 12px',

        card:
          'rgba(0,55,112,0.08) 0 8px 24px, rgba(0,55,112,0.04) 0 2px 6px',

        focus:
          '0 0 0 3px rgba(0,169,157,0.16)'
      },

      fontFamily: {
        arabic: [
          'var(--font-readex)',
          'Tajawal',
          'sans-serif'
        ],

        sans: [
          'var(--font-jakarta)',
          'Inter',
          'system-ui',
          'sans-serif'
        ]
      }
    }
  }
};
```

------------------------------------------------------------------------

# 56. CSS Foundation

``` css
:root {
  --sarh-teal: #00A99D;
  --sarh-teal-deep: #00837A;
  --sarh-gold: #F2994A;
  --sarh-navy: #0F2C59;

  --sarh-bg: #F8FAFC;
  --sarh-card: #FFFFFF;
  --sarh-border: #E2E8F0;

  --sarh-text: #0D253D;
  --sarh-muted: #64748D;
}

.dark {
  --sarh-bg: #081325;
  --sarh-card: #0F1E36;
  --sarh-border: #1E293B;

  --sarh-text: #FFFFFF;
  --sarh-muted: #CBD5E1;
}

html {
  direction: rtl;
}

body {
  background: var(--sarh-bg);
  color: var(--sarh-text);
  font-family:
    var(--font-readex),
    'Tajawal',
    sans-serif;
  font-feature-settings: "kern";
}

.numeric,
[data-numeric="true"] {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}
```

------------------------------------------------------------------------

# 57. Design QA Checklist

Before considering a UI implementation complete:

### Brand

-   [ ] SARH Teal is used for primary actions.
-   [ ] Gold is reserved for AI/highlight contexts.
-   [ ] Navy provides trustworthy information hierarchy.
-   [ ] No unauthorized brand colors.

### RTL

-   [ ] `dir="rtl"` works.
-   [ ] logical spacing utilities used.
-   [ ] icons remain meaningful.
-   [ ] numbers remain stable.

### Typography

-   [ ] Readex Pro for Arabic.
-   [ ] Plus Jakarta Sans / Inter for English and numeric fallback.
-   [ ] hierarchy follows this document.
-   [ ] financial values use `tnum`.

### Components

-   [ ] correct radius
-   [ ] correct shadow
-   [ ] focus state
-   [ ] disabled state
-   [ ] loading state
-   [ ] error state

### Responsive

-   [ ] mobile
-   [ ] tablet
-   [ ] desktop
-   [ ] wide screens
-   [ ] touch targets

### Accessibility

-   [ ] keyboard accessible
-   [ ] visible focus
-   [ ] semantic labels
-   [ ] status is not color-only
-   [ ] reduced motion supported

### Performance

-   [ ] WebP
-   [ ] next/image
-   [ ] lazy loading
-   [ ] minimal client JS
-   [ ] offline state where applicable

------------------------------------------------------------------------

# 58. Final Visual Rule

The final SARH experience should communicate:

> **"Friendly enough for a parent. Precise enough for an institution.
> Trustworthy enough for financial operations. Smart enough for AI."**

The public experience should feel **human and photo-led**.

The operational experience should feel **precise and data-led**.

The AI experience should feel **powerful but calm**.

The entire system must still feel like **one SARH product** through the
consistent use of:

**Teal + Gold + Navy + Arabic-first typography + soft geometry +
disciplined spacing + clear RTL hierarchy.**

------------------------------------------------------------------------

## Source Design Principles Applied

This system intentionally adapts: - Airbnb's photo-first marketplace
architecture, generous whitespace, pill search, soft cards, responsive
collapsing strategy, and trust-oriented listing hierarchy. - Stripe's
restrained gradient treatment, precise typography, tabular numeric
presentation, compact product UI, dashboard tables, financial workspace
patterns, and disciplined elevation.

The SARH-specific implementation remains authoritative over all
reference-brand details.
