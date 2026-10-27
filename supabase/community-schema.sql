-- Card Exchange Selector — Community Recommendations v1.0
-- Run this as a separate script in Supabase SQL Editor after the main schema.sql.
-- Uses Supabase Auth and the existing app_metadata.role = 'admin' convention.

create table if not exists public.community_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A public-safe profile row is created when a new Auth user is registered.
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

  if char_length(requested_name) < 2 or lower(requested_name) in ('trainer', 'community member') then
    requested_name := 'Player-' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;

  insert into public.community_profiles (id, display_name)
  values (new.id, requested_name)
  on conflict (id) do nothing;

  return new;
end;
$function$;

drop trigger if exists on_auth_user_created_community_profile on auth.users;
create trigger on_auth_user_created_community_profile
after insert on auth.users
for each row execute function public.handle_new_community_user();

-- Also create public display profiles for Auth users that pre-date this feature.
insert into public.community_profiles (id, display_name)
select
  u.id,
  case
    when char_length(candidates.candidate_name) >= 2
      and lower(candidates.candidate_name) not in ('trainer', 'community member')
      then left(candidates.candidate_name, 32)
    else 'Player-' || substr(replace(u.id::text, '-', ''), 1, 6)
  end
from auth.users as u
left join lateral (
  select identity.identity_data
  from auth.identities as identity
  where identity.user_id = u.id and identity.provider = 'discord'
  limit 1
) as discord_identity on true
cross join lateral (
  select btrim(coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'global_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'preferred_username'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'user_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'username'), ''),
    nullif(btrim(discord_identity.identity_data ->> 'global_name'), ''),
    nullif(btrim(discord_identity.identity_data ->> 'full_name'), ''),
    nullif(btrim(discord_identity.identity_data ->> 'name'), ''),
    nullif(btrim(discord_identity.identity_data ->> 'preferred_username'), ''),
    nullif(btrim(discord_identity.identity_data ->> 'user_name'), ''),
    nullif(btrim(discord_identity.identity_data ->> 'username'), ''),
    ''
  )) as candidate_name
) as candidates
on conflict (id) do nothing;

create table if not exists public.community_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 5 and 80),
  body text not null check (char_length(btrim(body)) between 1 and 1200),
  scenario_id text,
  scenario_name text check (scenario_name is null or char_length(btrim(scenario_name)) between 1 and 120),
  card_levels jsonb not null check (jsonb_typeof(card_levels) = 'object'),
  recommendations jsonb not null check (jsonb_typeof(recommendations) = 'object'),
  upvote_count integer not null default 0 check (upvote_count >= 0),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_votes (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.community_recommendations(id) on delete cascade,
  user_id uuid not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint community_votes_one_per_user unique (recommendation_id, user_id)
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid references public.community_recommendations(id) on delete set null,
  recommendation_title text not null check (char_length(btrim(recommendation_title)) between 1 and 80),
  reporter_id uuid not null references public.community_profiles(id) on delete cascade,
  reason text not null check (reason in ('misleading', 'spam', 'inappropriate', 'wrong_data', 'other')),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint community_reports_one_per_user unique (recommendation_id, reporter_id)
);

create index if not exists community_recommendations_votes_idx
  on public.community_recommendations (upvote_count desc, created_at desc)
  where is_hidden = false;
create index if not exists community_votes_user_idx
  on public.community_votes (user_id, recommendation_id);
create index if not exists community_reports_status_idx
  on public.community_reports (status, created_at desc);
create index if not exists community_recommendations_user_created_idx
  on public.community_recommendations (user_id, created_at desc);
create index if not exists community_reports_user_created_idx
  on public.community_reports (reporter_id, created_at desc);

-- Vote count is updated atomically in the database, even when multiple users vote concurrently.
create or replace function public.update_community_upvote_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_recommendations
    set upvote_count = upvote_count + 1
    where id = new.recommendation_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_recommendations
    set upvote_count = greatest(0, upvote_count - 1)
    where id = old.recommendation_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists community_vote_count_after_insert on public.community_votes;
create trigger community_vote_count_after_insert
after insert on public.community_votes
for each row execute function public.update_community_upvote_count();

drop trigger if exists community_vote_count_after_delete on public.community_votes;
create trigger community_vote_count_after_delete
after delete on public.community_votes
for each row execute function public.update_community_upvote_count();

