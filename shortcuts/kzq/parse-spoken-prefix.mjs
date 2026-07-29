/**
 * Spoken-prefix parser for KZQ (Watch shortcut mirrors this).
 *
 * Tokens (whitespace-separated), in order:
 *   backspace | delete  → drop last character
 *   clear | erase | reset → clear
 *   otherwise → append letters only (incl. ÄÖÜ), uppercase, cap at 3
 *
 * @param {string} raw
 * @returns {string}
 */
export function parseSpokenPrefix(raw) {
  let out = "";
  const tokens = String(raw ?? "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);

  for (const token of tokens) {
    const lower = token
      .normalize("NFC")
      .replace(/[^a-zA-Z]/gu, "")
      .toLocaleLowerCase("en-US");
    if (lower === "backspace" || lower === "delete") {
      out = out.slice(0, -1);
      continue;
    }
    if (lower === "clear" || lower === "erase" || lower === "reset") {
      out = "";
      continue;
    }
    const letters = token
      .normalize("NFC")
      .replace(/[^a-zA-ZäöüÄÖÜ]/gu, "")
      .toLocaleUpperCase("de-DE");
    if (!letters) continue;
    out = (out + letters).slice(0, 3);
  }

  return out;
}

/** Final field sanitize after confirm/edit (letters, uppercase, max 3). */
export function normalizePrefixField(raw) {
  return String(raw ?? "")
    .normalize("NFC")
    .replace(/[^a-zA-ZäöüÄÖÜ]/gu, "")
    .toLocaleUpperCase("de-DE")
    .slice(0, 3);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cases = [
    ["A B C backspace A", "ABA"],
    ["A B C backspace. A", "ABA"],
    ["a b c delete", "AB"],
    ["M X clear B", "B"],
    ["ABC erase", ""],
    ["ä ö reset ü", "Ü"],
    ["A 1 B ! C", "ABC"],
    ["backspace", ""],
    ["hello", "HEL"],
    ["  A   B  ", "AB"],
  ];
  let failed = 0;
  for (const [input, expected] of cases) {
    const got = parseSpokenPrefix(input);
    if (got !== expected) {
      console.error(`FAIL ${JSON.stringify(input)} → ${JSON.stringify(got)} (want ${JSON.stringify(expected)})`);
      failed++;
    }
  }
  if (normalizePrefixField("ab12!") !== "AB") {
    console.error("FAIL normalizePrefixField");
    failed++;
  }
  if (failed) process.exit(1);
  console.log(`ok ${cases.length + 1} checks`);
}
