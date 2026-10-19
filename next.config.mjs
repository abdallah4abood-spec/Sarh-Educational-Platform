import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  // Keep hot-reload predictable during development; PWA caches are for production.
  disable: process.env.NODE_ENV === "development",
  fallbacks: {
    // Offline page served whenever navigation cannot reach the network
    // and is not present in the Next.js route cache.
    document: "/offline",
  },
  runtimeCaching: [
    {
      // Next.js static/media assets (hashed → safe to cache aggressively).
      urlPattern: /\/_next\/static\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "sarh-next-static",
        expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // Images → WebP first, small offline cache (offline-first resiliency).
      urlPattern: /\/_next\/image\?.*/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "sarh-next-images",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|webp|gif|avif|ico)$/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "sarh-images",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // Fonts & Google Fonts stylesheets.
      urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "sarh-google-fonts",
        expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // Static JSON/API cache-first for offline reads.
      urlPattern: /\/api\/(auth|public)\/.*/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "sarh-api-public",
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 12 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      // Everything else → network first with offline fallback.
      urlPattern: /.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "sarh-pages",
        expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
        networkTimeoutSeconds: 8,
        cacheableResponse: { statuses: [0, 200] },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Static SVG logos are optimized locally; remote sources stay explicit.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  eslint: {
    dirs: ["src"],
  },
  /**
   * `/learn` was a self-contained e-learning microsite with its own header and
   * footer. It is now the platform's course directory at `/courses`, served by
   * the shared chrome, so the old URL forwards instead of 404-ing.
   */
  async redirects() {
    return [
      {
        source: "/learn",
        destination: "/courses",
        permanent: true,
      },
    ];
  },
};

export default withPWA(nextConfig);
