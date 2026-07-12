# Address Book v1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Build the open-source address book app per `docs/plans/2026-07-11-address-book-design.md` — server-only access architecture (option B), RLS enforced on every query, tokenized recipient updates, write-only public permalink.

**Architecture:** Next.js App Router on Vercel. Browser touches only Next.js routes and Supabase Auth. All data access via server actions/route handlers → Drizzle over a direct Postgres connection, wrapped in RLS-enforcing transactions (`set local role authenticated` + JWT claims). Untrusted flows (token update, permalink submit) call `SECURITY DEFINER` functions in a `private` schema. Data API (PostgREST) disabled in production.

**Tech Stack:** Next.js 16 (scaffolded from `@latest`; `next lint` no longer exists — use the ESLint CLI in Task 18 CI) / React 19 / TypeScript / Tailwind v4, Supabase (Postgres, Auth via `@supabase/ssr`, CLI migrations, pgTAP), Drizzle ORM + postgres.js, Resend + svix, Cloudflare Turnstile, Zod, Papaparse, Vitest, Playwright.

**Conventions for every task:**
- Supabase migrations are the ONLY source of schema truth. Drizzle schema is handwritten to mirror them; no drizzle-kit migrations.
- SQL changes get pgTAP tests (`supabase test db`). TS logic gets Vitest. Flows get Playwright (Task 17).
- Commit after every green test run. Commit messages: `feat:`/`test:`/`chore:` prefixes.
- All secrets in `.env.local` (gitignored). Never commit keys.

---

## Task 1: Scaffold project

**Files:**
- Create: Next.js app in repo root, `.env.local.example`, `.gitignore` additions

**Step 1: Scaffold Next.js (repo root already has docs/, so scaffold into a temp dir and move)**

```bash
cd /Users/seanoliver/code/projects/address-book
pnpm create next-app@latest tmp-scaffold --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack --yes
rsync -a tmp-scaffold/ ./ --exclude .git && rm -rf tmp-scaffold
```

**Step 2: Install dependencies**

```bash
pnpm add @supabase/ssr @supabase/supabase-js drizzle-orm postgres resend svix zod papaparse
pnpm add -D vitest @vitejs/plugin-react @playwright/test drizzle-kit @types/papaparse supabase
```

**Step 3: Create `.env.local.example`**

```bash
# Supabase (auth only — browser never touches data APIs)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from `supabase start`>
# Direct Postgres connection for Drizzle (server only)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
# Resend
RESEND_API_KEY=re_dev_placeholder
RESEND_WEBHOOK_SECRET=whsec_placeholder
EMAIL_FROM="Address Book <addresses@example.com>"
EMAIL_DRY_RUN=1
# Cloudflare Turnstile (these are Cloudflare's public ALWAYS-PASS test keys)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
# App
APP_URL=http://localhost:3000
```

**Step 4: Verify dev server boots**

Run: `pnpm dev` → expect Next.js welcome page on :3000. Kill it.

**Step 5: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

Add to `package.json` scripts: `"test": "vitest run"`, `"test:db": "supabase test db"`.

**Step 6: Commit**

```bash
git add -A && git commit -m "chore: scaffold Next.js app with deps"
```

---

## Task 2: Supabase local setup + core schema migration

**Files:**
- Create: `supabase/config.toml` (via CLI), `supabase/migrations/00000000000001_core_schema.sql`

**Step 1: Init and start Supabase**

```bash
pnpm supabase init
pnpm supabase start
```

Copy the printed anon key + DB URL into `.env.local` (create from example).

**Step 2: In `supabase/config.toml`, keep the Data API on locally** (pgTAP + CLI need the stack; production disables it — documented in Task 18). No edit needed.

**Step 3: Write the core schema migration**

Create `supabase/migrations/00000000000001_core_schema.sql`:

