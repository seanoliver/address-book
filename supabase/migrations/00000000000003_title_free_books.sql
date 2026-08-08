-- Address books belong to one owner and have no independent title.
-- Preserve useful local data before removing the old title column.

alter table public.profiles rename column full_name to display_name;

update public.profiles p
set display_name = trim(b.title)
from public.books b
where b.owner_id = p.id
  and trim(p.display_name) = ''
  and trim(b.title) <> '';

-- The auth trigger's PL/pgSQL body is parsed when called, so replace it after
-- the column rename. Google commonly supplies full_name or name; magic-link
-- users legitimately begin with an empty display name until onboarding.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    ), 200)
  );
  return new;
end $$;

-- Replace the token read contract before dropping the title it previously
-- selected. Recipient surfaces need only the owner's display name.
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
    'owner_name', p.display_name)
  from public.update_tokens t
  join public.contacts c on c.id = t.contact_id
  join public.books b on b.id = c.book_id
  join public.profiles p on p.id = b.owner_id
  where t.token_hash = extensions.digest(p_token, 'sha256')
    and t.expires_at > now()
    and t.used_at is null
$$;

alter table public.books drop column title;

alter table public.books alter column enabled_fields
  set default '{"partner_name": false, "kids_names": false, "birthday": false}'::jsonb;
