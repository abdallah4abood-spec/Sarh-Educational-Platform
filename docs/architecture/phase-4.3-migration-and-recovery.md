# المرحلة 4.3 — الترحيل والتحقق والاسترداد

**التاريخ:** 2026-10-26.
**النطاق المنفَّذ:** قاعدة اختبار منفصلة فقط.
**ما لم يُنفَّذ:** لا `db push` ولا migration ولا seed على `sarh_db`.

الملف المرجعي للتنفيذ: `prisma/migrate-4.3-grants.ts`.
المخططات: `dev-artifacts/schema-4.3-stage1.prisma` (عمود اختياري) و
`prisma/schema.prisma` (الهدف `NOT NULL`).

---

## 1. ترتيب التنفيذ المعتمد

1. **نسخة احتياطية موثقة** وقابلة للاستعادة على قاعدة منفصلة.
2. **مرحلة المخطط 1:** إنشاء `StudentGuardianGrant` + إضافة
   `SubjectPerformance.institutionId` **اختيارياً**. لا `NOT NULL` بعد.
3. **سكربت الترحيل:** إنشاء المنح للمؤسسات ذات التسجيل النشط، وتعبئة الصفوف
   الـ32، داخل معاملة واحدة.
4. **تحقق شامل:** 0 صفوف بلا مؤسسة، 0 روابط معتمدة بلا منحة لجلوس نشط، لا
   تكرار بعد الإسناد، والمنح كلها `APPROVED`.
5. **نشر الكود الجديد فقط بعد نجاح التحقق.** الكود الجديد يكتب
   `institutionId` في كل مسار.
6. **بعد استقرار الكود:** فرض `NOT NULL` + `onDelete: Restrict` في مرحلة مخطط
   ثانية. لا تُفرض قبل النشر، حتى لا يفشل الكود القديم في الكتابة أثناء القطع.
7. **الدخان:** تسجيل دخول ولي أمر بلا منحة، ومنحة A، ومنحة B، وسحب A، ثم
   التحقق من الإعلانات واليوميات والدرجات.

## 2. الأوامر

```bash
# 0) عنوان قاعدة الاختبار فقط — لا sarh_db
export DATABASE_URL='postgresql://…/sarh_db_43_migration_test'

# 1) نسخة احتياطية
pg_dump -Fc -f /secure/backups/sarh_db_pre_4.3_$(date +%Y%m%dT%H%M%S).dump \
  "$DATABASE_URL"

# 2) مرحلة المخطط 1 (اختياري)
npx prisma db push --schema dev-artifacts/schema-4.3-stage1.prisma

# 3) معاينة بلا كتابة
npx tsx prisma/migrate-4.3-grants.ts --expect-approved=<n> --expect-perf=32

# 4) تطبيق داخل معاملة
npx tsx prisma/migrate-4.3-grants.ts --apply --expect-approved=<n> --expect-perf=32

# 5) اختبار الفشل المتعمد (يجب أن يتراجع كاملاً)
npx tsx prisma/migrate-4.3-grants.ts --apply --fail-after=grants \
  --expect-approved=<n> --expect-perf=32

# 6) تحقق
psql "$DATABASE_URL" -Atc '
  select
    (select count(*) from "SubjectPerformance" where "institutionId" is null) as null_perf,
    (select count(*) from "StudentGuardianGrant" where status = '\''APPROVED'\'') as grants;'

# 7) بعد نشر الكود الجديد فقط
npx prisma db push   # يفرض NOT NULL على المخطط الهدف
```

`<n>` يجب أن يساوي عدد روابط `APPROVED` المقروء في المعاينة. أي اختلاف يوقف
التنفيذ قبل الكتابة.

## 3. SQL الترحيل (مراجعة قبل أي تنفيذ)