-- Match Community submissions to the currently enabled public scenario and validate card references.
create or replace function public.match_community_scenario(p_card_levels jsonb, p_config jsonb)
returns table(matched_id text, matched_name text)
language sql
stable
set search_path = ''
as $function$
  with core_cards as (
    select card.value ->> 'id' as card_id
    from jsonb_array_elements(coalesce(p_config -> 'cards', '[]'::jsonb)) as card(value)
    where coalesce((card.value ->> 'isCore')::boolean, false) = true
  ),
  candidates as (
    select
      scenario.value as scenario,
      scenario.ordinality,
      (
        select count(*)::integer
        from core_cards as core
        where coalesce(scenario.value -> 'conditions' ->> core.card_id, 'any') not in ('', '*', 'any', 'ignore')
          and coalesce(scenario.value -> 'conditions' ->> core.card_id, 'any') ~ '^(-1|0|1|2|3|4)$'
      ) as specificity,
      case
        when coalesce(scenario.value ->> 'priority', '') ~ '^-?[0-9]+([.][0-9]+)?$'
          then (scenario.value ->> 'priority')::numeric
        else 0::numeric
      end as priority
    from jsonb_array_elements(coalesce(p_config -> 'scenarios', '[]'::jsonb)) with ordinality as scenario(value, ordinality)
    where nullif(btrim(scenario.value ->> 'id'), '') is not null
      and (scenario.value ->> 'enabled') is distinct from 'false'
      and (select count(*) from core_cards) = (select count(*) from jsonb_object_keys(coalesce(p_card_levels, '{}'::jsonb)))
      and not exists (
        select 1 from core_cards as required_core
        where not (coalesce(p_card_levels, '{}'::jsonb) ? required_core.card_id)
      )
      and not exists (
        select 1
        from core_cards as core
        where case
          when coalesce(scenario.value -> 'conditions' ->> core.card_id, 'any') in ('', '*', 'any', 'ignore') then false
          when coalesce(scenario.value -> 'conditions' ->> core.card_id, 'any') ~ '^(-1|0|1|2|3|4)$' then
            case
              when coalesce(p_card_levels ->> core.card_id, '') ~ '^(-1|0|1|2|3|4)$'
                then (p_card_levels ->> core.card_id)::numeric <> (scenario.value -> 'conditions' ->> core.card_id)::numeric
              else true
            end
          else true
        end
      )
  )
  select candidate.scenario ->> 'id', candidate.scenario ->> 'name'
  from candidates as candidate
  order by candidate.specificity desc, candidate.priority desc, candidate.ordinality asc
  limit 1;
$function$;

revoke all on function public.match_community_scenario(jsonb, jsonb) from public, anon, authenticated;


create or replace function public.validate_community_recommendation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_config jsonb;
  core_card jsonb;
  card_item jsonb;
  category_name text;
  category_items jsonb;
  card_identifier text;
  core_card_count integer := 0;
  recommendation_count integer := 0;
  level_number numeric;
  card_level_count integer := 0;
  matched_scenario_id text;
  matched_scenario_name text;
begin
  select config into saved_config
  from public.card_exchange_config
  where id = 'main';

  if saved_config is null then
    raise exception 'The creator catalog is not configured.';
  end if;

  if jsonb_typeof(new.card_levels) is distinct from 'object' then
    raise exception 'The Core Card snapshot must be an object.';
  end if;
  if jsonb_typeof(new.recommendations) is distinct from 'object' then
    raise exception 'Recommendations must be an object.';
  end if;
  if (new.recommendations - 'universal' - 'fr' - 'pc' - 'ls' - 'ec') <> '{}'::jsonb then
    raise exception 'Unknown recommendation category.';
  end if;

  for core_card in
    select entry.value
    from jsonb_array_elements(coalesce(saved_config -> 'cards', '[]'::jsonb)) as entry(value)
    where coalesce((entry.value ->> 'isCore')::boolean, false) = true
  loop
    core_card_count := core_card_count + 1;
    card_identifier := core_card ->> 'id';
    if card_identifier is null or not (new.card_levels ? card_identifier) then
      raise exception 'The Core Card snapshot is missing a required card.';
    end if;
    if jsonb_typeof(new.card_levels -> card_identifier) is distinct from 'number' then
      raise exception 'Core Card levels must be numeric.';
    end if;
    level_number := (new.card_levels ->> card_identifier)::numeric;
    if level_number not in (-1, 0, 1, 2, 3, 4) then
      raise exception 'Core Card levels must be Not owned or LB0–LB4.';
    end if;
  end loop;

  select count(*)::integer into card_level_count
  from jsonb_object_keys(new.card_levels);

  if core_card_count = 0 or core_card_count <> card_level_count then
    raise exception 'The Core Card snapshot does not match the creator catalog.';
  end if;

  -- Match the submitted snapshot to the same enabled public scenario logic used by SelectorPage.
  select match.matched_id, match.matched_name
  into matched_scenario_id, matched_scenario_name
  from public.match_community_scenario(new.card_levels, saved_config) as match;

  if matched_scenario_id is null and tg_op = 'INSERT' then
    raise exception 'These Core Card levels do not match an enabled public scenario. Adjust the six Core Card levels and try again.';
  end if;

  -- Legacy columns are maintained automatically; users cannot set them from the client.
  new.scenario_id := matched_scenario_id;
  new.scenario_name := matched_scenario_name;

  foreach category_name in array array['universal', 'fr', 'pc', 'ls', 'ec'] loop
    if new.recommendations ? category_name then
      category_items := new.recommendations -> category_name;
      if jsonb_typeof(category_items) is distinct from 'array' then
        raise exception 'Each recommendation category must contain a list.';
      end if;

      for card_item in select entry.value from jsonb_array_elements(category_items) as entry(value)
      loop
        recommendation_count := recommendation_count + 1;
        if jsonb_typeof(card_item) is distinct from 'object' then
          raise exception 'Each recommended card must be an object.';
        end if;
        card_identifier := card_item ->> 'cardId';
        if card_identifier is null or not exists (
          select 1
          from jsonb_array_elements(coalesce(saved_config -> 'cards', '[]'::jsonb)) as catalog_card(value)
          where catalog_card.value ->> 'id' = card_identifier
        ) then
          raise exception 'A recommendation refers to a card that is not in the creator catalog.';
        end if;
        if coalesce(card_item ->> 'status', 'recommended') not in ('recommended', 'alternative') then
          raise exception 'Recommendation status must be Recommended or Alternative.';
        end if;
        if char_length(coalesce(card_item ->> 'note', '')) > 180 then
          raise exception 'A card note cannot exceed 180 characters.';
        end if;
      end loop;
    end if;
  end loop;

  if recommendation_count < 1 or recommendation_count > 20 then
    raise exception 'A recommendation must contain between 1 and 20 card entries.';
  end if;

  return new;
