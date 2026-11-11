# المرحلة 4.4 — دعوات الطاقم وسجل التدقيق العام

يوثّق هذا الملف ما نُفِّذ فعليًا في المرحلة 4.4: المخطط، الخدمة الوحيدة، الواجهات،
وحدود ما يمكن وما لا يمكن لهذه المرحلة. القرارات المعمارية D1–D6 مقفلة ولم تُعد
مناقشتها هنا.

## 1. القرارات المطبَّقة

| القرار | التطبيق |
|---|---|
| D1 — سجل تدقيق عام | `AuditLog` بـ`action`/`entityType` نصيين (بلا enum) كي لا تحتاج كل عملية جديدة ترحيلًا |
| D2 — PARENT + عضوية | قبول الدعوة لا يكتب `User.role` ولا `User.roles`؛ الشريحة تُشتق حيًّا من العضوية |
| D3 — `Institution.ownerId` مصدر الملكية | غير مكتوب في أي مسار دعوة، ومعروض للقراءة فقط في D6 |
| D5 — عزل المعلم | تعتمد الدعوات على نفس `resolveInstitutionAccess`؛ لا مسار وصول بيانات جديد |
| D6 — شاشة SUPER_ADMIN واحدة | `/admin/institutions/[id]/staff`، دور واحد فقط: `CENTER_ADMIN` |

## 2. المخطط

```prisma
enum StaffInvitationStatus { PENDING ACCEPTED REVOKED EXPIRED }

model StaffInvitation {
  id, institutionId, email, role, title, subjects,
  tokenHash @unique, status, invitedById,
  expiresAt, acceptedAt?, acceptedById?, revokedAt?, revokedById?,
  createdAt, updatedAt
}

model AuditLog {
  id, action, entityType, entityId, actorId?, actorRole?,
  institutionId?, metadata Json?, createdAt
}
```

نقاط مقصودة:

- **`StaffInvitation` مستقل عن `StaffMember`**، ولم يُضف `INVITED` إلى `StaffStatus`.
  لذلك يبقى سجل الطاقم قائمة بمن يعمل فعلًا في المركز.
- **`tokenHash` هو الشكل الوحيد المخزَّن** (SHA-256 مع فاصل نطاق
  `sarh:staff-invitation:`)، مطابقًا لنمط `hashJoinCode`. التوكن نصّي 256 بت
  (32 بايت base64url) ويظهر في الرابط ورسالة البريد فقط.
- **`email` مخزَّن مُطبَّعًا** (trim + lower-case) لأن القبول يقارنه بعنوان الحساب
  بنفس التطبيع.
- **`AuditLog` بلا علاقات** (`actorId`/`institutionId` أعمدة نصية): سجل التدقيق
  دليل، ويجب أن يبقى مقروءًا بعد حذف الحساب أو المركز. لا توكنات ولا `tokenHash`
  ولا روابط في `metadata`.
- `StaffInvitation.institution` بـ`onDelete: Cascade` (دعوة بلا مركز لا معنى لها)،
  بخلاف `StudentGuardianGrant` الذي يسجل قرارًا تاريخيًا.

الترحيل: `prisma/migrations/20251108133000_staff_invitations_audit/migration.sql` —
إضافي بالكامل: `CREATE TYPE` واحد، `CREATE TABLE` ×2، 7 فهارس، مفتاح أجنبي واحد،
بلا أي `DROP`/`ALTER` على جداول قائمة.

## 3. الخدمة الوحيدة

`src/lib/db/staff-invitations.ts` هو المسار الوحيد للكتابة، ويستخدمه:

- `src/app/api/institution/staff/invitations/**` (بوابة المؤسسة)،
- `src/app/api/admin/institutions/[id]/staff/**` (D6).

الترخيص يصل إلى الخدمة كـ`InvitationActor` لا يمكن بناؤه إلا من الخادم:

- `institutionInvitationActor(access)` — من `InstitutionAccess` مُتحقَّق منه من
  قاعدة البيانات (ملكية أو عضوية `CENTER_ADMIN` نشطة)، ويشترط قدرة `staff.invite`.
- `superAdminInvitationActor(userId, institutionId)` — يُستدعى فقط بعد
  `requireLiveSuperAdmin`.

### مصفوفة الأدوار (مُطبَّقة في `INVITABLE_ROLES`)

| المُرسِل | TEACHER | SECRETARY | CENTER_ADMIN |
|---|---|---|---|
| OWNER | ✅ | ✅ | ✅ |
| CENTER_ADMIN | ✅ | ✅ | ❌ |
| SUPER_ADMIN (D6) | ❌ | ❌ | ✅ |

`SUPERVISOR` و`STAFF` خارج نطاق الدعوات في هذه المرحلة، والخدمة ترفضهما
بـ`ROLE_NOT_INVITABLE` (403).

### دورة الحياة

- **الإنشاء:** بريد مطبَّع + دور مسموح. قفل استشاري على
  `staff-invitation:issue:<institution>:<email>` يمنع إرسالين متوازيين من إنشاء
  دعوتين. إن وُجدت دعوة حيّة لنفس البريد في المركز → 409 `INVITATION_PENDING`
  («أعد الإرسال بدل إنشاء دعوة جديدة»). إن كان البريد لعضو قائم → 409
  (`ALREADY_MEMBER` أو `MEMBERSHIP_CONFLICT`).
- **إعادة الفتح:** إن وُجدت دعوة `REVOKED`/`EXPIRED` لنفس البريد، تُعاد الدعوة
  نفسها (نفس `id`) بتوكن جديد، مع سجل `STAFF_INVITATION.REOPENED` يحمل الحالة
  السابقة. لا يُنشأ صف ثانٍ يمكن أن يخالف الأول.
