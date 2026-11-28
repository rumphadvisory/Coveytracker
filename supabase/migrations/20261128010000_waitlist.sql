-- Waiting list for the private beta (the form on the home page).
-- Anyone may add themselves; nobody can read the list through the API.
-- View signups in Supabase → Table Editor → waitlist.

create table if not exists public.waitlist (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(name) between 1 and 120),
  email         text not null check (char_length(email) between 3 and 254 and email like '%_@_%._%'),
  property_name text check (char_length(property_name) <= 160),
  state         text check (char_length(state) <= 60),
  acres         text check (char_length(acres) <= 40),
  role          text check (role in ('owner', 'manager', 'dog_man', 'other')),
  heard_from    text check (char_length(heard_from) <= 300),
  created_at    timestamptz not null default now()
);

-- One signup per email (case-insensitive); repeats are ignored by the app.
create unique index if not exists waitlist_email_key on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

create policy "anyone can join the waitlist" on public.waitlist
  for insert to anon, authenticated with check (true);
-- No select/update/delete policies: the list is only visible in the Supabase dashboard.

grant usage on schema public to anon;
grant insert on public.waitlist to anon, authenticated;
