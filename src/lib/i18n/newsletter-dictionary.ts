/**
 * SARH — newsletter band and footer accreditation copy.
 *
 * These strings used to live in `learn-dictionary.ts`, the copy for the retired
 * `/learn` e-learning microsite. When that page was removed, the newsletter band
 * and the footer kept reusing a handful of its keys, so those strings moved here
 * and everything course-specific (hero, catalog, statistics, testimonials,
 * pricing and refunds) was deleted with the page.
 *
 * Same contract as `home-dictionary.ts`: the English map is typed against
 * `keyof typeof newsletterAr`, so a key added to one language but not the other
 * is a compile error instead of a missing string at runtime.
 */

export const newsletterAr = {
  // ---------- Newsletter band ----------
  newsletterEyebrow: "النشرة البريدية",
  newsletterTitle: "اشترك في النشرة التعليمية",
  newsletterLead:
    "مراكز جديدة في الدليل، نصائح عملية لاختيار المركز المناسب لطفلك، وفرص تدريب للمعلمين — رسالة واحدة أسبوعياً وبلا إزعاج.",
  newsletterEmailLabel: "البريد الإلكتروني",
  newsletterPlaceholder: "name@example.com",
  newsletterCta: "اشترك الآن",
  newsletterSending: "جارٍ الاشتراك…",
  newsletterSuccess: "تم تسجيل بريدك بنجاح — ستصلك أول رسالة قريباً.",
  newsletterInvalid: "الرجاء إدخال بريد إلكتروني صحيح، مثال: name@example.com",
  newsletterError: "تعذّر إكمال الاشتراك الآن، حاول مرة أخرى بعد قليل.",
  newsletterHint: "لن نشارك بريدك مع أي طرف آخر، ويمكنك إلغاء الاشتراك بنقرة واحدة.",

  // ---------- Footer ----------
  footerVerifiedData: "بيانات موثّقة",
  footerAccreditationTitle: "التحقق من بيانات المراكز",
  footerAccreditationBody:
    "تُدخل كل مؤسسة بيانات ملفها بنفسها، ويراجع فريق صَرْح بيانات المركز وترخيصه قبل ظهوره في الدليل — وتستطيع التأكد من أي تفصيل بالتواصل المباشر مع المركز.",
  footerBackToTop: "العودة إلى الأعلى",
} as const;

export const newsletterEn: Record<keyof typeof newsletterAr, string> = {
  // ---------- Newsletter band ----------
  newsletterEyebrow: "Newsletter",
  newsletterTitle: "Subscribe to the learning newsletter",
  newsletterLead:
    "New centers in the directory, practical tips for choosing the right center for your child, and training opportunities for teachers — one email a week, no noise.",
  newsletterEmailLabel: "Email address",
  newsletterPlaceholder: "name@example.com",
  newsletterCta: "Subscribe now",
  newsletterSending: "Subscribing…",
  newsletterSuccess: "Your email is registered — the first issue is on its way soon.",
  newsletterInvalid: "Please enter a valid email address, e.g. name@example.com",
  newsletterError: "The subscription could not be completed. Please try again shortly.",
  newsletterHint: "We never share your email, and you can unsubscribe in one click.",

  // ---------- Footer ----------
  footerVerifiedData: "Verified data",
  footerAccreditationTitle: "Center data verification",
  footerAccreditationBody:
    "Each institution enters its own profile data, and the Sarh team reviews the center's details and licence before it appears in the directory — and you can confirm any detail by contacting the center directly.",
  footerBackToTop: "Back to top",
};
