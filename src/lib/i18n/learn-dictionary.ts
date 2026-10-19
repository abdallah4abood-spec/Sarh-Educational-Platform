/**
 * SARH — "منصة الصرح التعليمية" e-learning landing copy (/learn).
 *
 * Same contract as `home-dictionary.ts`: the English map is typed against
 * `keyof typeof learnAr`, so a key added to one language but not the other is
 * a compile error instead of a missing string at runtime.
 *
 * Only copy that is genuinely new lives here. Anything the rest of the site
 * already says — `nav_home`, `nav_contact`, `login`, `signUp`, `menu`,
 * `switchLanguage`, `themeLabel`, `privacyPolicy`, `termsOfService` — is reused
 * from the chrome dictionary so the landing page can never drift from it.
 *
 * Catalog *content* (course titles, instructor names, student quotes) is
 * deliberately NOT here: those are records, not UI chrome, and live in
 * `src/lib/data/learn-catalog.ts` as `{ ar, en }` pairs.
 */

export const learnAr = {
  // ---------- Brand & navigation ----------
  learn_heroBadge: "شهادات إتمام موثّقة ومسارات معتمدة",
  learn_heroTitleLead: "طوّر مهاراتك في",
  learn_heroTitleHighlight: "البرمجة والتصميم واللغات",
  learn_heroTitleTail: "مع نخبة المدربين العرب",
  learn_heroLead:
    "تجمع منصة الصرح أكثر من ٢٥٠ دورة معتمدة بمحتوى عربي واضح، ومشاريع عملية بعد كل وحدة، ومتابعة مباشرة من مدربين خبراء. تعلّم بالوتيرة التي تناسبك من أي جهاز، وأكمل دروسك حتى مع اتصال ضعيف.",
  learn_heroCtaPrimary: "تصفح الدورات الآن",
  learn_heroCtaSecondary: "شاهد الفيديو التعريفي",
  learn_heroTrust1: "شهادة إتمام موثّقة بعد كل دورة",
  learn_heroTrust2: "دفع محلي آمن وباقات تناسب الجميع",
  learn_heroTrust3: "دروس محمّلة تعمل دون اتصال بالإنترنت",
  learn_heroRatingNote: "تقييم ٤٫٩ من ٥ بناءً على ٣٬٢٠٠ مراجعة",
  learn_heroLearners: "أكثر من ١٥٬٠٠٠ متعلّم نشط",
  learn_heroVideoTitle: "الفيديو التعريفي",
  learn_heroVideoBody:
    "جولة سريعة داخل منصة الصرح: كيف تختار دورتك، تتابع تقدّمك، وتحصل على شهادتك.",
  learn_heroVideoClose: "إغلاق الفيديو",
  learn_heroVideoUnavailable:
    "تعذّر تحميل الفيديو التعريفي الآن — يمكنك متابعة جولة المنصة من الصور أدناه.",

  // Hero dashboard mockup
  learn_mockTitle: "لوحة تقدّمك",
  learn_mockLive: "مباشر الآن",
  learn_mockStudent: "سارة عبد الله",
  learn_mockProgressLabel: "مسار تطوير الويب",
  learn_mockProgressValue: "٧٢٪",
  learn_mockProgressBar: "شريط التقدّم في المسار",
  learn_mockNextLabel: "الدرس القادم",
  learn_mockNextValue: "الدوال والوحدات — ١٨ دقيقة",
  learn_mockStreakLabel: "سلسلة الالتزام",
  learn_mockStreakValue: "١٢ يوماً متتالياً",
  learn_mockCertificateLabel: "شهادة قابلة للتحميل",
  learn_mockCertificateValue: "تُفتح عند إتمام ٩٠٪ من الدورة",
  learn_mockFloatCertificate: "شهادة موثّقة برقم تحقق",
  learn_mockFloatInstructor: "مدرب معتمد بتقييم ٤٫٩",
  learn_mockFloatOffline: "حمّل الدروس وواصل دون إنترنت",

  // ---------- 2. Statistics & trust ----------
  learn_statsTitle: "أرقام تعكس ثقة المتعلّمين",
  learn_statsLead:
    "نقيس نجاحنا بنتائج الطلاب لا بعدد الساعات المسجّلة، لذلك يُحدَّث كل رقم هنا مباشرة من المنصة.",
  learn_statStudents: "متعلّم نشط",
  learn_statCourses: "دورة معتمدة",
  learn_statCompletion: "نسبة إتمام الدورات",
  learn_statExperts: "خبير ومدرّب معتمد",
  learn_statsTrustNote: "بيانات محدّثة ربع سنوياً من أنظمة المنصة",

  // ---------- 3. Features / benefits ----------
  learn_featuresBadge: "لماذا منصة الصرح؟",
  learn_featuresTitle: "تجربة تعليمية مصمّمة لتصلك إلى النتيجة",
  learn_featuresLead:
    "بنينا كل تفصيل في المنصة حول ثلاثة أسئلة يطرحها كل متعلّم: ماذا أتعلّم؟ ومع من؟ ومتى أستطيع الالتزام؟",
  learn_feature1Title: "محتوى تعليمي معتمد",
  learn_feature1Body:
    "دروس مبنيّة على معايير أكاديمية ومحدّثة دورياً، مع تمارين ومشاريع عملية بعد كل وحدة تقيس فهمك خطوة بخطوة.",
  learn_feature2Title: "نخبة المدربين",
  learn_feature2Body:
    "مدربون بخبرة عملية حقيقية في السوق، يخضع محتواهم للمراجعة قبل النشر ويقيّمهم الطلاب بعد كل دورة.",
  learn_feature3Title: "مرونة تامة في الجدولة",
  learn_feature3Body:
    "تعلّم في أي وقت ومن أي جهاز، واستأنف من حيث توقفت، وحمّل الدروس لمتابعتها لاحقاً دون اتصال بالإنترنت.",
  learn_feature4Title: "شهادات إتمام رقمية موثقة",
  learn_feature4Body:
    "شهادة لكل دورة تُكملها، تحمل رمز QR ورقم تحقق فريداً يمكن لأي جهة توظيف التأكد منه في ثوانٍ.",
  learn_featuresNote: "ضمان استرداد كامل خلال ١٤ يوماً إن لم تناسبك الدورة.",

  // ---------- 4. Courses catalog ----------
  learn_coursesTitle: "دورات مميزة تبدأ هذا الأسبوع",
  learn_coursesLead:
    "اختر مسارك من بين أكثر من ٢٥٠ دورة، وابدأ بالدرس الأول مجاناً في كل دورة.",
  learn_coursesFilter: "تصفية الدورات حسب المسار",
  learn_coursesEmpty:
    "لا توجد دورات منشورة في هذا المسار حالياً — جرّب مساراً آخر أو تصفّح كل الدورات.",
  learn_courseFree: "مجاني",
  learn_courseLessonsSuffix: "درساً",
  learn_courseHoursSuffix: "ساعة",
  learn_courseStudentsSuffix: "متعلّم",
  learn_courseEnroll: "سجّل في الدورة",
  learn_courseRatingLabel: "التقييم",
  learn_courseInstructorLabel: "المدرب",
  learn_courseBestseller: "الأكثر طلباً",
  learn_courseNew: "جديد",
  learn_levelBeginner: "مبتدئ",
  learn_levelIntermediate: "متوسط",
  learn_levelAdvanced: "متقدّم",
  learn_coursePriceLabel: "سعر الدورة",

  // ---------- 5. Testimonials ----------
  learn_storiesTitle: "قصص نجاح من متعلّمينا",
  learn_storiesLead:
    "مراجعات حقيقية من طلاب أكملوا دوراتهم وحصلوا على شهاداتهم، من قطاع غزة والضفة والخارج.",
  learn_verified: "متعلّم موثّق",
  learn_storiesRecommend: "٩٦٪ من المتعلّمين يوصون بدورات الصرح لأصدقائهم.",
  learn_storiesRatingLabel: "تقييم المتعلّم",

  // ---------- 6. Newsletter ----------
  learn_newsTitle: "اشترك في النشرة التعليمية",
  learn_newsLead:
    "دورة مجانية، ونصائح تعلّم عملية، وفرص تدريب — رسالة واحدة أسبوعياً وبلا إزعاج.",
  learn_newsEmailLabel: "البريد الإلكتروني",
  learn_newsPlaceholder: "name@example.com",
  learn_newsCta: "اشترك الآن",
  learn_newsSending: "جارٍ الاشتراك…",
  learn_newsSuccess: "تم تسجيل بريدك بنجاح — ستصلك أول رسالة قريباً.",
  learn_newsInvalid: "الرجاء إدخال بريد إلكتروني صحيح، مثال: name@example.com",
  learn_newsError: "تعذّر إكمال الاشتراك الآن، حاول مرة أخرى بعد قليل.",
  learn_newsHint: "لن نشارك بريدك مع أي طرف آخر، ويمكنك إلغاء الاشتراك بنقرة واحدة.",

  // ---------- 7. Footer ----------
  learn_footerLinkNewsletter: "النشرة البريدية",
  learn_footerLinkCertificates: "الشهادات والتوثيق",
  learn_accreditationTitle: "الاعتماد والجودة",
  learn_accreditationBody:
    "تراجع كل دورة تربوياً وتقنياً قبل نشرها، وتصدر الشهادات برقم تحقق فريد وبوابة تحقق عامة يمكن لأي جهة استخدامها.",
  learn_backToTop: "العودة إلى الأعلى",
} as const;

