-- Public site information pages and private feedback submissions.
-- Run once in Supabase SQL Editor on the existing Card Exchange Selector project.
-- This does not modify the Community recommendation schema.

create table if not exists public.site_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('suggestion', 'bug', 'question', 'other')),
  subject text not null check (char_length(btrim(subject)) between 3 and 120),
  message text not null check (char_length(btrim(message)) between 10 and 3000),
  status text not null default 'new' check (status in ('new', 'reviewed', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists site_feedback_created_at_idx
  on public.site_feedback (created_at desc);
create index if not exists site_feedback_user_id_created_at_idx
  on public.site_feedback (user_id, created_at desc);

alter table public.site_feedback enable row level security;

revoke all on table public.site_feedback from anon, authenticated;
grant select, insert, update on table public.site_feedback to authenticated;

drop policy if exists "Signed-in users can submit their own feedback" on public.site_feedback;
create policy "Signed-in users can submit their own feedback"
on public.site_feedback
for insert
to authenticated
with check (
  user_id = auth.uid()
  and category in ('suggestion', 'bug', 'question', 'other')
  and char_length(btrim(subject)) between 3 and 120
  and char_length(btrim(message)) between 10 and 3000
);

drop policy if exists "Admins can read site feedback" on public.site_feedback;
create policy "Admins can read site feedback"
on public.site_feedback
for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can update site feedback status" on public.site_feedback;
create policy "Admins can update site feedback status"
on public.site_feedback
for update
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create or replace function public.enforce_site_feedback_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
begin
  if new.user_id is distinct from auth.uid() then
    raise exception 'Feedback must be submitted for the signed-in account.' using errcode = '42501';
  end if;

  select count(*)::integer
    into recent_count
    from public.site_feedback f
   where f.user_id = new.user_id
     and f.created_at > now() - interval '1 hour';

  if recent_count >= 5 then
    raise exception 'You have reached the feedback limit. Please try again later.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_site_feedback_rate_limit() from public;
drop trigger if exists site_feedback_rate_limit_before_insert on public.site_feedback;
create trigger site_feedback_rate_limit_before_insert
before insert on public.site_feedback
for each row execute function public.enforce_site_feedback_rate_limit();
