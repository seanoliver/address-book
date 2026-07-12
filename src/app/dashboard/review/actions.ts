"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withRls, type RlsTx } from "@/lib/db";
import { dbAdmin } from "@/lib/db/admin";
import { contactInputToRow as toRow } from "@/lib/db/contact-row";
import { isUniqueViolation } from "@/lib/db/errors";
import { books, contactEvents, contacts, submissions } from "@/lib/db/schema";
import { logDbError } from "@/lib/log";
import {
  TOKEN_UPDATE_FIELDS,
  tokenUpdateSchema,
  type TokenUpdateField,
} from "@/lib/validation/contact";
import { dropDisabledFields } from "@/lib/validation/submission";

/**
 * Review-queue actions. `submissions.payload` is ATTACKER-CONTROLLED jsonb
 * (public permalink submissions; submit_to_book does not gate enabled_fields
 * and stores whatever object it was handed). Every approval therefore:
 *   1. re-validates the payload through the STRICT tokenUpdateSchema
 *      (unknown keys — including a smuggled `notes` — stripped, per-field
 *      caps, full_name required), and
 *   2. drops fields DISABLED on the book (dropDisabledFields)
 * BEFORE anything touches `contacts`. The DB CHECK constraints are the third
 * net. Display-side gating (review/page.tsx) uses the same dropDisabledFields
 * helper, so display and merge can never disagree.
 */

export type ReviewActionState = { error?: string };

const uuidSchema = z.uuid();

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NOT_FOUND = "Submission not found — it may already be reviewed.";
const INVALID_PAYLOAD =
  "This submission contains invalid data and can't be approved — reject it instead.";
const DUPLICATE_EMAIL =
  "You already have a contact with this email — use Apply update on the matching card or reject this one.";

type TokenUpdateInput = z.infer<typeof tokenUpdateSchema>;

/** Field snapshot keyed by schema names, for audit diffs. No `notes`: it can never arrive via a submission. */
type Snapshot = Record<TokenUpdateField, string | null>;

function inputToSnapshot(d: TokenUpdateInput): Snapshot {
  return {
    full_name: d.full_name,
    partner_name: d.partner_name ?? null,
    kids_names: d.kids_names ?? null,
    email: d.email ?? null,
    birthday: d.birthday ?? null,
    address_line1: d.address_line1 ?? null,
    address_line2: d.address_line2 ?? null,
    city: d.city ?? null,
    state_region: d.state_region ?? null,
    postal_code: d.postal_code ?? null,
    country: d.country ?? null,
  };
}

function rowToSnapshot(row: typeof contacts.$inferSelect): Snapshot {
  return {
    full_name: row.fullName,
    partner_name: row.partnerName,
    kids_names: row.kidsNames,
    email: row.email,
    birthday: row.birthday,
    address_line1: row.addressLine1,
    address_line2: row.addressLine2,
    city: row.city,
    state_region: row.stateRegion,
    postal_code: row.postalCode,
    country: row.country,
  };
}

/** Non-null fields only — keeps create diffs compact. */
function definedFields(snap: Snapshot): Partial<Snapshot> {
  const out: Partial<Snapshot> = {};
  for (const field of TOKEN_UPDATE_FIELDS) {
    if (snap[field] !== null) out[field] = snap[field];
  }
  return out;
}

/** Changed fields only, or undefined for a no-op merge (no audit row). */
function changedFields(
  before: Snapshot,
  after: Snapshot,
): { before: Partial<Snapshot>; after: Partial<Snapshot> } | undefined {
  const diff = { before: {} as Partial<Snapshot>, after: {} as Partial<Snapshot> };
  let changed = false;
  for (const field of TOKEN_UPDATE_FIELDS) {
    if (before[field] !== after[field]) {
      diff.before[field] = before[field];
      diff.after[field] = after[field];
      changed = true;
    }
  }
  return changed ? diff : undefined;
}

/** Schema field name → contacts column name, for the merge update. */
const FIELD_TO_COLUMN = {
  full_name: "fullName",
  partner_name: "partnerName",
  kids_names: "kidsNames",
  email: "email",
  birthday: "birthday",
  address_line1: "addressLine1",
  address_line2: "addressLine2",
  city: "city",
  state_region: "stateRegion",
  postal_code: "postalCode",
  country: "country",
} as const satisfies Record<TokenUpdateField, keyof typeof contacts.$inferInsert>;