export const learnEn: Record<keyof typeof learnAr, string> = {
  // ---------- Brand & navigation ----------
  learn_heroBadge: "Verified completion certificates & accredited tracks",
  learn_heroTitleLead: "Build real skills in",
  learn_heroTitleHighlight: "programming, design and languages",
  learn_heroTitleTail: "with the Arab world's top instructors",
  learn_heroLead:
    "Sarh brings together more than 250 accredited courses with clear Arabic content, a practical project after every unit, and direct follow-up from expert instructors. Learn at your own pace on any device — and keep going even on a weak connection.",
  learn_heroCtaPrimary: "Browse courses now",
  learn_heroCtaSecondary: "Watch the intro video",
  learn_heroTrust1: "A verified completion certificate with every course",
  learn_heroTrust2: "Secure local payment and plans for every budget",
  learn_heroTrust3: "Downloadable lessons that work offline",
  learn_heroRatingNote: "Rated 4.9 out of 5 from 3,200 reviews",
  learn_heroLearners: "More than 15,000 active learners",
  learn_heroVideoTitle: "Intro video",
  learn_heroVideoBody:
    "A quick tour of Sarh: how to choose a course, track your progress, and earn your certificate.",
  learn_heroVideoClose: "Close video",
  learn_heroVideoUnavailable:
    "The intro video could not load right now — you can still follow the platform tour in the mockup below.",

  // Hero dashboard mockup
  learn_mockTitle: "Your progress board",
  learn_mockLive: "Live now",
  learn_mockStudent: "Sara Abdullah",
  learn_mockProgressLabel: "Web development track",
  learn_mockProgressValue: "72%",
  learn_mockProgressBar: "Track progress bar",
  learn_mockNextLabel: "Next lesson",
  learn_mockNextValue: "Functions and modules — 18 minutes",
  learn_mockStreakLabel: "Streak",
  learn_mockStreakValue: "12 days in a row",
  learn_mockCertificateLabel: "Downloadable certificate",
  learn_mockCertificateValue: "Unlocks at 90% course completion",
  learn_mockFloatCertificate: "Verified certificate with an ID",
  learn_mockFloatInstructor: "Accredited instructor rated 4.9",
  learn_mockFloatOffline: "Download lessons and continue offline",

  // ---------- 2. Statistics & trust ----------
  learn_statsTitle: "Numbers that reflect learner trust",
  learn_statsLead:
    "We measure success by student outcomes rather than recorded hours, so every figure here comes straight from the platform.",
  learn_statStudents: "Active learners",
  learn_statCourses: "Accredited courses",
  learn_statCompletion: "Course completion rate",
  learn_statExperts: "Expert instructors",
  learn_statsTrustNote: "Figures refreshed quarterly from platform systems",

  // ---------- 3. Features / benefits ----------
  learn_featuresBadge: "Why Sarh?",
  learn_featuresTitle: "A learning experience designed to get you results",
  learn_featuresLead:
    "Every detail is built around the three questions every learner asks: what will I learn, with whom, and when can I commit?",
  learn_feature1Title: "Accredited learning content",
  learn_feature1Body:
    "Lessons built on academic standards and refreshed regularly, with a practical exercise or project after every unit to check your understanding.",
  learn_feature2Title: "Top-tier instructors",
  learn_feature2Body:
    "Instructors with real industry experience; their material is reviewed before publishing and rated by students after each course.",
  learn_feature3Title: "Fully flexible scheduling",
  learn_feature3Body:
    "Study any time on any device, resume exactly where you stopped, and download lessons to continue later without a connection.",
  learn_feature4Title: "Verified digital certificates",
  learn_feature4Body:
    "Every completed course issues a certificate with a QR code and a unique verification ID any employer can confirm in seconds.",
  learn_featuresNote: "Full refund within 14 days if a course is not right for you.",

  // ---------- 4. Courses catalog ----------
  learn_coursesTitle: "Featured courses starting this week",
  learn_coursesLead:
    "Pick your track from more than 250 courses and start the first lesson of any course for free.",
  learn_coursesFilter: "Filter courses by track",
  learn_coursesEmpty:
    "No courses are published in this track yet — try another track or browse all courses.",
  learn_courseFree: "Free",
  learn_courseLessonsSuffix: "lessons",
  learn_courseHoursSuffix: "hours",
  learn_courseStudentsSuffix: "learners",
  learn_courseEnroll: "Enroll in course",
  learn_courseRatingLabel: "Rating",
  learn_courseInstructorLabel: "Instructor",
  learn_courseBestseller: "Bestseller",
  learn_courseNew: "New",
  learn_levelBeginner: "Beginner",
  learn_levelIntermediate: "Intermediate",
  learn_levelAdvanced: "Advanced",
  learn_coursePriceLabel: "Course price",

  // ---------- 5. Testimonials ----------
  learn_storiesTitle: "Success stories from our learners",
  learn_storiesLead:
    "Genuine reviews from students who finished their courses and earned their certificates, from Gaza, the West Bank and beyond.",
  learn_verified: "Verified learner",
  learn_storiesRecommend: "96% of learners recommend Sarh courses to their friends.",
  learn_storiesRatingLabel: "Learner rating",

  // ---------- 6. Newsletter ----------
  learn_newsTitle: "Subscribe to the learning newsletter",
  learn_newsLead:
    "A free course, practical study tips and training opportunities — one email a week, no noise.",
  learn_newsEmailLabel: "Email address",
  learn_newsPlaceholder: "name@example.com",
  learn_newsCta: "Subscribe now",
  learn_newsSending: "Subscribing…",
  learn_newsSuccess: "Your email is registered — the first issue is on its way soon.",
  learn_newsInvalid: "Please enter a valid email address, e.g. name@example.com",
  learn_newsError: "The subscription could not be completed. Please try again shortly.",
  learn_newsHint: "We never share your email, and you can unsubscribe in one click.",

  // ---------- 7. Footer ----------
  learn_footerLinkNewsletter: "Newsletter",
  learn_footerLinkCertificates: "Certificates & verification",
  learn_accreditationTitle: "Accreditation & quality",
  learn_accreditationBody:
    "Every course is reviewed for pedagogy and quality before publishing, and certificates carry a unique verification ID and a public verification gateway any organisation can use.",
  learn_backToTop: "Back to top",
};
