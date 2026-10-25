-- Community scenario filtering and profile-name fix for an existing installation.
-- Run once in Supabase SQL Editor after the Community tables and card_exchange_config exist.
-- If the old scenario-removal migration has not been applied yet, run it first so legacy
-- scenario columns are nullable. This migration also updates the Discord profile trigger.

-- Improve profile names for Discord OAuth accounts and keep existing custom names.
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
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
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

-- Repair generic placeholder names for existing accounts, using Discord identity metadata when available.
update public.community_profiles as profile
set display_name = picked.display_name,
    updated_at = now()
from (
  select
    u.id,
    case
      when char_length(candidate.candidate_name) >= 2
        and lower(candidate.candidate_name) not in ('trainer', 'community member')
        then left(candidate.candidate_name, 32)
      else 'Player-' || substr(replace(u.id::text, '-', ''), 1, 6)
    end as display_name
  from auth.users as u
  left join lateral (
    select identity.identity_data
    from auth.identities as identity
    where identity.user_id = u.id and identity.provider = 'discord'
    limit 1
  ) as i on true
  cross join lateral (
    select btrim(coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'global_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'preferred_username'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'user_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'username'), ''),
      nullif(btrim(i.identity_data ->> 'global_name'), ''),
      nullif(btrim(i.identity_data ->> 'full_name'), ''),
      nullif(btrim(i.identity_data ->> 'name'), ''),
      nullif(btrim(i.identity_data ->> 'preferred_username'), ''),
      nullif(btrim(i.identity_data ->> 'user_name'), ''),
      nullif(btrim(i.identity_data ->> 'username'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      ''
    )) as candidate_name
  ) as candidate
) as picked
where profile.id = picked.id
  and (lower(btrim(profile.display_name)) in ('trainer', 'community member')
    or profile.display_name ~* '^Player-[a-f0-9]{6}$');

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

-- Reassign existing recommendations from their saved six-card snapshot.
do $migration$
declare
  saved_config jsonb;
  recommendation_row record;
  matched_scenario_id text;
  matched_scenario_name text;
begin
  select config into saved_config from public.card_exchange_config where id = 'main';
  if saved_config is null then
    raise exception 'The creator catalog is not configured in public.card_exchange_config.';
  end if;

  for recommendation_row in
    select id, card_levels from public.community_recommendations
  loop
    matched_scenario_id := null;
    matched_scenario_name := null;
    select match.matched_id, match.matched_name
      into matched_scenario_id, matched_scenario_name
    from public.match_community_scenario(recommendation_row.card_levels, saved_config) as match;

    update public.community_recommendations
    set scenario_id = matched_scenario_id,
        scenario_name = matched_scenario_name
    where id = recommendation_row.id
      and (scenario_id is distinct from matched_scenario_id
        or scenario_name is distinct from matched_scenario_name);
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';

