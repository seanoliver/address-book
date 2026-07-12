import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Explicit guard: postgres.js silently falls back to localhost:5432 when the
// connection string is undefined — fail loudly instead.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const client = postgres(url, {
  prepare: false,
  max: 10,
  // Serverless: warm instances must not hold connections forever.
  idle_timeout: 20, // seconds
  max_lifetime: 60 * 30, // seconds
});

/**
 * Admin connection — BYPASSES RLS (connection role owns the tables).
 * Allowed uses: calling private.* SECURITY DEFINER functions, minting
 * update_tokens, webhook status updates. NEVER use for owner-facing reads.
 * Importing this module is lint-restricted to the sanctioned call sites
 * (see no-restricted-imports in eslint.config.mjs) — owner-facing access
 * goes through withRls in `@/lib/db`.
 */
export const dbAdmin = drizzle(client, { schema });
