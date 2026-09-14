-- ---------------------------------------------------------------------
-- Stage 6: bringing existing data in (spec 59 to 70)
--
-- The office has years of records in PropCtrl exports and in spreadsheets
-- somebody keeps on a laptop. Getting them in matters more than almost
-- anything else, and getting it wrong quietly is the worst outcome: a
-- half-finished import that created three hundred duplicates is harder to
-- undo than no import at all.
--
-- So the shape here is deliberate.
--
-- An import is a record, not an event. The file's own rows are kept exactly
-- as they arrived, alongside what the CRM decided to do with each one and
-- what it actually did. Nothing about that is thrown away afterwards
-- (spec 104), so six months later it is still possible to answer "where did
-- this record come from" and "what did that import change".
--
-- Committing is one transaction (spec 106). Either every row lands or none
-- does. A committed import can also be rolled back, which reverses what it
-- created and is itself recorded rather than being a silent delete.
--
-- Running the same file twice is expected, not an error. The file's hash and
-- each row's identity are kept, so a second run recognises what it has seen
-- before and offers to update rather than duplicate (spec 68).
-- ---------------------------------------------------------------------

create sequence import_batch_reference_seq start 1;
grant usage, select on sequence import_batch_reference_seq to grlp_app;

create table import_batches (
  id              uuid primary key default gen_random_uuid(),
  batch_ref       text not null unique,
  name            text not null,

  -- What is being brought in. One import never mixes the two, because the
  -- mapping and the duplicate rules are different.
  entity_type     text not null check (entity_type in ('person','property')),

  -- Where it came from. 'url' is fetched through an allow-listed, redirect-
  -- refusing, private-address-refusing fetcher; see src/lib/import/url.ts.
  source_kind     text not null check (source_kind in ('file','paste','url')),
  source_name     text,
  source_url      text,
  source_system   text not null default 'generic'
                    check (source_system in ('generic','propctrl','private_property','property24')),

  -- sha256 of the bytes that were read. Recognising the same file again is
  -- what makes a repeat import safe rather than duplicating everything.
  content_hash    text,

  status          text not null default 'draft'
                    check (status in
                      ('draft','mapped','previewed','committed','rolled_back','cancelled','failed')),

  headers         jsonb not null default '[]'::jsonb,
  mapping         jsonb not null default '{}'::jsonb,
  options         jsonb not null default '{}'::jsonb,

  row_count       integer not null default 0,
  created_count   integer not null default 0,
  updated_count   integer not null default 0,
  skipped_count   integer not null default 0,
  failed_count    integer not null default 0,

  previewed_at    timestamptz,
  committed_at    timestamptz,
  committed_by    uuid references users(id) on delete set null,
  rolled_back_at  timestamptz,
  rolled_back_by  uuid references users(id) on delete set null,
  rollback_reason text,
  cancelled_at    timestamptz,
  failure_reason  text,

  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid references users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references users(id) on delete set null,
  row_version     integer not null default 1,

  constraint import_batches_committed_needs_date
    check (status <> 'committed' or committed_at is not null),
  constraint import_batches_rollback_needs_reason
    check (status <> 'rolled_back'
           or (rolled_back_at is not null
               and nullif(btrim(coalesce(rollback_reason, '')), '') is not null)),
  constraint import_batches_failed_needs_reason
    check (status <> 'failed' or nullif(btrim(coalesce(failure_reason, '')), '') is not null),
  constraint import_batches_url_needs_source
    check (source_kind <> 'url' or source_url is not null)
);
create index import_batches_status_idx on import_batches (status, created_at desc);
create index import_batches_hash_idx on import_batches (entity_type, content_hash)
  where content_hash is not null;
select app.attach_touch('import_batches');

