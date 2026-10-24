-- Card Exchange Selector v0.8
-- Run this in the Supabase SQL Editor.

create table if not exists public.card_exchange_config (
  id text primary key check (id = 'main'),
  config jsonb not null default '{"schemaVersion":4,"cards":[],"scenarios":[]}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.card_exchange_config (id, config)
values (
  'main',
  '{"schemaVersion":4,"lastUpdated":"2026-10-23","cards":[],"scenarios":[],"notes":"Katalog dan skenario diatur creator."}'::jsonb
)
on conflict (id) do nothing;

-- Existing installations may have a v0.1 row. Normalize the schema version
-- without replacing creator-owned card/rule data.
update public.card_exchange_config
set config = jsonb_set(
  jsonb_set(config, '{schemaVersion}', '4'::jsonb, true),
  '{scenarios}',
  coalesce(config -> 'scenarios', '[]'::jsonb),
  true
)
where id = 'main';

alter table public.card_exchange_config enable row level security;

drop policy if exists "Public can read card config" on public.card_exchange_config;
create policy "Public can read card config"
  on public.card_exchange_config for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can update card config" on public.card_exchange_config;
create policy "Admins can update card config"
  on public.card_exchange_config for update
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Fail closed on table privileges. Public visitors may only read the published config.
-- Authenticated users may issue UPDATE statements only; RLS below permits them only
-- when the JWT has app_metadata.role = 'admin'. No browser role can insert/delete rows.
revoke all privileges on table public.card_exchange_config from public, anon, authenticated;
grant select on public.card_exchange_config to anon, authenticated;
grant update on public.card_exchange_config to authenticated;
