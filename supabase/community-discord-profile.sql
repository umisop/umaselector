-- Card Exchange Selector — Discord OAuth profile compatibility
-- Run once in Supabase SQL Editor after the Community schema is installed.
-- The migration keeps Community profiles public-safe and never assigns admin roles.

create or replace function public.handle_new_community_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
begin
  requested_name := btrim(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'global_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'user_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'preferred_username'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    ''
  ));

  if char_length(requested_name) < 2 or char_length(requested_name) > 32 then
    requested_name := 'Trainer';
  end if;

  insert into public.community_profiles (id, display_name)
  values (new.id, requested_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Backfill only generic profiles for existing Discord-authenticated users.
-- Custom names that users have already chosen are preserved.
update public.community_profiles as profile
set display_name = picked.display_name,
    updated_at = now()
from (
  select
    u.id,
    left(btrim(coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'global_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'user_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'preferred_username'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      ''
    )), 32) as display_name
  from auth.users as u
  where u.raw_app_meta_data ->> 'provider' = 'discord'
) as picked
where profile.id = picked.id
  and profile.display_name = 'Trainer'
  and char_length(picked.display_name) between 2 and 32;
