-- Table and function privileges for signed-in users.
-- Newer Supabase projects no longer grant these automatically on tables created in SQL,
-- so without this every query fails with "permission denied for table ...".
-- Row level security (see the init migration) still decides which rows each user can touch;
-- these grants only let the `authenticated` role reach the tables at all. `anon` gets nothing.

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.properties,
  public.property_members,
  public.property_invites,
  public.dogs,
  public.courses,
  public.hunts,
  public.dog_runs,
  public.gps_marks,
  public.covey_counts
to authenticated;

grant execute on function
  public.member_role(uuid),
  public.is_member(uuid),
  public.is_manager(uuid),
  public.is_owner(uuid),
  public.accept_pending_invites(),
  public.property_member_list(uuid),
  public.clear_hunt_data(uuid)
to authenticated;
