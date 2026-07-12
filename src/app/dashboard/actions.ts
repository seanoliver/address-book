"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray, isNull, and } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withRls } from "@/lib/db";
// Sanctioned dbAdmin import (allowlisted in eslint.config.mjs): update_tokens
// has zero grants for client roles by design, so token minting/cleanup and
// email_sends bookkeeping go through the admin connection. The contact ids
// they operate on come exclusively from the RLS-scoped select below — the
// RLS query IS the authorization.
import { dbAdmin } from "@/lib/db/admin";
import { books, contacts, emailSends, profiles, updateTokens } from "@/lib/db/schema";
import { sendAddressRequests } from "@/lib/email/resend";
import { addressRequestEmail } from "@/lib/email/templates";
import { logDbError } from "@/lib/log";
import { generateToken, TOKEN_TTL_DAYS } from "@/lib/tokens";

const requestSchema = z.union([
  z.object({ contactIds: z.array(z.uuid()).min(1).max(1000) }),
  z.object({ all: z.literal(true) }),
]);

export type RequestAddressesInput = z.input<typeof requestSchema>;

export type RequestAddressesResult =
  | { sent: number; skippedNoEmail: number; failed: number }
  | { error: string };

/**
 * Mint update tokens for the targeted contacts and email each a personal
 * `/u/<token>` link. Single-active-token semantics: minting deletes the
 * contact's previous unused tokens, so re-running the request invalidates
 * old links and only the newest one works.
 *
 * Invariant: the raw token exists only transiently to build the email URL.
 * Only its sha256 is persisted, and it is never logged here (the dev-only
 * EMAIL_DRY_RUN path inside the email layer is the sole exception).
 */
export async function requestAddresses(
  input: RequestAddressesInput,
): Promise<RequestAddressesResult> {
  const claims = await requireUser();

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };

  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL is not set");

  // Authorization = RLS: this select can only ever return the caller's own
  // contacts. Ids belonging to another user silently drop out here.
  let scope:
    | {
        bookId: string;
        bookTitle: string;
        ownerName: string;
        rows: { id: string; email: string | null }[];
      }
    | undefined;
  try {
    scope = await withRls(claims, async (tx) => {
      const [book] = await tx
        .select({ id: books.id, title: books.title })
        .from(books)
        .where(eq(books.ownerId, claims.sub))
        .limit(1);
      if (!book) return undefined;

      const [profile] = await tx
        .select({ fullName: profiles.fullName })
        .from(profiles)
        .where(eq(profiles.id, claims.sub))
        .limit(1);

      const rows = await tx
        .select({ id: contacts.id, email: contacts.email })
        .from(contacts)
        .where(
          and(
            eq(contacts.bookId, book.id),
            "contactIds" in parsed.data
              ? inArray(contacts.id, parsed.data.contactIds)
              : undefined,
          ),
        );

      return {
        bookId: book.id,
        bookTitle: book.title,
        // Owner display name: profile full_name, falling back to the book
        // title for owners who never set one.
        ownerName: profile?.fullName.trim() || book.title,
        rows,
      };
    });
  } catch (err) {
    logDbError("[ra] [requestAddresses] contact select failed", err);
    return { error: "Something went wrong. Please try again." };
  }
  if (!scope) return { error: "Set up your address book first." };

  const targets = scope.rows.filter(
    (row): row is { id: string; email: string } => row.email !== null,
  );
  const skippedNoEmail = scope.rows.length - targets.length;
  if (targets.length === 0) {
    return { sent: 0, skippedNoEmail, failed: 0 };
  }

  // Mint one token per target. Hashes are persisted BEFORE the emails go out
  // so a recipient clicking instantly always finds a live row.
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const minted = targets.map((target) => {
    const { token, hash } = generateToken();
    return { target, token, hash };
  });

  try {
    await dbAdmin.transaction(async (tx) => {
      // Single-active-token: previous unused tokens for these contacts die
      // now — re-requesting rotates the link rather than stacking live ones.
      await tx.delete(updateTokens).where(
        and(
          inArray(
            updateTokens.contactId,
            targets.map((t) => t.id),
          ),
          isNull(updateTokens.usedAt),
        ),
      );
      await tx.insert(updateTokens).values(
        minted.map(({ target, hash }) => ({
          contactId: target.id,
          tokenHash: hash,
          expiresAt,
        })),
      );
    });
  } catch (err) {
    logDbError("[ra] [requestAddresses] token mint failed", err);
    return { error: "Something went wrong. Please try again." };
  }

  const results = await sendAddressRequests(
    minted.map(({ target, token }) => ({
      to: target.email,
      ...addressRequestEmail({
        ownerName: scope.ownerName,
        bookTitle: scope.bookTitle,
        updateUrl: `${appUrl}/u/${token}`,
      }),
    })),
  );

  // Positional: results[i] corresponds to minted[i].
  const paired = minted.map((mint, i) => ({ ...mint, resendId: results[i].id }));
  const delivered = paired.filter(
    (p): p is typeof p & { resendId: string } => p.resendId !== null,
  );
  const failedMints = paired.filter((p) => p.resendId === null);

  try {
    if (delivered.length > 0) {
      await dbAdmin.insert(emailSends).values(
        delivered.map(({ target, resendId }) => ({
          contactId: target.id,
          bookId: scope.bookId,
          resendId,
          status: "sent",
        })),
      );
    }
    if (failedMints.length > 0) {
      // A token whose email never went out must not stay live — delete by
      // exact hash so concurrent re-sends can't be affected.
      await dbAdmin.delete(updateTokens).where(
        inArray(
          updateTokens.tokenHash,
          failedMints.map(({ hash }) => hash),
        ),
      );
    }
  } catch (err) {
    // Emails are already out; surface a success count but log the
    // bookkeeping failure loudly.
    logDbError("[ra] [requestAddresses] send bookkeeping failed", err);
  }

  revalidatePath("/dashboard");
  return { sent: delivered.length, skippedNoEmail, failed: failedMints.length };
}
