"use client";

/** Replays the navigation once the service worker reports connectivity. */
export function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="sarh-btn-primary w-full"
    >
      إعادة المحاولة
    </button>
  );
}
