-- =====================================================================
-- 003 PEOPLE
--
-- One person, one master record (spec 5). A person who buys, sells, lets
-- and rents is still one row here; what they are to the business is a set
-- of client types, and which side of the business they belong to is a
-- separate business area. The two are never conflated.
--
-- Identity numbers are held in their own table behind their own policy.
-- The master record keeps only a one-way fingerprint, used for duplicate
-- detection, and the last three digits, used for masked display.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Normalisation used by duplicate detection and search
-- ---------------------------------------------------------------------

-- 082 543 2681, 0825432681 and +27 82 543 2681 are the same number.
create or replace function app.normalise_za_phone(p_value text) returns text
language sql immutable as $$
  with digits as (
    select regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g') as d
  )
  select case
    when d = '' then null
    -- 0825432681 -> +27825432681
    when length(d) = 10 and left(d, 1) = '0' then '+27' || substr(d, 2)
    -- 27825432681 -> +27825432681
    when length(d) = 11 and left(d, 2) = '27' then '+' || d
    -- 825432681 -> +27825432681
    when length(d) = 9 and left(d, 1) <> '0' then '+27' || d
    -- anything else (international, short code) is kept as dialled
    else '+' || d
  end from digits;
$$;

create or replace function app.normalise_email(p_value text) returns text
language sql immutable as $$
  select nullif(lower(btrim(coalesce(p_value, ''))), '');
$$;

-- Folds accents and punctuation so "de Villiers" and "De-Villiers" match.
create or replace function app.normalise_name(p_value text) returns text
language sql immutable as $$
  select nullif(
    btrim(regexp_replace(lower(unaccent(coalesce(p_value, ''))), '[^a-z0-9]+', ' ', 'g')),
    '');
$$;

grant execute on function app.normalise_za_phone(text) to grlp_app;
grant execute on function app.normalise_email(text) to grlp_app;
grant execute on function app.normalise_name(text) to grlp_app;

-- ---------------------------------------------------------------------
-- The master person record
-- ---------------------------------------------------------------------

-- A sequence, so a reference is never reused: nextval does not roll back
-- when a transaction aborts, which is exactly the behaviour required.
create sequence person_reference_seq start 1;
grant usage, select on sequence person_reference_seq to grlp_app;

create table people (
  id                    uuid primary key default gen_random_uuid(),
  -- GRLP-00000001. Unique, permanent, never reused, and safe to quote in
  -- an email or on the phone because it discloses nothing about the person.
  client_ref            text not null unique,

  title                 text,
  first_name            text not null,
  middle_name           text,
  surname               text not null,
  preferred_name        text,

  -- Identity numbers live in person_identity. These two support masked
  -- display and duplicate detection without exposing the number itself.
  id_last3              text check (id_last3 ~ '^[0-9]{3}$'),
  id_fingerprint        text,
  passport_last3        text,
  passport_fingerprint  text,
  passport_country      text,
  passport_expiry       date,

  -- Which side of the business, kept separate from client type (spec 5).
  business_area         text not null default 'sales'
                          check (business_area in ('sales','rentals','sales_rentals','other')),

  primary_agent_id      uuid references users(id) on delete set null,
  secondary_agent_id    uuid references users(id) on delete set null,
  office_id             uuid references offices(id) on delete set null,
  team_id               uuid references teams(id) on delete set null,

  -- Maintained from meaningful activity, never from opening the profile.
  first_contact_at      timestamptz,
  last_contact_at       timestamptz,
  last_contact_method   text check (last_contact_method in
                          ('email','whatsapp','phone','sms','in_person','other')),
  last_contacted_by     uuid references users(id) on delete set null,
  next_follow_up_at     timestamptz,

  notes                 text,

  -- Archived rather than deleted, so history survives (spec 104, 38).
  is_archived           boolean not null default false,
  archived_at           timestamptz,
  archived_by           uuid references users(id) on delete set null,
  archive_reason        text,

  -- Set when this record loses a merge. The row stays for ever so that its
  -- reference can never be handed to anybody else (spec 20).
  merged_into_id        uuid references people(id) on delete restrict,
  merged_at             timestamptz,

  created_at            timestamptz not null default now(),
  created_by            uuid references users(id) on delete set null,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references users(id) on delete set null,
  row_version           integer not null default 1,

  constraint people_merge_consistent
    check ((merged_into_id is null) = (merged_at is null)),
  constraint people_not_merged_into_self
    check (merged_into_id is null or merged_into_id <> id)
);

