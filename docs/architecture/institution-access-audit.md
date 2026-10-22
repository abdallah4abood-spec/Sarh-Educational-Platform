# تدقيق دخول بوابة المؤسسة وصلاحيات العضوية

**النطاق:** `/institution/**`، `middleware.ts`، NextAuth/JWT، قارئات
`src/lib/db/institution.ts`، اختبارات الصلاحيات، وترحيل `StaffRole`.
**تاريخ التدقيق:** 2026-10-22.
**الإنتاج:** لم يُفحص ولم يُعدّل؛ كل التحقق أدناه على قاعدة التطوير المحلية.

---

## 1. الشروط الفعلية لدخول `/institution`

| الطبقة | الشرط | الدليل |
|---|---|---|
| المسار | جلسة صالحة، بريد موثّق، وطبقة `INSTITUTION_TEACHER` داخل JWT | `src/middleware.ts:96-164` |
| البوابة الخادمية | `PortalShell` يعيد فحص نفس الطبقة عند الرسم | `src/components/portal/portal-shell.tsx:37-60` |
| المؤسسة | `resolveInstitutionAccess` يقرأ PostgreSQL: ملكية `Institution.ownerId` أو عضوية **ACTIVE** بدور `CENTER_ADMIN` | `src/lib/institution-access.ts:144-199` |
| التخطيط | حساب يملك الطبقة لكن لا يملك أي تفويض مؤسسي يُعاد توجيهه | `src/app/(portal)/institution/layout.tsx:34-54` |
| كل صفحة/قارئ | تحلّ التفويض مرة أخرى، والقارئ يفرض القدرة المطلوبة | `src/app/(portal)/institution/page.tsx:67-82`، `src/lib/db/institution.ts:29-241` |

**الفرق بين الحقول:**

- `User.role`: الطبقة الأساسية/بوابة الهبوط. لا تحدد مؤسسة.
- `User.roles`: طبقات إضافية في JWT. لا تحدد مؤسسة.
- `StaffMember.role`: سلطة العضوية داخل مؤسسة واحدة؛ `CENTER_ADMIN` فقط يمنح
  تفويضًا إداريًا غير مالك.
- `StaffMember.title`: نص عرض فقط، ولا يُقرأ في أي فحص صلاحية.
- `Institution.ownerId`: أقوى تفويض، مستقل عن وجود صف عضوية.

`SUPER_ADMIN` يدخل كل البوابات بحكم `canEnterPortal`، لكن الصفحات لا تحمّل أي صف
مؤسسة دون `InstitutionAccess`، لذلك لا يتحول ذلك إلى قراءة عابرة للمستأجرين.

---

## 2. هل يستطيع `CENTER_ADMIN` غير المالك الدخول بأمان؟

**نعم بعد الإصلاح**، لكن الطبقة كانت هي الفجوة:

- قبل الإصلاح: الحساب يحتاج `INSTITUTION_TEACHER` في `User.role/User.roles` يدويًا،
  وإلا رفضه middleware قبل أن يصل إلى العضوية. وجود `CENTER_ADMIN` في
  `StaffMember` لم يكن كافيًا.
- بعد الإصلاح: يشتق `sessionTiers` في `src/lib/auth.ts:58-70` مفتاح البوابة عند
  تسجيل الدخول إذا وجد ملكية أو عضوية نشطة `CENTER_ADMIN`، ويضيفه إلى `roles` دون
  تغيير `User.role` أو منح بيانات. المعلم/السكرتير/المشرف/`STAFF` لا يحصلون عليه.
- حتى لو حمل الحساب الطبقة، لا تُقرأ بيانات مؤسسة إلا عبر
  `resolveInstitutionAccess`؛ الطبقة مفتاح بوابة وليست تفويض مستأجر.
- لا تمنح الصلاحيات العامة (`TEACHER` أو `SUPER_ADMIN`) وحدها نطاق مؤسسة؛
  `ownerId` أو عضوية `CENTER_ADMIN` النشطة فقط تفعل ذلك.

**الخطر المتبقي:** جلسة قديمة قد تحمل `INSTITUTION_TEACHER` بعد سحب العضوية. هذا لا
يفتح بيانات: التخطيط وكل صفحة يقرآن العضوية الحية، و`load*` يرفض. لكنه يسمح بعرض
هيكل البوابة قبل إعادة التوجيه؛ لذلك أُضيفت بوابة التخطيط. إغلاق المسار نفسه فورًا
يحتاج `sessionVersion` أو جلسات قاعدة بيانات، وهو قرار معماري منفصل.

