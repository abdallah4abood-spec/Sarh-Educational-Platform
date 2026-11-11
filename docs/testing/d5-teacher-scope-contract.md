# D5 — Teacher scope: contract tests

**الحالة:** منفَّذ (D5). الاختبارات جزء من `npm test`.

| Suite | Tests | Pass |
|---|---|---|
| `tests/teacher-scope.test.ts` | 19 | 19 |
| `tests/session-tiers.test.ts` | 16 | 16 |

```bash
node --import tsx --test tests/teacher-scope.test.ts
node --import tsx --test tests/session-tiers.test.ts
```

يحتاجان `DATABASE_URL` وقاعدة PostgreSQL متاحة (نفس `.env` التطبيق)، ويرفضان
العمل عند `NODE_ENV=production`. الـfixtures بادئتها `d5-scope-` و`d5-tier-`
وتُحذف في `after()`؛ وملف النطاق يؤكد انعدام البقايا.

---

## 1. العقد المنفَّذ

### `resolveTeacherScope(userId, requestedInstitutionId?)` — `src/lib/teacher-access.ts`

| # | الحالة | النتيجة | مغطّاة بـ |
|---|---|---|---|
| 1 | عضوية `TEACHER` نشطة واحدة بلا اختيار | `scope` | "creates a scope for the single ACTIVE membership…" |
| 2 | أكثر من عضوية نشطة بلا اختيار | `ambiguous` + قائمة المؤسسات، **بلا بيانات** | "returns ambiguous — and no scope…" |
| 3 | `?institution=` يطابق عضوية نشطة | `scope` | "accepts an explicit institution…" |
| 4 | `?institution=` لا يطابق أي عضوية نشطة | `denied: institution-not-granted`، بلا رجوع | "denies an explicit institution with no ACTIVE membership — no fallback" |
| 5 | `User.role = TEACHER` بلا أي عضوية | `denied: no-membership` | "denies an account with no teaching membership despite User.role = TEACHER" |
| 6 | حساب غير تعليمي | `denied: not-teacher` | "denies a non-teacher account" |
| 7 | معرّف مستخدم غير موجود | `denied: unknown-user` | "denies an unknown user id" |
| 8 | خطأ قاعدة بيانات | `denied: lookup-failed` (فشل مغلق) | لا اختبار آلي (يتطلب إسقاط الاتصال) |

`ON_LEAVE` و`INACTIVE` لا تدخلان حساب النطاق؛ يغطّي ذلك fixture
`teacher-mixed` (ACTIVE في A، INACTIVE في B) وحالة `teacher3` الحقيقية.

### دوال `src/lib/db/teacher.ts`

كل الدوال تستقبل `TeacherScope` وتضيف `institutionId` إلى شروط الاستعلام:
`loadTeacherClasses`, `loadTeacherTimetable`, `loadTeacherOverview`,
`loadClassRoster`, `loadTeacherWorkload`, `loadTeacherStudio`,
`loadTeacherAttendanceBoard`, `loadTeacherAssignments`.

قرارات حدّية مقصودة:

- `loadTeacherTimetable`: الحصة لا تحمل مؤسسة، فالفصل هو المرساة
  (`class: { institutionId }`). حصة بلا فصل لا تُنسب لأي مركز فتُستبعد.
- `loadTeacherOverview`: الخطط بلا `institutionId` لا تُحتسب.
- `loadTeacherStudio`: المؤسسة تأتي من النطاق لا من `classes[0]`.
- `loadClassRoster`: يتطلب `id` + `teacherId` + `institutionId` معًا؛ الإسناد وحده
  ليس تصريحًا.

## 2. ضمانات مثبَّتة

- `effectiveRoles` جمعي، ترتيب ثابت، بلا تكرار.
- `User.role` / `User.roles` لا يُعاد كتابتهما من الجلسة.
- `userHasInstitutionPortalGrant` بلا تغيير: مالك → true، `CENTER_ADMIN` نشطة →
  true، `INACTIVE` → false، معلم فقط → false، `SECRETARY` → false.
- `activeRole` من العميل لا يمنح `SUPER_ADMIN` / `INSTITUTION_TEACHER` /
  `TEACHER`.
- الدور الأساسي `TEACHER` يبقى عند انتهاء العضوية (D5 جمعي)، والبيانات تُمنع عبر
  `resolveTeacherScope`. لا تُصلح ذلك بكتابة `User.role`.

## 3. ما يبقى يدويًا

`getServerSession` في مسار RSC لا يكتب الكوكي (`setCookie` فارغة في
`next-auth/next/index.js`)؛ التحديث الفعلي يحتاج `useSession().update()`.
الخطوات الكاملة في [d5-manual-session-verification.md](d5-manual-session-verification.md).
نُفِّذت الفحوص الستة (1–5 و4ب) في 2026-11-08/09؛ النتائج والأدلة في
[d5-manual-session-verification.md](d5-manual-session-verification.md)، والخلاصة في
[d5-final-report.md](d5-final-report.md).
