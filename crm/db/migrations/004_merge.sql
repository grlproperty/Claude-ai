-- =====================================================================
-- 004 MERGE
--
-- Merging people and properties (spec 20, 33).
--
-- The losing record is never deleted. It keeps its reference for ever, is
-- marked as merged into the master, and every child row it owned is
-- re-parented so that no history is lost.
--
-- Which child tables exist grows with every later stage, so the tables to
-- re-parent are held in a registry rather than written into the function.
-- Each later migration registers its own tables and the merge stays correct
-- without this function ever being rewritten.
-- =====================================================================

create table merge_child_tables (
  entity_type   text not null check (entity_type in ('person','property')),
  table_name    text not null,
  column_name   text not null,
  note          text,
  primary key (entity_type, table_name, column_name)
);

-- Deliberately not granted to the application: only a migration may change
-- what a merge touches.
comment on table merge_child_tables is
  'Registry of columns re-parented by app.merge_records_of(). Migration-owned.';

insert into merge_child_tables (entity_type, table_name, column_name, note) values
  ('person', 'person_identity',          'person_id',         'Identity numbers'),
  ('person', 'person_client_types',      'person_id',         'Buyer, seller, landlord and so on'),
  ('person', 'person_contacts',          'person_id',         'Telephone numbers and addresses'),
  ('person', 'person_addresses',         'person_id',         'Physical and postal addresses'),
  ('person', 'person_relationships',     'person_id',         'Relationships, from this side'),
  ('person', 'person_relationships',     'related_person_id', 'Relationships, from the other side'),
  ('person', 'person_agent_assignments', 'person_id',         'Agent assignment history');

/**
 * Re-parents every registered child row from one record to another.
 *
 * A row that would collide with one the master already holds -- the same
 * mobile number recorded on both records, say -- is dropped rather than
 * duplicated, and counted separately so the merge record says what happened.
 */
create or replace function app.reparent_children(
  p_entity_type text, p_master uuid, p_merged uuid
) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  reg      record;
  row_ref  record;
  moved    integer;
  dropped  integer;
  result   jsonb := '{}'::jsonb;
begin
  for reg in
    select table_name, column_name from merge_child_tables
     where entity_type = p_entity_type
     order by table_name, column_name
  loop
    moved := 0;
    dropped := 0;

    for row_ref in
      execute format('select ctid from public.%I where %I = $1', reg.table_name, reg.column_name)
      using p_merged
    loop
      begin
        execute format('update public.%I set %I = $1 where ctid = $2', reg.table_name, reg.column_name)
          using p_master, row_ref.ctid;
        moved := moved + 1;
      exception
        -- The master already has this, or the move would make a record refer
        -- to itself. Either way the losing row adds nothing.
        when unique_violation or check_violation or foreign_key_violation then
          execute format('delete from public.%I where ctid = $1', reg.table_name)
            using row_ref.ctid;
          dropped := dropped + 1;
      end;
    end loop;

    if moved > 0 or dropped > 0 then
      result := result || jsonb_build_object(
        reg.table_name || '.' || reg.column_name,
        jsonb_build_object('moved', moved, 'dropped', dropped)
      );
    end if;
  end loop;

  return result;
end;
$$;
revoke all on function app.reparent_children(text, uuid, uuid) from public;

/**
 * Merges one person into another, in a single transaction (spec 106).
 *
 * The caller has already applied whichever field values were chosen to
 * survive; this moves the history, marks the losing record, and writes the
 * merge audit record. Nothing here is reversible by accident: the merged
 * record remains readable for ever under its own reference.
 */
create or replace function app.merge_people(
  p_master uuid, p_merged uuid, p_reason text, p_selected jsonb
) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_actor        uuid := app.current_user_id();
  v_master       people%rowtype;
  v_merged       people%rowtype;
  v_counts       jsonb;
begin
  if not app.has_permission('MERGE_RECORDS') then
    raise exception 'You do not have permission to merge records.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_master = p_merged then
    raise exception 'A record cannot be merged into itself.' using errcode = 'check_violation';
  end if;

  -- The lower id is locked first so two simultaneous merges cannot deadlock.
  if p_master < p_merged then
    select * into v_master from people where id = p_master for update;
    select * into v_merged from people where id = p_merged for update;
  else
    select * into v_merged from people where id = p_merged for update;
    select * into v_master from people where id = p_master for update;
  end if;

  if v_master.id is null or v_merged.id is null then
    raise exception 'One of those people could not be found.' using errcode = 'no_data_found';
  end if;
  if not app.can_edit_person(p_master) or not app.can_edit_person(p_merged) then
    raise exception 'You do not have permission to merge those records.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_merged.merged_into_id is not null then
    raise exception 'That record has already been merged.' using errcode = 'check_violation';
  end if;
  if v_master.merged_into_id is not null then
    raise exception 'The surviving record has itself been merged into another.'
      using errcode = 'check_violation';
  end if;

  -- The identity fingerprint is unique among live records, so it has to be
  -- released before the master can claim it.
  if v_master.id_fingerprint is null and v_merged.id_fingerprint is not null then
    update people set id_fingerprint = null, id_last3 = null where id = p_merged;
    update people
       set id_fingerprint = v_merged.id_fingerprint, id_last3 = v_merged.id_last3
     where id = p_master;
  end if;

  v_counts := app.reparent_children('person', p_master, p_merged);

  -- The earliest first contact and the latest last contact both survive.
  update people m
     set first_contact_at = least(
           coalesce(m.first_contact_at, v_merged.first_contact_at),
           coalesce(v_merged.first_contact_at, m.first_contact_at)),
         last_contact_at = greatest(
           coalesce(m.last_contact_at, v_merged.last_contact_at),
           coalesce(v_merged.last_contact_at, m.last_contact_at)),
         last_contact_method = case
           when v_merged.last_contact_at is not null
            and (m.last_contact_at is null or v_merged.last_contact_at > m.last_contact_at)
           then v_merged.last_contact_method else m.last_contact_method end,
         next_follow_up_at = least(
           coalesce(m.next_follow_up_at, v_merged.next_follow_up_at),
           coalesce(v_merged.next_follow_up_at, m.next_follow_up_at)),
         notes = case
           when coalesce(v_merged.notes, '') = '' then m.notes
           when coalesce(m.notes, '') = '' then v_merged.notes
           else m.notes || E'\n\n--- Merged from ' || v_merged.client_ref || E' ---\n' || v_merged.notes
         end,
         updated_by = v_actor
   where m.id = p_master;

  update people
     set merged_into_id = p_master,
         merged_at = now(),
         is_archived = true,
         archived_at = coalesce(archived_at, now()),
         archived_by = coalesce(archived_by, v_actor),
         archive_reason = coalesce(archive_reason, 'Merged into ' || v_master.client_ref),
         updated_by = v_actor
   where id = p_merged;

  insert into merge_records
    (entity_type, master_id, master_reference, merged_id, merged_reference,
     reason, selected_fields, moved_counts, performed_by)
  values
    ('person', p_master, v_master.client_ref, p_merged, v_merged.client_ref,
     p_reason, p_selected, v_counts, v_actor);

  return jsonb_build_object(
    'master_reference', v_master.client_ref,
    'merged_reference', v_merged.client_ref,
    'moved', v_counts
  );
end;
$$;
revoke all on function app.merge_people(uuid, uuid, text, jsonb) from public;
grant execute on function app.merge_people(uuid, uuid, text, jsonb) to grlp_app;

grant select on merge_child_tables to grlp_app;
alter table merge_child_tables enable row level security;
create policy merge_child_tables_select on merge_child_tables for select
  using (app.is_authenticated());