/**
 * Audit append — the ONLY sanctioned dbAdmin use in this module.
 * contact_events is client-unwritable by design (no insert policy/grant for
 * `authenticated`), so the row is written via the admin connection after the
 * RLS-scoped write has already succeeded. Best-effort: an audit failure is
 * logged, never surfaced as a user-facing error for a write that committed.
 */
async function recordSubmissionEvent(
  contactId: string,
  diff: Record<string, unknown>,
): Promise<void> {
  try {
    await dbAdmin
      .insert(contactEvents)
      .values({ contactId, source: "submission", diff });
  } catch (err) {
    logDbError("[rv] [recordSubmissionEvent] audit insert failed", err);
  }
}

/**
 * The caller's book + the PENDING submission, both RLS-scoped (the explicit
 * predicates mirror what RLS enforces). undefined ⇒ no book, unknown id,
 * another user's submission, or already reviewed — all indistinguishable.
 */
async function loadPendingSubmission(tx: RlsTx, ownerId: string, id: string) {
  const [book] = await tx
    .select({ id: books.id, enabledFields: books.enabledFields })
    .from(books)
    .where(eq(books.ownerId, ownerId))
    .limit(1);
  if (!book) return undefined;
  const [submission] = await tx
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.id, id),
        eq(submissions.bookId, book.id),
        eq(submissions.status, "pending"),
      ),
    )
    .limit(1);
  if (!submission) return undefined;
  return { book, submission };
}

/** Approve an unmatched submission: create a new contact from the payload. */
export async function approveNew(
  _prevState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const claims = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!uuidSchema.safeParse(id).success) return { error: NOT_FOUND };

  type Outcome =
    | { kind: "not_found" }
    | { kind: "invalid" }
    | { kind: "ok"; contactId: string; after: Partial<Snapshot> };

  let outcome: Outcome;
  try {
    outcome = await withRls(claims, async (tx): Promise<Outcome> => {
      const loaded = await loadPendingSubmission(tx, claims.sub, id);
      if (!loaded) return { kind: "not_found" };
      const { book, submission } = loaded;

      // STRICT re-validation of the untrusted payload (unknown keys stripped,
      // caps enforced, full_name required — a missing/invalid name fails
      // here), then drop book-disabled fields. Nothing unvalidated or
      // ungated ever reaches `contacts`.
      const parsed = tokenUpdateSchema.safeParse(submission.payload);
      if (!parsed.success) return { kind: "invalid" };
      const gated = dropDisabledFields(parsed.data, book.enabledFields);

      const [row] = await tx
        .insert(contacts)
        .values({ bookId: book.id, ...toRow(gated) })
        .returning({ id: contacts.id });
      await tx
        .update(submissions)
        .set({ status: "approved" })
        .where(eq(submissions.id, submission.id));
      return {
        kind: "ok",
        contactId: row.id,
        after: definedFields(inputToSnapshot(gated)),
      };
    });
  } catch (err) {
    // Unique-violation ⇒ the tx rolled back: contact not created, submission
    // still pending, so the owner can Apply update / reject instead.
    if (isUniqueViolation(err, "contacts_book_email_unique")) {
      return { error: DUPLICATE_EMAIL };
    }
    logDbError("[rv] [approveNew] failed", err);
    return { error: GENERIC_ERROR };
  }
  if (outcome.kind === "not_found") return { error: NOT_FOUND };
  if (outcome.kind === "invalid") return { error: INVALID_PAYLOAD };

  await recordSubmissionEvent(outcome.contactId, { after: outcome.after });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/review");
  return {};
}

