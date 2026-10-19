/**
 * SARH — homepage copy (marketing landing page).
 *
 * Kept in its own module so `dictionary.ts` stays readable and the landing
 * page can grow without touching the portal strings. `homeEn` is typed against
 * `keyof typeof homeAr`, so a key added to one language but not the other is a
 * compile error rather than a missing string at runtime.
 */

export const homeAr = {
  // ---------- 1. Hero ----------
  home_heroBadge: "منصة تعليمية فلسطينية — تعمل بدون إنترنت",
  /*
   * The headline is split into four segments rather than three: the identity
   * colours "صَرْح" and "أهالي غزة" in warm orange and leaves the connecting
   * words in navy, so the two colours carry the sentence instead of one long
   * gradient strip.
   */
  home_heroTitleLead: "صَرْح",
  home_heroTitleConnect: "يجمع",
  home_heroTitlePlace: "أهالي غزة",
  home_heroTitleTail: "بأفضل المراكز التعليمية",
  home_heroLead:
    "ابحث عن روضة أو مركز تحضير قريب منك، احجز مقعد طفلك بثقة، وتابع يومه بالصور والأنشطة والحضور لحظة بلحظة — حتى لو انقطعت الشبكة.",
  home_ctaExplore: "استكشف المراكز",
  home_ctaPrograms: "تصفح البرامج",
  home_trustBadge: "أكثر من ١٢٠ عائلة غزّية تتابع أطفالها عبر صَرْح",
  home_trustBadgeSub: "تقييم ٤٫٩ من ٥ — مراكز موثوقة فقط",

  /* Vertical ribbon badges pinned to the far edge of the hero composition. */
  home_ribbonEducation: "التعليم",
  home_ribbonFuture: "مستقبل أفضل",
  home_ribbonChildren: "لأطفالنا",
  home_ribbonLabel: "قيم منصة صَرْح",

  /* Accessible name for the hero dashboard preview (its rows are a mockup). */
  home_heroCardAria: "معاينة لوحة متابعة اليوم في تطبيق صَرْح",

  // Hero product mockup (attendance dashboard preview)
  home_mockTitle: "لوحة متابعة اليوم",
  home_mockLive: "مباشر الآن",
  home_mockAttendance: "حالة الحضور",
  home_mockPresent: "حاضر",
  home_mockSchedule: "بداية الدوام الصباحي",
  home_mockScheduleValue: "٧:٠٠ – ٨:٠٠ ص (حسب المركز)",
  home_mockActivity: "النشاط",
  home_mockActivityValue: "أعمال ورقية وحديقة",
  home_mockSummary: "ملخص المعلمة",
  home_mockSummaryValue:
    "شاركت اليوم بثقة في نشاط المجموعة، وأكملت تدريبات الحروف بتركيز جيد.",
  home_mockSynced: "مُتزامن مع الخادم",
  home_mockOfflineNote: "محفوظ محلياً — سيُزامن عند عودة الشبكة",

  // ---------- 2. Dual portal cards ----------
  home_portalsTitle: "بوابتان، تجربة واحدة متكاملة",
  home_portalsLead:
    "صَرْح مصمّمة لطرفي الرحلة التعليمية: الأهل الذين يتابعون، والمراكز التي تدير.",
  home_parentCardTitle: "بوابة الأهالي",
  home_parentCardLead:
    "كل ما يخصّ طفلك في شاشة واحدة: الحضور، برنامج اليوم، الأنشطة، والرسوم.",
  home_parentPoint1: "تغذية يومية بالصور وملاحظات المعلمة",
  home_parentPoint2: "تنبيه فوري عند الوصول والمغادرة",
  home_parentPoint3: "ملخصات ذكية بلغة واضحة لكل يوم",
  home_parentPoint4: "متابعة الرسوم وإيصالات الدفع",
  home_parentCardCta: "ادخل بوابة الأهالي",
  home_instCardTitle: "بوابة المؤسسات",
  home_instCardLead:
    "أدوات المعلم والإدارة: تسجيل الحضور، توليد الاختبارات، ومتابعة العمولات.",
  home_instPoint1: "تسجيل حضور فوري يعمل بدون إنترنت",
  home_instPoint2: "استوديو ذكاء اصطناعي للاختبارات والملخصات",
  home_instPoint3: "إدارة الشُعب والبرامج والرسوم",
  home_instPoint4: "مطابقة إيصالات الدفع تلقائياً",
  home_instCardCta: "ادخل بوابة المؤسسات",

  // ---------- 3. Subjects & categories ----------
  home_categoriesTitle: "تصفّح حسب ما يحتاجه طفلك",
  home_categoriesLead:
    "من الطفولة المبكرة إلى التوجيهي: اختر التصنيف ونعرض لك المراكز المتاحة قريبة منك.",
  home_categoriesHint: "اضغط أي تصنيف لعرض المراكز المتاحة فيه مباشرة.",
  home_catKindergarten: "روضات الطفولة المبكرة",
  home_catKindergartenDesc: "فصول صغيرة وأنشطة يومية لأعمار ٥–٧ سنوات.",
  home_catTawjihi: "تحضير التوجيهي",
  home_catTawjihiDesc: "مراجعة مكثفة وحلّ امتحانات وزارية سابقة.",
  home_catLanguages: "لغات",
  home_catLanguagesDesc: "إنجليزي وعربي بمستويات متدرّجة ومجموعات صغيرة.",
  home_catComputer: "حاسوب وذكاء اصطناعي",
  home_catComputerDesc: "أساسيات البرمجة والمهارات الرقمية بأدوات عملية.",
  home_catCamps: "مخيمات صيفية",
  home_catCampsDesc: "برامج ترفيهية وتعليمية في العطلة الصيفية.",

  // ---------- 4. Pain points & solutions ----------
  home_problemsTitle: "نحلّ أكبر ثلاث مشاكل تواجه الأهل",
  home_problemsLead:
    "بنينا صَرْح من شكاوى حقيقية سمعناها من أهالي غزة، لا من نموذج تسويقي.",
  home_problem1Title: "«لا أعرف إن وصل طفلي أم لا»",
  home_problem1Body:
    "تسجيل الحضور في صَرْح يصل لولي الأمر مع الوقت والمسؤول عن الاستلام، فتنتهي مكالمات المتابعة المتكررة.",
  home_problem2Title: "«المركز لا يُخبرني بما يحدث»",
  home_problem2Body:
    "تغذية يومية بالصور والأنشطة وملاحظة مكتوبة من المعلمة، وملخص ذكي يجمع اليوم في رسالة واحدة.",
  home_problem3Title: "«الشبكة تنقطع دائماً»",
  home_problem3Body:
    "الحضور والملاحظات تُحفظ على جهاز المعلم أولاً وتُزامن تلقائياً عند عودة الشبكة، بدون إدخال مكرر.",

  // ---------- 5. AI & offline showcase ----------
  home_aiBadge: "ذكاء اصطناعي + عمل بدون إنترنت",
  home_aiTitle: "ميزتان تصنعان الفرق في قطاع غزة",
  home_aiLead:
    "بنينا التقنية لتُنجز عملها على أضعف اتصال وأبسط جهاز، ثم أضفنا الذكاء الاصطناعي ليوفّر وقت المعلم.",
  home_aiOfflineTitle: "حضور يعمل بدون إنترنت",
  home_aiOfflineBody:
    "يُخزَّن السجل في ذاكرة الجهاز فوراً مع شعار «غير متزامن»، ثم يُرسل للخادم عند عودة الاتصال دون أن يفقد المعلم أي سجل.",
  home_aiQuizTitle: "استوديو الاختبارات الذكي",
  home_aiQuizBody:
    "اختر الصف والمادة ومستوى الصعوبة، واكتب عدد الأسئلة — ويولّد النموذج اختباراً جاهزاً للطباعة في ثوانٍ.",
  home_aiSummaryTitle: "ملخص يومي تلقائي",
  home_aiSummaryBody:
    "يحوّل ملاحظات المعلم القصيرة إلى رسالة واضحة وودّية للأهل، مع الحفاظ على الخصوصية الكاملة لبيانات الطفل.",

  // ---------- 6. Three-step process ----------
  home_stepsTitle: "ثلاث خطوات فقط حتى يبدأ طفلك",
  home_stepsLead: "من البحث إلى المتابعة اليومية دون أي إجراء معقّد.",
  home_step1Title: "ابحث وقارن",
  home_step1Body:
    "فلتر المراكز حسب المنطقة والمرحلة والسعر والتقييم، واقرأ تفاصيل البرامج قبل أي قرار.",
  home_step2Title: "احجز المقعد أو سجّل في المركز",
  home_step2Body:
    "أرسل طلب حجز مع إيصال الدفع (تحويل بنكي أو جوال باي) ويتواصل معك المركز للتأكيد.",
  home_step3Title: "تابع الحضور اليومي",
  home_step3Body:
    "تصلك التغذية اليومية والتنبيهات والملخصات، وتتابع الرسوم من لوحة واحدة.",

  // ---------- 7. Parent & center value ----------
  home_valueTitle: "فائدة واضحة للأهل وللمركز",
  home_valueLead:
    "نفس المنصة تخدم الطرفين: شفافية للأهل، وتنظيم للمركز — مع حماية صارمة لبيانات الأطفال.",
  home_parentValueTitle: "ماذا يكسب ولي الأمر؟",
  home_parentValuePoint1: "تقرير يومي بالصور والأنشطة وبرنامج اليوم",
  home_parentValuePoint2: "تنبيهات فورية للوصول والمغادرة والاستلام",
  home_parentValuePoint3: "رسوم وتقييمات واضحة قبل الحجز",
  home_parentValuePoint4: "سجل كامل للأيام السابقة للمراجعة",
  home_privacyTitle: "خصوصية الطفل أولاً",
  home_privacyPoint1: "سجلات الحضور والصور لا يراها إلا ولي الأمر والمركز المسؤول",
  home_privacyPoint2: "لا تُستخدم البيانات لأي إعلانات ولا تُباع لأي طرف ثالث",
  home_privacyPoint3: "يمكن لولي الأمر طلب حذف سجل طفله في أي وقت",

  // ---------- 8. Pricing ----------
  home_pricingTitle: "خطط تناسب الأهل والمراكز",
  home_pricingLead:
    "ابدأ مجاناً كولي أمر، وارتقِ إلى خطة المؤسسات عندما تحتاج أدوات الإدارة والذكاء الاصطناعي.",
  home_planFreeName: "الأهالي",
  home_planFreePrice: "مجاناً",
  home_planFreePeriod: "للأبد",
  home_planFreeLead: "كل ما يحتاجه ولي الأمر لمتابعة أطفاله.",
  home_planFreePoint1: "بحث وحجز في كل المراكز الموثّقة",
  home_planFreePoint2: "متابعة يومية بالصور والملاحظات",
  home_planFreePoint3: "تنبيهات الحضور والاستلام",
  home_planFreePoint4: "متاح على الجوال وبدون إنترنت",
  home_planFreeCta: "ابدأ مجاناً",
  home_planProName: "المؤسسات",
  home_planProBadge: "الأكثر اختياراً للمراكز",
  home_planProPrice: "١٩٩ ₪",
  home_planProPeriod: "شهرياً لكل فرع",
  home_planProLead: "أدوات كاملة للمعلم والإدارة في مركز واحد.",
  home_planProPoint1: "تسجيل حضور غير متصل مع مزامنة تلقائية",
  home_planProPoint2: "استوديو الذكاء الاصطناعي للاختبارات والملخصات",
  home_planProPoint3: "إدارة الشُعب والبرامج والرسوم",
  home_planProPoint4: "مطابقة إيصالات الدفع ولوحة مالية",
  home_planProPoint5: "دعم فلسطيني محلي عبر واتساب",
  home_planProCta: "اطلب عرضاً للمركز",

  // ---------- 10. Final CTA ----------
  home_ctaTitle: "جاهز تبدأ؟ مقعد طفلك ينتظرك",
  home_ctaLead:
    "أنشئ حسابك في أقل من دقيقة، وابدأ بمتابعة الحضور والرسوم والتقارير اليومية من لوحة واحدة.",
  home_ctaPrimary: "أنشئ حسابك مجاناً",
  home_ctaSecondary: "تصفح المراكز أولاً",
} as const;