---

## 3. إلغاء العضوية أو تغيير الدور

**البيانات:** تُقرأ العضوية من PostgreSQL في كل طلب لصفحة مؤسسة. تحويل
`StaffMember.role` من `CENTER_ADMIN` إلى `TEACHER`/`STAFF` أو تغيير `status` إلى
`ON_LEAVE`/`INACTIVE` يجعل `resolveInstitutionAccess` يعيد `null` فورًا. لا توجد
ذاكرة مؤقتة للتفويض. اختبار `revokes both the data grant and the portal projection
on role change` يثبت ذلك.

**JWT:** لا يتحدث تلقائيًا. الجلسة 30 يومًا، و`middleware` يعتمد على التوكن. لذلك:

- إلغاء العضوية يمنع البيانات فورًا (القارئ الحي).
- مفتاح البوابة في الجلسة القديمة قد يبقى حتى تسجيل الدخول التالي؛ التخطيط يمنع
  الوصول إلى أي بيانات في الأثناء.
- إزالة `INSTITUTION_TEACHER` من `User.roles` ليست آلية إلغاء العضوية؛ يجب تغيير
  `StaffMember.role/status`. هذا قرار صريح موثق في `staff-role-rollout.md`.

**واجهات المؤسسة:** لا توجد حاليًا أي `route.ts` أو Server Action تحت
`/api/institution` أو داخل صفحات المؤسسة. لذلك لا توجد كتابة إدارية تحتاج حارسًا
إضافيًا. `settings` للعرض فقط، وكتابة `/api/settings` خاصة بإعدادات المنصة وتشترط
`SUPER_ADMIN`.

---

## 4. فرض القدرات المالية

| المسار | الفرض | النتيجة لـ`CENTER_ADMIN` |
|---|---|---|
| `/institution` | `hasCapability("commissions.read")` قبل الاستعلام | لا تُجلب العمولات، وتُخفى البطاقات |
| `/institution/enrollments` | فحص مبكر + `loadInstitutionCommissions` | لوحة «بيانات محمية»، لا استعلام |
| `/institution/profile` | `loadInstitutionProfile` | `reviews` و`occupancy` = `null` |
| `/institution/ai-studio` | فحص + `loadInstitutionCommissions` | لا تُجلب العمولات، ويُخفى الجدول |
| `loadInstitutionCommissions` | `requireCapability` | يرمي `InstitutionAccessDeniedError` |

هذا فرض خادمي مزدوج: الصفحة تقرر ما تحمّله، والقارئ يرفض حتى لو استُدعي من مسار
آخر. لا يوجد مسار API مالي للمؤسسة يمكن تجاوزه. اختبارات
`financial data is owner-only` تغطي الرفض والتنقيح.

**ملاحظة:** `loadInstitutionHeader` يعيد عدد التسجيلات وعدد الطاقم، وهذه أرقام
تشغيلية لا مالية. `rating` تقييم دليل عام، وليس رقمًا ماليًا.

---

## 5. عزل المؤسسات عند تعديل المعرف

- `requestedInstitutionId` يقبل نصًا واحدًا فقط ويتجاهل القيم المتكررة/المصفوفات
  (`src/lib/institution-access.ts:208-215`).
- `resolveInstitutionAccess` يبحث في قائمة المنح المحسوبة من قاعدة البيانات؛ معرف
  مؤسسة أخرى يعيد `null`، والصفحة تعيد `notFound()`.
- تعدد المؤسسات مرتب: المملوكة أولًا ثم عضويات `CENTER_ADMIN`، بترتيب ثابت.
- الاختبارات تغطي: مالك يطلب مؤسسة مالك آخر، معرفًا مجهولًا، ومبدّل مالك متعدد
  المراكز.

**لا يوجد مسار يقرأ `institutionId` من جسم الطلب أو من `params` مباشرةً** في بوابة
المؤسسة؛ الصفحات تستخدم `?institution=` المفلتر فقط.

---

## 6. حالة الترحيل

- `prisma/schema.prisma` يحتوي `StaffRole` و`StaffMember.role` بقيمة افتراضية
  `STAFF` وفهرس `(userId, status)`.
- قاعدة التطوير تحتوي 14 عضوية: 5 `CENTER_ADMIN`، 1 `SUPERVISOR`، 8 `TEACHER`،
  0 `SECRETARY`، 0 `STAFF`.
- `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma
  --to-schema-datamodel prisma/schema.prisma --script` أعاد **«This is an empty
  migration»**، أي لا انحراف بين المخطط وقاعدة التطوير.
