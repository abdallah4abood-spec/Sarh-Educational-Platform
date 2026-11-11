-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PARENT', 'INSTITUTION_TEACHER', 'TEACHER', 'SUPERVISOR', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('KINDERGARTEN', 'EDUCATIONAL_CENTER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EnrollmentSource" AS ENUM ('PLATFORM_REFERRAL', 'INSTITUTION');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('PENDING', 'APPROVED', 'REVISION');

-- CreateEnum
CREATE TYPE "TrustStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('CENTER_ADMIN', 'SECRETARY', 'TEACHER', 'SUPERVISOR', 'STAFF');

-- CreateEnum
CREATE TYPE "GuardianLinkStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "GuardianAuditAction" AS ENUM ('LEGACY_IMPORTED', 'MIGRATED', 'REQUESTED', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SignalKind" AS ENUM ('ALERT', 'ACHIEVEMENT', 'INFO');

-- CreateEnum
CREATE TYPE "AnnouncementKind" AS ENUM ('HOLIDAY', 'SCHEDULE', 'MEETING');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('SIGNUP', 'ENROLLMENT', 'PAYMENT', 'VERIFICATION');

-- CreateEnum
CREATE TYPE "GrantStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PARENT',
    "roles" "Role"[] DEFAULT ARRAY[]::"Role"[],
    "emailVerified" TIMESTAMP(3),
    "termsAcceptedAt" TIMESTAMP(3),
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "InstitutionType" NOT NULL,
    "address" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "description" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "phone" TEXT,
    "email" TEXT,
    "trustStatus" "TrustStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "trustRequestedAt" TIMESTAMP(3),
    "trustNote" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "avatarUrl" TEXT,
    "parentId" TEXT,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentGuardian" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "GuardianLinkStatus" NOT NULL DEFAULT 'PENDING',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "relation" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentGuardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentJoinCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redeemedAt" TIMESTAMP(3),
    "redeemedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentJoinCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentGuardianEvent" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "linkId" TEXT,
    "guardianId" TEXT,
    "institutionId" TEXT,
    "action" "GuardianAuditAction" NOT NULL,
    "dedupeKey" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentGuardianEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL,
    "classId" TEXT,
    "commissionFee" DOUBLE PRECISION NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "source" "EnrollmentSource" NOT NULL DEFAULT 'PLATFORM_REFERRAL',
    "enrollmentStatus" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyLog" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attendance" BOOLEAN NOT NULL DEFAULT true,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "meals" TEXT,
    "activityPhotos" TEXT[],
    "pickupPerson" TEXT,
    "aiSummary" TEXT,
    "gradesJson" JSONB,
    "dayPlan" TEXT[],
    "homework" JSONB,
    "teacherNote" TEXT,

    CONSTRAINT "DailyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "institutionId" TEXT,
    "receiptUrl" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "ocrData" JSONB,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "lesson" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "questionsJson" JSONB NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolClass" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 20,
    "institutionId" TEXT NOT NULL,
    "teacherId" TEXT,
    "planProgress" INTEGER NOT NULL DEFAULT 0,
    "room" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimetableSlot" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT,
    "weekday" INTEGER NOT NULL,
    "startsAt" TEXT NOT NULL,
    "endsAt" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "room" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimetableSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'STAFF',
    "subjects" TEXT[],
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LessonPlan" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "gradeLevel" TEXT NOT NULL,
    "objectives" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'PENDING',
    "authorId" TEXT NOT NULL,
    "institutionId" TEXT,
    "classId" TEXT,
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "completeness" INTEGER NOT NULL DEFAULT 80,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LessonPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherEvaluation" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "classroomVisits" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualitySignal" (
    "id" TEXT NOT NULL,
    "kind" "SignalKind" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "scopeOwnerId" TEXT NOT NULL,
    "institutionId" TEXT,
    "subjectUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualitySignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "kind" "AnnouncementKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "institutionId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubjectPerformance" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "classAverage" INTEGER NOT NULL,

    CONSTRAINT "SubjectPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION,
    "actorId" TEXT,
    "institutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectoryChecklistItem" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectoryChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentGuardianGrant" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "status" "GrantStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentGuardianGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE INDEX "Institution_zone_type_idx" ON "Institution"("zone", "type");

-- CreateIndex
CREATE INDEX "Institution_trustStatus_idx" ON "Institution"("trustStatus");

-- CreateIndex
CREATE INDEX "Student_parentId_idx" ON "Student"("parentId");

-- CreateIndex
CREATE INDEX "StudentGuardian_userId_status_idx" ON "StudentGuardian"("userId", "status");

-- CreateIndex
CREATE INDEX "StudentGuardian_studentId_status_isPrimary_idx" ON "StudentGuardian"("studentId", "status", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGuardian_studentId_userId_key" ON "StudentGuardian"("studentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentJoinCode_code_key" ON "StudentJoinCode"("code");

-- CreateIndex
CREATE INDEX "StudentJoinCode_studentId_idx" ON "StudentJoinCode"("studentId");

-- CreateIndex
CREATE INDEX "StudentJoinCode_institutionId_expiresAt_idx" ON "StudentJoinCode"("institutionId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGuardianEvent_dedupeKey_key" ON "StudentGuardianEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "StudentGuardianEvent_studentId_createdAt_idx" ON "StudentGuardianEvent"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "StudentGuardianEvent_guardianId_createdAt_idx" ON "StudentGuardianEvent"("guardianId", "createdAt");

-- CreateIndex
CREATE INDEX "StudentGuardianEvent_linkId_createdAt_idx" ON "StudentGuardianEvent"("linkId", "createdAt");

-- CreateIndex
CREATE INDEX "Enrollment_institutionId_status_idx" ON "Enrollment"("institutionId", "status");

-- CreateIndex
CREATE INDEX "Enrollment_studentId_idx" ON "Enrollment"("studentId");

-- CreateIndex
CREATE INDEX "Enrollment_institutionId_source_idx" ON "Enrollment"("institutionId", "source");

-- CreateIndex
CREATE INDEX "DailyLog_studentId_date_idx" ON "DailyLog"("studentId", "date");

-- CreateIndex
CREATE INDEX "DailyLog_institutionId_date_idx" ON "DailyLog"("institutionId", "date");

-- CreateIndex
CREATE INDEX "PaymentTransaction_userId_status_idx" ON "PaymentTransaction"("userId", "status");

-- CreateIndex
CREATE INDEX "PaymentTransaction_institutionId_status_idx" ON "PaymentTransaction"("institutionId", "status");

-- CreateIndex
CREATE INDEX "PaymentTransaction_status_createdAt_idx" ON "PaymentTransaction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Quiz_subject_difficulty_idx" ON "Quiz"("subject", "difficulty");

-- CreateIndex
CREATE INDEX "SchoolClass_institutionId_gradeLevel_idx" ON "SchoolClass"("institutionId", "gradeLevel");

-- CreateIndex
CREATE INDEX "SchoolClass_teacherId_idx" ON "SchoolClass"("teacherId");

-- CreateIndex
CREATE INDEX "TimetableSlot_teacherId_weekday_idx" ON "TimetableSlot"("teacherId", "weekday");

-- CreateIndex
CREATE INDEX "StaffMember_institutionId_status_idx" ON "StaffMember"("institutionId", "status");

-- CreateIndex
CREATE INDEX "StaffMember_userId_status_idx" ON "StaffMember"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_userId_institutionId_key" ON "StaffMember"("userId", "institutionId");

-- CreateIndex
CREATE INDEX "LessonPlan_status_scheduledFor_idx" ON "LessonPlan"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "LessonPlan_authorId_idx" ON "LessonPlan"("authorId");

-- CreateIndex
CREATE INDEX "TeacherEvaluation_teacherId_idx" ON "TeacherEvaluation"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherEvaluation_supervisorId_idx" ON "TeacherEvaluation"("supervisorId");

-- CreateIndex
CREATE INDEX "QualitySignal_scopeOwnerId_createdAt_idx" ON "QualitySignal"("scopeOwnerId", "createdAt");

-- CreateIndex
CREATE INDEX "Announcement_institutionId_publishedAt_idx" ON "Announcement"("institutionId", "publishedAt");

-- CreateIndex
CREATE INDEX "Message_toUserId_readAt_idx" ON "Message"("toUserId", "readAt");

-- CreateIndex
CREATE INDEX "Message_fromUserId_idx" ON "Message"("fromUserId");

-- CreateIndex
CREATE INDEX "SubjectPerformance_institutionId_subject_idx" ON "SubjectPerformance"("institutionId", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "SubjectPerformance_studentId_institutionId_subject_term_key" ON "SubjectPerformance"("studentId", "institutionId", "subject", "term");

-- CreateIndex
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_type_createdAt_idx" ON "ActivityEvent"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DirectoryChecklistItem_institutionId_key_key" ON "DirectoryChecklistItem"("institutionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSetting_key_key" ON "SiteSetting"("key");

-- CreateIndex
CREATE INDEX "StudentGuardianGrant_institutionId_status_idx" ON "StudentGuardianGrant"("institutionId", "status");

-- CreateIndex
CREATE INDEX "StudentGuardianGrant_linkId_status_idx" ON "StudentGuardianGrant"("linkId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGuardianGrant_linkId_institutionId_key" ON "StudentGuardianGrant"("linkId", "institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE INDEX "VerificationToken_identifier_idx" ON "VerificationToken"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "Institution" ADD CONSTRAINT "Institution_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGuardian" ADD CONSTRAINT "StudentGuardian_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentJoinCode" ADD CONSTRAINT "StudentJoinCode_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentJoinCode" ADD CONSTRAINT "StudentJoinCode_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentJoinCode" ADD CONSTRAINT "StudentJoinCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentJoinCode" ADD CONSTRAINT "StudentJoinCode_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGuardianEvent" ADD CONSTRAINT "StudentGuardianEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGuardianEvent" ADD CONSTRAINT "StudentGuardianEvent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "StudentGuardian"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGuardianEvent" ADD CONSTRAINT "StudentGuardianEvent_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGuardianEvent" ADD CONSTRAINT "StudentGuardianEvent_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyLog" ADD CONSTRAINT "DailyLog_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimetableSlot" ADD CONSTRAINT "TimetableSlot_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_classId_fkey" FOREIGN KEY ("classId") REFERENCES "SchoolClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonPlan" ADD CONSTRAINT "LessonPlan_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherEvaluation" ADD CONSTRAINT "TeacherEvaluation_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherEvaluation" ADD CONSTRAINT "TeacherEvaluation_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualitySignal" ADD CONSTRAINT "QualitySignal_scopeOwnerId_fkey" FOREIGN KEY ("scopeOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectPerformance" ADD CONSTRAINT "SubjectPerformance_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubjectPerformance" ADD CONSTRAINT "SubjectPerformance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectoryChecklistItem" ADD CONSTRAINT "DirectoryChecklistItem_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGuardianGrant" ADD CONSTRAINT "StudentGuardianGrant_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "StudentGuardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGuardianGrant" ADD CONSTRAINT "StudentGuardianGrant_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
