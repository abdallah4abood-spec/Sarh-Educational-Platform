# ترحيل `StaffMember.role` وبوابة المؤسسة

**الحالة:** مطبَّق على قاعدة التطوير المحلية فقط. لم يُنفَّذ أي ترحيل على الإنتاج، ولم
يُنشأ مجلد `prisma/migrations`، ولم يتغيّر `middleware.ts` أو عقد الـ JWT.

---

## 1. القرار المعماري

`User.role` يحدّد **البوابة** التي يملك الحساب مفتاحها (`INSTITUTION_TEACHER` لبوابة
`/institution`). `StaffMember.role` يحدّد **ما يجوز للحساب فعله داخل مؤسسة معيّنة**.
لا يُمنح `CENTER_ADMIN` صلاحيات المالك، ولا يصبح أي دور عضوية بديلًا عن
`Institution.ownerId`.

| القدرة | `OWNER` | `CENTER_ADMIN` | بقية الأدوار |
|---|---|---|---|
| `institution.read` | نعم | نعم | لا |
| `staff.read` | نعم | نعم | لا |
| `roster.read` | نعم | نعم | لا |
| `profile.read` | نعم | نعم | لا |
| `ai_studio.use` | نعم | نعم | لا |
| `commissions.read` | نعم | **لا** | لا |

المصدر الوحيد للقرار هو `src/lib/institution-access.ts`. كل قارئ في
`src/lib/db/institution.ts` يستدعي `requireCapability` بنفسه، فلا يعتمد العزل على
إخفاء عنصر واجهة. صفحات العمولات والملف المالي تحجب الرقم من الاستعلام نفسه
(`null`) بدل تحميله ثم إخفائه.

`title` بقي نصًا وصفيًا للعرض فقط. اختبارات `tests/institution-access.test.ts` تثبت أن
عضوية `CENTER_ADMIN` بعنوان «معلمة» تعمل، وأن عضوية `TEACHER` بعنوان «مدير المركز»
لا تعمل.

---

## 2. دخول `CENTER_ADMIN` غير المالك

سلسلة الدخول الآمنة:

1. **الطبقة:** يجب أن يحمل الحساب `INSTITUTION_TEACHER` في `User.role` أو
   `User.roles`، أو أن يشتقها تسجيل الدخول من ملكية مؤسسة أو عضوية نشطة
   `CENTER_ADMIN` (انظر أدناه). هذا ما يفحصه `middleware.ts` من التوكن، ولا يمكنه
   قراءة PostgreSQL من Edge.
2. **العضوية:** عند فتح الصفحة، يقرأ `resolveInstitutionAccess` الصف النشط
   `StaffMember.role = CENTER_ADMIN` من قاعدة البيانات. غياب الصف يعطي `null`.
3. **البوابة الخادمية:** `src/app/(portal)/institution/layout.tsx` يعيد توجيه حساب
   يملك طبقة البوابة لكن لا يملك أي تفويض مؤسسي إلى بوابته الفعلية بدل عرض هيكل
   إداري فارغ.
4. **الصفحة والقارئ:** كل صفحة تحلّ تفويضها مرة أخرى، وكل قارئ يفرض القدرة المطلوبة.

`CENTER_ADMIN` **لا يمنح سلطة بيانات** لمجرد وجود صف عضوية في قاعدة البيانات؛
السلطة تُحسم في `resolveInstitutionAccess` و`requireCapability`. أما مفتاح البوابة
فيُشتق عند تسجيل الدخول (أدناه). عند بناء مسار الدعوات، يجب أن يقرأ الخادم الدور من
الدعوة ويستخدم `portalTierForStaffRole`:

```ts
portalTierForStaffRole("CENTER_ADMIN"); // "INSTITUTION_TEACHER"
portalTierForStaffRole("TEACHER"); // null
portalTierForStaffRole("SECRETARY"); // null
```

هذه دالة عرض (projection) وليست تفويضًا: مجرد حمل الطبقة لا يعطي بيانات مؤسسة.

**الاشتقاق الحيّ (D5):** يبني `loadLiveTiers` في `src/lib/session-tiers.ts` مجموعة
الطبقات من صف `User` والعضويات **النشطة** وحدهما، ولا يقرأ `role`/`roles` من
التوكن إطلاقًا. يضيف `INSTITUTION_TEACHER` لمن يملك مؤسسة (`ownerId`) أو عضوية
نشطة بدور `CENTER_ADMIN`، ويضيف `TEACHER` لعضوية نشطة بدور `TEACHER`. لا يضيفها
للسكرتير أو المشرف أو `STAFF`، ولا لعضوية `ON_LEAVE` أو `INACTIVE`.

