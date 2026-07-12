# `reset role` in withRls finally block masks the real Postgres error

**Date:** 2026-07-11
**Severity:** Important
**Status:** Fixed in the Task 5 commit (`feat: drizzle schema + RLS transaction wrapper`)

## Symptom

Any RLS denial inside `withRls` (permission denied, row-level security
violation) surfaced to callers as `Failed query: reset role` instead of the
real error. Two integration tests asserting on `permission denied for table
update_tokens` and `row-level security` failed with the wrong message.

## Root cause

The planned wrapper ran `await tx.execute(sql`reset role`)` in a bare
`finally`. When `fn` throws a Postgres error, the transaction is in the
aborted state, so the `reset role` command itself fails with 25P02
("current transaction is aborted"). A throw from a `finally` block replaces
the in-flight exception, so the 25P02 error masked the original RLS error.

## Repro steps

```ts
await withRls({ sub: U1 }, (tx) => tx.select().from(updateTokens));
// update_tokens has zero grants for `authenticated` -> permission denied
// -> tx aborted -> finally's `reset role` throws 25P02 -> caller sees
// "Failed query: reset role" instead of "permission denied"
```

## Fix

`src/lib/db/index.ts`: wrap the `reset role` in its own try/catch that
swallows the failure. This is safe because `SET LOCAL role` is
transaction-scoped — COMMIT/ROLLBACK restores the session role regardless;
the explicit reset is belt-and-braces for the success path only.

## Verification

- `src/lib/db/rls.test.ts`: "update_tokens are unreachable under RLS" and
  "rejects writes into another owner's book" now match the real Postgres
  error text through the DrizzleQueryError cause chain (6/6 pass).
- Pool-hygiene note: a failure-path probe cannot verify non-poisoning
  (ROLLBACK reverts even a plain session-scoped `SET`, so it always looks
  clean). The real hazard is the COMMITTED path: "leaves no role or claims
  on the pooled connection after commit" runs a successful `withRls` on a
  dedicated max-1 pool via the exported `makeWithRls` factory, then asserts
  the same physical connection reports `current_user = postgres` and no
  `request.jwt.claims`. Mutation-verified: flipping the claims `set_config`
  to session scope (`is_local => false`) makes the test fail with the
  leaked sub visible. (Flipping only the role's scope is neutralized by the
  finally's `reset role`, which clears session-level role too — genuine
  defense in depth.)

## Recurrence guardrail

The two error-text assertions in `src/lib/db/rls.test.ts` fail immediately
if the wrapper ever re-masks errors (they match on the underlying Postgres
message, not just "any rejection"), and the committed-path pool probe fails
if any `set_config` in the wrapper is ever flipped to session scope.
Convention: never `await` a statement in a `finally` inside an open
transaction without catching — the tx may be aborted.
