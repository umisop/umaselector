-- Community Profile page: let users see their own moderated/hidden recommendations
-- while keeping hidden recommendations out of the public feed.
-- Run this once in Supabase SQL Editor on an existing Community database.

drop policy if exists "Public can read visible community recommendations" on public.community_recommendations;

create policy "Public can read visible community recommendations"
on public.community_recommendations
for select
to anon, authenticated
using (
  is_hidden = false
  or user_id = auth.uid()
  or ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'
);