end;
$$;

drop trigger if exists community_recommendation_validate_before_insert on public.community_recommendations;
create trigger community_recommendation_validate_before_insert
before insert on public.community_recommendations
for each row execute function public.validate_community_recommendation();

drop trigger if exists community_recommendation_validate_before_update on public.community_recommendations;
create trigger community_recommendation_validate_before_update
before update of card_levels, recommendations on public.community_recommendations
for each row execute function public.validate_community_recommendation();

-- Recalculate scenario tags whenever the creator changes public scenario configuration.
create or replace function public.refresh_community_scenario_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  recommendation_row record;
  matched_scenario_id text;
  matched_scenario_name text;
begin
  if new.id is distinct from 'main' then
    return new;
  end if;

  for recommendation_row in
    select recommendation.id, recommendation.card_levels
    from public.community_recommendations as recommendation
  loop
    matched_scenario_id := null;
    matched_scenario_name := null;
    select match.matched_id, match.matched_name
      into matched_scenario_id, matched_scenario_name
    from public.match_community_scenario(recommendation_row.card_levels, new.config) as match;

    update public.community_recommendations
    set scenario_id = matched_scenario_id,
        scenario_name = matched_scenario_name
    where id = recommendation_row.id
      and (scenario_id is distinct from matched_scenario_id
        or scenario_name is distinct from matched_scenario_name);
  end loop;

  return new;
end;
$function$;

revoke all on function public.refresh_community_scenario_assignments() from public, anon, authenticated;
drop trigger if exists refresh_community_scenarios_after_config_update on public.card_exchange_config;
create trigger refresh_community_scenarios_after_config_update
after insert or update of config on public.card_exchange_config
for each row execute function public.refresh_community_scenario_assignments();

-- Conservative per-account rate limits for community publishing and reporting.
create or replace function public.enforce_community_post_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  select count(*)::integer into recent_count
  from public.community_recommendations
  where user_id = new.user_id and created_at > now() - interval '1 hour';

  if recent_count >= 5 then
    raise exception 'Rate limit: you can publish up to 5 community recommendations per hour.';
  end if;
  return new;
end;
$$;

drop trigger if exists community_recommendation_rate_limit_before_insert on public.community_recommendations;
create trigger community_recommendation_rate_limit_before_insert
before insert on public.community_recommendations
for each row execute function public.enforce_community_post_rate_limit();

create or replace function public.enforce_community_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.reporter_id::text, 1));
  select count(*)::integer into recent_count
  from public.community_reports
  where reporter_id = new.reporter_id and created_at > now() - interval '1 hour';

  if recent_count >= 10 then
    raise exception 'Rate limit: you can send up to 10 community reports per hour.';
  end if;
  return new;
end;
$$;

drop trigger if exists community_report_rate_limit_before_insert on public.community_reports;
create trigger community_report_rate_limit_before_insert
before insert on public.community_reports
for each row execute function public.enforce_community_report_rate_limit();

-- Moderation state is changed only through this admin-checked function.
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

-- RLS: table permissions are intentionally narrow; counts are public via the recommendation row.
alter table public.community_profiles enable row level security;
alter table public.community_recommendations enable row level security;
alter table public.community_votes enable row level security;
alter table public.community_reports enable row level security;

