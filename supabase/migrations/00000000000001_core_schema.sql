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
