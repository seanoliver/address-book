import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!, { prepare: false, max: 10 });

/**
 * Admin connection — BYPASSES RLS (connection role owns the tables).
 * Allowed uses: calling private.* SECURITY DEFINER functions, minting
 * update_tokens, webhook status updates. NEVER use for owner-facing reads.
 */
export const dbAdmin = drizzle(client, { schema });

export type RlsTx = Parameters<Parameters<PostgresJsDatabase<typeof schema>["transaction"]>[0]>[0];

/**
 * Runs `fn` inside a transaction with the user's JWT claims applied and
 * `role` dropped to `authenticated`, so every query inside is RLS-enforced.
 * This is the ONLY sanctioned path for owner-facing data access.
 */
export async function withRls<T>(
  claims: { sub: string; [k: string]: unknown },
  fn: (tx: RlsTx) => Promise<T>,
): Promise<T> {
  if (!claims.sub) {
    throw new Error("withRls: claims.sub must be a non-empty user id");
  }
  return dbAdmin.transaction(async (tx) => {
    await tx.execute(sql`
      select set_config('request.jwt.claims', ${JSON.stringify({ ...claims, role: "authenticated" })}, true)`);
    await tx.execute(sql`
      select set_config('request.jwt.claim.sub', ${claims.sub}, true)`);
    await tx.execute(sql`set local role authenticated`);
    try {
      return await fn(tx);
    } finally {
      // Belt-and-braces: SET LOCAL is transaction-scoped, so COMMIT/ROLLBACK
      // restores the role either way. If fn threw a Postgres error the tx is
      // aborted and `reset role` itself fails (25P02) — swallow that so the
      // original error propagates instead of being masked.
      try {
        await tx.execute(sql`reset role`);
      } catch {
        // aborted transaction; rollback will restore the role
      }
    }
  });
}
