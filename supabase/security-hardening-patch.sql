-- Security hardening for an EXISTING Umaselector deployment.
-- Run in Supabase SQL Editor AFTER community-schema.sql and site-info-and-feedback.sql.
-- Review the comments and test with a second non-admin account after applying.

-- 1) Stop using an email's local-part as a public display name for future users.
create or replace function public.handle_new_community_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requested_name text;
begin
  requested_name := left(btrim(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'global_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'preferred_username'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'user_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
    ''
  )), 32);

  if char_length(requested_name) < 2
    or lower(requested_name) in ('trainer', 'community member') then
    requested_name := 'Player-' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;

  insert into public.community_profiles (id, display_name)
  values (new.id, requested_name)
  on conflict (id) do nothing;

  return new;
end;
$function$;

-- 2) Repair existing profiles only when the public name equals the email local-part
-- AND there is no usable display-name field in Auth metadata or linked identities.
-- A deliberately chosen matching name accompanied by metadata is preserved.
update public.community_profiles as profile
set display_name = 'Player-' || substr(replace(auth_user.id::text, '-', ''), 1, 6),
    updated_at = now()
from auth.users as auth_user
where profile.id = auth_user.id
  and nullif(split_part(coalesce(auth_user.email, ''), '@', 1), '') is not null
  and lower(btrim(profile.display_name)) = lower(btrim(split_part(auth_user.email, '@', 1)))
  and not exists (
    select 1
    from (values
      (auth_user.raw_user_meta_data ->> 'display_name'),
      (auth_user.raw_user_meta_data ->> 'global_name'),
      (auth_user.raw_user_meta_data ->> 'full_name'),
      (auth_user.raw_user_meta_data ->> 'name'),
      (auth_user.raw_user_meta_data ->> 'preferred_username'),
      (auth_user.raw_user_meta_data ->> 'user_name'),
      (auth_user.raw_user_meta_data ->> 'username')
    ) as metadata_names(candidate)
    where nullif(btrim(metadata_names.candidate), '') is not null
  )
  and not exists (
    select 1
    from auth.identities as identity
    cross join lateral jsonb_each_text(coalesce(identity.identity_data, '{}'::jsonb)) as identity_field(field_name, field_value)
    where identity.user_id = auth_user.id
      and identity_field.field_name in ('display_name', 'global_name', 'full_name', 'name', 'preferred_username', 'user_name', 'username')
      and nullif(btrim(identity_field.field_value), '') is not null
  );

-- 3) Explicitly enforce least-privilege table grants for private feedback.
-- This mirrors the hardened site-info-and-feedback.sql for an existing deployment.
alter table public.site_feedback enable row level security;
revoke all privileges on table public.site_feedback from public, anon, authenticated;
grant select, insert, update on table public.site_feedback to authenticated;

-- 4) Use an empty search_path in the SECURITY DEFINER feedback trigger function.
create or replace function public.enforce_site_feedback_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  recent_count integer;
begin
  if new.user_id is distinct from auth.uid() then
    raise exception 'Feedback must be submitted for the signed-in account.' using errcode = '42501';
  end if;

  select count(*)::integer
    into recent_count
    from public.site_feedback as feedback
   where feedback.user_id = new.user_id
     and feedback.created_at > now() - interval '1 hour';

  if recent_count >= 5 then
    raise exception 'You have reached the feedback limit. Please try again later.' using errcode = 'P0001';
  end if;

  return new;
end;
$function$;

-- 5) Trigger-only SECURITY DEFINER functions should not be directly executable by API roles.
revoke all on function public.handle_new_community_user() from public, anon, authenticated;
revoke all on function public.update_community_upvote_count() from public, anon, authenticated;
revoke all on function public.validate_community_recommendation() from public, anon, authenticated;
revoke all on function public.enforce_community_post_rate_limit() from public, anon, authenticated;
revoke all on function public.enforce_community_report_rate_limit() from public, anon, authenticated;
revoke all on function public.refresh_community_scenario_assignments() from public, anon, authenticated;
revoke all on function public.match_community_scenario(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.enforce_site_feedback_rate_limit() from public, anon, authenticated;

-- 6) Keep moderation as the only route for changing the hidden state.
revoke update (is_hidden) on table public.community_recommendations from authenticated;
revoke all on function public.admin_set_community_recommendation_hidden(uuid, boolean) from public, anon;
grant execute on function public.admin_set_community_recommendation_hidden(uuid, boolean) to authenticated;
