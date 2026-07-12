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