export const homeEn: Record<keyof typeof homeAr, string> = {
  // ---------- 1. Hero ----------
  home_heroBadge: "Palestinian education platform — works offline",
  home_heroTitleLead: "SARH",
  home_heroTitleConnect: "connects",
  home_heroTitlePlace: "Gaza families",
  home_heroTitleTail: "with the best learning centers",
  home_heroLead:
    "Find a kindergarten or prep center near you, book your child's seat with confidence, and follow the day through photos, activities and live attendance — even when the connection drops.",
  home_ctaExplore: "Explore centers",
  home_ctaPrograms: "Browse programs",
  home_trustBadge: "More than 120 Gaza families follow their children through SARH",
  home_trustBadgeSub: "4.9 / 5 rating — verified centers only",

  home_ribbonEducation: "Education",
  home_ribbonFuture: "A better future",
  home_ribbonChildren: "For our children",
  home_ribbonLabel: "SARH values",

  home_heroCardAria: "Preview of the daily tracking dashboard in the SARH app",

  home_mockTitle: "Today's tracking board",
  home_mockLive: "Live now",
  home_mockAttendance: "Attendance",
  home_mockPresent: "Present",
  home_mockSchedule: "Morning start",
  home_mockScheduleValue: "7:00 – 8:00 AM (per center)",
  home_mockActivity: "Activity",
  home_mockActivityValue: "Paper work and garden time",
  home_mockSummary: "Teacher's note",
  home_mockSummaryValue:
    "Joined the group activity with confidence today and finished the letters drill with good focus.",
  home_mockSynced: "Synced with the server",
  home_mockOfflineNote: "Saved locally — syncs when the network returns",

  // ---------- 2. Dual portal cards ----------
  home_portalsTitle: "Two portals, one complete experience",
  home_portalsLead:
    "SARH is built for both sides of the journey: families who follow, and centers that manage.",
  home_parentCardTitle: "Parent portal",
  home_parentCardLead:
    "Everything about your child on one screen: attendance, the day's programme, activities and fees.",
  home_parentPoint1: "Daily photo feed with the teacher's notes",
  home_parentPoint2: "Instant arrival and pickup alerts",
  home_parentPoint3: "Plain-language AI summaries for every day",
  home_parentPoint4: "Fee tracking and payment receipts",
  home_parentCardCta: "Open the parent portal",
  home_instCardTitle: "Institution portal",
  home_instCardLead:
    "Teacher and admin tools: attendance capture, quiz generation and commission tracking.",
  home_instPoint1: "Instant attendance capture that works offline",
  home_instPoint2: "AI studio for quizzes and summaries",
  home_instPoint3: "Classes, programs and fees management",
  home_instPoint4: "Automatic payment receipt reconciliation",
  home_instCardCta: "Open the institution portal",

  // ---------- 3. Subjects & categories ----------
  home_categoriesTitle: "Browse by what your child needs",
  home_categoriesLead:
    "From early childhood to Tawjihi: pick a category and we show the centers available near you.",
  home_categoriesHint: "Tap any category to open the centers listed under it.",
  home_catKindergarten: "Early kindergarten",
  home_catKindergartenDesc: "Small classes and daily activities for ages 5–7.",
  home_catTawjihi: "Tawjihi preparation",
  home_catTawjihiDesc: "Intensive revision and past ministry exam practice.",
  home_catLanguages: "Languages",
  home_catLanguagesDesc: "English and Arabic in graded levels and small groups.",
  home_catComputer: "Computing & AI",
  home_catComputerDesc: "Programming basics and digital skills with hands-on tools.",
  home_catCamps: "Summer camps",
  home_catCampsDesc: "Recreational and learning programs during the summer break.",

  // ---------- 4. Pain points & solutions ----------
  home_problemsTitle: "We solve the three problems families complain about most",
  home_problemsLead:
    "SARH was built from real complaints we heard from Gaza families, not from a marketing template.",
  home_problem1Title: "\"I never know whether my child arrived\"",
  home_problem1Body:
    "Attendance recorded in SARH reaches the parent with the exact time and the person who collected the child — no more repeated follow-up calls.",
  home_problem2Title: "\"The center never tells me what happened\"",
  home_problem2Body:
    "A daily feed with photos, activities and a written note from the teacher, plus an AI summary that folds the day into one message.",
  home_problem3Title: "\"The network always drops\"",
  home_problem3Body:
    "Attendance and notes are saved on the teacher's device first and synced automatically when the network returns — nothing is entered twice.",

  // ---------- 5. AI & offline showcase ----------
  home_aiBadge: "AI + offline-first",
  home_aiTitle: "Two capabilities that matter in Gaza",
  home_aiLead:
    "The platform is engineered to work on the weakest connection and the simplest device, then AI gives teachers their time back.",
  home_aiOfflineTitle: "Attendance that works offline",
  home_aiOfflineBody:
    "Each record is written to device storage immediately with an \"unsynced\" badge, then pushed to the server once the connection returns — no record is ever lost.",
  home_aiQuizTitle: "AI quiz studio",
  home_aiQuizBody:
    "Pick the grade, subject and difficulty, set the number of questions, and a print-ready quiz is generated in seconds.",
  home_aiSummaryTitle: "Automatic daily summary",
  home_aiSummaryBody:
    "Turns the teacher's short notes into a clear, friendly message for the family, while the child's data stays fully private.",

  // ---------- 6. Three-step process ----------
  home_stepsTitle: "Three steps and your child is learning",
  home_stepsLead: "From search to daily tracking with no complicated process.",
  home_step1Title: "Search & compare",
  home_step1Body:
    "Filter centers by zone, stage, price and rating, and read the program details before deciding.",
  home_step2Title: "Book a seat or enroll at the center",
  home_step2Body:
    "Send a booking request with the payment receipt (bank transfer or Jawwal Pay) and the center confirms with you.",
  home_step3Title: "Track daily attendance",
  home_step3Body:
    "Daily feed, alerts and summaries arrive for you, and fees are tracked from one dashboard.",

  // ---------- 7. Parent & center value ----------
  home_valueTitle: "Clear value for families and for centers",
  home_valueLead:
    "One platform serves both sides: transparency for families, organisation for the center — with strict protection of children's data.",
  home_parentValueTitle: "What does a parent get?",
  home_parentValuePoint1: "A daily report with photos, activities and the day's programme",
  home_parentValuePoint2: "Instant arrival, departure and pickup alerts",
  home_parentValuePoint3: "Clear fees and ratings before booking",
  home_parentValuePoint4: "A full history of previous days to review",
  home_privacyTitle: "A child's privacy comes first",
  home_privacyPoint1:
    "Attendance records and photos are visible only to the parent and the responsible center",
  home_privacyPoint2: "Data is never used for advertising and never sold to third parties",
  home_privacyPoint3: "A parent can request deletion of their child's records at any time",

  // ---------- 8. Pricing ----------
  home_pricingTitle: "Plans for families and for centers",
  home_pricingLead:
    "Start free as a parent, and move to the institution plan when you need management and AI tooling.",
  home_planFreeName: "Families",
  home_planFreePrice: "Free",
  home_planFreePeriod: "forever",
  home_planFreeLead: "Everything a parent needs to follow their children.",
  home_planFreePoint1: "Search and book across every verified center",
  home_planFreePoint2: "Daily updates with photos and notes",
  home_planFreePoint3: "Attendance and pickup alerts",
  home_planFreePoint4: "Works on mobile and offline",
  home_planFreeCta: "Start for free",
  home_planProName: "Institutions",
  home_planProBadge: "Most chosen by centers",
  home_planProPrice: "₪199",
  home_planProPeriod: "per branch / month",
  home_planProLead: "A complete toolkit for teachers and admins in one center.",
  home_planProPoint1: "Offline attendance capture with automatic sync",
  home_planProPoint2: "AI studio for quizzes and summaries",
  home_planProPoint3: "Classes, programs and fees management",
  home_planProPoint4: "Receipt reconciliation and a finance dashboard",
  home_planProPoint5: "Local Palestinian support over WhatsApp",
  home_planProCta: "Request a center demo",

  // ---------- 10. Final CTA ----------
  home_ctaTitle: "Ready to start? Your child's seat is waiting",
  home_ctaLead:
    "Create your account in under a minute and track attendance, fees and daily reports from a single dashboard.",
  home_ctaPrimary: "Create your free account",
  home_ctaSecondary: "Browse centers first",
};
