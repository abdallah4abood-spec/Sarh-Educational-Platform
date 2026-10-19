/**
 * SARH — /teachers-academy copy.
 *
 * Its own module for the same reason the homepage and /learn have one: the
 * public academy landing page carries a lot of marketing copy, and keeping it
 * here means `dictionary.ts` stays readable. `academyEn` is typed against
 * `keyof typeof academyAr`, so a key added to one language but not the other is
 * a compile error rather than a blank string at runtime.
 *
 * The page is public on purpose: it is the top of the teacher funnel, and it is
 * also the page that tells parents and center directors that Sarh trains and
 * certifies its teaching staff.
 */

export const academyAr = {
  academy_badge: "أكاديمية المعلمين",
  academy_titleLead: "أكاديمية",
  academy_titleHighlight: "صَرْح للمعلمين",
  academy_titleTail: "تدريب معتمد يختصر طريقك إلى الفصل",
  academy_lead:
    "مسارات تدريبية ودبلومات عملية لأدوات العصر، مع مساعد ذكاء اصطناعي يخفّف عنك التخطيط والتصحيح والتقارير اليومية — لتصبح معلماً موثوقاً لدى أهالي غزة ومراكزها.",

  // ---- Calls to action (role-aware, see the page component) ----
  academy_ctaJoin: "انضم كمعلم",
  academy_ctaJoinHint: "حساب معلم ومشرف خلال دقيقتين — بدون رسوم تسجيل",
  academy_ctaBrowse: "تصفّح المسارات",
  academy_ctaContinue: "متابعة التعلم",
  academy_ctaStudio: "الانتقال إلى استوديو المعلم",
  academy_signedIn: "أنت مسجّل الدخول — تابع من حيث توقفت.",
  academy_offlineNote: "محتوى المسارات قابل للتحميل ويعمل بدون إنترنت",

  // ---- Training tracks ----
  academy_tracksTitle: "المسارات والدبلومات",
  academy_tracksLead:
    "كل مسار مكوّن من وحدات قصيرة مع تمارين تطبيقية ومشروع ختامي، وتُصدر شهادته باسم الأكاديمية عند إكماله.",
  academy_trackCount: "مسار تدريبي متاح الآن",
  academy_track1Title: "دبلوم الطفولة المبكرة (٥–٧ سنوات)",
  academy_track1Body:
    "أنشطة الحروف والأرقام، إدارة حلقة الصف، وتهيئة الطفل نفسياً لأول تجربة تعليمية.",
  academy_track1Meta: "٦ أسابيع · مبتدئ",
  academy_track2Title: "مسار التحضير والتوجيهي (٨–١٨ سنة)",
  academy_track2Body:
    "بناء خطط مراجعة فعّالة، إدارة الوقت قبل الامتحانات، وتحليل نتائج الطلبة أسبوعياً.",
  academy_track2Meta: "٨ أسابيع · متوسط",
  academy_track3Title: "التقييم والتقارير اليومية",
  academy_track3Body:
    "كيف تكتب ملاحظة يومية قصيرة تفهمها الأسرة، وتحوّل الحضور والأنشطة إلى تقرير واضح.",
  academy_track3Meta: "٣ أسابيع · أساسي",
  academy_track4Title: "إدارة الصف والسلامة النفسية للأطفال",
  academy_track4Body:
    "أساليب ضبط الصف بلا عقاب، والتعامل مع الطفل القلق خصوصاً في ظروف الحرب والنزوح.",
  academy_track4Meta: "٤ أسابيع · متوسط",

  // ---- AI Teacher Assistant ----
  academy_aiBadge: "أدوات ذكية ضمن الاستوديو",
  academy_aiTitle: "مساعد المعلم بالذكاء الاصطناعي",
  academy_aiLead:
    "نفس الأدوات التي ستستخدمها في مركزك بعد التسجيل — تعرّف عليها قبل أن تبدأ.",
  academy_aiFeature1Title: "توليد اختبارات من الدرس",
  academy_aiFeature1Body:
    "ألصق نص الدرس، واحصل على أسئلة متعددة الخيارات جاهزة للطباعة مع مفتاح التصحيح.",
  academy_aiFeature2Title: "ملخص أسبوعي للأهل",
  academy_aiFeature2Body:
    "ملخص بلغة بسيطة يمكن إرساله لولي الأمر مباشرة، مبني على حضور الطالب وأنشطته.",
  academy_aiFeature3Title: "حضور يعمل بدون إنترنت",
  academy_aiFeature3Body:
    "سجّل الحضور على الجهاز ويُحفظ محلياً، ثم يُزامن تلقائياً عند عودة الشبكة.",

  // ---- Trust (aimed at parents and center directors) ----
  academy_trustTitle: "لماذا يثق الأهالي والمراكز بهذه الأكاديمية؟",
  academy_trust1Title: "كوادر مدرَّبة داخل المراكز",
  academy_trust1Body:
    "المعلم الذي يكمل المسار يحمل شهادة أكاديمية صَرْح، فيعرف الأهل أن طفلهم بين يدي مدرَّب.",
  academy_trust2Title: "تدريب على سياق غزة تحديداً",
  academy_trust2Body:
    "أمثلة وتمارين مبنية على واقع المراكز في غزة: انقطاع الكهرباء، الصفوف المزدحمة، والنزوح.",
  academy_trust3Title: "متابعة وإشراف مستمر",
  academy_trust3Body:
    "تقييم لكل وحدة وملاحظات على التطبيق العملي، لا مجرد فيديوهات تُشاهد ثم تُنسى.",

  // ---- How it works ----
  academy_stepsTitle: "كيف تبدأ؟",
  academy_step1Title: "أنشئ حساب معلم",
  academy_step1Body: "اختر نوع الحساب (معلم ومشرف) في صفحة التسجيل، أو ادخل بحسابك الحالي.",
  academy_step2Title: "اختر مسارك",
  academy_step2Body: "حدّد المستوى والفئة العمرية التي تعمل معها، وابدأ بالوحدة الأولى.",
  academy_step3Title: "تدرّب واعتمد",
  academy_step3Body:
    "أكمل التمارين والمشروع الختامي، ثم انسخ شهادة الأكاديمية إلى ملفك داخل الاستوديو.",

  // ---- Closing CTA ----
  academy_finalTitle: "ابدأ مسارك التدريبي اليوم",
  academy_finalLead:
    "التسجيل مجاني، والمسارات مفتوحة للمعلمين والمشرفين في كل مراكز غزة وروضاتها.",
} as const;

