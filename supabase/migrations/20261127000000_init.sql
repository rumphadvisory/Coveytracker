-- CoveyTracker initial schema
-- Multi-tenant by property. Every data table carries property_id and is
-- protected by row level security keyed on property_members.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.properties (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  lat         double precision,
  lng         double precision,
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.property_members (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null check (role in ('owner', 'manager', 'handler')),
  created_at   timestamptz not null default now(),
  unique (property_id, user_id)
);

-- Pending invitations. Accepted automatically the next time a user with a
-- matching email signs in (see accept_pending_invites()).
create table public.property_invites (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  email        text not null,
  role         text not null check (role in ('manager', 'handler')),
  invited_by   uuid references auth.users (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (property_id, email)
);

create table public.dogs (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  name         text not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.courses (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  name         text not null,
  acres        double precision,
  created_at   timestamptz not null default now()
);

create table public.hunts (
  id                   uuid primary key default gen_random_uuid(),
  property_id          uuid not null references public.properties (id) on delete cascade,
  date                 date not null default current_date,
  season               text not null,
  course_id            uuid references public.courses (id) on delete set null,
  hours_spent          double precision,
  weather              text,
  temperature          text,
  wind                 text,
  ground               text,
  barometric_pressure  text,
  comments             text,
  coveys_pointed       int not null default 0,
  coveys_shot          int not null default 0,
  coveys_flushed       int not null default 0,
  coveys_flushed_wild  int not null default 0,
  total_coveys_seen    int generated always as (coalesce(coveys_pointed, 0) + coalesce(coveys_flushed_wild, 0)) stored,
  birds_on_covey_rise  int not null default 0,
  singles_shot         int not null default 0,
  total_birds_cocks    int not null default 0,
  total_birds_hens     int not null default 0,
  total_birds_adult    int generated always as (coalesce(total_birds_cocks, 0) + coalesce(total_birds_hens, 0)) stored,
  total_birds_juvenile int not null default 0,
  total_contacts       int not null default 0, -- maintained by trigger from dog_runs
  created_by           uuid references auth.users (id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now()
);

create table public.dog_runs (
  id        uuid primary key default gen_random_uuid(),
  hunt_id   uuid not null references public.hunts (id) on delete cascade,
  dog_id    uuid not null references public.dogs (id) on delete cascade,
  contacts  int not null default 0,
  hours     double precision,
  unique (hunt_id, dog_id)
);

create table public.gps_marks (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  hunt_id      uuid references public.hunts (id) on delete set null,
  type         text not null check (type in ('covey', 'contact')),
  lat          double precision not null,
  lng          double precision not null,
  accuracy     double precision,
  dog_id       uuid references public.dogs (id) on delete set null,
  course_id    uuid references public.courses (id) on delete set null,
  season       text not null,
  "timestamp"  timestamptz not null default now(),
  notes        text,
  created_by   uuid references auth.users (id) on delete set null default auth.uid()
);

create table public.covey_counts (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid not null references public.properties (id) on delete cascade,
  date             date not null default current_date,
  season           text not null,
  course_id        uuid references public.courses (id) on delete set null,
  coveys_heard     int not null default 0,
  avg_covey_size   int not null default 12,
  acres_surveyed   double precision,
  estimated_birds  int generated always as (coalesce(coveys_heard, 0) * coalesce(avg_covey_size, 12)) stored,
  lat              double precision,
  lng              double precision,
  notes            text,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now()
);

create index on public.property_members (user_id);
create index on public.dogs (property_id);
create index on public.courses (property_id);
create index on public.hunts (property_id, season);
create index on public.dog_runs (hunt_id);
create index on public.dog_runs (dog_id);
create index on public.gps_marks (property_id, season);
create index on public.gps_marks (hunt_id);
create index on public.covey_counts (property_id, season);
create index on public.property_invites (lower(email));

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer so policies don't recurse)
-- ---------------------------------------------------------------------------

create or replace function public.member_role(p_property uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select role from public.property_members
  where property_id = p_property and user_id = auth.uid()
  limit 1
$$;

create or replace function public.is_member(p_property uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.member_role(p_property) is not null
$$;

create or replace function public.is_manager(p_property uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.member_role(p_property) in ('owner', 'manager'), false)
$$;

create or replace function public.is_owner(p_property uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(public.member_role(p_property) = 'owner', false)
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Property creator automatically becomes its owner member.
create or replace function public.handle_new_property()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.property_members (property_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (property_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_property_created
after insert on public.properties
for each row execute function public.handle_new_property();

-- Keep hunts.total_contacts = sum(dog_runs.contacts).
create or replace function public.refresh_hunt_contacts()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  h uuid := coalesce(new.hunt_id, old.hunt_id);
begin
  update public.hunts
     set total_contacts = coalesce((select sum(contacts) from public.dog_runs where hunt_id = h), 0)
   where id = h;
  if tg_op = 'UPDATE' and old.hunt_id is distinct from new.hunt_id then
    update public.hunts
       set total_contacts = coalesce((select sum(contacts) from public.dog_runs where hunt_id = old.hunt_id), 0)
     where id = old.hunt_id;
  end if;
  return null;
end;
$$;

create trigger dog_runs_refresh_contacts
after insert or update or delete on public.dog_runs
for each row execute function public.refresh_hunt_contacts();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Turn any pending invites for the signed-in user's email into memberships.
create or replace function public.accept_pending_invites()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_count int := 0;
begin
  if auth.uid() is null or v_email = '' then
    return 0;
  end if;

  insert into public.property_members (property_id, user_id, role)
  select i.property_id, auth.uid(), i.role
    from public.property_invites i
   where lower(i.email) = v_email
  on conflict (property_id, user_id) do nothing;
  get diagnostics v_count = row_count;

  delete from public.property_invites where lower(email) = v_email;
  return v_count;
end;
$$;

-- Members list with emails (auth.users is not exposed to the client).
create or replace function public.property_member_list(p_property uuid)
returns table (id uuid, user_id uuid, email text, role text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select m.id, m.user_id, u.email::text, m.role, m.created_at
    from public.property_members m
    join auth.users u on u.id = m.user_id
   where m.property_id = p_property
     and public.is_member(p_property)
   order by m.created_at
$$;

-- Owner-only: wipe all hunts, dog runs and GPS marks for a property.
create or replace function public.clear_hunt_data(p_property uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_owner(p_property) then
    raise exception 'Only the property owner can clear hunt data';
  end if;
  delete from public.gps_marks where property_id = p_property;
  delete from public.hunts where property_id = p_property;
end;
$$;

grant execute on function public.accept_pending_invites() to authenticated;
grant execute on function public.property_member_list(uuid) to authenticated;
grant execute on function public.clear_hunt_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.properties       enable row level security;
alter table public.property_members enable row level security;
alter table public.property_invites enable row level security;
alter table public.dogs             enable row level security;
alter table public.courses          enable row level security;
alter table public.hunts            enable row level security;
alter table public.dog_runs         enable row level security;
alter table public.gps_marks        enable row level security;
alter table public.covey_counts     enable row level security;

-- properties
create policy "members read property" on public.properties
  for select using (public.is_member(id) or owner_id = auth.uid());
create policy "authenticated create property" on public.properties
  for insert to authenticated with check (owner_id = auth.uid());
create policy "managers update property" on public.properties
  for update using (public.is_manager(id)) with check (public.is_manager(id));
create policy "owner deletes property" on public.properties
  for delete using (public.is_owner(id));

-- property_members
create policy "members read members" on public.property_members
  for select using (public.is_member(property_id));
create policy "owner adds members" on public.property_members
  for insert with check (public.is_owner(property_id));
create policy "owner updates members" on public.property_members
  for update using (public.is_owner(property_id)) with check (public.is_owner(property_id));
create policy "owner removes members or self leaves" on public.property_members
  for delete using (public.is_owner(property_id) or (user_id = auth.uid() and role <> 'owner'));

-- property_invites
create policy "members read invites" on public.property_invites
  for select using (public.is_member(property_id));
create policy "owner invites" on public.property_invites
  for insert with check (public.is_owner(property_id));
create policy "owner revokes invites" on public.property_invites
  for delete using (public.is_owner(property_id));

-- dogs & courses: everyone reads, managers write
create policy "members read dogs" on public.dogs
  for select using (public.is_member(property_id));
create policy "managers write dogs" on public.dogs
  for all using (public.is_manager(property_id)) with check (public.is_manager(property_id));

create policy "members read courses" on public.courses
  for select using (public.is_member(property_id));
create policy "managers write courses" on public.courses
  for all using (public.is_manager(property_id)) with check (public.is_manager(property_id));

-- hunts: members insert; managers or the creator update; managers delete
create policy "members read hunts" on public.hunts
  for select using (public.is_member(property_id));
create policy "members insert hunts" on public.hunts
  for insert with check (public.is_member(property_id));
create policy "managers or creator update hunts" on public.hunts
  for update using (public.is_manager(property_id) or (created_by = auth.uid() and public.is_member(property_id)))
  with check (public.is_member(property_id));
create policy "managers delete hunts" on public.hunts
  for delete using (public.is_manager(property_id));

-- dog_runs inherit from their hunt
create policy "members read dog runs" on public.dog_runs
  for select using (exists (select 1 from public.hunts h where h.id = hunt_id and public.is_member(h.property_id)));
create policy "members insert dog runs" on public.dog_runs
  for insert with check (exists (select 1 from public.hunts h where h.id = hunt_id and public.is_member(h.property_id)));
create policy "managers or hunt creator update dog runs" on public.dog_runs
  for update using (exists (
    select 1 from public.hunts h where h.id = hunt_id
      and (public.is_manager(h.property_id) or (h.created_by = auth.uid() and public.is_member(h.property_id)))
  ));
create policy "managers or hunt creator delete dog runs" on public.dog_runs
  for delete using (exists (
    select 1 from public.hunts h where h.id = hunt_id
      and (public.is_manager(h.property_id) or (h.created_by = auth.uid() and public.is_member(h.property_id)))
  ));

-- gps_marks
create policy "members read marks" on public.gps_marks
  for select using (public.is_member(property_id));
create policy "members insert marks" on public.gps_marks
  for insert with check (public.is_member(property_id));
create policy "managers or creator update marks" on public.gps_marks
  for update using (public.is_manager(property_id) or (created_by = auth.uid() and public.is_member(property_id)))
  with check (public.is_member(property_id));
-- Handlers may undo their own mis-taps while a mark isn't attached to a saved hunt yet.
create policy "managers or creator (unattached) delete marks" on public.gps_marks
  for delete using (
    public.is_manager(property_id)
    or (created_by = auth.uid() and hunt_id is null and public.is_member(property_id))
  );

-- covey_counts
create policy "members read counts" on public.covey_counts
  for select using (public.is_member(property_id));
create policy "members insert counts" on public.covey_counts
  for insert with check (public.is_member(property_id));
create policy "managers or creator update counts" on public.covey_counts
  for update using (public.is_manager(property_id) or (created_by = auth.uid() and public.is_member(property_id)))
  with check (public.is_member(property_id));
create policy "managers delete counts" on public.covey_counts
  for delete using (public.is_manager(property_id));

-- ---------------------------------------------------------------------------
-- Realtime: live GPS marks on the map for everyone in the field
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.gps_marks;
