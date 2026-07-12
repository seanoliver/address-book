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
    -- least(): blocked calls needn't keep counting; also rules out int overflow
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds)
                 then 1 else least(r.count + 1, p_max + 1) end,
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
  -- untrusted input: refuse non-object or oversized payloads outright
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or pg_column_size(p_payload) > 65536 then
    return false;
  end if;

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

  -- audit only keys this function can map: junk keys from the untrusted
  -- payload never reach storage
  insert into public.contact_events (contact_id, source, diff)
  values (v_contact_id, 'token', jsonb_build_object(
    'before', v_before,
    'payload', p_payload - array(
      select k from jsonb_object_keys(p_payload) k
      where k not in ('full_name', 'email', 'partner_name', 'kids_names', 'birthday',
                      'address_line1', 'address_line2', 'city', 'state_region',
                      'postal_code', 'country'))));

  return true;
end $$;

-- ── permalink submit (write-only, enumeration-proof) ────────────────────
create or replace function private.submit_to_book(p_slug text, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_book_id uuid;
  v_match uuid;
begin
  -- untrusted input: refuse non-object or oversized payloads outright
  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or pg_column_size(p_payload) > 65536 then
    return false;
  end if;

  select id into v_book_id from public.books where slug = p_slug;
  if v_book_id is null then return false; end if;

  select id into v_match from public.contacts
  where book_id = v_book_id
    -- operator(extensions.=): with search_path='', bare = degrades to
    -- case-sensitive text equality via implicit cast; citext ops live in extensions
    and email operator(extensions.=) nullif(trim(p_payload ->> 'email'), '')::extensions.citext;

  insert into public.submissions (book_id, payload, matched_contact_id)
  values (v_book_id, p_payload, v_match);

  return true;
end $$;

-- lock down: only the direct server connection may execute
revoke all on function private.check_rate_limit(text, int, int) from public, anon, authenticated;
revoke all on function private.get_contact_for_token(text) from public, anon, authenticated;
revoke all on function private.apply_token_update(text, jsonb) from public, anon, authenticated;
revoke all on function private.submit_to_book(text, jsonb) from public, anon, authenticated;
