# Restricted `app_server` DB role for production

**Date:** 2026-07-12
**Prompted by:** Pre-publication review — the design doc promised a restricted production DB role, but the code (and docs) only ever connected as `postgres`.

## Context

`DATABASE_URL` connects as `postgres` in local dev: table owner, implicit RLS bypass, full DDL, every schema. The design's least-privilege story wanted production to connect as a role that can run the app but can't rewrite the schema or reach `storage`/`vault`. This investigation produced and verified the one-time SQL now documented in [docs/SECURITY.md → Database role](../SECURITY.md#database-role), by creating the role against the local stack, pointing `DATABASE_URL` at it, and running the full vitest integration suite (157 tests, including `rls.test.ts`, `approve-race.test.ts`, and the webhook `route.test.ts`) — all green under the restricted role.

## Key findings

1. **`bypassrls` is mandatory — and it was missing from the first draft of the snippet.** Every table is RLS-enabled with default-deny policies scoped to owners. A plain role with full DML grants gets *silently filtered to zero rows*: `select count(*) from books` returned 0 (vs 3 as `postgres`), webhook `update email_sends …` matched 0 rows, token minting inserted 0. No errors — just quiet no-ops. `dbAdmin`'s "bypasses RLS" semantics come from `postgres` *owning* the tables; a non-owner role needs the explicit `BYPASSRLS` attribute.
2. **`bypassrls` does not weaken Wall 2.** RLS is checked against the *current* role. `withRls` runs `SET ROLE authenticated` inside each transaction, and `authenticated` has no `BYPASSRLS` — verified: after the role switch, a foreign `sub` saw 0 books, and `select from update_tokens` still raised `permission denied for table update_tokens`.
3. **Supabase's `postgres` can create `bypassrls` roles despite not being superuser** (`usesuper = f`). In vanilla Postgres that requires superuser; Supabase's privileged-role machinery (supautils) allows it. Verified locally with `create role … bypassrls` as `postgres`.
4. **`grant authenticated to app_server` does double duty**: it permits the `SET ROLE authenticated` in `withRls`, and membership inherits `usage` on the `auth` schema — so no explicit `grant usage on schema auth` is needed for the `auth.users (id, email)` column grant to be usable.
5. **`postgres` can grant column-scoped `select (id, email)` on `auth.users`, but not `insert`/`delete`** — `grant insert, delete on auth.users` as `postgres` emits `WARNING: no privileges were granted` (it lacks the grant option). Fine for production (the app only reads id/email for owner-notify); the vitest fixtures seed `auth.users`, so running the suite against the restricted role needs that extra grant issued by a superuser (`supabase_admin` locally). Local-only.
6. **No sequence grants are strictly needed today** (uuid keys everywhere), but `grant usage on all sequences` plus `alter default privileges … on sequences/tables/functions` future-proof migrations that run as `postgres`.

## How it works

- Snippet + rationale: `docs/SECURITY.md` → "Database role" (checklist item added too).
- `src/lib/db/admin.ts` (`dbAdmin`) — direct connection, relies on owner-or-bypassrls semantics.
- `src/lib/db/index.ts` (`withRls`) — `set_config('role','authenticated',true)` per transaction; this is why the restricted role stays RLS-enforced for owner-facing reads.
- `src/lib/db/rls.test.ts` — the post-commit connection probe now asserts the role is **not** `authenticated` (role-reset semantics) instead of hardcoding `postgres`, so the suite passes under either connection role.

## Gotchas

- **Missing `bypassrls` fails silently.** No permission errors — queries just return/affect zero rows. If a hardened deployment "loses" webhook status updates or mints tokens that never appear, check `select rolbypassrls from pg_roles where rolname = current_user` first.
- **Teardown order matters**: `drop owned by` only revokes grants made *by roles you have privileges of*. Column grants on `auth.users` made by `postgres` had to be revoked as `postgres` (or cleaned by the superuser) before `drop role app_server` succeeded.
- The `WARNING: no privileges were granted` from a partially-privileged `grant` is easy to miss in a migration log — it does not error.

## References

- `docs/SECURITY.md` — Database role section (the verified snippet)
- PostgreSQL docs: `CREATE ROLE … BYPASSRLS`, row security and `current_user`
- Local verification: Supabase CLI stack (Postgres on 54322), vitest 13 files / 157 tests passing with `DATABASE_URL` pointed at `app_server`