`callbacks.jwt` في `src/lib/auth.ts` يستدعي هذه الوحدة في **كل** قراءة جلسة، لا
عند تسجيل الدخول فقط: NextAuth يمرّر التوكن عبر هذا الـcallback عند كل
`getServerSession` وعند `useSession().update()`، فتتغيّر مجموعة الطبقات مع تغيّر
العضوية. الإنشاء/الإلغاء ينعكس فورًا على البيانات عبر `resolveInstitutionAccess`
و`resolveTeacherScope`، وينعكس على مفتاح البوابة عند أول قراءة جلسة تالية.

> إعادة الحساب داخل مسار RSC لا تكتب الكوكي: NextAuth يستخدم `setCookie` فارغة في
> `next-auth/next/index.js`. تحديث الكوكي يحتاج `useSession().update()` (طلب
> `POST /api/auth/session`). لكن البيانات محمية دائمًا بالفحص الخادمي الحيّ، فأي
> توكن قديم لا يمنح وصولًا.

> إزالة `INSTITUTION_TEACHER` من `User.roles` وحدها **ليست** آلية إلغاء العضوية.
> الإلغاء الفعلي هو تحويل `StaffMember.role` أو `StaffMember.status`. هذا فصل
> مقصود بين مفتاح البوابة وسلطة المؤسسة.

لا توجد اليوم واجهة دعوات حقيقية؛ لذلك إسناد `CENTER_ADMIN` لحساب جديد يظل خطوة
تشغيلية (seed أو إدارة قاعدة البيانات).

---

## 3. الأمام (Forward SQL)

هذا هو التغيير الإضافي المطابق لما طُبّق على التطوير. نفّذه داخل معاملة واحدة بعد
نسخة احتياطية، ولا تشغّله على الإنتاج ضمن هذه المهمة.

```sql
BEGIN;

CREATE TYPE "StaffRole" AS ENUM (
  'CENTER_ADMIN',
  'SECRETARY',
  'TEACHER',
  'SUPERVISOR',
  'STAFF'
);

ALTER TABLE "StaffMember"
  ADD COLUMN "role" "StaffRole" NOT NULL DEFAULT 'STAFF';

-- خريطة العناوين الحالية. تُطبّق مرة واحدة قبل الاعتماد على `role`.
UPDATE "StaffMember"
SET "role" = CASE
  WHEN "title" ILIKE '%مدير%' OR "title" ILIKE '%مديرة%' THEN 'CENTER_ADMIN'::"StaffRole"
  WHEN "title" ILIKE '%مشرف%' OR "title" ILIKE '%مشرفة%' THEN 'SUPERVISOR'::"StaffRole"
  WHEN "title" ILIKE '%معلم%' OR "title" ILIKE '%معلمة%' THEN 'TEACHER'::"StaffRole"
  ELSE 'STAFF'::"StaffRole"
END;

CREATE INDEX "StaffMember_userId_status_idx"
  ON "StaffMember" ("userId", "status");

COMMIT;
```

التحقق المطلوب قبل المتابعة:

```sql
SELECT "role", count(*)
FROM "StaffMember"
GROUP BY "role"
ORDER BY "role";

SELECT count(*) FROM "StaffMember" WHERE "role" IS NULL; -- يجب أن يكون 0
```

النتيجة المتوقعة على بيانات التطوير بعد التعبئة: **5** `CENTER_ADMIN`، **1**
`SUPERVISOR`، **8** `TEACHER`، **0** `SECRETARY`، **0** `STAFF` (المجموع 14).
أي اختلاف يعني إيقاف الترحيل ومراجعة العنوان الذي لم تُغطّه الخريطة.

---

## 4. التراجع (Rollback)

التراجع آمن لأن التغيير إضافي: الكود القديم لا يقرأ `role`. نفّذه فقط بعد إعادة نشر
النسخة التي لا تستخدم الحقل:

```sql
BEGIN;

DROP INDEX IF EXISTS "StaffMember_userId_status_idx";
ALTER TABLE "StaffMember" DROP COLUMN IF EXISTS "role";
DROP TYPE IF EXISTS "StaffRole";

COMMIT;
```

التراجع يحذف تصنيف الأدوار، ولا يحذف أي عضوية أو عنوان. يمكن إعادة التصنيف من
`title` عند إعادة التطبيق، لكن أي تصحيح يدوي لاحق على `role` سيضيع.

---

## 5. ما لم يُفعل

- لم يُنشأ baseline لـ`prisma migrate`، ولا يمكن لـ`migrate deploy` إعادة إنتاج هذه
  الخطوة بعد.
- لم تُعدّل بيانات الإنتاج.
- لم يُضف مسار دعوات أو منح تلقائي لطبقة `INSTITUTION_TEACHER`.
- لم يُغيّر middleware أو محتوى JWT؛ إبطال الصلاحيات فوري في طبقة القراءة، لكن
  إغلاق مسار البوابة نفسه ينتظر انتهاء الجلسة أو إعادة الدخول.
