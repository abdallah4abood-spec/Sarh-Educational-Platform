# AGENT INSTRUCTIONS & ARCHITECTURE SPECIFICATIONS (`Agent.md`)

## 1. Role & Identity
You are a Senior Full-Stack Architect, Lead UI/UX Engineer, and AI Systems Specialist. Your mission is to autonomously design, construct, optimize, and maintain the entire full-stack codebase for the **SARH (صَرْح)** platform.

You must strictly enforce:
1. **Clean Architecture & Design Patterns:** Modular code, single responsibility principle, typed contracts, and zero coupling between microservices.
2. **Low-Bandwidth Resiliency:** Optimization for low-latency and offline execution (specifically tailored for Gaza's network constraints).
3. **UI/UX Consistency:** Strict adherence to brand tokens, dual-theme styling, and native RTL-first layout structures.

---

## 2. Project Vision & Core Stack Specifications

**SARH (صَرْح)** is an offline-first Progressive Web App (PWA) designed to connect parents with private kindergartens (ages 5–7) and educational/Tawjihi centers (ages 8–18). It streamlines institutional operations, tracks student growth, automates teacher tasks via AI, and manages localized commission-based registrations.

### Comprehensive Technology Stack

* **Frontend Framework:** Next.js 14+ (App Router architecture, React 18+, Server Components by default, Client Components only when interactive state is required).
* **Styling & UI Library:** Tailwind CSS, Shadcn UI components, Lucide React Icons, Framer Motion for micro-interactions.
* **Form Validation & State:** React Hook Form + Zod validation schemas.
* **Localization & Theme System:**
  * **Language & Direction:** Native Arabic (`dir="rtl"`) as default, English (`dir="ltr"`) toggle via custom context/dictionary.
  * **Theme:** Native Light Mode & Dark Mode using CSS variables and `next-themes`.
* **Backend & API Layer:**
  * **Core API:** Next.js API Routes (Route Handlers).
  * **Database & ORM:** PostgreSQL managed via Prisma ORM with strict type safety.
  * **Auth & Security:** NextAuth.js / JWT with Role-Based Access Control (RBAC): `PARENT`, `INSTITUTION_TEACHER`, `SUPER_ADMIN`.
* **AI Microservice:**
  * **Engine:** Python FastAPI microservice (`/ai_service`).
  * **LLM & OCR Integration:** OpenAI API (GPT-4o), Anthropic Claude API, or Google Gemini API for Quiz Generation, Automated OCR Receipt Processing, and Daily Log Summarization.
* **PWA & Offline Infrastructure:**
  * `next-pwa` service workers for caching shell assets and static data.
  * `IndexedDB` (via `Dexie.js`) for storing offline mutations (e.g., local attendance taking) that auto-sync via a background queue upon reconnection.
  * Client-side WebP image compression pipeline (`browser-image-compression`) before uploading user receipts or daily photos.

---

## 3. Brand Identity Guidelines & Design System Tokens

All generated CSS, Tailwind configurations, and UI components must strictly utilize these design tokens:

### Color Palette Definitions
```javascript
// tailwind.config.js extension tokens
colors: {
  sarh: {
    teal: '#00A99D',       // Primary Brand: Growth, Primary Actions, Active States
    gold: '#F2994A',       // Secondary / Accent: Highlights, Notifications, Badges
    navy: '#0F2C59',       // Deep Navy: Primary Text (Light Mode), Dark Mode Surfaces
    bgLight: '#F8FAFC',    // Light Mode Background Surface
    bgDark: '#081325',     // Dark Mode Root Background Surface
    cardLight: '#FFFFFF',  // Light Mode Card Surface
    cardDark: '#0F1E36',   // Dark Mode Card Surface
    borderLight: '#E2E8F0',// Light Mode Border Color
    borderDark: '#1E293B', // Dark Mode Border Color
  }
}
Typography & Fonts
Primary Arabic Fonts: 'Readex Pro', 'Tajawal', sans-serif.

Primary English Fonts: 'Plus Jakarta Sans', system-ui, sans-serif.

Visual Effects & Elevation
Soft Shadows: box-shadow: 0 4px 20px -2px rgba(15, 44, 89, 0.08)

Glassmorphism Overlays: backdrop-filter: blur(12px) saturate(160%)

Border Radius: Cards (16px / rounded-2xl), Buttons (8px / rounded-lg), Modals (24px / rounded-3xl).
4. Proposed Project Folder Architecture
Keep the project organized under this modular layout:
Sarh_project/
├── ai_service/             # Python FastAPI Microservice
│   ├── main.py
│   ├── routers/
│   │   ├── quiz.py
│   │   ├── ocr.py
│   │   └── summary.py
│   └── requirements.txt
├── prisma/
│   └── schema.prisma
├── public/
│   ├── icons/
│   └── manifest.json
├── src/
│   ├── app/                # Next.js App Router
│   │   ├── (auth)/         # Auth routes (login, register)
│   │   ├── (public)/       # Landing Page & Discovery Hub
│   │   ├── parent/         # Parent Portal
│   │   ├── institution/    # Institution & Teacher Portal
│   │   ├── admin/          # Super Admin Dashboard
│   │   └── api/            # API Route Handlers
│   ├── components/         # Shared & Shadcn UI Components
│   ├── lib/                # Prisma client, NextAuth, Dexie DB & Sync Logic
│   ├── hooks/              # Custom hooks (e.g., useOfflineSync)
│   ├── middleware.ts       # Route guards based on user RBAC roles
│   └── types/              # TypeScript definitions
└── tailwind.config.js
5. Prisma Database Schema & Data Models
Ensure the schema file (prisma/schema.prisma) includes the following core models:
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  PARENT
  INSTITUTION_TEACHER
  SUPER_ADMIN
}

enum InstitutionType {
  KINDERGARTEN       // Ages 5-7
  EDUCATIONAL_CENTER // Ages 8-18 (Tawjihi)
}

enum PaymentStatus {
  PENDING
  VERIFIED
  REJECTED
}

model User {
  id            String               @id @default(uuid())
  fullName      String
  email         String               @unique
  phoneNumber   String
  passwordHash  String
  role          Role                 @default(PARENT)
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt

  students      Student[]            // For Parents
  institutions  Institution[]        // For Institution Owners/Staff
  payments      PaymentTransaction[]
}

model Institution {
  id            String               @id @default(uuid())
  name          String
  type          InstitutionType
  address       String
  zone          String
  description   String?
  rating        Float                @default(5.0)
  ownerId       String
  owner         User                 @relation(fields: [ownerId], references: [id])
  students      Enrollment[]
  logs          DailyLog[]
  createdAt     DateTime             @default(now())

  @@index([zone, type])
}

model Student {
  id            String               @id @default(uuid())
  fullName      String
  dateOfBirth   DateTime
  parentId      String
  parent        User                 @relation(fields: [parentId], references: [id])
  enrollments   Enrollment[]
  logs          DailyLog[]
}

model Enrollment {
  id            String               @id @default(uuid())
  studentId     String
  student       Student              @relation(fields: [studentId], references: [id])
  institutionId String
  institution   Institution          @relation(fields: [institutionId], references: [id])
  gradeLevel    String
  commissionFee Float
  status        PaymentStatus        @default(PENDING)
  createdAt     DateTime             @default(now())
}

model DailyLog {
  id             String              @id @default(uuid())
  studentId      String
  student        Student             @relation(fields: [studentId], references: [id])
  institutionId  String
  institution    Institution         @relation(fields: [institutionId], references: [id])
  date           DateTime            @default(now())
  attendance     Boolean             @default(true)
  meals          String?             // For Kindergartens
  activityPhotos String[]            // WebP Image URLs
  pickupPerson   String?             // Authorized person name/photo URL
  aiSummary      String?             // Generated daily summary for parents
  gradesJson     Json?               // For Centers (Homework, quiz scores)

  @@index([studentId, date])
}

model PaymentTransaction {
  id            String               @id @default(uuid())
  userId        String
  user          User                 @relation(fields: [userId], references: [id])
  receiptUrl    String
  amount        Float
  status        PaymentStatus        @default(PENDING)
  ocrData       Json?                // Extracted fields by AI microservice
  createdAt     DateTime             @default(now())
}

model Quiz {
  id            String               @id @default(uuid())
  subject       String
  lesson        String
  difficulty    String
  questionsJson Json
  createdAt     DateTime             @default(now())
}
6. Detailed Modular Architecture & Route Breakdown
Module 1: Public Landing Page & Discovery (/)
Hero Section: Cinematic high-impact greeting with search CTA and background video/poster optimization.

Directory Search Hub (/explore): Dynamic client/server filtering by Zone (المنطقة), Age Tier (المرحلة العمريّة), Price, and Rating.

Center Detail & Booking Modal (/center/[id]): Complete profile display with photo gallery, features, location map, and an interactive "Book Seat Now" (حجز مقعد الآن) modal with receipt upload.

Module 2: Parent Portal (/parent)
Dashboard Overview (/parent/dashboard): Summary cards for enrolled children.

Child Daily Feed (/parent/feed):

Kindergarten View (5–7): Timeline showing attendance status, meals, activity photo gallery, and authorized pickup person verification badge.

Center / Tawjihi View (8–18): Grade tracking, homework checklist, and the AI Daily Summary paragraph.

Payment History (/parent/payments): Status of uploaded bank transfers and Jawwal Pay receipts.

Module 3: Institution & Teacher Portal (/institution)
Attendance & Log Studio (/institution/daily-log): Quick 1-click attendance checklist with offline-first local saving (Dexie.js) and auto-sync.

AI Teacher Studio (/institution/ai-studio): Form interface accepting Subject, Lesson, and Difficulty Level to call Python FastAPI and generate structured interactive quizzes/exams.

Enrollment & Revenue Table (/institution/enrollments): Table showing incoming students referred by Sarh and commission verification statuses.

Module 4: Super Admin Dashboard (/admin)
Approvals Queue (/admin/approvals): Verification and onboarding flow for newly registered schools/centers.

Financial Hub & OCR Reconciler (/admin/finance): Side-by-side view comparing uploaded payment receipts against AI OCR extracted values (Amount, Transaction ID, Payer Name) for 1-click verification.

7. Execution Roadmap & Phase-by-Phase Instructions
Execute all tasks sequentially following this phase structure:

Phase 1: Environment Initialization & PWA Infrastructure
Initialize Next.js App Router inside Sarh_project.

Install dependencies: @prisma/client, prisma, next-auth, tailwindcss, lucide-react, framer-motion, next-themes, next-pwa, dexie, browser-image-compression, zod, react-hook-form.

Configure tailwind.config.js with the exact brand color tokens.

Set up manifest.json and service worker caching rules for PWA offline capabilities.

Phase 2: Core Data Layer & Authentication API
Create prisma/schema.prisma with all models specified above.

Generate Prisma Client and configure database connection pooling.

Implement NextAuth.js credentials provider with bcrypt password hashing and JWT role management.

Add middleware.ts to protect portal routes based on User Roles (PARENT, INSTITUTION_TEACHER, SUPER_ADMIN).

Phase 3: Python FastAPI AI Microservice Construction
Build a Python FastAPI server under ai_service/.

Endpoint 1: /api/ai/generate-quiz (Receives subject/lesson -> returns structured quiz JSON).

Endpoint 2: /api/ai/ocr-receipt (Receives image -> extracts text & transaction values via Vision API).

Endpoint 3: /api/ai/summarize-log (Receives raw teacher notes -> generates warm parent summary).

Phase 4: Shared Component Library & Theme Engine
Build Navbar with Language Toggle (AR/EN), Theme Switcher (Light/Dark), and User Profile drop-down.

Build reusable UI components: Card, Button, Modal, DataTable, Badge, FileInput with image compression.

Phase 5: Page Construction & Integration
Build Public Landing Page & Discovery Hub.

Build Parent Portal and Child Daily Feed interfaces.

Build Institution Portal & AI Teacher Studio.

Build Super Admin Financial Reconciliation Workspace.

8. Strict Execution Rules for the AI Agent
No Omission of Code: Always provide full, runnable, functional TypeScript and Python code blocks. Avoid placeholders like // TODO: implement later.

PWA-First Performance: All images must use next/image with WebP formatting. Client-side compression must execute prior to upload. Keep bundle size lightweight.

Optimistic UI Updates & Offline Support: Attendance and log updates must save to IndexedDB immediately, sync to the server when connected, and reflect in the UI without lag.

Locale Default & Form Validation: Default text, labels, Zod error messages, and UI strings must be written in modern, clear Arabic (Fusha), with English dictionary fallbacks.
