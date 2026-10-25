-- Remove scenario as a visible/required dimension of Community Recommendations.
-- Existing scenario columns are retained for compatibility but cleared whenever a post is created/edited.
alter table public.community_recommendations
  alter column scenario_id drop not null,
  alter column scenario_name drop not null;

drop index if exists public.community_recommendations_scenario_idx;

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

  -- Scenarios are intentionally not part of Community Recommendations.
  -- Keep legacy database columns for compatibility, but do not expose or store values in them.
  new.scenario_id := null;
  new.scenario_name := null;

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

-- Tighten column grants now that Community no longer writes scenario metadata.
revoke insert (scenario_id, scenario_name) on public.community_recommendations from authenticated;
revoke update (scenario_id, scenario_name) on public.community_recommendations from authenticated;

notify pgrst, 'reload schema';
