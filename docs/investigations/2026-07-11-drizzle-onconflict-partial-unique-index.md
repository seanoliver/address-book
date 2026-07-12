# Drizzle onConflictDoNothing against a partial unique index

**Date:** 2026-07-11
**Prompted by:** Feature build (Task 10 CSV import — bulk insert must skip, not error, on `contacts_book_email_unique` conflicts)

## Context

The CSV import bulk-inserts up to 1000 contacts and must silently skip rows
whose email already exists in the book. The unique index is **partial**:

```sql
create unique index contacts_book_email_unique
  on public.contacts (book_id, email) where email is not null;
```

Question: does drizzle's `onConflictDoNothing` match a partial index, and how
do you spell the predicate?

## Key findings

- `onConflictDoNothing({ target, where })` — the `where` is the **index
  predicate**, and Postgres requires it to match the partial index's `WHERE`
  clause for conflict-target inference. Verified in drizzle-orm 0.45.2:
  `node_modules/drizzle-orm/pg-core/query-builders/insert.js:100-110` renders
  `on conflict (cols) where <where> do nothing` — predicate before
  `do nothing`, which is the correct Postgres placement.
- Bare `onConflictDoNothing()` (no target) renders `on conflict do nothing`
  and matches ANY unique violation, including partial indexes. It works, but
  we used the explicit target so an unrelated future constraint can't be
  silently swallowed.
- `skipped = values.length − returning().length`: `RETURNING` only yields
  actually-inserted rows, so counting the returned ids gives the real
  imported count.
- Duplicates **within one INSERT batch** are fine under `DO NOTHING` (the
  second occurrence is skipped). Under `DO UPDATE` the same situation errors
  with "cannot affect row a second time" — do not switch to upsert without
  in-batch dedupe.
- Rows with `email IS NULL` are outside the partial index, so they never
  conflict: re-importing a file duplicates its email-less rows. Accepted v1
  behavior, documented in `src/app/dashboard/import/actions.ts`.

## How it works

`src/app/dashboard/import/actions.ts`:

```ts
.onConflictDoNothing({
  target: [contacts.bookId, contacts.email],
  where: sql`email is not null`,
})
.returning({ id: contacts.id });
```

Note `onConflictDoNothing` takes `where` (the index predicate). The
`targetWhere`/`setWhere` split only exists on `onConflictDoUpdate`, where a
second `WHERE` (the update condition) is also possible.

## Gotchas

- The `where` predicate must textually satisfy the partial index's predicate
  or Postgres raises `there is no unique or exclusion constraint matching the
  ON CONFLICT specification` (42P10) at runtime — the types won't catch it.
- `email` is citext, so "duplicates" collide case-insensitively; any
  client-side pre-dedupe must lowercase before comparing
  (`src/app/dashboard/import/import-form.tsx` `dedupeByEmail`).

## References

- `node_modules/drizzle-orm/pg-core/query-builders/insert.d.ts` (0.45.2)
- `node_modules/drizzle-orm/pg-core/query-builders/insert.js:100-110`
- `supabase/migrations/00000000000001_core_schema.sql` (index definition)
- Verified live by the Task 10 e2e run: re-import of a 7-email fixture →
  imported 0 / skipped 7 (+1 in-file dupe), no unique-violation errors.
