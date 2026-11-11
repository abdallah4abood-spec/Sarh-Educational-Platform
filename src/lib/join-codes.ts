import { createHash, randomInt } from "node:crypto";

/**
 * Student join codes — pure rules, no database, no session.
 *
 * A code is the institution's *written offer* to hand a student's records to a
 * guardian account: whoever holds a live code may redeem it, so the code is
 * treated as a bearer secret.
 *
 * Three consequences shape this module:
 *
 *   • **Never stored in clear.** `hashJoinCode` produces the only value that
 *     reaches `StudentJoinCode.code`; the plaintext exists in the issuing
 *     response and nowhere else. A database dump therefore contains no usable
 *     code.
 *   • **Readable over the phone.** Crockford base32 without `I`, `L`, `O`, `U`,
 *     in two groups of four plus two, so a guardian can read it aloud without
 *     ambiguity. `normalizeJoinCode` reverses the common confusions
 *     (`O → 0`, `I/L → 1`) and strips spaces and dashes.
 *   • **Short-lived.** Fourteen days, single use, one live code per student per
 *     institution (issuing a new one expires the previous).
 *
 * This file is server-only (`node:crypto`): the client receives the formatted
 * code as data, never re-derives it.
 */

export const JOIN_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const JOIN_CODE_LENGTH = 10;
export const JOIN_CODE_TTL_DAYS = 14;
export const JOIN_CODE_TTL_MS = JOIN_CODE_TTL_DAYS * 24 * 60 * 60 * 1000;

/** What `normalizeJoinCode` must produce; 32^10 ≈ 2^50 possibilities. */
export const JOIN_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/;

/** Characters a human confuses when reading the code aloud. */
const CONFUSABLE: Record<string, string> = {
  O: "0",
  I: "1",
  L: "1",
};

/** Uppercase, strip separators, and resolve the ambiguous letters. */
export function normalizeJoinCode(raw: string): string {
  const compact = raw.replace(/[\s\-_]/g, "").toUpperCase();
  let normalized = "";
  for (const character of compact) {
    normalized += CONFUSABLE[character] ?? character;
  }
  return normalized;
}

/** `ABCD1234EF` → `ABCD-1234-EF`, the shape the UI shows. */
export function formatJoinCode(code: string): string {
  return code.replace(/^(.{4})(.{4})(.{2})$/, "$1-$2-$3");
}

/** A fresh code from a cryptographically strong source. */
export function generateJoinCode(): string {
  let code = "";
  for (let index = 0; index < JOIN_CODE_LENGTH; index += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(0, JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * The stored form of a code.
 *
 * The `sha256:` prefix makes the column self-describing (`code` holds a digest,
 * not a secret) and keeps the value stable if a different scheme is ever
 * introduced. The prefix inside the digest input is a domain separator, not a
 * secret: a hash of the bare code would be reusable against any other table.
 */
export function hashJoinCode(code: string): string {
  return `sha256:${createHash("sha256")
    .update(`sarh:join-code:${code}`)
    .digest("hex")}`;
}

/** `now + 14 days`, in one place so the UI and the server agree. */
export function joinCodeExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + JOIN_CODE_TTL_MS);
}
