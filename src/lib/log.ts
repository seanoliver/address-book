import "server-only";

/**
 * PII-safe logging for database errors.
 *
 * Never log a DB error object (or its drizzle wrapper) directly:
 * DrizzleQueryError's message embeds the full query with params, and
 * PostgresError's `detail` can embed row values (addresses, emails, ...).
 * This helper logs only the tag, the Postgres error `code`,
 * `constraint_name` when present, and the underlying Postgres error's
 * message (which names relations/constraints, not values).
 */
export function logDbError(tag: string, err: unknown): void {
  let code: string | undefined;
  let constraint: string | undefined;
  let message: string | undefined;

  // Walk the `cause` chain (drizzle wraps the real PostgresError) and take
  // the deepest error carrying a Postgres error code.
  let cur: unknown = err;
  while (cur instanceof Error) {
    const e = cur as Error & { code?: unknown; constraint_name?: unknown };
    if (typeof e.code === "string") {
      code = e.code;
      constraint =
        typeof e.constraint_name === "string" ? e.constraint_name : undefined;
      message = e.message;
    }
    cur = cur.cause;
  }

  console.error(
    `${tag} db error`,
    JSON.stringify({ code, constraint, message }),
  );
}