```sql
-- Core schema: tables, RLS, auth trigger.
-- Access model (option B): server-only queries under `authenticated` role with
-- JWT claims set per-transaction. Tables with NO policies are intentionally
-- unreachable outside SECURITY DEFINER functions / admin connection.

create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ── profiles ────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 200),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- auto-create profile on signup
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ── books ───────────────────────────────────────────────────────────────
create table public.books (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  title text not null check (char_length(title) between 1 and 120),
  enabled_fields jsonb not null
    default '{"partner_name": true, "kids_names": true, "birthday": true}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index books_one_per_owner on public.books (owner_id); -- v1: one book per user
alter table public.books enable row level security;

create policy "books_all_own" on public.books
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ── contacts ────────────────────────────────────────────────────────────
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 200),
  partner_name text check (char_length(partner_name) <= 200),
  kids_names text check (char_length(kids_names) <= 500),
  email extensions.citext check (char_length(email::text) <= 320),
  birthday date,
  address_line1 text check (char_length(address_line1) <= 200),
  address_line2 text check (char_length(address_line2) <= 200),
  city text check (char_length(city) <= 120),
  state_region text check (char_length(state_region) <= 120),
  postal_code text check (char_length(postal_code) <= 20),
  country text check (char_length(country) <= 120),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contacts_book_idx on public.contacts (book_id);
create unique index contacts_book_email_unique
  on public.contacts (book_id, email) where email is not null;
alter table public.contacts enable row level security;

create policy "contacts_all_own_book" on public.contacts
  for all to authenticated
  using (exists (select 1 from public.books b
                 where b.id = book_id and b.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.books b
                      where b.id = book_id and b.owner_id = (select auth.uid())));

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger contacts_touch before update on public.contacts
  for each row execute function private.touch_updated_at();

-- ── submissions (permalink self-adds; write path is SECURITY DEFINER only) ─
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  matched_contact_id uuid references public.contacts (id) on delete set null,
  created_at timestamptz not null default now()
);
create index submissions_book_status_idx on public.submissions (book_id, status);
alter table public.submissions enable row level security;

-- owner may read and change status; owner may NOT insert (only the definer fn inserts)
create policy "submissions_select_own_book" on public.submissions
  for select to authenticated
  using (exists (select 1 from public.books b
                 where b.id = book_id and b.owner_id = (select auth.uid())));
create policy "submissions_update_own_book" on public.submissions
  for update to authenticated
  using (exists (select 1 from public.books b
                 where b.id = book_id and b.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.books b
                      where b.id = book_id and b.owner_id = (select auth.uid())));
create policy "submissions_delete_own_book" on public.submissions
  for delete to authenticated
  using (exists (select 1 from public.books b
                 where b.id = book_id and b.owner_id = (select auth.uid())));

-- ── update_tokens: NO policies. Deny-all outside definer fns / admin. ────
create table public.update_tokens (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.update_tokens enable row level security;

-- ── email_sends ─────────────────────────────────────────────────────────
create table public.email_sends (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  resend_id text unique,
  status text not null default 'sent'
    check (status in ('sent','delivered','opened','bounced','complained')),
  sent_at timestamptz not null default now(),
  last_event_at timestamptz
);
create index email_sends_contact_idx on public.email_sends (contact_id);
alter table public.email_sends enable row level security;

create policy "email_sends_select_own_book" on public.email_sends
  for select to authenticated
  using (exists (select 1 from public.books b
                 where b.id = book_id and b.owner_id = (select auth.uid())));

-- ── contact_events (audit): owner may read; writes via definer/admin only ─
create table public.contact_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  source text not null check (source in ('owner','token','submission')),
  diff jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.contact_events enable row level security;

create policy "contact_events_select_own" on public.contact_events
  for select to authenticated
  using (exists (select 1 from public.contacts c
                 join public.books b on b.id = c.book_id
                 where c.id = contact_id and b.owner_id = (select auth.uid())));

-- ── explicit least-privilege grants ─────────────────────────────────────
-- Current Supabase defaults no longer auto-expose new public tables to
-- client roles, so every privilege is granted explicitly. RLS policies
-- above then filter rows within these grants. anon gets NOTHING;
-- update_tokens gets NOTHING for any client-facing role.
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.books to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, update, delete on public.submissions to authenticated; -- no insert: definer fn only
grant select on public.email_sends to authenticated;
grant select on public.contact_events to authenticated;
```

**Step 4: Apply and smoke-check**

```bash
pnpm supabase db reset
```

Expected: migration applies cleanly.

**Step 5: Commit**

```bash
git add supabase/ && git commit -m "feat: core schema with default-deny RLS"
```

---

## Task 3: pgTAP RLS regression tests

**Files:**
- Create: `supabase/tests/database/01_rls.sql`

**Step 1: Write the failing tests**

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- fixtures: two users, two books, one contact each
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner1@test.dev'),
  ('00000000-0000-0000-0000-000000000002', 'owner2@test.dev');

insert into public.books (id, owner_id, slug, title) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'book-one', 'Book One'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'book-two', 'Book Two');

insert into public.contacts (id, book_id, full_name, email) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Alice A', 'alice@test.dev'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Bob B', 'bob@test.dev');

insert into public.update_tokens (contact_id, token_hash, expires_at) values
  ('20000000-0000-0000-0000-000000000001', '\xdeadbeef', now() + interval '30 days');

-- helper to impersonate
create or replace function tests.authenticate_as(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid, true);
  execute 'set local role authenticated';
end $$;

-- 1. structural guardrail: every public table has RLS enabled
select is_empty(
  $$ select tablename from pg_tables where schemaname = 'public' and rowsecurity = false $$,
  'every table in public has RLS enabled');

-- as owner1
select tests.authenticate_as('00000000-0000-0000-0000-000000000001');
select results_eq('select count(*) from public.contacts', array[1::bigint], 'owner1 sees exactly own contact');
select results_eq('select full_name from public.contacts', array['Alice A'], 'owner1 sees Alice not Bob');
select results_eq('select count(*) from public.books', array[1::bigint], 'owner1 sees one book');
select results_eq('select count(*) from public.update_tokens', array[0::bigint], 'update_tokens invisible even to owner');
select results_eq('select count(*) from public.profiles', array[1::bigint], 'owner1 sees only own profile');
select throws_ok(
  $$ insert into public.contacts (book_id, full_name)
     values ('10000000-0000-0000-0000-000000000002', 'Sneaky') $$,
  '42501', null, 'owner1 cannot insert into owner2''s book');
select throws_ok(
  $$ insert into public.submissions (book_id, payload)
     values ('10000000-0000-0000-0000-000000000001', '{}') $$,
  '42501', null, 'even owner cannot insert submissions directly');
select throws_ok(
  $$ insert into public.update_tokens (contact_id, token_hash, expires_at)
     values ('20000000-0000-0000-0000-000000000001', '\xff', now()) $$,
  '42501', null, 'authenticated cannot mint tokens');

-- as owner2
select tests.authenticate_as('00000000-0000-0000-0000-000000000002');
select results_eq('select full_name from public.contacts', array['Bob B'], 'owner2 sees Bob not Alice');
select is_empty(
  $$ update public.contacts set full_name = 'pwned'
     where id = '20000000-0000-0000-0000-000000000001' returning id $$,
  'owner2 cannot update owner1''s contact');

-- as anon
reset role;
set local role anon;
select results_eq('select count(*) from public.contacts', array[0::bigint], 'anon sees nothing');

