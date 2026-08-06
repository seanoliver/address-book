import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { type SessionClaims } from "@/lib/auth";
import { withRls } from "@/lib/db";
import { books, profiles } from "@/lib/db/schema";

/** The signed-in user's book (v1: one per owner), or undefined during onboarding. */
export const getOwnBook = cache(async (claims: SessionClaims) => {
  const [book] = await withRls(claims, (tx) =>
    tx.select().from(books).where(eq(books.ownerId, claims.sub)).limit(1),
  );
  return book;
});

/** The signed-in owner's profile, created by the auth-user trigger. */
export async function getOwnProfile(claims: SessionClaims) {
  const [profile] = await withRls(claims, (tx) =>
    tx.select().from(profiles).where(eq(profiles.id, claims.sub)).limit(1),
  );
  return profile;
}