export const academyEn: Record<keyof typeof academyAr, string> = {
  academy_badge: "Teachers' academy",
  academy_titleLead: "The SARH",
  academy_titleHighlight: "Teachers' Academy",
  academy_titleTail: "certified training that shortens the road to the classroom",
  academy_lead:
    "Practical diplomas and training tracks, plus an AI assistant that takes the weight of planning, grading and daily reports off your desk — so Gaza's families and centers can rely on you.",

  academy_ctaJoin: "Join as a teacher",
  academy_ctaJoinHint: "A teacher/supervisor account in two minutes — no signup fee",
  academy_ctaBrowse: "Browse the tracks",
  academy_ctaContinue: "Continue learning",
  academy_ctaStudio: "Go to the teacher studio",
  academy_signedIn: "You are signed in — pick up where you left off.",
  academy_offlineNote: "Track content downloads and works without internet",

  academy_tracksTitle: "Tracks and diplomas",
  academy_tracksLead:
    "Every track is built from short units with hands-on exercises and a final project, and is certified in the academy's name once completed.",
  academy_trackCount: "training tracks available right now",
  academy_track1Title: "Early childhood diploma (ages 5–7)",
  academy_track1Body:
    "Letters and numbers activities, running the class circle, and settling a child into their first learning experience.",
  academy_track1Meta: "6 weeks · beginner",
  academy_track2Title: "Prep and Tawjihi track (ages 8–18)",
  academy_track2Body:
    "Building revision plans that work, managing time before exams, and reading student results weekly.",
  academy_track2Meta: "8 weeks · intermediate",
  academy_track3Title: "Assessment and daily reports",
  academy_track3Body:
    "How to write a short daily note a family actually understands, and turn attendance and activities into a clear report.",
  academy_track3Meta: "3 weeks · core",
  academy_track4Title: "Classroom management and child wellbeing",
  academy_track4Body:
    "Holding a class together without punishment, and supporting an anxious child — especially through war and displacement.",
  academy_track4Meta: "4 weeks · intermediate",

  academy_aiBadge: "Smart tools inside the studio",
  academy_aiTitle: "The AI teacher assistant",
  academy_aiLead:
    "The same tools you will use in your center after signing up — meet them before you start.",
  academy_aiFeature1Title: "Generate a quiz from a lesson",
  academy_aiFeature1Body:
    "Paste the lesson text and get print-ready multiple-choice questions with an answer key.",
  academy_aiFeature2Title: "A weekly summary for parents",
  academy_aiFeature2Body:
    "A plain-language summary built from the student's attendance and activities, ready to send home.",
  academy_aiFeature3Title: "Attendance that works offline",
  academy_aiFeature3Body:
    "Mark attendance on the device, stored locally, then synced automatically when the network returns.",

  academy_trustTitle: "Why do families and centers trust this academy?",
  academy_trust1Title: "Staff trained inside the centers",
  academy_trust1Body:
    "A teacher who finishes a track holds a SARH academy certificate, so families know their child is in trained hands.",
  academy_trust2Title: "Built for the Gaza context",
  academy_trust2Body:
    "Examples and exercises drawn from how centers here actually work: power cuts, crowded classes, displacement.",
  academy_trust3Title: "Ongoing review, not just videos",
  academy_trust3Body:
    "Every unit is assessed with feedback on the practical work, instead of a video watched and forgotten.",

  academy_stepsTitle: "How do you start?",
  academy_step1Title: "Create a teacher account",
  academy_step1Body:
    "Choose the teacher/supervisor account type on the sign-up page, or use an account you already have.",
  academy_step2Title: "Pick your track",
  academy_step2Body: "Choose the level and age group you work with, and start unit one.",
  academy_step3Title: "Train and get certified",
  academy_step3Body:
    "Finish the exercises and the final project, then add the academy certificate to your studio profile.",

  academy_finalTitle: "Start your training track today",
  academy_finalLead:
    "Sign-up is free, and the tracks are open to teachers and supervisors across Gaza's centers and kindergartens.",
};
