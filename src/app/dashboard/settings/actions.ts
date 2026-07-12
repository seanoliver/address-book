"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { withRls } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db/errors";
import { books } from "@/lib/db/schema";
import { logDbError } from "@/lib/log";
import { bookSchema } from "@/lib/validation/book";

export type BookFormValues = {
  title: string;
  slug: string;
  partner_name: boolean;
  kids_names: boolean;
  birthday: boolean;
};

export type SaveBookState = {
  error?: string;
  saved?: boolean;
  /**
   * Submitted values, echoed back on error. React 19 resets uncontrolled
   * inputs to their defaultValue after a form action completes — the form
   * uses these as defaults so a failed save doesn't wipe the user's input.
   */
  values?: BookFormValues;
};

export async function saveBook(
  _prevState: SaveBookState,
  formData: FormData,
): Promise<SaveBookState> {
  const claims = await requireUser();

  const submitted: BookFormValues = {
    title: String(formData.get("title") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    // Unchecked checkboxes are absent from FormData; checked ones post "on".
    partner_name: formData.get("partner_name") === "on",
    kids_names: formData.get("kids_names") === "on",
    birthday: formData.get("birthday") === "on",
  };

  const parsed = bookSchema.safeParse(submitted);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      values: submitted,
    };
  }
  const { title, slug, partner_name, kids_names, birthday } = parsed.data;
  const enabledFields = { partner_name, kids_names, birthday };

  try {
    await withRls(claims, (tx) =>
      tx
        .insert(books)
        .values({ ownerId: claims.sub, slug, title, enabledFields })
        .onConflictDoUpdate({
          // one book per owner (unique index books_one_per_owner) — an
          // existing book is updated in place, so saving is idempotent.
          target: books.ownerId,
          set: { slug, title, enabledFields },
        }),
    );
  } catch (err) {
    if (isUniqueViolation(err, "books_slug_key")) {
      return { error: "That link name is taken", values: submitted };
    }
    logDbError("[bk] [saveBook] upsert failed", err);
    return {
      error: "Something went wrong. Please try again.",
      values: submitted,
    };
  }

  // Task 12: also revalidate the old + new /b/[slug] paths when the public
  // page exists.
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return { saved: true };
}
