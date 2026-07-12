"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withRls } from "@/lib/db";
import { dbAdmin } from "@/lib/db/admin";
import { isUniqueViolation } from "@/lib/db/errors";
import { books, contactEvents, contacts } from "@/lib/db/schema";
import { logDbError } from "@/lib/log";
import {
  CONTACT_FIELDS,
  contactSchema,
  type ContactField,
  type ContactFormValues,
  type ContactInput,
} from "@/lib/validation/contact";

export type ContactFormState = {
  error?: string;
  saved?: boolean;
  /**
   * Submitted values, echoed back on error. React 19 resets uncontrolled
   * inputs to their defaultValue after a form action completes — the form
   * uses these as defaults so a failed save doesn't wipe the user's input.
   */
  values?: ContactFormValues;
};

export type DeleteContactState = { error?: string };

const uuidSchema = z.uuid();

function readContactForm(formData: FormData): ContactFormValues {
  return Object.fromEntries(
    CONTACT_FIELDS.map((field) => [field, String(formData.get(field) ?? "")]),
  ) as ContactFormValues;
}

/** Parsed input → drizzle column values (cleared optionals become NULL). */
function toRow(d: ContactInput) {
  return {
    fullName: d.full_name,
    partnerName: d.partner_name ?? null,
    kidsNames: d.kids_names ?? null,
    email: d.email ?? null,
    birthday: d.birthday ?? null,
    addressLine1: d.address_line1 ?? null,
    addressLine2: d.address_line2 ?? null,
    city: d.city ?? null,
    stateRegion: d.state_region ?? null,
    postalCode: d.postal_code ?? null,
    country: d.country ?? null,
    notes: d.notes ?? null,
  };
}

/** Field snapshot keyed by form/schema names, for audit diffs. */
type Snapshot = Record<ContactField, string | null>;

function inputToSnapshot(d: ContactInput): Snapshot {
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
    notes: d.notes ?? null,
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
    notes: row.notes,
  };
}

/** Non-null fields only — keeps create diffs compact. */
function definedFields(snap: Snapshot): Partial<Snapshot> {
  const out: Partial<Snapshot> = {};
  for (const field of CONTACT_FIELDS) {
    if (snap[field] !== null) out[field] = snap[field];
  }
  return out;
}

/** Changed fields only, or undefined for a no-op save (no audit row). */
function changedFields(
  before: Snapshot,
  after: Snapshot,
): { before: Partial<Snapshot>; after: Partial<Snapshot> } | undefined {
  const diff = { before: {} as Partial<Snapshot>, after: {} as Partial<Snapshot> };
  let changed = false;
  for (const field of CONTACT_FIELDS) {
    if (before[field] !== after[field]) {
      diff.before[field] = before[field];
      diff.after[field] = after[field];
      changed = true;
    }
  }
  return changed ? diff : undefined;
}

/**
 * Audit append — the ONLY sanctioned dbAdmin use in this module.
 * contact_events is client-unwritable by design (no insert policy/grant for
 * `authenticated`), so the row is written via the admin connection after the
 * RLS-scoped write has already succeeded. Best-effort: an audit failure is
 * logged, never surfaced as a user-facing error for a write that committed.
 */
async function recordContactEvent(
  contactId: string,
  diff: Record<string, unknown>,
): Promise<void> {
  try {
    await dbAdmin
      .insert(contactEvents)
      .values({ contactId, source: "owner", diff });
  } catch (err) {
    logDbError("[ct] [recordContactEvent] audit insert failed", err);
  }
}

export async function createContact(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const claims = await requireUser();

  const submitted = readContactForm(formData);
  const parsed = contactSchema.safeParse(submitted);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      values: submitted,
    };
  }

  let inserted: { id: string } | undefined;
  try {
    inserted = await withRls(claims, async (tx) => {
      // Resolve the book inside the RLS tx — never trust a client bookId.
      const [book] = await tx
        .select({ id: books.id })
        .from(books)
        .where(eq(books.ownerId, claims.sub))
        .limit(1);
      if (!book) return undefined;
      const [row] = await tx
        .insert(contacts)
        .values({ bookId: book.id, ...toRow(parsed.data) })
        .returning({ id: contacts.id });
      return row;
    });
  } catch (err) {
    if (isUniqueViolation(err, "contacts_book_email_unique")) {
      return {
        error: "You already have a contact with this email",
        values: submitted,
      };
    }
    logDbError("[ct] [createContact] insert failed", err);
    return {
      error: "Something went wrong. Please try again.",
      values: submitted,
    };
  }
  if (!inserted) {
    return { error: "Set up your address book first.", values: submitted };
  }

  await recordContactEvent(inserted.id, {
    after: definedFields(inputToSnapshot(parsed.data)),
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/contacts/${inserted.id}`);
  redirect("/dashboard");
}

export async function updateContact(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const claims = await requireUser();

  const submitted = readContactForm(formData);
  const id = String(formData.get("id") ?? "");
  if (!uuidSchema.safeParse(id).success) {
    return { error: "Contact not found.", values: submitted };
  }

  const parsed = contactSchema.safeParse(submitted);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      values: submitted,
    };
  }

  let before: (typeof contacts.$inferSelect) | undefined;
  try {
    before = await withRls(claims, async (tx) => {
      const [book] = await tx
        .select({ id: books.id })
        .from(books)
        .where(eq(books.ownerId, claims.sub))
        .limit(1);
      if (!book) return undefined;
      // Scoped by id AND bookId (RLS backstops the same predicate).
      const [existing] = await tx
        .select()
        .from(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.bookId, book.id)))
        .limit(1);
      if (!existing) return undefined;
      await tx
        .update(contacts)
        .set(toRow(parsed.data))
        .where(and(eq(contacts.id, id), eq(contacts.bookId, book.id)));
      return existing;
    });
  } catch (err) {
    if (isUniqueViolation(err, "contacts_book_email_unique")) {
      return {
        error: "You already have a contact with this email",
        values: submitted,
      };
    }
    logDbError("[ct] [updateContact] update failed", err);
    return {
      error: "Something went wrong. Please try again.",
      values: submitted,
    };
  }
  if (!before) {
    return { error: "Contact not found.", values: submitted };
  }

  const diff = changedFields(rowToSnapshot(before), inputToSnapshot(parsed.data));
  if (diff) await recordContactEvent(id, diff);

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/contacts/${id}`);
  return { saved: true, values: submitted };
}

export async function deleteContact(
  _prevState: DeleteContactState,
  formData: FormData,
): Promise<DeleteContactState> {
  const claims = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!uuidSchema.safeParse(id).success) {
    return { error: "Contact not found." };
  }

  let deleted: { id: string } | undefined;
  try {
    deleted = await withRls(claims, async (tx) => {
      const [book] = await tx
        .select({ id: books.id })
        .from(books)
        .where(eq(books.ownerId, claims.sub))
        .limit(1);
      if (!book) return undefined;
      const [row] = await tx
        .delete(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.bookId, book.id)))
        .returning({ id: contacts.id });
      return row;
    });
  } catch (err) {
    logDbError("[ct] [deleteContact] delete failed", err);
    return { error: "Something went wrong. Please try again." };
  }
  if (!deleted) {
    return { error: "Contact not found." };
  }

  // No audit row for deletes: contact_events.contact_id references
  // contacts(id) ON DELETE CASCADE, so a delete-audit row would either
  // violate the FK (inserted after) or be cascade-removed with the contact
  // (inserted before). The trail intentionally lives and dies with the
  // contact.

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
