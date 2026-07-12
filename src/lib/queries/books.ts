import "server-only";
import { eq } from "drizzle-orm";
import { type SessionClaims } from "@/lib/auth";
import { withRls } from "@/lib/db";
import { books } from "@/lib/db/schema";

/** The signed-in user's book (v1: one per owner), or undefined during onboarding. */
export async function getOwnBook(claims: SessionClaims) {
  const [book] = await withRls(claims, (tx) =>
    tx.select().from(books).where(eq(books.ownerId, claims.sub)).limit(1),
  );
  return book;
}