```sql
BEGIN;

-- 3.1 منح أولية: رابط معتمد × كل مؤسسة لها تسجيل ACTIVE.
--     لا منحة لمؤسسة سابقة غير نشطة. الصفوف المتعددة لنفس الثنائي لا تُكرر.
INSERT INTO "StudentGuardianGrant"
  (id, "linkId", "institutionId", status, "requestedAt", "approvedAt",
   "approvedById", "revokedAt", "revokedById", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text, sg.id, e."institutionId", 'APPROVED',
  sg."requestedAt", COALESCE(sg."approvedAt", now()),
  NULL, NULL, NULL, now(), now()
FROM "StudentGuardian" sg
JOIN "Enrollment" e
  ON e."studentId" = sg."studentId"
 AND e."enrollmentStatus" = 'ACTIVE'
WHERE sg.status = 'APPROVED'
GROUP BY sg.id, e."institutionId", sg."requestedAt", sg."approvedAt"
ON CONFLICT ("linkId", "institutionId") DO NOTHING;

-- 3.2 سجل تدقيق ترحيل واحد لكل منحة جديدة.
INSERT INTO "StudentGuardianEvent"
  (id, "studentId", "linkId", "guardianId", "institutionId", action,
   "dedupeKey", note, "createdAt")
SELECT
  gen_random_uuid()::text, sg."studentId", g."linkId", NULL,
  g."institutionId", 'MIGRATED',
  'migrate:' || g."linkId" || ':' || g."institutionId",
  'ترحيل 4.3 — اعتماد تاريخي سابق، فاعله غير معروف', now()
FROM "StudentGuardianGrant" g
JOIN "StudentGuardian" sg ON sg.id = g."linkId"
WHERE g.status = 'APPROVED'
ON CONFLICT ("dedupeKey") DO NOTHING;

-- 3.3 تعبئة الدرجات: يجب أن يكون للطالب جلوس ACTIVE واحد فقط.
--     السكربت يجهض عند 0 أو أكثر من مؤسسة، أو عند تكرار المفتاح.
UPDATE "SubjectPerformance" p
SET "institutionId" = x."institutionId"
FROM (
  SELECT p2.id, min(e."institutionId") AS "institutionId"
  FROM "SubjectPerformance" p2
  JOIN "Enrollment" e
    ON e."studentId" = p2."studentId"
   AND e."enrollmentStatus" = 'ACTIVE'
  WHERE p2."institutionId" IS NULL
  GROUP BY p2.id
  HAVING count(DISTINCT e."institutionId") = 1
) x
WHERE p.id = x.id;

-- 3.4 تحقق داخل المعاملة: أي صف متبقٍ يجهض كل شيء.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "SubjectPerformance" WHERE "institutionId" IS NULL) THEN
    RAISE EXCEPTION 'VERIFY_FAILED: performance rows still have no institution';
  END IF;
END $$;

COMMIT;
```

> ملاحظة: `dedupeKey` عمود في `StudentGuardianEvent` وليس في المنحة؛ الشرط
> `ON CONFLICT` هو ما يجعل إعادة التشغيل آمنة. لا تُشغّل SQL يدوياً إن كان
> السكربت متاحاً، لأن السكربت يتحقق من التكرار والإسناد قبل الكتابة.

### فرض NOT NULL بعد الكود الجديد

