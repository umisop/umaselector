-- Security hardening migration for an already-installed Community v1 schema.
-- Run in Supabase SQL Editor after community-schema.sql has already been applied.

-- Do not allow authenticated clients to insert arbitrary vote IDs/timestamps.
revoke insert on table public.community_votes from authenticated;
grant insert (recommendation_id, user_id) on table public.community_votes to authenticated;

-- Normal users must not be able to write moderation state directly.
revoke update (is_hidden) on table public.community_recommendations from authenticated;

-- Admin moderation uses a narrowly scoped SECURITY DEFINER function instead.
create or replace function public.admin_set_community_recommendation_hidden(
  recommendation_id_input uuid,
  hidden_input boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (auth.jwt() -> 'app_metadata' ->> 'role') is distinct from 'admin' then
    raise exception 'Admin role required.';
  end if;

  update public.community_recommendations
  set is_hidden = hidden_input,
      updated_at = now()
  where id = recommendation_id_input;

  if not found then
    raise exception 'Recommendation not found.';
  end if;
end;
$$;

revoke all on function public.admin_set_community_recommendation_hidden(uuid, boolean) from public, anon;
grant execute on function public.admin_set_community_recommendation_hidden(uuid, boolean) to authenticated;
