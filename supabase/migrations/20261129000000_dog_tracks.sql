-- Garmin (or any GPS collar) tracks for a dog on a hunt, imported from GPX after the hunt.
-- points: [[lng, lat, unix_seconds], ...] — thinned on import to keep rows small.

create table if not exists public.dog_tracks (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  hunt_id      uuid not null references public.hunts (id) on delete cascade,
  dog_id       uuid references public.dogs (id) on delete set null,
  name         text not null default '',          -- track name from the file (usually the dog's name)
  points       jsonb not null,
  distance_m   double precision not null default 0,
  duration_s   double precision not null default 0,
  moving_s     double precision not null default 0,
  started_at   timestamptz,
  ended_at     timestamptz,
  created_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create index if not exists dog_tracks_hunt on public.dog_tracks (hunt_id);
create index if not exists dog_tracks_dog on public.dog_tracks (dog_id);

alter table public.dog_tracks enable row level security;

create policy "members read dog tracks" on public.dog_tracks
  for select using (public.is_member(property_id));
create policy "members add dog tracks" on public.dog_tracks
  for insert with check (public.is_member(property_id));
create policy "managers or uploader update dog tracks" on public.dog_tracks
  for update using (public.is_manager(property_id) or (created_by = auth.uid() and public.is_member(property_id)))
  with check (public.is_member(property_id));
create policy "managers or uploader delete dog tracks" on public.dog_tracks
  for delete using (public.is_manager(property_id) or (created_by = auth.uid() and public.is_member(property_id)));

grant select, insert, update, delete on public.dog_tracks to authenticated;
