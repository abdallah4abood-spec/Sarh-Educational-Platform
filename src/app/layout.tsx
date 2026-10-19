import type { Metadata, Viewport } from "next";

import { AppProviders } from "@/components/providers/app-providers";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  title: {
    default: "صَرْح | منصة ربط الأهالي بالمراكز التعليمية",
    template: "%s | صَرْح",
  },
  description:
    "صَرْح (SARH): منصة فلسطينية تربط الأهالي برواضي الطفولة المبكرة (5–7 سنوات) ومراكز التحضير والتوجيهي (8–18 سنة)، مع متابعة يومية، حضور غير متصل، وروبوت ذكاء اصطناعي للمعلمين.",
  applicationName: "صَرْح",
  manifest: "/manifest.json",
  keywords: [
    "صَرْح",
    "SARH",
    "روضة",
    "تربية",
    "توجيهي",
    "مراكز تأهيل",
    "غزة",
    "متابعة يومية",
    "حضور",
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "صَرْح",
  },
  openGraph: {
    type: "website",
    locale: "ar_AR",
    siteName: "صَرْح",
    title: "صَرْح | منصة ربط الأهالي بالمراكز التعليمية",
    description:
      "احجز مقعداً، تابع يوم طفلك، وأتمت مهام المعلمين بالذكاء الاصطناعي — منصة صَرْح.",
    images: ["/icons/icon-512.svg"],
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: "/icons/icon-192.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#081325" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // RTL-first: Arabic is the default direction, `lang` matches `dir`.
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* Fonts are loaded at runtime (no build-time fetch) for offline resiliency. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Tajawal:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-background font-arabic text-foreground antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