revoke all privileges on table public.community_profiles from public, anon, authenticated;
revoke all privileges on table public.community_recommendations from public, anon, authenticated;
revoke all privileges on table public.community_votes from public, anon, authenticated;
revoke all privileges on table public.community_reports from public, anon, authenticated;

grant select on public.community_profiles to anon, authenticated;
grant update (display_name, updated_at) on public.community_profiles to authenticated;

grant select on public.community_recommendations to anon, authenticated;
grant insert (user_id, title, body, card_levels, recommendations)
  on public.community_recommendations to authenticated;
grant update (title, body, card_levels, recommendations, updated_at)
  on public.community_recommendations to authenticated;
grant delete on public.community_recommendations to authenticated;

grant select, delete on public.community_votes to authenticated;
grant insert (recommendation_id, user_id) on public.community_votes to authenticated;

grant insert (recommendation_id, recommendation_title, reporter_id, reason, details) on public.community_reports to authenticated;
grant select on public.community_reports to authenticated;
grant update (status, reviewed_at) on public.community_reports to authenticated;

-- Profiles: everyone can see public display names, but users may only update their own name.
drop policy if exists "Public can read community profiles" on public.community_profiles;
create policy "Public can read community profiles"
  on public.community_profiles for select to anon, authenticated using (true);
drop policy if exists "Users can update own community profile" on public.community_profiles;
create policy "Users can update own community profile"
  on public.community_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Recommendations: visible publicly unless hidden by an admin. Only owners can change their posts.
drop policy if exists "Public can read visible community recommendations" on public.community_recommendations;
create policy "Public can read visible community recommendations"
  on public.community_recommendations for select to anon, authenticated
  using (is_hidden = false or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "Users can publish own community recommendations" on public.community_recommendations;
create policy "Users can publish own community recommendations"
  on public.community_recommendations for insert to authenticated
  with check (user_id = auth.uid() and is_hidden = false and upvote_count = 0);
drop policy if exists "Owners and admins can update community recommendations" on public.community_recommendations;
create policy "Owners and admins can update community recommendations"
  on public.community_recommendations for update to authenticated
  using (user_id = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check (
    (user_id = auth.uid() and is_hidden = false)
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
drop policy if exists "Owners and admins can delete community recommendations" on public.community_recommendations;
create policy "Owners and admins can delete community recommendations"
  on public.community_recommendations for delete to authenticated
  using (user_id = auth.uid() or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Votes: a signed-in account can see and alter only its own vote. The unique constraint is the final duplicate guard.
drop policy if exists "Users can read own community votes" on public.community_votes;
create policy "Users can read own community votes"
  on public.community_votes for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users can upvote visible community recommendations" on public.community_votes;
create policy "Users can upvote visible community recommendations"
  on public.community_votes for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.community_recommendations as recommendation
      where recommendation.id = recommendation_id and recommendation.is_hidden = false
    )
  );
drop policy if exists "Users can remove own community upvote" on public.community_votes;
create policy "Users can remove own community upvote"
  on public.community_votes for delete to authenticated using (user_id = auth.uid());

-- Reports: one report per user per recommendation. Only admins can read or moderate reports.
drop policy if exists "Users can report visible recommendations" on public.community_reports;
create policy "Users can report visible recommendations"
  on public.community_reports for insert to authenticated
  with check (
    reporter_id = auth.uid()
    and exists (
      select 1 from public.community_recommendations as recommendation
      where recommendation.id = recommendation_id
        and recommendation.is_hidden = false
        and recommendation.user_id <> auth.uid()
    )
  );
drop policy if exists "Admins can read community reports" on public.community_reports;
create policy "Admins can read community reports"
  on public.community_reports for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "Admins can moderate community reports" on public.community_reports;
create policy "Admins can moderate community reports"
  on public.community_reports for update to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');


-- Keep trigger-only SECURITY DEFINER functions from being callable as RPCs.
-- Triggers execute using the function owner; client roles do not need direct EXECUTE.
revoke all on function public.handle_new_community_user() from public, anon, authenticated;
revoke all on function public.update_community_upvote_count() from public, anon, authenticated;
revoke all on function public.validate_community_recommendation() from public, anon, authenticated;
revoke all on function public.enforce_community_post_rate_limit() from public, anon, authenticated;
revoke all on function public.enforce_community_report_rate_limit() from public, anon, authenticated;
revoke all on function public.refresh_community_scenario_assignments() from public, anon, authenticated;
revoke all on function public.match_community_scenario(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.admin_set_community_recommendation_hidden(uuid, boolean) from public, anon;
grant execute on function public.admin_set_community_recommendation_hidden(uuid, boolean) to authenticated;
