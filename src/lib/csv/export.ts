import { CONTACT_FIELDS, type ContactField } from "@/lib/validation/contact";

// NOTE: keep this module dependency-clean (no server-only imports, no db/env
// access) — like import.ts it is pure string logic; the export route handler
// does the server-only work.

/** One exported contact: canonical field name → value (null/missing → empty cell). */
export type ContactCsvRow = Partial<Record<ContactField, string | null>>;

/**
 * Formula-injection guard (OWASP "CSV Injection"): cells beginning with
 * = + - @, tab, or CR are treated as formulas by Excel/Numbers/Sheets, so a
 * contact who set their name to `=HYPERLINK(...)` via the token form would
 * otherwise become an exploit when the owner opens the export.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** RFC 4180: quote any field containing a comma, quote, or line break. */
const NEEDS_QUOTING = /[",\r\n]/;

function toCell(value: string | null | undefined): string {
  let cell = value ?? "";
  // Sanitize before quoting so the neutralizing ' ends up inside the quotes.
  // Tradeoff: the ' survives a re-import (documented in the round-trip tests);
  // safety over losslessness.
  if (FORMULA_PREFIX.test(cell)) cell = `'${cell}`;
  if (NEEDS_QUOTING.test(cell)) cell = `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

/**
 * Serializes contacts to RFC 4180 CSV: canonical CONTACT_FIELDS header (the
 * exact headers parseContactsCsv recognizes, so export → import round-trips),
 * CRLF line endings with a trailing CRLF, empty cells for null/missing
 * values, and formula-injection-safe cell contents.
 */
export function contactsToCsv(rows: readonly ContactCsvRow[]): string {
  const lines = [CONTACT_FIELDS.join(",")];
  for (const row of rows) {
    lines.push(CONTACT_FIELDS.map((field) => toCell(row[field])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