create or replace function app.assign_client_ref() returns trigger
language plpgsql as $$
begin
  if new.client_ref is null or new.client_ref = '' then
    new.client_ref := 'GRLP-' || lpad(nextval('person_reference_seq')::text, 8, '0');
  end if;
  return new;
end;
$$;
create trigger people_assign_ref before insert on people
  for each row execute function app.assign_client_ref();
select app.attach_touch('people');

create index people_primary_agent_idx on people (primary_agent_id) where not is_archived;
create index people_secondary_agent_idx on people (secondary_agent_id) where not is_archived;
create index people_surname_idx on people (app.normalise_name(surname));
create index people_fullname_trgm_idx on people
  using gin ((app.normalise_name(first_name || ' ' || surname)) gin_trgm_ops);
create index people_business_area_idx on people (business_area) where not is_archived;
create index people_follow_up_idx on people (next_follow_up_at) where next_follow_up_at is not null;
create index people_last_contact_idx on people (last_contact_at desc nulls last);
create index people_merged_idx on people (merged_into_id) where merged_into_id is not null;
-- Two live people must not share an identity number.
create unique index people_id_fingerprint_key on people (id_fingerprint)
  where id_fingerprint is not null and merged_into_id is null;

-- ---------------------------------------------------------------------
-- Identity numbers (spec 15)
--
-- A separate table with its own policy, so the number is unreachable
-- without PERSON_ID_VIEW no matter which query asks for it.
-- ---------------------------------------------------------------------
create table person_identity (
  person_id        uuid primary key references people(id) on delete cascade,
  id_number        text,
  passport_number  text,
  recorded_at      timestamptz not null default now(),
  recorded_by      uuid references users(id) on delete set null,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references users(id) on delete set null
);

-- ---------------------------------------------------------------------
-- Client types: one person can be several at once (spec 5, 12)
-- ---------------------------------------------------------------------
create table person_client_types (
  person_id     uuid not null references people(id) on delete cascade,
  client_type   text not null check (client_type in
                  ('buyer','seller','landlord','tenant','owner','investor','developer','other')),
  added_at      timestamptz not null default now(),
  added_by      uuid references users(id) on delete set null,
  primary key (person_id, client_type)
);
create index person_client_types_type_idx on person_client_types (client_type);

-- ---------------------------------------------------------------------
-- Contact details: several per person, each typed (spec 12)
-- ---------------------------------------------------------------------
create table person_contacts (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references people(id) on delete cascade,
  contact_type    text not null check (contact_type in
                    ('mobile','alternative_mobile','landline','email','whatsapp','fax','other')),
  value           text not null,
  -- Normalised at write time so duplicate detection and search agree.
  value_normalised text generated always as (
    case when contact_type = 'email' then app.normalise_email(value)
         when contact_type in ('mobile','alternative_mobile','landline','whatsapp','fax')
           then app.normalise_za_phone(value)
         else nullif(lower(btrim(value)), '') end
  ) stored,
  is_primary      boolean not null default false,
  is_active       boolean not null default true,
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid references users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references users(id) on delete set null
);
create index person_contacts_person_idx on person_contacts (person_id);
create index person_contacts_value_idx on person_contacts (value_normalised)
  where value_normalised is not null and is_active;
-- One primary per type per person.
create unique index person_contacts_one_primary_idx
  on person_contacts (person_id, contact_type) where is_primary;
create unique index person_contacts_no_repeat_idx
  on person_contacts (person_id, contact_type, value_normalised)
  where value_normalised is not null;
select app.attach_touch('person_contacts');

