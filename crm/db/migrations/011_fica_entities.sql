-- ---------------------------------------------------------------------
-- Stage 8: companies, and FICA (spec 30 to 38, 115)
--
-- Two things that belong together because the second is usually about the
-- first: a great many GRLP clients buy, sell or let through a company, a
-- close corporation or a trust, and FICA is about establishing who is really
-- behind it.
--
-- THE HONESTY RULE FOR THIS STAGE (spec 115).
--
-- The CRM cannot verify anybody. It has no connection to Home Affairs, to a
-- deeds office, to CIPC, to a credit bureau or to a sanctions list. Nothing
-- here checks an identity document, and nothing here decides whether somebody
-- is a politically exposed person.
--
-- What it does is keep the office's own record: which documents were
-- collected, who looked at them, when, and what that person concluded. Every
-- verification names a USER, never the system. A record cannot reach
-- 'verified' without a person and a date attached, and the database enforces
-- that rather than trusting the form.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Companies and other legal entities (spec 30, 31)
-- ---------------------------------------------------------------------
create sequence company_reference_seq start 1;
grant usage, select on sequence company_reference_seq to grlp_app;

create table companies (
  id                uuid primary key default gen_random_uuid(),
  company_ref       text not null unique,

  registered_name   text not null,
  trading_name      text,
  entity_type       text not null default 'pty_ltd' check (entity_type in
                      ('pty_ltd','close_corporation','trust','sole_proprietor','partnership',
                       'npc','body_corporate','public_company','foreign_entity','other')),

  registration_number text,
  vat_number          text,
  tax_number          text,

  -- Where it is registered. Kept on the company rather than borrowed from a
  -- person, because they are genuinely different addresses.
  address_line1     text,
  address_line2     text,
  suburb            text,
  city              text,
  province          text,
  postal_code       text,

  -- Kept separate from client type, exactly as for a person (spec 5, 24).
  business_area     text not null default 'sales' check (business_area in
                      ('sales','rentals','sales_rentals','commercial')),

  primary_agent_id  uuid references users(id) on delete set null,
  secondary_agent_id uuid references users(id) on delete set null,
  office_id         uuid references offices(id) on delete set null,

  notes             text,

  is_archived       boolean not null default false,
  archived_at       timestamptz,
  archived_by       uuid references users(id) on delete set null,
  archive_reason    text,
  merged_into_id    uuid references companies(id) on delete set null,

  created_at        timestamptz not null default now(),
  created_by        uuid references users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references users(id) on delete set null,
  row_version       integer not null default 1,

  constraint companies_archive_needs_reason
    check (not is_archived or nullif(btrim(coalesce(archive_reason, '')), '') is not null)
);
create index companies_name_idx on companies (lower(registered_name));
create index companies_registration_idx on companies (registration_number)
  where registration_number is not null;
create index companies_agent_idx on companies (primary_agent_id, secondary_agent_id);
select app.attach_touch('companies');

