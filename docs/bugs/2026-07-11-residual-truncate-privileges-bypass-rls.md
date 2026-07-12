# Client roles could TRUNCATE every table — RLS does not apply to TRUNCATE

**Date:** 2026-07-11
**Severity:** Critical (caught in review before any deployment)
**Status:** Fixed in `4178a73`

## Symptom

With the core schema migration applied, `set role anon; truncate
public.update_tokens;` succeeded — on the table the design declares
"unreachable outside SECURITY DEFINER functions." Same for `authenticated`,
on all seven tables.

## Root cause

Two separate Postgres/Supabase behaviors compounded:

1. Supabase's default ACLs (`pg_default_acl` for role `postgres` in schema
   `public`) grant client roles `Dxtm` — TRUNCATE, REFERENCES, TRIGGER,
   MAINTAIN — on every new table, even though the newer defaults stopped
   auto-granting DML (`arwd`).
2. **Row Level Security does not apply to TRUNCATE.** TRUNCATE is gated only
   by the table-level privilege, so enabling RLS with default-deny policies
   provides zero protection against it.

The migration granted DML explicitly (correct) but never revoked the residual
`Dxtm`, and every future table would inherit the same exposure via the
default ACL.

## Repro steps

```sql
-- pre-fix schema
set local role anon;
truncate public.update_tokens;  -- succeeded
```

## Fix

In `supabase/migrations/00000000000001_core_schema.sql`, before the grants:

```sql
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
```

then grant back exactly the intended DML matrix.

## Verification

Live probes: TRUNCATE now `permission denied` for both roles on all tables;
a freshly created probe table inherits zero client-role privileges; intended
DML + RLS filtering still work.

## Recurrence guardrail

`supabase/tests/database/01_rls.sql`:
- Structural assertion: no public table grants TRUNCATE/REFERENCES/TRIGGER/
  MAINTAIN to `anon`/`authenticated` (aclexplode sweep — catches table #8
  automatically).
- Grants-matrix assertion: the exact (table, role, privilege) set must equal
  the intended 15-row matrix; any stray grant or missing revoke surfaces as a
  named diff row.