create or replace function app.set_import_batch_ref() returns trigger
language plpgsql as $$
begin
  if new.batch_ref is null then
    new.batch_ref := 'GRLP-IMP-' || lpad(nextval('import_batch_reference_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
create trigger import_batches_reference before insert on import_batches
  for each row execute function app.set_import_batch_ref();

-- ---------------------------------------------------------------------
-- The rows of the file, kept as they arrived.
--
-- raw is exactly what was read, before any mapping or cleaning, so a
-- mis-mapped import can be re-mapped and re-previewed without going back to
-- the original file — which by then may be gone from somebody's laptop.
-- ---------------------------------------------------------------------
create table import_rows (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references import_batches(id) on delete cascade,
  row_number    integer not null,

  raw           jsonb not null,
  mapped        jsonb,

  -- What the CRM intends to do, decided at preview and shown before anything
  -- is written.
  action        text not null default 'pending'
                  check (action in ('pending','create','update','skip','error')),
  -- Why it decided that, in words a person can read.
  action_reason text,

  -- The record this row is about, once known: either the duplicate it
  -- matched or the record it created.
  target_id     uuid,
  match_score   integer,
  errors        jsonb not null default '[]'::jsonb,

  -- Set only when this row actually wrote something, so a rollback knows
  -- precisely what to reverse and what to leave alone.
  committed_at  timestamptz,
  created_record boolean not null default false,

  constraint import_rows_error_needs_detail
    check (action <> 'error' or jsonb_array_length(errors) > 0),
  constraint import_rows_update_needs_target
    check (action <> 'update' or target_id is not null)
);
create unique index import_rows_one_per_number_idx on import_rows (batch_id, row_number);
create index import_rows_action_idx on import_rows (batch_id, action);
create index import_rows_target_idx on import_rows (target_id) where target_id is not null;

-- ---------------------------------------------------------------------
-- Saved mappings, so the same export does not have to be mapped by hand
-- every month (spec 64).
-- ---------------------------------------------------------------------
create table import_mappings (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  entity_type   text not null check (entity_type in ('person','property')),
  source_system text not null default 'generic',
  mapping       jsonb not null,
  is_shared     boolean not null default true,
  times_used    integer not null default 0,
  last_used_at  timestamptz,
  created_at    timestamptz not null default now(),
  created_by    uuid references users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references users(id) on delete set null
);
create unique index import_mappings_name_idx on import_mappings (lower(name), entity_type);
select app.attach_touch('import_mappings');

-- ---------------------------------------------------------------------
-- Where a record came from.
--
-- Provenance belongs on the record itself, not only in the import, because
-- the question is nearly always asked from the record's side: somebody is
-- looking at an odd-looking client and wants to know whether a person typed
-- it or a spreadsheet did.
-- ---------------------------------------------------------------------
alter table people
  add column imported_from_batch_id uuid references import_batches(id) on delete set null;
alter table properties
  add column imported_from_batch_id uuid references import_batches(id) on delete set null;
create index people_imported_idx on people (imported_from_batch_id)
  where imported_from_batch_id is not null;
create index properties_imported_idx on properties (imported_from_batch_id)
  where imported_from_batch_id is not null;

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------
insert into settings (key, value, category, label, description) values
  ('import.max_rows', '5000'::jsonb, 'Import',
   'Largest import accepted',
   'How many rows one import may contain. Bigger files should be split.'),
  ('import.max_bytes', '10485760'::jsonb, 'Import',
   'Largest file accepted (bytes)',
   'Files above this are refused rather than read into memory.'),
  ('import.url_allowed_hosts', '[]'::jsonb, 'Import',
   'Hosts an import may fetch from',
   'Importing by web address only works for hosts listed here. Empty means '
   || 'importing by address is switched off entirely.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table import_batches  enable row level security;
alter table import_rows     enable row level security;
alter table import_mappings enable row level security;

-- An import is an office-wide act, not an agent's private record, so anyone
-- who may see imports sees all of them. What an import may WRITE is still
-- governed by the policies on people and properties, which is the point:
-- an agent cannot use an import to create records they could not create by
-- hand, because the insert goes through the same policy.
create policy import_batches_select on import_batches for select
  using (app.has_permission('IMPORT_VIEW'));
create policy import_batches_insert on import_batches for insert
  with check (app.has_permission('IMPORT_CREATE') and created_by = app.current_user_id());
create policy import_batches_update on import_batches for update
  using (app.has_permission('IMPORT_CREATE')) with check (app.has_permission('IMPORT_CREATE'));

create policy import_rows_select on import_rows for select
  using (app.has_permission('IMPORT_VIEW'));
create policy import_rows_insert on import_rows for insert
  with check (app.has_permission('IMPORT_CREATE'));
create policy import_rows_update on import_rows for update
  using (app.has_permission('IMPORT_CREATE')) with check (app.has_permission('IMPORT_CREATE'));
-- Rows may be cleared while a batch is still a draft being re-mapped. Once
-- committed the batch's rows are history and the application never deletes
-- them; the check below is belt and braces for that.
create policy import_rows_delete on import_rows for delete
  using (
    app.has_permission('IMPORT_CREATE')
    and exists (
      select 1 from import_batches b
       where b.id = import_rows.batch_id
         and b.status in ('draft','mapped','previewed','cancelled')
    )
  );

create policy import_mappings_select on import_mappings for select
  using (app.has_permission('IMPORT_VIEW'));
create policy import_mappings_write on import_mappings for insert
  with check (app.has_permission('IMPORT_CREATE'));
create policy import_mappings_update on import_mappings for update
  using (app.has_permission('IMPORT_CREATE')) with check (app.has_permission('IMPORT_CREATE'));

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant select, insert, update on import_batches to grlp_app;
grant select, insert, update, delete on import_rows to grlp_app;
grant select, insert, update on import_mappings to grlp_app;