- **إعادة الإرسال:** تدوير التوكن وتمديد الصلاحية. الرابط القديم يموت لحظة
  التحديث لأن `tokenHash` يُستبدل. مقبولة → 409.
- **السحب:** `REVOKED` + `revokedAt/By` + سجل. السحب المتكرر عملية لا أثر لها.
  المقبولة لا تُسحب (409) — تُعدَّل العضوية بدل ذلك.
- **الانتهاء:** مشتق من `expiresAt` (`effectiveInvitationStatus`) كي لا يعتمد على
  مهمة مجدولة، ويُثبَّت `EXPIRED` عند أول محاولة قبول.
- **القبول:** يتحقق من (1) توكن حيّ، (2) تطابق البريد المطبَّع، (3) `emailVerified`
  من صف `User` الحيّ لا من JWT، (4) عدم وجود عضوية قائمة. ثم داخل معاملة واحدة:
  إنشاء `StaffMember` نشط + `ACCEPTED` + `AuditLog`. أي فشل في التدقيق يتراجع عن
  العضوية لأن الكتابتين تستخدمان نفس `tx`.

### البريد

`sendStaffInvitationEmail` في `src/lib/email.ts` يستخدم `sendEmail` نفسه. عند غياب
`RESEND_API_KEY` أو رفض المزوّد، تعيد الواجهة `201` مع `emailSent: false` و
`acceptPath` (الرابط) و`emailFailure` — لا يُعرض إرسال ناجح لم يحدث. الرابط لا
يُعاد عندما ينجح الإرسال فعلًا.

## 4. الواجهات

| المسار | الغرض |
|---|---|
| `/institution/staff` | لوحة «دعوات الانضمام» داخل صفحة الطاقم القائمة |
| `/admin/institutions/[id]/staff` | D6: دعوات `CENTER_ADMIN` لمؤسسة واحدة |
| `/invitations/accept?token=…` | صفحة القبول (خارج كل بوابة) |

- `/invitations/accept` خارج البوابات عمدًا: المدعو قد يكون حساب `PARENT` بلا
  شريحة معلم، فبوابة محمية كانت ستصرفه قبل القبول. تسجيل الدخول مطلوب، ويعود
  المتصفح إلى الرابط نفسه بعد الدخول عبر `callbackUrl`.
- القبول ضغطة صريحة لا `useEffect`: فتح الرابط تلقائيًا (فاحص بريد) لا يستهلك الدعوة.
- بعد النجاح: `useSession().update({})` ثم `router.refresh()` ثم انتقال إلى بوابة
  الدور. إعادة الحساب تحدث في الخادم من قاعدة البيانات.
- `SECRETARY` لا تُحوَّل إلى `/teacher`: القبول ينشئ العضوية فقط، والشريحة المشتقة
  تبقى `PARENT` حتى تُمنح بوابة سكرتارية في مرحلة لاحقة.

## 5. الحماية في المسارات

- `isSameOriginRequest` (`src/lib/http/same-origin.ts`) على كل كتابة جديدة: مطابقة
  `Origin` تامة، وغياب الترويسة = رفض. لا يوجد CSRF token؛ الحماية مكمّلة لسياسة
  الكوكي `SameSite` وليست بديلًا عن المصادقة.
- D6: `requireLiveSuperAdmin` في كل معالج (قراءة أو كتابة)، و`institutionExists`
  قبل أي عمل، والدور ثابت في الخادم — مخطط جسم الطلب في D6 **لا يحتوي حقل دور**.
- دعوة من مركز آخر: `INVITATION_NOT_FOUND` (404) لا 403، حتى لا يؤكد وجود المعرّف.
- حدود المعدل: `checkRateLimit` في الإنشاء (لكل مُرسِل) والقبول (لكل حساب). القيود
  الفعلية: داخل العملية الواحدة، تُصفَّر عند إعادة التشغيل، ولا تحمي من مهاجم موزَّع.

## 6. الاختبارات

`tests/staff-invitations.test.ts` — 15 اختبارًا على PostgreSQL حقيقي:
المصفوفة، تخزين الـhash فقط، رفض التكرار، تدوير التوكن، إعادة الفتح بعد السحب،
الانتهاء، تطابق البريد والتحقق، رفض العضوية القائمة وغير النشطة، عزل المركز الآخر،
رفض مصدر مختلف، تخطيط أخطاء الـhandler، وفرض D6 لدور `CENTER_ADMIN`.

غير المغطّى آليًا: كتابة الكوكي عبر `Set-Cookie`، وتجربة الواجهة في متصفح. التفاصيل
في `docs/testing/d5-manual-session-verification.md`.

## 7. قيود معروفة

1. **لا إلغاء تلقائي لروابط البريد القديمة في صندوق الوارد** — إعادة الإرسال تُبطل
   التوكن، لكن الرسالة القديمة تبقى؛ الضغط عليها يعطي «الدعوة غير صالحة».
2. **الانتهاء كسول**: لا مهمة مجدولة تحوّل `PENDING` إلى `EXPIRED`؛ الحالة تُحسب
   عند القراءة وتُثبَّت عند محاولة قبول.
3. **`SECRETARY` بلا بوابة**، فقبولها ينشئ عضوية لا واجهة.
4. **الدعوة لا تنشئ حسابًا**: البريد بلا حساب يبقى `PENDING`، ولا يُنشأ حساب نيابةً
   عنه (تسجيل الحساب يبقى مسار المستخدم نفسه).
5. **حدود المعدل في العملية الواحدة** فقط.