-- ---------------------------------------------------------------------
-- Addresses (spec 12)
-- ---------------------------------------------------------------------
create table person_addresses (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references people(id) on delete cascade,
  address_type  text not null default 'physical'
                  check (address_type in ('physical','postal','other')),
  line1         text,
  line2         text,
  suburb        text,
  city          text,
  province      text check (province is null or province in
                  ('Western Cape','Eastern Cape','Northern Cape','Free State','KwaZulu-Natal',
                   'North West','Gauteng','Mpumalanga','Limpopo','Outside South Africa')),
  postal_code   text,
  is_primary    boolean not null default false,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references users(id) on delete set null
);
create index person_addresses_person_idx on person_addresses (person_id);
create index person_addresses_suburb_idx on person_addresses (app.normalise_name(suburb));
create unique index person_addresses_one_primary_idx
  on person_addresses (person_id, address_type) where is_primary;
select app.attach_touch('person_addresses');

-- ---------------------------------------------------------------------
-- Person to person relationships (spec 16)
-- ---------------------------------------------------------------------
create table person_relationships (
  id                 uuid primary key default gen_random_uuid(),
  person_id          uuid not null references people(id) on delete cascade,
  related_person_id  uuid not null references people(id) on delete cascade,
  relationship_type  text not null check (relationship_type in
                       ('spouse','partner','family','attorney','adviser','accountant',
                        'company_representative','co_owner','buyer','seller','landlord',
                        'tenant','other')),
  start_date         date,
  end_date           date,
  notes              text,
  created_at         timestamptz not null default now(),
  created_by         uuid references users(id) on delete set null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references users(id) on delete set null,
  constraint person_relationship_not_self check (person_id <> related_person_id),
  constraint person_relationship_dates check (end_date is null or start_date is null or end_date >= start_date)
);
create unique index person_relationships_unique_idx
  on person_relationships (person_id, related_person_id, relationship_type);
create index person_relationships_related_idx on person_relationships (related_person_id);
select app.attach_touch('person_relationships');

-- ---------------------------------------------------------------------
-- Agent assignment history (spec 65)
-- ---------------------------------------------------------------------
create table person_agent_assignments (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references people(id) on delete cascade,
  agent_id      uuid references users(id) on delete set null,
  assignment    text not null default 'primary' check (assignment in ('primary','secondary')),
  assigned_at   timestamptz not null default now(),
  assigned_by   uuid references users(id) on delete set null,
  unassigned_at timestamptz,
  reason        text
);
create index person_agent_assignments_person_idx
  on person_agent_assignments (person_id, assigned_at desc);
create index person_agent_assignments_agent_idx on person_agent_assignments (agent_id);

-- ---------------------------------------------------------------------
-- Merge records (spec 20, 21)
--
-- Kept for people and properties alike. The losing record is never deleted,
-- so its reference stays occupied for ever.
-- ---------------------------------------------------------------------
create table merge_records (
  id                uuid primary key default gen_random_uuid(),
  entity_type       text not null check (entity_type in ('person','property')),
  master_id         uuid not null,
  master_reference  text not null,
  merged_id         uuid not null,
  merged_reference  text not null,
  reason            text,
  selected_fields   jsonb,
  moved_counts      jsonb,
  performed_at      timestamptz not null default now(),
  performed_by      uuid references users(id) on delete set null
);
create index merge_records_master_idx on merge_records (entity_type, master_id);
create index merge_records_merged_idx on merge_records (entity_type, merged_id);
create index merge_records_when_idx on merge_records (performed_at desc);

-- Duplicate pairs a user has chosen to leave alone (spec 21).
create table duplicate_dismissals (
  id            uuid primary key default gen_random_uuid(),
  entity_type   text not null check (entity_type in ('person','property')),
  left_id       uuid not null,
  right_id      uuid not null,
  decision      text not null check (decision in ('not_duplicate','review_later')),
  reason        text,
  decided_at    timestamptz not null default now(),
  decided_by    uuid references users(id) on delete set null,
  constraint duplicate_dismissal_order check (left_id < right_id)
);
create unique index duplicate_dismissals_pair_idx
  on duplicate_dismissals (entity_type, left_id, right_id);

-- ---------------------------------------------------------------------
-- Tags (spec 91)
-- ---------------------------------------------------------------------
create table tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  colour      text not null default 'neutral'
                check (colour in ('neutral','brand','ok','warn','stop','info')),
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid references users(id) on delete set null
);
create unique index tags_name_key on tags (lower(name));