/** Approve a matched submission: merge the payload into the matched contact. */
export async function approveMerge(
  _prevState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const claims = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!uuidSchema.safeParse(id).success) return { error: NOT_FOUND };

  type Outcome =
    | { kind: "not_found" }
    | { kind: "invalid" }
    | { kind: "no_match" }
    | {
        kind: "ok";
        contactId: string;
        diff: ReturnType<typeof changedFields>;
      };

  let outcome: Outcome;
  try {
    outcome = await withRls(claims, async (tx): Promise<Outcome> => {
      const loaded = await loadPendingSubmission(tx, claims.sub, id);
      if (!loaded) return { kind: "not_found" };
      const { book, submission } = loaded;
      if (!submission.matchedContactId) return { kind: "no_match" };

      // Same strict-parse + gate as approveNew (see module doc).
      const parsed = tokenUpdateSchema.safeParse(submission.payload);
      if (!parsed.success) return { kind: "invalid" };
      const gated = dropDisabledFields(parsed.data, book.enabledFields);

      // Scoped by id AND bookId (RLS backstops the same predicate). The FK
      // is ON DELETE SET NULL, so a dangling match is unreachable in
      // practice — no_match covers the race anyway.
      const [existing] = await tx
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.id, submission.matchedContactId),
            eq(contacts.bookId, book.id),
          ),
        )
        .limit(1);
      if (!existing) return { kind: "no_match" };

      // Merge semantics: PRESENT keys overwrite, ABSENT keys stay untouched.
      // Legit payloads are value-bearing by construction (submitToBook drops
      // empty values), and tokenUpdateSchema turns "" into undefined — so an
      // empty string (only craftable by a hostile direct insert) is treated
      // as absent and can never CLEAR a column. This intentionally differs
      // from token updates, where a present-but-empty key means "clear".
      const before = rowToSnapshot(existing);
      const after = { ...before, ...definedFields(inputToSnapshot(gated)) };
      const diff = changedFields(before, after);

      if (diff) {
        const set: Partial<
          Record<(typeof FIELD_TO_COLUMN)[TokenUpdateField], string>
        > = {};
        for (const field of TOKEN_UPDATE_FIELDS) {
          // Changed fields always carry the submitted string — a merge can
          // overwrite but never clear (see the semantics note above).
          const next = diff.after[field];
          if (typeof next === "string") set[FIELD_TO_COLUMN[field]] = next;
        }
        await tx
          .update(contacts)
          .set(set)
          .where(
            and(eq(contacts.id, existing.id), eq(contacts.bookId, book.id)),
          );
      }

      await tx
        .update(submissions)
        .set({ status: "approved" })
        .where(eq(submissions.id, submission.id));
      return { kind: "ok", contactId: existing.id, diff };
    });
  } catch (err) {
    if (isUniqueViolation(err, "contacts_book_email_unique")) {
      return { error: DUPLICATE_EMAIL };
    }
    logDbError("[rv] [approveMerge] failed", err);
    return { error: GENERIC_ERROR };
  }
  if (outcome.kind === "not_found") return { error: NOT_FOUND };
  if (outcome.kind === "invalid") return { error: INVALID_PAYLOAD };
  if (outcome.kind === "no_match") {
    return {
      error:
        "This submission isn't linked to an existing contact — use Add contact instead.",
    };
  }

  // No audit row for a no-op merge (nothing changed).
  if (outcome.diff) {
    await recordSubmissionEvent(outcome.contactId, outcome.diff);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/contacts/${outcome.contactId}`);
  revalidatePath("/dashboard/review");
  return {};
}

/** Reject a pending submission. No audit row — nothing changed. */
export async function reject(
  _prevState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const claims = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!uuidSchema.safeParse(id).success) return { error: NOT_FOUND };

  let rejected: { id: string } | undefined;
  try {
    rejected = await withRls(claims, async (tx) => {
      const [book] = await tx
        .select({ id: books.id })
        .from(books)
        .where(eq(books.ownerId, claims.sub))
        .limit(1);
      if (!book) return undefined;
      const [row] = await tx
        .update(submissions)
        .set({ status: "rejected" })
        .where(
          and(
            eq(submissions.id, id),
            eq(submissions.bookId, book.id),
            eq(submissions.status, "pending"),
          ),
        )
        .returning({ id: submissions.id });
      return row;
    });
  } catch (err) {
    logDbError("[rv] [reject] failed", err);
    return { error: GENERIC_ERROR };
  }
  if (!rejected) return { error: NOT_FOUND };

  revalidatePath("/dashboard/review");
  return {};
}