create or replace function app.set_company_ref() returns trigger
language plpgsql as $$
begin
  if new.company_ref is null then
    new.company_ref := 'GRLP-C-' || lpad(nextval('company_reference_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
create trigger companies_reference before insert on companies
  for each row execute function app.set_company_ref();

-- The documents table has carried a company_id since stage 3.
alter table documents
  add constraint documents_company_fk
  foreign key (company_id) references companies(id) on delete cascade;

-- ---------------------------------------------------------------------
-- Who is behind the company (spec 31, 34)
--
-- This is the part FICA actually cares about: a company is not a person, and
-- establishing who controls it is the whole exercise.
-- ---------------------------------------------------------------------
create table company_people (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  person_id     uuid not null references people(id) on delete cascade,
  role          text not null check (role in
                  ('director','member','trustee','beneficiary','shareholder',
                   'authorised_representative','public_officer','partner','signatory','other')),
  is_primary_contact boolean not null default false,
  shareholding_percent numeric(6,3) check (shareholding_percent is null or
                         (shareholding_percent >= 0 and shareholding_percent <= 100)),
  appointed_on  date,
  resigned_on   date,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references users(id) on delete set null,

  constraint company_people_dates
    check (resigned_on is null or appointed_on is null or resigned_on >= appointed_on)
);
create unique index company_people_unique_idx
  on company_people (company_id, person_id, role);
create index company_people_person_idx on company_people (person_id);
create unique index company_people_one_primary_idx
  on company_people (company_id) where is_primary_contact;
select app.attach_touch('company_people');

-- A property can be owned by a company, which is the common case for a
-- development or a body corporate. property_people keeps people; this keeps
-- entities, rather than pretending a company is a person.
create table property_companies (
  id                uuid primary key default gen_random_uuid(),
  property_id       uuid not null references properties(id) on delete cascade,
  company_id        uuid not null references companies(id) on delete cascade,
  role              text not null check (role in
                      ('owner','co_owner','seller','buyer','landlord','tenant',
                       'previous_owner','developer','managing_agent','other')),
  ownership_percent numeric(6,3) check (ownership_percent is null or
                      (ownership_percent >= 0 and ownership_percent <= 100)),
  start_date        date,
  end_date          date,
  notes             text,
  created_at        timestamptz not null default now(),
  created_by        uuid references users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references users(id) on delete set null,

  constraint property_companies_dates
    check (end_date is null or start_date is null or end_date >= start_date)
);
create unique index property_companies_unique_idx
  on property_companies (property_id, company_id, role);
create index property_companies_company_idx on property_companies (company_id);
select app.attach_touch('property_companies');

-- ---------------------------------------------------------------------
-- FICA (spec 33 to 38)
-- ---------------------------------------------------------------------
create sequence fica_reference_seq start 1;
grant usage, select on sequence fica_reference_seq to grlp_app;

create table fica_records (
  id            uuid primary key default gen_random_uuid(),
  fica_ref      text not null unique,

  -- Exactly one subject. A FICA file is about a person or about an entity,
  -- and conflating the two is how the entity's controllers get missed.
  person_id     uuid references people(id) on delete cascade,
  company_id    uuid references companies(id) on delete cascade,

  status        text not null default 'not_started' check (status in
                  ('not_started','documents_requested','documents_received',
                   'under_review','verified','rejected','expired','exempt')),

  -- The officer's own assessment, recorded as theirs. Nothing computes this.
  risk_rating   text check (risk_rating in ('low','medium','high')),
  risk_note     text,

  -- Asked and answered by a person, never looked up. The CRM has no
  -- connection to any sanctions or PEP list, and saying otherwise would be
  -- the most dangerous lie in the whole system.
  pep_declared  boolean,
  pep_note      text,
  sanctions_note text,

  source_of_funds text,
  purpose_of_relationship text,

  -- Who concluded what, and when. A verified record without a person and a
  -- date is refused below: the office must be able to say who decided.
  verified_by   uuid references users(id) on delete set null,
  verified_at   timestamptz,
  verification_note text,

  rejected_by   uuid references users(id) on delete set null,
  rejected_at   timestamptz,
  rejection_reason text,

  -- FICA is not done once. A file goes stale and has to be refreshed.
  expires_on    date,

  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references users(id) on delete set null,
  row_version   integer not null default 1,

  constraint fica_records_one_subject
    check ((person_id is not null) <> (company_id is not null)),

  -- The honesty rule, enforced by the database (spec 115). A record cannot
  -- claim to be verified unless a named person verified it on a known date.
  constraint fica_records_verified_needs_a_person
    check (status <> 'verified' or (verified_by is not null and verified_at is not null)),
  constraint fica_records_rejected_needs_a_reason
    check (status <> 'rejected'
           or (rejected_at is not null
               and nullif(btrim(coalesce(rejection_reason, '')), '') is not null)),
  constraint fica_records_exempt_needs_a_reason
    check (status <> 'exempt' or nullif(btrim(coalesce(notes, '')), '') is not null)
);
create unique index fica_records_one_per_person_idx on fica_records (person_id)
  where person_id is not null;
create unique index fica_records_one_per_company_idx on fica_records (company_id)
  where company_id is not null;
create index fica_records_status_idx on fica_records (status);
create index fica_records_expiry_idx on fica_records (expires_on)
  where expires_on is not null and status = 'verified';
select app.attach_touch('fica_records');

create or replace function app.set_fica_ref() returns trigger
language plpgsql as $$
begin
  if new.fica_ref is null then
    new.fica_ref := 'GRLP-F-' || lpad(nextval('fica_reference_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
create trigger fica_records_reference before insert on fica_records
  for each row execute function app.set_fica_ref();

-- ---------------------------------------------------------------------
-- What the office asks for.
--
-- Configuration, not law. GRLP decides what it collects and can change it
-- without a deployment; nothing here asserts a statutory requirement.
-- ---------------------------------------------------------------------
create table fica_checklist_items (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  description   text,
  applies_to    text not null default 'both'
                  check (applies_to in ('person','company','both')),
  is_required   boolean not null default true,
  sort_order    integer not null default 0,
  is_active     boolean not null default true
);

insert into fica_checklist_items (code, name, description, applies_to, is_required, sort_order) values
  ('id_document', 'Identity document',
   'A copy of the identity document or passport, seen against the original.', 'person', true, 10),
  ('proof_of_address', 'Proof of address',
   'Something recent enough to be worth having, in the person''s own name.', 'both', true, 20),
  ('bank_confirmation', 'Bank confirmation letter',
   'Confirms the account the money will move through.', 'both', true, 30),
  ('tax_number', 'Tax number',
   'The number itself, and whatever confirms it.', 'both', false, 40),
  ('source_of_funds', 'Source of funds',
   'Where the money is coming from, and what backs that up.', 'both', true, 50),
  ('company_registration', 'Company registration documents',
   'The registration certificate and whatever shows the current state of it.',
   'company', true, 60),
  ('trust_deed', 'Trust deed or founding document',
   'For a trust, a close corporation or a body corporate.', 'company', false, 70),
  ('directors_ids', 'Identity documents of those in control',
   'Every director, member or trustee, and anyone holding enough to control it.',
   'company', true, 80),
  ('resolution', 'Resolution or authority to act',
   'What shows the person in front of you may sign for the entity.', 'company', true, 90),
  ('pep_declaration', 'Politically exposed person declaration',
   'Asked and answered by the client. The CRM checks no list, because it is '
   || 'connected to none.', 'both', true, 100)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- What was actually collected, and who looked at it.
-- ---------------------------------------------------------------------
create table fica_document_checks (
  id            uuid primary key default gen_random_uuid(),
  fica_record_id uuid not null references fica_records(id) on delete cascade,
  item_id       uuid not null references fica_checklist_items(id) on delete restrict,

  status        text not null default 'not_provided' check (status in
                  ('not_provided','requested','provided','seen_against_original',
                   'rejected','not_applicable')),
  document_id   uuid references documents(id) on delete set null,
  note          text,

  -- The person who looked. Required for anything beyond 'requested', because
  -- "provided" with nobody's name on it is not a record of anything.
  checked_by    uuid references users(id) on delete set null,
  checked_at    timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references users(id) on delete set null,

  constraint fica_document_checks_needs_a_checker
    check (status in ('not_provided','requested')
           or (checked_by is not null and checked_at is not null))
);
create unique index fica_document_checks_unique_idx
  on fica_document_checks (fica_record_id, item_id);
create index fica_document_checks_record_idx on fica_document_checks (fica_record_id);
select app.attach_touch('fica_document_checks');

-- Append-only, like every other status history in the system (spec 104).
create table fica_status_history (
  id            bigserial primary key,
  fica_record_id uuid not null references fica_records(id) on delete cascade,
  old_status    text,
  new_status    text not null,
  reason        text,
  changed_at    timestamptz not null default now(),
  changed_by    uuid references users(id) on delete set null
);
create index fica_status_history_record_idx
  on fica_status_history (fica_record_id, changed_at desc);
create trigger fica_status_history_no_change
  before update or delete on fica_status_history
  for each statement execute function app.deny_mutation();

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------
insert into settings (key, value, category, label, description) values
  ('fica.valid_months', '24'::jsonb, 'FICA',
   'How long a verified FICA file stays current (months)',
   'After this, the file is treated as needing refreshing. GRLP sets this.'),
  ('fica.warn_days_before_expiry', '60'::jsonb, 'FICA',
   'Warn this many days before a file expires',
   'How much notice the office wants before a verified file goes stale.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------
create or replace function app.can_see_company(p_company_id uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.has_permission('PEOPLE_VIEW') and exists (
    select 1 from companies c
     where c.id = p_company_id
       and app.can_access_agent_record(c.primary_agent_id, c.secondary_agent_id)
  );
$$;
revoke all on function app.can_see_company(uuid) from public;
grant execute on function app.can_see_company(uuid) to grlp_app;

create or replace function app.can_edit_company(p_company_id uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.has_permission('PEOPLE_EDIT') and exists (
    select 1 from companies c
     where c.id = p_company_id
       and app.can_access_agent_record(c.primary_agent_id, c.secondary_agent_id)
  );
$$;
revoke all on function app.can_edit_company(uuid) from public;
grant execute on function app.can_edit_company(uuid) to grlp_app;

alter table companies             enable row level security;
alter table company_people        enable row level security;
alter table property_companies    enable row level security;
alter table fica_records          enable row level security;
alter table fica_checklist_items  enable row level security;
alter table fica_document_checks  enable row level security;
alter table fica_status_history   enable row level security;

create policy companies_select on companies for select using (
  app.has_permission('PEOPLE_VIEW')
  and app.can_access_agent_record(primary_agent_id, secondary_agent_id)
);
create policy companies_insert on companies for insert with check (
  app.has_permission('PEOPLE_CREATE')
  and (app.can_view_all() or coalesce(primary_agent_id, app.current_user_id()) = app.current_user_id())
);
create policy companies_update on companies for update using (
  app.has_permission('PEOPLE_EDIT')
  and app.can_access_agent_record(primary_agent_id, secondary_agent_id)
) with check (
  app.has_permission('PEOPLE_EDIT')
  and app.can_access_agent_record(primary_agent_id, secondary_agent_id)
);

create policy company_people_select on company_people for select
  using (app.can_see_company(company_id));
create policy company_people_write on company_people for insert
  with check (app.can_edit_company(company_id) and app.can_see_person(person_id));
create policy company_people_update on company_people for update
  using (app.can_edit_company(company_id)) with check (app.can_edit_company(company_id));
create policy company_people_delete on company_people for delete
  using (app.can_edit_company(company_id));

create policy property_companies_select on property_companies for select
  using (app.can_see_property(property_id) and app.can_see_company(company_id));
create policy property_companies_write on property_companies for insert
  with check (app.can_edit_property(property_id) and app.can_see_company(company_id));
create policy property_companies_update on property_companies for update
  using (app.can_edit_property(property_id)) with check (app.can_edit_property(property_id));
create policy property_companies_delete on property_companies for delete
  using (app.can_edit_property(property_id));

-- FICA is its own permission, deliberately not given to ADMIN (spec 9): an
-- office administrator runs the CRM without being able to read everybody's
-- identity documents.
create policy fica_records_select on fica_records for select using (
  app.has_permission('FICA_VIEW')
  and (
    (person_id is not null and app.can_see_person(person_id))
    or (company_id is not null and app.can_see_company(company_id))
  )
);
create policy fica_records_insert on fica_records for insert with check (
  app.has_permission('FICA_CREATE')
  and (
    (person_id is not null and app.can_see_person(person_id))
    or (company_id is not null and app.can_see_company(company_id))
  )
);
create policy fica_records_update on fica_records for update using (
  app.has_permission('FICA_EDIT')
) with check (
  app.has_permission('FICA_EDIT')
);

create policy fica_checklist_items_select on fica_checklist_items for select
  using (app.is_authenticated());
create policy fica_checklist_items_write on fica_checklist_items for all
  using (app.has_permission('SETTINGS_ADMIN'))
  with check (app.has_permission('SETTINGS_ADMIN'));

create policy fica_document_checks_select on fica_document_checks for select using (
  app.has_permission('FICA_VIEW')
  and exists (select 1 from fica_records r where r.id = fica_record_id)
);
create policy fica_document_checks_write on fica_document_checks for insert
  with check (app.has_permission('FICA_CREATE'));
create policy fica_document_checks_update on fica_document_checks for update
  using (app.has_permission('FICA_EDIT')) with check (app.has_permission('FICA_EDIT'));

create policy fica_status_history_select on fica_status_history for select
  using (app.has_permission('FICA_VIEW'));
create policy fica_status_history_insert on fica_status_history for insert
  with check (app.has_permission('FICA_CREATE'));

-- ---------------------------------------------------------------------
-- A merge must carry all of this
-- ---------------------------------------------------------------------
insert into merge_child_tables (entity_type, table_name, column_name, note) values
  ('person', 'company_people', 'person_id', 'Roles in companies'),
  ('person', 'fica_records', 'person_id', 'FICA file'),
  ('property', 'property_companies', 'property_id', 'Companies linked to the property');

-- ---------------------------------------------------------------------
-- Grants. A FICA record is never deleted, only superseded.
-- ---------------------------------------------------------------------
grant select, insert, update on companies to grlp_app;
grant select, insert, update, delete on company_people to grlp_app;
grant select, insert, update, delete on property_companies to grlp_app;
grant select, insert, update on fica_records to grlp_app;
grant select on fica_checklist_items to grlp_app;
grant select, insert, update on fica_document_checks to grlp_app;
grant select, insert on fica_status_history to grlp_app;
grant usage, select on sequence fica_status_history_id_seq to grlp_app;
