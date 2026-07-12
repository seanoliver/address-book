begin;
create schema if not exists tests;
create extension if not exists pgtap with schema extensions;
select plan(14);

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

-- 2. structural guardrail: no residual non-DML privileges for client roles.
-- RLS does NOT apply to TRUNCATE; Supabase default ACLs historically leave
-- TRUNCATE/REFERENCES/TRIGGER/MAINTAIN granted. Must be zero, always.
select is_empty(
  $$ select c.relname, a.privilege_type
     from pg_class c
     cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     join pg_roles r on r.oid = a.grantee
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       and r.rolname in ('anon', 'authenticated')
       and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN') $$,
  'client roles hold no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on any public table');

-- 3. update_tokens: zero privileges of any kind for client roles
select ok(
  not has_table_privilege('authenticated', 'public.update_tokens', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  and not has_table_privilege('anon', 'public.update_tokens', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  'update_tokens grants nothing to client roles');

-- as owner1
select tests.authenticate_as('00000000-0000-0000-0000-000000000001');
select results_eq('select count(*) from public.contacts', array[1::bigint], 'owner1 sees exactly own contact');
select results_eq('select full_name from public.contacts', array['Alice A'], 'owner1 sees Alice not Bob');
select results_eq('select count(*) from public.books', array[1::bigint], 'owner1 sees one book');
-- no grant at all, so even SELECT errors (stronger than RLS row-filtering)
select throws_ok('select count(*) from public.update_tokens', '42501', null,
  'update_tokens not selectable even by owner');
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

-- as owner2 (reset role first: authenticated has no USAGE on schema tests)
reset role;
select tests.authenticate_as('00000000-0000-0000-0000-000000000002');
select results_eq('select full_name from public.contacts', array['Bob B'], 'owner2 sees Bob not Alice');
select is_empty(
  $$ update public.contacts set full_name = 'pwned'
     where id = '20000000-0000-0000-0000-000000000001' returning id $$,
  'owner2 cannot update owner1''s contact');

-- as anon (anon holds zero grants, so even SELECT errors)
reset role;
set local role anon;
select throws_ok('select count(*) from public.contacts', '42501', null,
  'anon cannot even select contacts');

select * from finish();
rollback;
