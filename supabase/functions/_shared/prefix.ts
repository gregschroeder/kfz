/**
 * Shared KFZ prefix normalization for edge functions.
 * Keeps A–Z / ÄÖÜ only (case-insensitive), uppercases, max 3 chars.
 */
export function normalizePrefix(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[^a-zA-ZäöüÄÖÜ]/gu, "")
    .toLocaleUpperCase("de-DE")
    .slice(0, 3);
}
