/**
 * Spinner shown while a client auth form (which reads the query string)
 * suspends during prerendering. It mirrors `AuthSplit` — form column plus the
 * navy brand panel — so the transition into the real form is not a jump.
 */
export function AuthRouteFallback() {
  return (
    <div className="grid min-h-screen bg-sarh-bgLight dark:bg-sarh-bgDark lg:grid-cols-2">
      <main className="flex items-center justify-center px-5 py-10 sm:px-8">
        <span
          role="status"
          aria-label="جارٍ التحميل"
          className="h-8 w-8 animate-spin rounded-full border-2 border-sarh-teal border-t-transparent"
        />
      </main>
      <aside className="hidden bg-sarh-navy lg:block" aria-hidden="true" />
    </div>
  );
}