```sql
ALTER TABLE "SubjectPerformance"
  ALTER COLUMN "institutionId" SET NOT NULL;

CREATE INDEX "SubjectPerformance_institutionId_subject_idx"
  ON "SubjectPerformance" ("institutionId", subject);

ALTER TABLE "SubjectPerformance"
  ADD CONSTRAINT "SubjectPerformance_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "Institution"(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

## 4. ما تم اختباره فعلياً

على قاعدة منفصلة `sarh_db_43_migration_test_20261026` (ثم استعادة على
`sarh_db_43_migration_restore_20261026`):

| الاختبار | النتيجة |
|---|---|
| بيانات قديمة: 32 صف درجة بلا مؤسسة | ✅ |
| `--fail-after=grants` (رابط واحد) | ✅ فشل مقصود، وتراجعت المعاملة: 0 منحة، 32 صفاً بلا مؤسسة |
| `--apply` على 8 روابط APPROVED | ✅ 8 منح APPROVED، 8/8 جلوس نشط، 32/32 صفاً منسوباً، 0 صف بلا مؤسسة |
| `--apply` مرة ثانية | ✅ idempotent: 0 منح جديدة، 0 تحديثات |
| فرض `NOT NULL` | ✅ `is_nullable = NO` |
| استعادة النسخة الاحتياطية | ✅ 0 منحة، 32 صفاً بلا مؤسسة (حالة ما قبل الترحيل) |

لم يُختبر الترحيل على `sarh_db`، ولا توجد نتائج تُنسب إليها.

## 5. الاسترداد

### أ. فشل قبل نشر الكود الجديد

- الكود القديم يعمل لأن العمود ما زال اختيارياً.
- لا حاجة لاستعادة مدمرة. أصلح السكربت أو البيانات، ثم أعد التشغيل؛ المنح
  فريدة والسكربت idempotent.
- إن لزم التراجع عن مرحلة المخطط 1: احذف جدول المنح والعمود **فقط** بعد تأكيد
  عدم وجود كتابات جديدة، أو استعد النسخة الاحتياطية.

### ب. فشل بعد نشر الكود الجديد

- **لا تُرجع الكود القديم.** الكود القديم يقرأ الرابط الأسري كصلاحية عامة،
  وإرجاعه بعد إنشاء المنح يعيد فتح سجلات كل المراكز. بوابة الأمان: لا رجوع
  للكود القديم إلا إذا ثبت أنه يحترم المنح، وهو لا يفعل.
- أصلح للأمام (hotfix) أو أعد نشر الإصدار الجديد السابق المتوافق مع المنح.
- الاستعادة الكاملة (كود قديم + قاعدة ما قبل 4.3) تتطلب **موافقة صريحة
  منفصلة**، ونسخة `post-4.3` قبل الاستعادة، وتقرير فروق يحفظ:
  - المنح المنشأة/المسحوبة بعد الترحيل.
  - الدرجات واليوميات والإعلانات والرسائل الجديدة.
  - أي تغيير على `isPrimary`.

### ج. أوامر الاستعادة المعزولة

```bash
# نسخة ما بعد الترحيل أولاً (حتى لا تُفقد بيانات جديدة)
pg_dump -Fc -f /secure/backups/sarh_db_post_4.3_$(date +%Y%m%dT%H%M%S).dump \
  "$DATABASE_URL"

# استعادة على قاعدة منفصلة للتحقق فقط
createdb sarh_db_43_restore_check
pg_restore --clean --if-exists -d sarh_db_43_restore_check \
  /secure/backups/sarh_db_pre_4.3_*.dump
```

لا تُنفَّذ الاستعادة على `sarh_db` قبل موافقة منفصلة، ولا قبل تقرير الفروق.

## 6. شروط التوقف

أوقف التنفيذ فوراً عند أي من التالي:

1. `approvedLinks` أو `performanceRows` لا يطابق القيمة المعتمدة.
2. صف `SubjectPerformance` له 0 أو أكثر من مؤسسة `ACTIVE` واحدة.
3. تكرار `(studentId, institutionId, subject, term)` بعد الإسناد.
4. أي صف يبقى `institutionId IS NULL` بعد التحديث.
5. رابط `APPROVED` لطالب له جلوس `ACTIVE` بلا منحة بعد السكربت.
6. فشل قيد `NOT NULL` أو الفهرس أو المفتاح الأجنبي.
7. أي اختلاف في عدد المنح المتوقع، أو ظهور منحة لمؤسسة غير نشطة.
8. فشل بوابة الأمان (اختبار ولي أمر بلا منحة يرى بيانات مؤسسية).

## 7. التراجع عن هذه الوثيقة

هذه الوثيقة تصف خطة ونتائج اختبار على قاعدة منفصلة. لا تُغيّر `sarh_db` ولا
تنشر كوداً. أي تنفيذ على القاعدة الأصلية يحتاج موافقة تنفيذ صريحة منفصلة بعد
عرض: SQL النهائي، نتائج الاختبارات، ونتائج `typecheck` و`test` و`lint` و
`build`، وخطة الاسترداد.
