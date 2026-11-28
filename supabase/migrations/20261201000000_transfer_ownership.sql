-- Handing a property over: records belong to the property, people come and go. An owner can make
-- another team member the owner (e.g. the manager who set it up hands it to the plantation owner);
-- the previous owner stays on as a manager and can then leave or be removed.
create or replace function public.transfer_ownership(p_property uuid, p_new_owner uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_owner(p_property) then
    raise exception 'Only an owner can transfer ownership';
  end if;
  if p_new_owner = auth.uid() then
    raise exception 'You already own this property';
  end if;
  if not exists (select 1 from public.property_members where property_id = p_property and user_id = p_new_owner) then
    raise exception 'Add them to the team first, then transfer ownership';
  end if;
  update public.property_members set role = 'owner' where property_id = p_property and user_id = p_new_owner;
  update public.property_members set role = 'manager' where property_id = p_property and user_id = auth.uid();
  update public.properties set owner_id = p_new_owner where id = p_property;
end;
$$;

revoke all on function public.transfer_ownership(uuid, uuid) from public;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