create table record_tags (
  tag_id       uuid not null references tags(id) on delete cascade,
  entity_type  text not null check (entity_type in
                 ('person','property','lead','transaction','rental_application')),
  entity_id    uuid not null,
  added_at     timestamptz not null default now(),
  added_by     uuid references users(id) on delete set null,
  primary key (tag_id, entity_type, entity_id)
);
create index record_tags_entity_idx on record_tags (entity_type, entity_id);

insert into tags (name, colour, sort_order) values
  ('VIP', 'brand', 10), ('Investor', 'info', 20), ('Hot Buyer', 'stop', 30),
  ('Hot Seller', 'stop', 40), ('Seller Prospect', 'warn', 50),
  ('Buyer Prospect', 'warn', 60), ('Relocation', 'info', 70),
  ('Holiday Home', 'info', 80), ('Follow Up', 'warn', 90),
  ('Open Day', 'neutral', 100), ('Rental Investor', 'info', 110),
  ('Urgent', 'stop', 120), ('Other', 'neutral', 130);

-- ---------------------------------------------------------------------
-- Activity maintenance (spec 13, 14)
--
-- First contact is set by the earliest meaningful interaction and never
-- moves forward; last contact always reflects the most recent one. Opening
-- a profile is not an interaction and never reaches this function.
-- ---------------------------------------------------------------------
create or replace function app.record_person_contact(
  p_person_id uuid, p_at timestamptz, p_method text, p_user_id uuid
) returns void
language sql as $$
  update people
     set first_contact_at = least(coalesce(first_contact_at, p_at), p_at),
         last_contact_at = greatest(coalesce(last_contact_at, p_at), p_at),
         last_contact_method = case
           when last_contact_at is null or p_at >= last_contact_at then p_method
           else last_contact_method end,
         last_contacted_by = case
           when last_contact_at is null or p_at >= last_contact_at then p_user_id
           else last_contacted_by end
   where id = p_person_id;
$$;
grant execute on function app.record_person_contact(uuid, timestamptz, text, uuid) to grlp_app;

