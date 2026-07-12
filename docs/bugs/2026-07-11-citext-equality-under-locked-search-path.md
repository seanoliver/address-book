# citext equality silently case-sensitive under `search_path = ''`

**Date:** 2026-07-11
**Severity:** Important (silent data-matching failure on an untrusted input path)
**Status:** Fixed in `1bb0ab5`

## Symptom

`private.submit_to_book()` failed to set `matched_contact_id` when a permalink
visitor submitted their email with different casing than the stored contact
(`BOB@TEST.DEV` vs `bob@test.dev`), even though `contacts.email` is `citext`.
The owner would see a "new person" submission instead of a "possible update to
existing contact" merge prompt.

## Root cause

All our `SECURITY DEFINER` functions set `search_path = ''` (correctly, to
prevent search-path hijacking). But the `citext` type's operators live in the
`extensions` schema. With an empty search path, the bare `=` between two
citext values cannot resolve the citext operator, and Postgres silently falls
back to `pg_catalog`'s text `=` via the implicit `citext → text` cast —
turning a case-insensitive comparison into a case-sensitive one. No error, no
warning.

## Repro steps

```sql
set local search_path = '';
select 'bob@test.dev'::extensions.citext = 'BOB@TEST.DEV'::extensions.citext;
-- false  (true under a normal search_path)
```

## Fix

Qualify the operator explicitly in `supabase/migrations/00000000000002_private_functions.sql`:

```sql
and email operator(extensions.=) nullif(trim(p_payload ->> 'email'), '')::extensions.citext;
```

## Verification

- pgTAP assertion added first (TDD red): mixed-case submit produced
  `matched_contact_id = null` against the pre-fix function.
- Post-fix: 35/35 pgTAP green; live probe with reverted function body in a
  rolled-back transaction confirmed the assertion fails on regression.

## Recurrence guardrail

- `supabase/tests/database/02_functions.sql` test 11: mixed-case email must
  match (fails if anyone reverts to bare `=`).
- Convention: **any comparison of citext (or any extension-schema type) inside
  a `search_path = ''` function must use `operator(extensions.=)`** or an
  explicit `lower()` comparison. Assignment casts are unaffected; comparison
  operators are.
