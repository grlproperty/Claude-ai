-- =====================================================================
-- 007 DEAL VISIBILITY
--
-- An agent brought onto a deal has to be able to see the property the deal
-- is about (spec 78, 126). Before this, a sharing agent could see the
-- transaction row but not the property it referred to, which made the deal
-- unreadable to the very person sharing it.
--
-- The lookup is a SECURITY DEFINER function rather than a subquery inside
-- the policy, so the properties policy never has to read a table whose own
-- policy reads properties back.
-- =====================================================================

create or replace function app.is_agent_on_property_deal(p_property_id uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select exists (
    select 1
      from transactions t
      join transaction_agents ta on ta.transaction_id = t.id
     where t.property_id = p_property_id
       and ta.agent_id = app.current_user_id()
  );
$$;
revoke all on function app.is_agent_on_property_deal(uuid) from public;
grant execute on function app.is_agent_on_property_deal(uuid) to grlp_app;

-- The property itself.
drop policy properties_select on properties;
create policy properties_select on properties for select using (
  app.has_permission('PROPERTIES_VIEW')
  and (
    app.can_access_agent_record(primary_agent_id, secondary_agent_id)
    or app.is_agent_on_property_deal(id)
  )
);

-- And everything hanging off it: photographs, documents, viewings, history.
-- Editing is not widened; that stays with the listing agents.
create or replace function app.can_see_property(p_property_id uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.has_permission('PROPERTIES_VIEW') and (
    exists (
      select 1 from properties p
      where p.id = p_property_id
        and app.can_access_agent_record(p.primary_agent_id, p.secondary_agent_id)
    )
    or app.is_agent_on_property_deal(p_property_id)
  );
$$;