-- ---------------------------------------------------------------------
-- Visibility helper: one place that decides whether a person is visible,
-- reused by every child table's policy.
-- ---------------------------------------------------------------------
create or replace function app.can_see_person(p_person_id uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.has_permission('PEOPLE_VIEW') and exists (
    select 1 from people p
    where p.id = p_person_id
      and app.can_access_agent_record(p.primary_agent_id, p.secondary_agent_id)
  );
$$;
revoke all on function app.can_see_person(uuid) from public;
grant execute on function app.can_see_person(uuid) to grlp_app;

create or replace function app.can_edit_person(p_person_id uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.has_permission('PEOPLE_EDIT') and exists (
    select 1 from people p
    where p.id = p_person_id
      and app.can_access_agent_record(p.primary_agent_id, p.secondary_agent_id)
  );
$$;
revoke all on function app.can_edit_person(uuid) from public;
grant execute on function app.can_edit_person(uuid) to grlp_app;

-- ---------------------------------------------------------------------
-- Grants. People are archived, never deleted, so no DELETE is granted on
-- the master record or on its history.
-- ---------------------------------------------------------------------
grant select, insert, update on people to grlp_app;
grant select, insert, update on person_identity to grlp_app;
grant select, insert, delete on person_client_types to grlp_app;
grant select, insert, update, delete on person_contacts to grlp_app;
grant select, insert, update, delete on person_addresses to grlp_app;
grant select, insert, update, delete on person_relationships to grlp_app;
grant select, insert, update on person_agent_assignments to grlp_app;
grant select, insert on merge_records to grlp_app;
grant select, insert, update, delete on duplicate_dismissals to grlp_app;
grant select, insert, update on tags to grlp_app;
grant select, insert, delete on record_tags to grlp_app;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table people enable row level security;
alter table person_identity enable row level security;
alter table person_client_types enable row level security;
alter table person_contacts enable row level security;
alter table person_addresses enable row level security;
alter table person_relationships enable row level security;
alter table person_agent_assignments enable row level security;
alter table merge_records enable row level security;
alter table duplicate_dismissals enable row level security;
alter table tags enable row level security;
alter table record_tags enable row level security;

create policy people_select on people for select using (
  app.has_permission('PEOPLE_VIEW')
  and app.can_access_agent_record(primary_agent_id, secondary_agent_id)
);
-- An agent may only create a record they will still be able to see.
create policy people_insert on people for insert with check (
  app.has_permission('PEOPLE_CREATE')
  and app.can_access_agent_record(primary_agent_id, secondary_agent_id)
);
create policy people_update on people for update using (
  app.has_permission('PEOPLE_EDIT')
  and app.can_access_agent_record(primary_agent_id, secondary_agent_id)
) with check (
  app.has_permission('PEOPLE_EDIT')
  and app.can_access_agent_record(primary_agent_id, secondary_agent_id)
);

-- Reading an identity number needs PERSON_ID_VIEW; recording one does not.
-- An agent taking a client's details can capture the number -- they are
-- looking at the document in front of them -- but cannot then read back the
-- numbers held against anybody else's record.
create policy person_identity_select on person_identity for select using (
  app.has_permission('PERSON_ID_VIEW') and app.can_see_person(person_id)
);
create policy person_identity_insert on person_identity for insert with check (
  app.can_edit_person(person_id)
);
create policy person_identity_update on person_identity for update using (
  app.can_edit_person(person_id)
) with check (
  app.can_edit_person(person_id)
);

create policy person_client_types_select on person_client_types for select
  using (app.can_see_person(person_id));
create policy person_client_types_write on person_client_types for all
  using (app.can_edit_person(person_id)) with check (app.can_edit_person(person_id));

create policy person_contacts_select on person_contacts for select
  using (app.can_see_person(person_id));
create policy person_contacts_write on person_contacts for all
  using (app.can_edit_person(person_id)) with check (app.can_edit_person(person_id));

create policy person_addresses_select on person_addresses for select
  using (app.can_see_person(person_id));
create policy person_addresses_write on person_addresses for all
  using (app.can_edit_person(person_id)) with check (app.can_edit_person(person_id));

-- A relationship is visible from either side, provided both people are.
create policy person_relationships_select on person_relationships for select
  using (app.can_see_person(person_id) or app.can_see_person(related_person_id));
create policy person_relationships_write on person_relationships for all
  using (app.can_edit_person(person_id))
  with check (app.can_edit_person(person_id) and app.can_see_person(related_person_id));

create policy person_assignments_select on person_agent_assignments for select
  using (app.can_see_person(person_id));
create policy person_assignments_insert on person_agent_assignments for insert
  with check (app.has_permission('PEOPLE_EDIT'));
create policy person_assignments_update on person_agent_assignments for update
  using (app.has_permission('PEOPLE_EDIT')) with check (app.has_permission('PEOPLE_EDIT'));

create policy merge_records_select on merge_records for select
  using (app.has_permission('PEOPLE_VIEW') or app.has_permission('PROPERTIES_VIEW'));
create policy merge_records_insert on merge_records for insert
  with check (app.has_permission('MERGE_RECORDS'));

create policy duplicate_dismissals_select on duplicate_dismissals for select
  using (app.has_permission('PEOPLE_VIEW') or app.has_permission('PROPERTIES_VIEW'));
create policy duplicate_dismissals_write on duplicate_dismissals for all
  using (app.has_permission('MERGE_RECORDS')) with check (app.has_permission('MERGE_RECORDS'));

create policy tags_select on tags for select using (app.is_authenticated());
create policy tags_write on tags for all
  using (app.has_permission('SETTINGS_ADMIN')) with check (app.has_permission('SETTINGS_ADMIN'));

-- A tag on a person follows that person's visibility; tags on records from
-- later stages are handled by their own migrations extending this policy.
create policy record_tags_select on record_tags for select using (
  app.is_authenticated()
  and (entity_type <> 'person' or app.can_see_person(entity_id))
);
create policy record_tags_write on record_tags for all using (
  app.is_authenticated()
  and (entity_type <> 'person' or app.can_edit_person(entity_id))
) with check (
  app.is_authenticated()
  and (entity_type <> 'person' or app.can_edit_person(entity_id))
);
