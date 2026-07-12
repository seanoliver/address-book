import { z } from "zod";
import { type TokenUpdateField } from "./contact";

/**
 * Helpers for handling `submissions.payload`, which is ATTACKER-CONTROLLED
 * jsonb: the public /b/[slug] flow zod-validates what it stores, but the
 * column may still hold anything an attacker smuggled past it (unknown keys,
 * fields disabled on the book, non-string values) and — defense in depth —
 * even non-object jsonb (the DB CHECK enforces object shape for new rows,
 * but tolerate legacy/hostile shapes anyway). Nothing here trusts the
 * payload; nothing here throws on any input.
 */

/** Per-book optional-field switches (mirrors books.enabled_fields). */
export type EnabledFields = {
  partner_name: boolean;
  kids_names: boolean;
  birthday: boolean;
};

/**
 * Display-only cap. Stored values are zod-capped on the legit path (≤500
 * chars), but a hostile payload only has to fit the 64KB jsonb guard — never
 * let a huge string blow up the review page. Approval paths re-validate the
 * FULL value through tokenUpdateSchema; this truncation is cosmetic.
 */
export const DISPLAY_VALUE_MAX = 200;

const displayValue = z
  .string()
  .transform((s) =>
    s.length > DISPLAY_VALUE_MAX ? `${s.slice(0, DISPLAY_VALUE_MAX)}…` : s,
  )
  .optional()
  // Non-string value under a known key (hostile jsonb) → drop the field
  // rather than failing the whole card.
  .catch(undefined);

/**
 * Lenient parser for DISPLAY only (approval uses strict tokenUpdateSchema):
 * accepts any object, DROPS unknown keys (z.object strips them) and
 * non-string values, truncates long values. Rejects non-object payloads
 * (scalar/array/null) — callers render those as "Malformed submission".
 * `notes` is deliberately not here: it is owner-private and can never arrive
 * via a submission; a smuggled `notes` key is an unknown key and is dropped.
 */
export const submissionDisplaySchema = z.object({
  full_name: displayValue,
  partner_name: displayValue,
  kids_names: displayValue,
  email: displayValue,
  birthday: displayValue,
  address_line1: displayValue,
  address_line2: displayValue,
  city: displayValue,
  state_region: displayValue,
  postal_code: displayValue,
  country: displayValue,
});

export type SubmissionDisplayFields = z.infer<typeof submissionDisplaySchema>;

/**
 * Fields the book has DISABLED are removed entirely — a smuggled
 * `kids_names` on a kids-disabled book must neither display nor merge.
 * Shared by the review page (lenient display parse) and the approve actions
 * (strict tokenUpdateSchema parse), so the two paths can never disagree
 * about gating.
 */
export function dropDisabledFields<
  T extends Partial<Record<TokenUpdateField, unknown>>,
>(data: T, enabled: EnabledFields): T {
  const out = { ...data };
  if (!enabled.partner_name) delete out.partner_name;
  if (!enabled.kids_names) delete out.kids_names;
  if (!enabled.birthday) delete out.birthday;
  return out;
}

/**
 * Lenient display parse: known string fields (truncated, gated) or null for
 * a malformed (non-object) payload. Never throws.
 */
export function parseSubmissionForDisplay(
  payload: unknown,
  enabled: EnabledFields,
): SubmissionDisplayFields | null {
  const parsed = submissionDisplaySchema.safeParse(payload);
  if (!parsed.success) return null;
  return dropDisabledFields(parsed.data, enabled);
}