- لا يوجد `prisma/migrations`. آلية المشروع الحالية `npm run db:push` وليست
  `migrate deploy`.
- SQL الأمامي والتراجع موثقان في `docs/architecture/staff-role-rollout.md`.
  لم يُطبّق أي شيء على الإنتاج.

**خطة إعادة الإنتاج على قاعدة جديدة/اختبار:**

1. أنشئ قاعدة فارغة مخصصة للاختبار، وضع عنوانها في `DATABASE_URL` المؤقت.
2. طبّق المخطط: `npx prisma db push` (بيئة تطوير/اختبار فقط)، أو نفّذ SQL الأمامي
   داخل معاملة ثم `npx prisma generate`.
3. شغّل `npm run db:seed` إن كانت البيانات التجريبية مطلوبة.
4. تحقق: `SELECT role, count(*) ...` يجب أن يعطي 5/1/8/0/0.
5. شغّل `npm test`, `npx tsc --noEmit`, `npm run build`.

أما الإنتاج: لا تنفّذ `db push` عليه. القرار المطلوب هو اعتماد baseline ترحيلات
(يتطلب قاعدة موجودة ونقطة أساس) أو تنفيذ SQL الموثق ضمن نافذة صيانة بعد نسخة
احتياطية. لم يُتخذ هذا القرار هنا.

---

## 7. النتائج حسب الخطورة

| # | الخطورة | الحالة | النتيجة |
|---|---|---|---|
| 1 | عالية (وظيفية) | **مُصلحة** | `CENTER_ADMIN` غير المالك لم يكن يدخل دون طبقة عامة يدوية؛ أُضيف اشتقاق آمن عند تسجيل الدخول |
| 2 | متوسطة | **مُصلحة** | جلسة قديمة بعد سحب العضوية كانت قد تعرض هيكل البوابة؛ أُضيفت بوابة تخطيط خادمية تمنع البيانات |
| 3 | متوسطة | **مفتوحة، خارج النطاق** | `/api/admin/*` تتحقق من `SUPER_ADMIN` في JWT فقط؛ إزالة الدور لا تلغي الكتابة حتى انتهاء الجلسة. تحتاج فحصًا حيًا أو `sessionVersion` |
| 4 | منخفضة | **مفتوحة، خارج النطاق** | `/api/settings` و`/api/parent/ai-chat` يفحصان `session.user.role` المفرد بدل `roles`؛ يسببان رفضًا لحساب متعدد الطبقات، لا تصعيدًا |
| 5 | منخفضة | مفتوحة | عنوان صفحة استوديو الذكاء الاصطناعي يذكر جدول العمولات حتى لمدير لا يراها؛ النص فقط، لا تسريب |
| 6 | منخفضة | **مُصلحة** | أُضيف اختبار تكامل يستدعي `authorize` فعليًا: يضيف الطبقة لمدير `CENTER_ADMIN` مع بقاء `role = TEACHER`، ولا يضيفها لعضوية `TEACHER` عادية |
| 7 | منخفضة | مفتوحة | لا يوجد اختبار متصفح لإعادة توجيه التخطيط؛ مغطى بالكود والبناء فقط |

---

## 8. التحقق المنفذ

- `npm test`: 42 اختبارًا ناجحًا، 0 فشل.
- `npx tsc --noEmit`: ناجح.
- `npm run build`: ناجح (كل مسارات `/institution` ديناميكية).
- `npm run lint`: ناجح، مع تحذيرين قديمين غير متعلقين (خطوط في `src/app/layout.tsx`،
  و`<img>` في `src/components/ui/file-input.tsx`).
- `git diff --check`: ناجح.
- `prisma migrate diff`: لا انحراف في قاعدة التطوير.

---

## 9. قرارات ما زالت مطلوبة

1. **إبطال الجلسات:** هل نعتمد `sessionVersion` في `User` وفحصه في بوابة خادمية
   موحّدة (يغلق البوابة فورًا)، أم نكتفي بالسلوك الحالي (البيانات فورية، بوابة
   الجلسة حتى 30 يومًا)؟
2. **`/api/admin`:** هل نضيف فحص دور حي من قاعدة البيانات قبل الكتابة، أم نؤجل ذلك
   إلى مرحلة `sessionVersion`؟
3. **الترحيل:** هل نعتمد baseline لـ`prisma migrate` الآن، أم نستمر بـ`db push` في
   التطوير وSQL موثق للإنتاج؟
4. **دور السكرتير:** هل يبقى بلا دخول إداري، أم يحتاج مساحة عمل محدودة لاحقًا؟
