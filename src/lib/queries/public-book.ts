import "server-only";
import { eq } from "drizzle-orm";
// Sanctioned dbAdmin import (allowlisted in eslint.config.mjs): the public
// permalink page is unauthenticated, so there are no claims for withRls —
// this module is the ONLY reader on that surface and it selects nothing but
// the three public display fields below.
import { dbAdmin } from "@/lib/db/admin";
import { books, profiles } from "@/lib/db/schema";

/**
 * Mirror of the DB CHECK on books.slug. Anything failing this shape is
 * rejected before any query (or rate-limit row) happens.
 */
export const SLUG_SHAPE = /^[a-z0-9][a-z0-9-]{2,62}$/;

/**
 * The COMPLETE set of book data the public surface may see. Nothing else —
 * no ids, no counts, no contact data, no timestamps. Widening this type is
 * a security decision, not a convenience.
 */
export type PublicBook = {
  title: string;
  ownerName: string;
  enabledFields: { partner_name: boolean; kids_names: boolean; birthday: boolean };
};

/**
 * Look up a book for the public /b/[slug] page. Returns null for a
 * malformed slug (no DB work) and for an unknown slug alike — the caller
 * renders a 404 either way. May throw on connection failure; callers on the
 * public surface catch and fail to a generic error page.
 */
export async function getPublicBook(slug: string): Promise<PublicBook | null> {
  if (!SLUG_SHAPE.test(slug)) return null;

  const [row] = await dbAdmin
    .select({
      title: books.title,
      ownerName: profiles.fullName,
      enabledFields: books.enabledFields,
    })
    .from(books)
    .innerJoin(profiles, eq(profiles.id, books.ownerId))
    .where(eq(books.slug, slug))
    .limit(1);

  return row ?? null;
}
