/**
 * Saudi/Gaza-style phone handling for the SARH auth suite.
 *
 * Email is the account anchor, but a registered phone number works as an
 * alternate identifier for sign-in and password recovery. Users type numbers
 * however their keyboard offers them, so every comparison happens on a
 * normalised form instead of the raw string.
 *
 * Arabic-Indic (٠١٢٣…) and Extended Arabic-Indic (۰۱۲۳…) digits are folded to
 * ASCII because a Palestinian keyboard frequently produces them, and pasted
 * numbers arrive with spaces, dashes or parentheses.
 */

const ARABIC_INDIC = /[\u0660-\u0669]/g;
const EXTENDED_ARABIC_INDIC = /[\u06F0-\u06F9]/g;

/** Digits of the national significant number used for fuzzy matching. */
export const PHONE_MATCH_DIGITS = 9;

/** Folds Arabic-Indic digits to ASCII and strips everything that is not one. */
function digitsOf(value: string): string {
  return value
    .replace(ARABIC_INDIC, (digit) =>
      String(digit.charCodeAt(0) - 0x0660)
    )
    .replace(EXTENDED_ARABIC_INDIC, (digit) =>
      String(digit.charCodeAt(0) - 0x06f0)
    )
    .replace(/\D/g, "");
}

/**
 * Normalises a phone number to `+<digits>`, or returns `null` when the input
 * cannot be a phone number at all.
 *
 * A local number written without a country code (`0599…`) is stored as-is with
 * a leading `+`, so the platform never invents a country: lookups fall back to
 * a suffix match (see `phoneMatchSuffix`) which makes `0599000000` and
 * `+970599000000` resolve to the same account.
 */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let digits = digitsOf(trimmed);

  // `00<country>` is the international prefix dialled on landlines and is
  // equivalent to a leading `+`.
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.length < 7 || digits.length > 15) return null;

  return `+${digits}`;
}

/** True when the string is a usable phone number (7–15 digits). */
export function isPhoneNumber(raw: string): boolean {
  return normalizePhone(raw) !== null;
}

/** Last `PHONE_MATCH_DIGITS` digits, used for the tolerant lookup. */
export function phoneMatchSuffix(normalized: string): string | null {
  const digits = digitsOf(normalized);
  if (digits.length < PHONE_MATCH_DIGITS) return null;
  return digits.slice(-PHONE_MATCH_DIGITS);
}

/**
 * True when the value looks like an email address. Deliberately loose: the
 * caller re-validates with zod, this only decides *how* to look the account up.
 */
export function looksLikeEmail(value: string): boolean {
  return value.includes("@");
}

/** Digits-only comparison between a stored number and a freshly typed one. */
export function samePhoneNumber(a: string, b: string): boolean {
  const left = phoneMatchSuffix(a);
  const right = phoneMatchSuffix(b);
  if (left && right) return left === right;
  return digitsOf(a) === digitsOf(b);
}