select * from finish();
rollback;
```

Note: create the `tests` schema first — add to the top of the file after `begin;`:

```sql
create schema if not exists tests;
```

**Step 2: Run tests**

Run: `pnpm supabase test db`
Expected: 12/12 pass. If `authenticate_as` fixture or a policy is wrong, fix the migration (edit + `db reset`), not the assertions.

**Step 3: Commit**

```bash
git add supabase/tests/ && git commit -m "test: pgTAP RLS isolation suite"
```

---

## Task 4: SECURITY DEFINER functions + rate limiting (migration 2)

**Files:**
- Create: `supabase/migrations/00000000000002_private_functions.sql`
- Create: `supabase/tests/database/02_functions.sql`

**Step 1: Write failing pgTAP tests first** (`supabase/tests/database/02_functions.sql`)

```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'own@test.dev');
update public.profiles set full_name = 'Sean O' where id = '00000000-0000-0000-0000-0000000000a1';
insert into public.books (id, owner_id, slug, title, enabled_fields) values
  ('10000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1',
   'seans-book', 'Sean''s Book', '{"partner_name": true, "kids_names": false, "birthday": true}');
insert into public.contacts (id, book_id, full_name, email, city) values
  ('20000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000a1',
   'Alice A', 'alice@test.dev', 'Oldtown');

-- token whose plaintext is 'testtoken' (hash computed inline)
insert into public.update_tokens (contact_id, token_hash, expires_at) values
  ('20000000-0000-0000-0000-0000000000a1', extensions.digest('testtoken', 'sha256'), now() + interval '30 days'),
  ('20000000-0000-0000-0000-0000000000a1', extensions.digest('expiredtoken', 'sha256'), now() - interval '1 day');

-- get_contact_for_token
select ok((private.get_contact_for_token('testtoken')) -> 'contact' ->> 'full_name' = 'Alice A',
  'valid token returns contact');
select ok((private.get_contact_for_token('testtoken')) ->> 'owner_name' = 'Sean O',
  'valid token returns owner name');
select ok(private.get_contact_for_token('expiredtoken') is null, 'expired token returns null');
select ok(private.get_contact_for_token('nosuchtoken') is null, 'unknown token returns null');

-- apply_token_update: happy path, respects enabled_fields, single-use
select ok(private.apply_token_update('testtoken',
  '{"full_name": "Alice Updated", "city": "Newtown", "kids_names": "ShouldBeIgnored"}'),
  'apply_token_update returns true');
select results_eq(
  $$ select full_name, city, kids_names from public.contacts
     where id = '20000000-0000-0000-0000-0000000000a1' $$,
  $$ values ('Alice Updated', 'Newtown', null::text) $$,
  'update applied; disabled field ignored');
select ok(not private.apply_token_update('testtoken', '{"city": "Again"}'),
  'token is single-use');
select results_eq(
  $$ select count(*) from public.contact_events
     where contact_id = '20000000-0000-0000-0000-0000000000a1' and source = 'token' $$,
  array[1::bigint], 'audit row written');

-- submit_to_book: inserts pending submission, matches on email, enum-proof return
select ok((private.submit_to_book('seans-book', '{"full_name": "New Guy", "email": "alice@test.dev"}')) = true,
  'submit to valid slug succeeds');
select results_eq(
  $$ select status, (matched_contact_id is not null) from public.submissions $$,
  $$ values ('pending', true) $$,
  'submission pending and matched to existing contact by email');

-- rate limit
select ok(private.check_rate_limit('k1', 2, 60) and private.check_rate_limit('k1', 2, 60)
          and not private.check_rate_limit('k1', 2, 60),
  'third call within window is rejected');

select * from finish();
rollback;
```

**Step 2: Run tests to verify they fail**

Run: `pnpm supabase test db` → expect failures: `function private.get_contact_for_token does not exist`.

**Step 3: Write the migration** (`supabase/migrations/00000000000002_private_functions.sql`)

```sql
-- The only code paths that touch update_tokens or write submissions.
-- All are SECURITY DEFINER, locked search_path, EXECUTE revoked from
-- client-reachable roles. Called exclusively from Next.js server code.

-- ── rate limiting (fixed window, Postgres-backed, no extra infra) ───────
create table private.rate_limits (
  key text primary key,
  count int not null,
  window_start timestamptz not null
);

create or replace function private.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  insert into private.rate_limits as r (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                 then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                        then now() else r.window_start end
  returning r.count <= p_max into v_ok;
  return v_ok;
end $$;

-- ── token read ──────────────────────────────────────────────────────────
create or replace function private.get_contact_for_token(p_token text)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'contact', jsonb_build_object(
      'full_name', c.full_name, 'partner_name', c.partner_name,
      'kids_names', c.kids_names, 'email', c.email, 'birthday', c.birthday,
      'address_line1', c.address_line1, 'address_line2', c.address_line2,
      'city', c.city, 'state_region', c.state_region,
      'postal_code', c.postal_code, 'country', c.country),
    'enabled_fields', b.enabled_fields,
    'owner_name', p.full_name,
    'book_title', b.title)
  from public.update_tokens t
  join public.contacts c on c.id = t.contact_id
  join public.books b on b.id = c.book_id
  join public.profiles p on p.id = b.owner_id
  where t.token_hash = extensions.digest(p_token, 'sha256')
    and t.expires_at > now()
    and t.used_at is null
$$;

-- ── token update (single-use, respects enabled_fields, audited) ─────────
create or replace function private.apply_token_update(p_token text, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_contact_id uuid;
  v_enabled jsonb;
  v_before jsonb;
begin
  select t.contact_id, b.enabled_fields
    into v_contact_id, v_enabled
  from public.update_tokens t
  join public.contacts c on c.id = t.contact_id
  join public.books b on b.id = c.book_id
  where t.token_hash = extensions.digest(p_token, 'sha256')
    and t.expires_at > now()
    and t.used_at is null
  for update of t;

  if v_contact_id is null then return false; end if;

  select to_jsonb(c) - 'created_at' - 'updated_at' into v_before
  from public.contacts c where c.id = v_contact_id;

  update public.contacts c set
    full_name    = coalesce(nullif(trim(p_payload ->> 'full_name'), ''), c.full_name),
    email        = coalesce(nullif(trim(p_payload ->> 'email'), '')::extensions.citext, c.email),
    partner_name = case when (v_enabled ->> 'partner_name')::boolean and p_payload ? 'partner_name'
                        then nullif(trim(p_payload ->> 'partner_name'), '') else c.partner_name end,
    kids_names   = case when (v_enabled ->> 'kids_names')::boolean and p_payload ? 'kids_names'
                        then nullif(trim(p_payload ->> 'kids_names'), '') else c.kids_names end,
    birthday     = case when (v_enabled ->> 'birthday')::boolean and p_payload ? 'birthday'
                        then nullif(trim(p_payload ->> 'birthday'), '')::date else c.birthday end,
    address_line1 = case when p_payload ? 'address_line1' then nullif(trim(p_payload ->> 'address_line1'), '') else c.address_line1 end,
    address_line2 = case when p_payload ? 'address_line2' then nullif(trim(p_payload ->> 'address_line2'), '') else c.address_line2 end,
    city          = case when p_payload ? 'city' then nullif(trim(p_payload ->> 'city'), '') else c.city end,
    state_region  = case when p_payload ? 'state_region' then nullif(trim(p_payload ->> 'state_region'), '') else c.state_region end,
    postal_code   = case when p_payload ? 'postal_code' then nullif(trim(p_payload ->> 'postal_code'), '') else c.postal_code end,
    country       = case when p_payload ? 'country' then nullif(trim(p_payload ->> 'country'), '') else c.country end
  where c.id = v_contact_id;

  update public.update_tokens
    set used_at = now()
  where token_hash = extensions.digest(p_token, 'sha256');

  insert into public.contact_events (contact_id, source, diff)
  values (v_contact_id, 'token',
          jsonb_build_object('before', v_before, 'payload', p_payload));

  return true;
end $$;

-- ── permalink submit (write-only, enumeration-proof) ────────────────────
create or replace function private.submit_to_book(p_slug text, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_book_id uuid;
  v_match uuid;
begin
  select id into v_book_id from public.books where slug = p_slug;
  if v_book_id is null then return false; end if;

  select id into v_match from public.contacts
  where book_id = v_book_id
    and email = nullif(trim(p_payload ->> 'email'), '')::extensions.citext;

  insert into public.submissions (book_id, payload, matched_contact_id)
  values (v_book_id, p_payload, v_match);

  return true;
end $$;

-- lock down: only the direct server connection may execute
revoke all on function private.check_rate_limit(text, int, int) from public, anon, authenticated;
revoke all on function private.get_contact_for_token(text) from public, anon, authenticated;
revoke all on function private.apply_token_update(text, jsonb) from public, anon, authenticated;
revoke all on function private.submit_to_book(text, jsonb) from public, anon, authenticated;
```

**Step 4: Apply and run tests**

```bash
pnpm supabase db reset && pnpm supabase test db
```

Expected: both test files pass (12 + 11).

**Step 5: Commit**

```bash
git add supabase/ && git commit -m "feat: security definer functions with pgTAP coverage"
```

---

## Task 5: Drizzle schema + RLS transaction wrapper

**Files:**
- Create: `src/lib/db/schema.ts`, `src/lib/db/index.ts`, `src/lib/db/rls.test.ts`

**Step 1: Handwrite Drizzle schema mirroring the migrations** (`src/lib/db/schema.ts`)

```ts
import {
  pgTable, uuid, text, jsonb, timestamp, date, customType,
} from "drizzle-orm/pg-core";

const citext = customType<{ data: string }>({ dataType: () => "citext" });
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  fullName: text("full_name").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const books = pgTable("books", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  enabledFields: jsonb("enabled_fields").notNull().$type<{
    partner_name: boolean; kids_names: boolean; birthday: boolean;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookId: uuid("book_id").notNull(),
  fullName: text("full_name").notNull(),
  partnerName: text("partner_name"),
  kidsNames: text("kids_names"),
  email: citext("email"),
  birthday: date("birthday"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  stateRegion: text("state_region"),
  postalCode: text("postal_code"),
  country: text("country"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookId: uuid("book_id").notNull(),
  payload: jsonb("payload").notNull().$type<Record<string, string>>(),
  status: text("status").notNull().default("pending"),
  matchedContactId: uuid("matched_contact_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const updateTokens = pgTable("update_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id").notNull(),
  tokenHash: bytea("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailSends = pgTable("email_sends", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id").notNull(),
  bookId: uuid("book_id").notNull(),
  resendId: text("resend_id"),
  status: text("status").notNull().default("sent"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
});

export const contactEvents = pgTable("contact_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id").notNull(),
  source: text("source").notNull(),
  diff: jsonb("diff").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Step 2: Write the RLS wrapper** (`src/lib/db/index.ts`)

```ts
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
  return dbAdmin.transaction(async (tx) => {
    await tx.execute(sql`
      select set_config('request.jwt.claims', ${JSON.stringify({ ...claims, role: "authenticated" })}, true)`);
    await tx.execute(sql`
      select set_config('request.jwt.claim.sub', ${claims.sub}, true)`);
    await tx.execute(sql`set local role authenticated`);
    try {
      return await fn(tx);
    } finally {
      await tx.execute(sql`reset role`);
    }
  });
}
```

**Step 3: Write an integration test proving the wrapper enforces RLS** (`src/lib/db/rls.test.ts`)

Runs against the local Supabase stack (started in Task 2). This is the TS-side mirror of the pgTAP suite — it proves the *wrapper* sets the context correctly.

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { dbAdmin, withRls } from "./index";
import { contacts, updateTokens } from "./schema";

const U1 = "00000000-0000-0000-0000-00000000b001";
const U2 = "00000000-0000-0000-0000-00000000b002";
const B1 = "10000000-0000-0000-0000-00000000b001";

describe("withRls", () => {
  beforeAll(async () => {
    await dbAdmin.execute(sql`
      insert into auth.users (id, email) values
        (${U1}, 'rlstest1@test.dev'), (${U2}, 'rlstest2@test.dev')
      on conflict (id) do nothing`);
    await dbAdmin.execute(sql`
      insert into public.books (id, owner_id, slug, title)
      values (${B1}, ${U1}, 'rls-test-book', 'RLS Test')
      on conflict (id) do nothing`);
    await dbAdmin.execute(sql`
      insert into public.contacts (book_id, full_name)
      values (${B1}, 'RLS Test Contact')
      on conflict do nothing`);
  });

  it("owner sees own contacts", async () => {
    const rows = await withRls({ sub: U1 }, (tx) => tx.select().from(contacts));
    expect(rows.some((r) => r.fullName === "RLS Test Contact")).toBe(true);
  });

  it("other user sees nothing", async () => {
    const rows = await withRls({ sub: U2 }, (tx) => tx.select().from(contacts));
    expect(rows.filter((r) => r.bookId === B1)).toHaveLength(0);
  });

  it("update_tokens are invisible under RLS", async () => {
    const rows = await withRls({ sub: U1 }, (tx) => tx.select().from(updateTokens));
    expect(rows).toHaveLength(0);
  });
});
```

**Step 4: Run** `pnpm test` → expect 3 pass (requires `supabase start` running and `.env.local` loaded — add `import "dotenv/config"` handling: install `dotenv` and add `env: { ...loadEnv }` OR simpler: run vitest with `pnpm dlx dotenv-cli`? Simplest: add to `vitest.config.ts`:

```ts
import { loadEnv } from "vite";
// inside defineConfig:
test: { environment: "node", include: ["src/**/*.test.ts"], env: loadEnv("", process.cwd(), "") },
```

**Step 5: Commit** `git add src/lib/db vitest.config.ts && git commit -m "feat: drizzle schema + RLS transaction wrapper with integration tests"`

---

## Task 6: Auth (Supabase SSR) + login page

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`, `src/middleware.ts`, `src/lib/auth.ts`, `src/app/login/page.tsx`, `src/app/auth/confirm/route.ts`, `src/app/auth/signout/route.ts`

**Step 1: Supabase server client** (`src/lib/supabase/server.ts`) — standard `@supabase/ssr` cookie pattern:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all) => {
          try {
            all.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {} // server component context — middleware handles refresh
        },
      },
    },
  );
}
```

**Step 2: Session-refresh middleware** (`src/lib/supabase/middleware.ts` + `src/middleware.ts`) — copy the canonical `@supabase/ssr` `updateSession` pattern from Supabase docs verbatim; matcher excludes `_next/*`, static assets, `/b/*`, `/u/*`, `/api/webhooks/*` (public routes need no session work).

**Step 3: Auth gate helper** (`src/lib/auth.ts`)

```ts
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SessionClaims = { sub: string; email?: string; [k: string]: unknown };

/** Validated JWT claims or redirect to /login. Use in every dashboard page/action. */
export async function requireUser(): Promise<SessionClaims> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");
  return data.claims as SessionClaims;
}
```

**Step 4: Login page** (`src/app/login/page.tsx`): email input → server action calling `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${APP_URL}/auth/confirm` } })`; plus "Sign in with Google" button → `signInWithOAuth`. `src/app/auth/confirm/route.ts` exchanges `token_hash`/`code` for a session (canonical Supabase SSR confirm route) then redirects to `/dashboard`. `signout` route calls `supabase.auth.signOut()` and redirects `/`.

**Step 5: Verify manually**

`pnpm dev`, visit `/login`, submit your email, open Inbucket (`http://127.0.0.1:54324`), click magic link, expect redirect to `/dashboard` (404 for now — that's fine, session cookie set).

**Step 6: Commit** `git commit -m "feat: supabase ssr auth with magic link + google"`

---

## Task 7: Onboarding + settings (book create/edit)

**Files:**
- Create: `src/lib/validation/book.ts`, `src/app/dashboard/settings/page.tsx`, `src/app/dashboard/settings/actions.ts`, `src/app/dashboard/layout.tsx`, `src/lib/validation/book.test.ts`

**Step 1: Failing Vitest for slug/book validation** (`src/lib/validation/book.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { bookSchema } from "./book";

describe("bookSchema", () => {
  it("accepts valid input", () => {
    expect(bookSchema.safeParse({
      title: "Sean's Book", slug: "sean-oliver",
      partner_name: true, kids_names: false, birthday: true,
    }).success).toBe(true);
  });
  it.each(["ab", "-bad", "Bad Slug", "a".repeat(64), "sean_oliver"])(
    "rejects slug %s", (slug) => {
      expect(bookSchema.safeParse({ title: "T", slug, partner_name: true, kids_names: true, birthday: true }).success).toBe(false);
    });
  it("rejects empty title", () => {
    expect(bookSchema.safeParse({ title: "", slug: "good-slug", partner_name: true, kids_names: true, birthday: true }).success).toBe(false);
  });
});
```

**Step 2: Run** `pnpm test` → fails (no module).

**Step 3: Implement** (`src/lib/validation/book.ts`)

```ts
import { z } from "zod";

export const bookSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}$/,
    "3-63 chars; lowercase letters, numbers, hyphens; must start alphanumeric"),
  partner_name: z.boolean(),
  kids_names: z.boolean(),
  birthday: z.boolean(),
});
export type BookInput = z.infer<typeof bookSchema>;
```

**Step 4: Run** `pnpm test` → pass. Commit `test+feat: book validation`.

**Step 5: Server actions** (`src/app/dashboard/settings/actions.ts`): `requireUser()` → parse with `bookSchema` → `withRls(claims, tx => tx.insert(books).values({...}).onConflictDoUpdate(...))` (upsert on owner). RLS `WITH CHECK` guarantees `ownerId` honesty, but set it from `claims.sub` anyway. `revalidatePath("/dashboard")`.

**Step 6: Settings page**: server component; loads own book via `withRls`; form (title, slug, three checkboxes for optional fields) posting to the action. `dashboard/layout.tsx`: calls `requireUser()`, renders nav (Contacts / Review / Settings / Sign out). If user has no book yet, `/dashboard` redirects to `/dashboard/settings` with an onboarding hint.

**Step 7: Manual verify:** log in, create book, edit toggles, confirm persisted (reload). Commit.

---

## Task 8: Dashboard contact list

**Files:**
- Create: `src/app/dashboard/page.tsx`, `src/lib/queries/contacts.ts`

**Step 1: Query helper** (`src/lib/queries/contacts.ts`): `listContacts(claims, search?)` → `withRls` select from `contacts` joined with latest `email_sends` status and "updated" flag (any `contact_events.source='token'` newer than latest send), filtered with `ilike` on `full_name` OR `partner_name` when `search` present, ordered by `full_name`.

**Step 2: Page**: server component reading `?q=` searchParam; table columns: Name, Partner, Email, City/Country, Status chip, Updated-at. Search form (GET). Each row links to `/dashboard/contacts/[id]`. Empty state: "Import a CSV or add your first contact."

**Step 3: Manual verify** with a couple of hand-inserted rows (`dbAdmin` seed script or SQL editor). Commit.

---

## Task 9: Contact CRUD

**Files:**
- Create: `src/lib/validation/contact.ts` (+ `.test.ts`), `src/app/dashboard/contacts/new/page.tsx`, `src/app/dashboard/contacts/[id]/page.tsx`, `src/app/dashboard/contacts/actions.ts`, `src/components/contact-form.tsx`

**Step 1: Failing tests for `contactSchema`** — trims strings, empty→undefined, max lengths mirror SQL checks (name 200, notes 2000, email 320 + `z.email()`), birthday `YYYY-MM-DD` or empty, rejects missing `full_name`.

**Step 2–3: Implement schema, tests green, commit.**

```ts
import { z } from "zod";

const opt = (max: number) =>
  z.string().trim().max(max).transform((s) => s === "" ? undefined : s).optional();

export const contactSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  partner_name: opt(200),
  kids_names: opt(500),
  email: z.string().trim().max(320).pipe(z.email().or(z.literal(""))).transform((s) => s === "" ? undefined : s).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal("")).transform((s) => s === "" ? undefined : s).optional(),
  address_line1: opt(200), address_line2: opt(200),
  city: opt(120), state_region: opt(120),
  postal_code: opt(20), country: opt(120),
  notes: opt(2000),
});
export type ContactInput = z.infer<typeof contactSchema>;
```

**Step 4: Actions** (`createContact`, `updateContact`, `deleteContact`): `requireUser` → parse → `withRls` write scoped to own book (resolve `bookId` inside the same RLS tx — never trust a client-posted bookId) → insert `contact_events` row with `source: 'owner'` via the same tx (needs an insert policy? No — write audit via `dbAdmin` after the RLS write succeeds; keep `contact_events` client-unwritable) → `revalidatePath`.

**Step 5: `ContactForm` component** (client): all fields, used by new + edit pages; edit page also shows audit trail (`contact_events` via RLS select) and a delete button with confirm.

**Step 6: Manual verify CRUD round-trip. Commit.**

---

## Task 10: CSV import

**Files:**
- Create: `src/lib/csv/import.ts` (+ `.test.ts`), `src/app/dashboard/import/page.tsx`, `src/app/dashboard/import/actions.ts`

**Step 1: Failing tests** for `parseContactsCsv(text)`: maps canonical headers (`full_name,partner_name,kids_names,email,birthday,address_line1,address_line2,city,state_region,postal_code,country,notes`), tolerates common aliases (`name`→full_name, `partner`/`spouse`→partner_name, `zip`→postal_code, `state`→state_region), returns `{ valid: ContactInput[], errors: { row: number, message: string }[] }`, caps at 1000 rows, validates each row with `contactSchema`.

**Step 2–3: Implement with Papaparse (`header: true, skipEmptyLines: true`), tests green, commit.**

**Step 4: Import page**: client component — file input → parse in browser → preview table (first 20 rows + error list) → confirm → server action `importContacts(rows)` which re-validates every row server-side (`z.array(contactSchema).max(1000)`) and bulk-inserts via `withRls`, skipping rows whose email already exists in the book (report skipped count back). Provide a "download template CSV" link (static file in `public/`).

**Step 5: Manual verify with a 5-row CSV including one bad row. Commit.**

---

## Task 11: CSV export

**Files:**
- Create: `src/lib/csv/export.ts` (+ `.test.ts`), `src/app/dashboard/export/route.ts`

**Step 1: Failing tests** for `contactsToCsv(rows)`: canonical header order, RFC-4180 quoting (commas/quotes/newlines in values), empty fields as empty strings, CRLF line endings.

**Step 2–3: Implement (hand-rolled ~20 lines or Papaparse `unparse`), green, commit.**

**Step 4: Route handler** (GET): `requireUser` → `withRls` select all contacts → `contactsToCsv` → `Response` with `Content-Type: text/csv` and `Content-Disposition: attachment; filename="address-book.csv"`. Add Export button on dashboard.

**Step 5: Manual verify download opens in Numbers/Excel. Commit.**

---

## Task 12: Tokens + "Request addresses" send flow

**Files:**
- Create: `src/lib/tokens.ts` (+ `.test.ts`), `src/lib/email/resend.ts`, `src/lib/email/templates.ts`, `src/app/dashboard/actions.ts` (requestAddresses), send UI on dashboard

**Step 1: Failing tests** (`src/lib/tokens.ts`): `generateToken()` returns `{ token, hash }` where token is 43-char base64url (32 bytes) and hash is the sha256 of the token; two calls never collide; `hashToken(token)` deterministic and equal to `generateToken`'s own hash.

**Step 2–3: Implement + green + commit**

```ts
import { createHash, randomBytes } from "node:crypto";

export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}
export function generateToken(): { token: string; hash: Buffer } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}
export const TOKEN_TTL_DAYS = 30;
```

**Step 3b: Email layer** (`src/lib/email/resend.ts`): thin wrapper — `sendAddressRequests(batch: { to, subject, html }[])` using `resend.batch.send` in chunks of 100; when `EMAIL_DRY_RUN=1`, log and return fake ids (`dry_<n>`). `templates.ts`: `addressRequestEmail({ ownerName, updateUrl })` → plain, friendly HTML + text: "Sean is updating their address book — confirm or update your address here." **No address data in the email body.** Subject: `"${ownerName} would like your current mailing address"`.

**Step 4: `requestAddresses` server action** (`src/app/dashboard/actions.ts`):

1. `requireUser`; input `{ contactIds: string[] } | { all: true }` (Zod).
2. `withRls`: select the target contacts **that have an email** — this both authorizes (RLS) and filters. Take the returned ids as the authorized set.
3. For each: `generateToken()`; insert `{ contactId, tokenHash, expiresAt: now + 30d }` into `update_tokens` via `dbAdmin` (documented admin-path exception; contact ids came from the RLS query in step 2).
4. Build `updateUrl = ${APP_URL}/u/${token}`; send via email layer; insert `email_sends` rows (`resendId` from response) via `dbAdmin`.
5. Return `{ sent, skippedNoEmail }` for a toast/banner.

**Step 5: Dashboard UI**: checkbox column + "Request addresses" button (and "Send to all"). Confirmation dialog shows count before sending.

**Step 6: Verify with `EMAIL_DRY_RUN=1`:** trigger send, check server log shows dry-run URLs, `update_tokens` and `email_sends` rows exist. Grab a logged `/u/<token>` URL for the next task. Commit.

---

## Task 13: Recipient update page `/u/[token]`

**Files:**
- Create: `src/app/u/[token]/page.tsx`, `src/app/u/[token]/actions.ts`, `src/components/turnstile.tsx`, `src/lib/turnstile.ts`, `src/lib/request-ip.ts`

**Step 1: Turnstile verify helper** (`src/lib/turnstile.ts`)

```ts
export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY!,
      response: token,
      ...(ip ? { remoteip: ip } : {}),
    }),
  });
  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}
```

`request-ip.ts`: read `x-forwarded-for` first hop (Vercel-set) with fallback `"unknown"`. `turnstile.tsx`: client component rendering the Turnstile widget (script tag + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`), hidden input `cf-turnstile-response`.

**Step 2: Page** (server component):

1. Rate-limit check: `dbAdmin` → `select private.check_rate_limit(${'token-view:' + sha256(ip)}, 30, 3600)`; on false → generic "Too many requests" page.
2. `select private.get_contact_for_token(${token})` via `dbAdmin`.
3. `null` → render the generic not-found page: "This link is invalid or has expired. Ask {nothing — we don't know the owner} — copy: 'Ask the person who sent it for a fresh link.'" Same page for invalid/expired/used (no distinction).
4. Valid → form pre-filled with the contact's own data; render optional fields only if `enabled_fields` allows; heading "Update your address for {owner_name}". Turnstile widget at the bottom.

**Step 3: Submit action** (`actions.ts`):

1. Zod-parse form (reuse `contactSchema` minus notes).
2. `verifyTurnstile` → fail = generic error.
3. Rate limit `token-submit:` key (10/hour).
4. `dbAdmin` → `select private.apply_token_update(${token}, ${payload})`.
5. `true` → thank-you screen. `false` → same generic invalid-link page.

**Step 4: Manual verify:** open dry-run URL → form pre-filled → change city → submit → thank-you; dashboard shows new city + "updated" status; reload token URL → generic invalid page (single-use). Commit.

---

## Task 14: Public permalink `/b/[slug]`

**Files:**
- Create: `src/app/b/[slug]/page.tsx`, `src/app/b/[slug]/actions.ts`

**Step 1: Page** (server): look up book by slug via `dbAdmin` (select only `title`, `enabled_fields`, owner `full_name` — never counts or contents). Unknown slug → `notFound()`. Renders: "Add your address to {owner}'s address book", the write-only form (same fields as token form, all blank), Turnstile. Explicit copy: "Only {owner} can see what you submit."

**Step 2: Submit action:**

1. Zod parse (`contactSchema` minus notes) — require `full_name`; email optional but encouraged.
2. `verifyTurnstile`.
3. Rate limit `permalink:` + hashed IP (5/hour) AND `permalink-book:` + slug (100/day) — second key stops distributed spam on one book.
4. `dbAdmin` → `select private.submit_to_book(${slug}, ${payload})` → false → `notFound()`.
5. Notify owner: look up owner's auth email via `dbAdmin` (join `auth.users`), send "New address submission — review it" email (no submitted data in email body). Fire-and-forget with try/catch.
6. Render identical "Thanks! {owner} will review your info." — same response whether or not the email matched an existing contact.

**Step 3: Manual verify:** submit as a stranger; check `submissions` row created (with `matched_contact_id` set when email matches); same thank-you both ways. Commit.

---

## Task 15: Review queue

**Files:**
- Create: `src/app/dashboard/review/page.tsx`, `src/app/dashboard/review/actions.ts`

**Step 1: Page**: `requireUser` → `withRls` select pending submissions; each card shows payload fields; if `matched_contact_id`, show side-by-side diff with current contact values and label "Possible update to existing contact".

**Step 2: Actions** (all `withRls`):
- `approveNew(submissionId)` → parse payload with `contactSchema` → insert contact (skip if email now conflicts → surface error) → mark approved.
- `approveMerge(submissionId)` → update matched contact with non-empty payload fields → mark approved.
- Both write `contact_events` (`source: 'submission'`) via `dbAdmin`.
- `reject(submissionId)` → mark rejected.

Note `submissions_update_own_book` policy allows the status change and RLS scopes everything else. Payload is untrusted input — it is Zod-validated here *again* before touching `contacts`, and DB CHECK constraints are the third net.

**Step 3: Manual verify all three buttons. Commit.**

---

## Task 16: Resend webhook + status chips

**Files:**
- Create: `src/app/api/webhooks/resend/route.ts`

**Step 1: Route** (POST):

```ts
import { Webhook } from "svix";
import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { dbAdmin } from "@/lib/db";

const EVENT_TO_STATUS: Record<string, string> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

export async function POST(req: Request) {
  const payload = await req.text();
  const h = await headers();
  let evt: { type: string; data: { email_id: string } };
  try {
    evt = new Webhook(process.env.RESEND_WEBHOOK_SECRET!).verify(payload, {
      "svix-id": h.get("svix-id")!,
      "svix-timestamp": h.get("svix-timestamp")!,
      "svix-signature": h.get("svix-signature")!,
    }) as typeof evt;
  } catch {
    return new Response("invalid signature", { status: 401 });
  }
  const status = EVENT_TO_STATUS[evt.type];
  if (status) {
    // never regress a bounce back to delivered/opened
    await dbAdmin.execute(sql`
      update public.email_sends
      set status = ${status}, last_event_at = now()
      where resend_id = ${evt.data.email_id}
        and status not in ('bounced','complained')`);
  }
  return new Response("ok");
}
```

**Step 2: Verify locally** with a hand-signed svix payload (svix lib can sign: small script in `scratch/`), or defer to production smoke test — document which you did.

**Step 3: Dashboard status chips** already read `email_sends.status` (Task 8); confirm chips render: `sent / delivered / opened / bounced / updated`. Commit.

---

## Task 17: Playwright happy paths

**Files:**
- Create: `playwright.config.ts`, `e2e/owner-flow.spec.ts`, `e2e/token-update.spec.ts`, `e2e/permalink.spec.ts`, `e2e/helpers.ts`

**Step 1: Config**: baseURL `http://localhost:3000`, `webServer: { command: "pnpm dev", reuseExistingServer: true }`. Helper `loginAs(page, email)`: request magic link, fetch it from Inbucket's REST API (`http://127.0.0.1:54324/api/v1/mailbox/...`), visit it.

**Step 2: Specs**
- `owner-flow`: login → create book → add contact → see it listed → export CSV (assert header row).
- `token-update`: seed contact + token directly via `dbAdmin` in the spec (import the lib) → visit `/u/<token>` → assert pre-filled name → change city → submit → thank-you → second visit shows invalid-link page.
- `permalink`: visit `/b/<slug>` → fill form → submit → thank-you → login as owner → review queue shows submission → approve → contact exists.

(Turnstile test keys auto-pass, so no bot-wall in e2e.)

**Step 3: Run** `pnpm exec playwright test` → 3 specs green. Add `"e2e": "playwright test"` script. Commit.

---

## Task 18: README, security docs, production checklist

**Files:**
- Create: `README.md`, `docs/SECURITY.md`, `.github/workflows/ci.yml`

**Step 1: README**: what it is, local dev (`supabase start`, `pnpm dev`), env table, deploy-to-Vercel steps.

**Step 2: `docs/SECURITY.md`** — the OSS security story:
- Architecture (two walls: server code + RLS; browser never reaches data APIs)
- **Production checklist:** Dashboard → Settings → Data API → **remove all exposed schemas**; confirm `DATABASE_URL` uses the pooler with the `postgres` role only in Vercel server env; enable Supabase Auth email rate limits; set real Turnstile keys; configure Resend domain (SPF/DKIM) + webhook secret; Vercel env vars marked Sensitive.
- Token design, enumeration-proofing, rate limits, audit trail.
- Reporting a vulnerability (email).

**Step 3: CI** (`.github/workflows/ci.yml`): jobs — `lint` (next lint + tsc), `unit` (vitest), `db` (supabase CLI action: `supabase start` → `supabase test db`). Playwright optional nightly (skip in v1 CI if flaky).

**Step 4: Final full run:** `pnpm lint && pnpm test && pnpm test:db && pnpm exec playwright test` — all green.

**Step 5: Commit.** Tag `v0.1.0`.

---

## Deferred (explicitly NOT in this plan)

Stripe/plans, groups/tags, multiple books, recipient self-service link renewal, Resend broadcast analytics beyond webhook statuses, i18n.
