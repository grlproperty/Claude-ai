-- =====================================================================
-- 005 PROPERTIES
--
-- One property, one master record (spec 5, 22).
--
-- The six status concepts stay six columns, never one (spec 141):
--
--   property_status  where the property itself stands
--   sales_status     where it stands in the sales pipeline
--   rental_status    where it stands in the rental pipeline
--   mandate_status   whether GRLP has a mandate, and what has become of it
--   mandate_type     sole, open or dual
--   sale_outcome     who eventually sold it, if anybody did
--
-- Collapsing these into one "status" is the mistake this schema exists to
-- prevent: a property can be off market, with an expired sole mandate, that
-- was sold by a third party, and each of those is a different fact.
-- =====================================================================

create sequence property_reference_seq start 1;
grant usage, select on sequence property_reference_seq to grlp_app;

create table properties (
  id                    uuid primary key default gen_random_uuid(),
  -- GRLP-P-00000001. Unique, permanent, never reused.
  property_ref          text not null unique,

  -- Identification
  erf_number            text,
  portion_number        text,
  township              text,
  property_name         text,
  street_address        text,
  suburb                text,
  city                  text,
  province              text check (province is null or province in
                          ('Western Cape','Eastern Cape','Northern Cape','Free State','KwaZulu-Natal',
                           'North West','Gauteng','Mpumalanga','Limpopo','Outside South Africa')),
  postal_code           text,

  -- The property itself
  property_type         text not null default 'house' check (property_type in
                          ('house','apartment','townhouse','vacant_land','farm','smallholding',
                           'commercial','industrial','retirement','guest_house','other')),
  bedrooms              numeric(4,1) check (bedrooms is null or bedrooms >= 0),
  bathrooms             numeric(4,1) check (bathrooms is null or bathrooms >= 0),
  garages               integer check (garages is null or garages >= 0),
  parking               integer check (parking is null or parking >= 0),
  land_size_sqm         numeric(12,2) check (land_size_sqm is null or land_size_sqm >= 0),
  building_size_sqm     numeric(12,2) check (building_size_sqm is null or building_size_sqm >= 0),

  -- Money. Kept as numeric so nothing is rounded on the way in.
  original_asking_price numeric(14,2) check (original_asking_price is null or original_asking_price >= 0),
  current_asking_price  numeric(14,2) check (current_asking_price is null or current_asking_price >= 0),
  estimated_value       numeric(14,2) check (estimated_value is null or estimated_value >= 0),
  monthly_rental        numeric(12,2) check (monthly_rental is null or monthly_rental >= 0),

  -- Which side of the business, separate from every status (spec 24)
  business_area         text not null default 'sales'
                          check (business_area in ('sales','rentals','sales_rentals','other')),

  -- The six separate status concepts
  property_status       text not null default 'active' check (property_status in
                          ('active','on_market','off_market','expired','mandate_withdrawn',
                           'sale_cancelled','sale_pending','sale_concluded','sale_registered')),
  sales_status          text not null default 'prospect' check (sales_status in
                          ('prospect','active','on_market','viewing','offer_received','sale_pending',
                           'sale_concluded','sale_cancelled','sale_registered','withdrawn',
                           'off_market','expired')),
  rental_status         text not null default 'rental_prospect' check (rental_status in
                          ('rental_prospect','available','on_market','viewing','application_pending',
                           'application_approved','let','lease_active','lease_expired','withdrawn',
                           'off_market','not_available')),
  mandate_status        text not null default 'no_mandate' check (mandate_status in
                          ('no_mandate','mandate_active','mandate_expired','mandate_withdrawn',
                           'mandate_cancelled','mandate_concluded','other')),
  mandate_type          text check (mandate_type is null or mandate_type in
                          ('sole','open','dual','other')),
  sale_outcome          text not null default 'not_applicable' check (sale_outcome in
                          ('sold_by_us','sold_by_sharing_party','sold_by_third_party','not_sold',
                           'sale_cancelled','pending','not_applicable')),

  mandate_start         date,
  mandate_expiry        date,

  primary_agent_id      uuid references users(id) on delete set null,
  secondary_agent_id    uuid references users(id) on delete set null,
  office_id             uuid references offices(id) on delete set null,
  team_id               uuid references teams(id) on delete set null,

  notes                 text,

  is_archived           boolean not null default false,
  archived_at           timestamptz,
  archived_by           uuid references users(id) on delete set null,
  archive_reason        text,

  merged_into_id        uuid references properties(id) on delete restrict,
  merged_at             timestamptz,

  created_at            timestamptz not null default now(),
  created_by            uuid references users(id) on delete set null,
  updated_at            timestamptz not null default now(),
  updated_by            uuid references users(id) on delete set null,
  row_version           integer not null default 1,

  constraint properties_merge_consistent check ((merged_into_id is null) = (merged_at is null)),
  constraint properties_not_merged_into_self check (merged_into_id is null or merged_into_id <> id),
  constraint properties_mandate_dates
    check (mandate_expiry is null or mandate_start is null or mandate_expiry >= mandate_start)
);

create or replace function app.assign_property_ref() returns trigger
language plpgsql as $$
begin
  if new.property_ref is null or new.property_ref = '' then
    new.property_ref := 'GRLP-P-' || lpad(nextval('property_reference_seq')::text, 8, '0');
  end if;
  return new;
end;
$$;
create trigger properties_assign_ref before insert on properties
  for each row execute function app.assign_property_ref();
select app.attach_touch('properties');

create index properties_agent_idx on properties (primary_agent_id) where not is_archived;
create index properties_second_agent_idx on properties (secondary_agent_id) where not is_archived;
create index properties_suburb_idx on properties (app.normalise_name(suburb));
create index properties_address_trgm_idx on properties
  using gin ((app.normalise_name(coalesce(street_address,'') || ' ' || coalesce(suburb,''))) gin_trgm_ops);
create index properties_erf_idx on properties (app.normalise_name(erf_number), app.normalise_name(suburb));
create index properties_status_idx on properties (property_status) where not is_archived;
create index properties_sales_status_idx on properties (sales_status) where not is_archived;
create index properties_rental_status_idx on properties (rental_status) where not is_archived;
create index properties_mandate_expiry_idx on properties (mandate_expiry)
  where mandate_expiry is not null and mandate_status = 'mandate_active';
create index properties_price_idx on properties (current_asking_price);
create index properties_merged_idx on properties (merged_into_id) where merged_into_id is not null;

-- ---------------------------------------------------------------------
-- People linked to a property (spec 32)
-- ---------------------------------------------------------------------
create table property_people (
  id                 uuid primary key default gen_random_uuid(),
  property_id        uuid not null references properties(id) on delete cascade,
  person_id          uuid not null references people(id) on delete cascade,
  role               text not null check (role in
                       ('owner','co_owner','seller','buyer','landlord','tenant','previous_owner',
                        'interested_buyer','interested_seller','contact','other')),
  ownership_percent  numeric(6,3) check (ownership_percent is null or
                                         (ownership_percent >= 0 and ownership_percent <= 100)),
  is_primary_contact boolean not null default false,
  start_date         date,
  end_date           date,
  notes              text,
  created_at         timestamptz not null default now(),
  created_by         uuid references users(id) on delete set null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references users(id) on delete set null,
  constraint property_people_dates check (end_date is null or start_date is null or end_date >= start_date)
);
create unique index property_people_unique_idx on property_people (property_id, person_id, role);
create index property_people_person_idx on property_people (person_id);
create index property_people_property_idx on property_people (property_id);
select app.attach_touch('property_people');

-- ---------------------------------------------------------------------
-- History (spec 31). Nothing is ever overwritten without a record of it.
-- ---------------------------------------------------------------------

-- Every status change, whichever of the status concepts it belongs to.
create table property_status_history (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references properties(id) on delete cascade,
  status_kind   text not null check (status_kind in
                  ('property','sales','rental','mandate','sale_outcome','business_area')),
  old_value     text,
  new_value     text,
  reason        text,
  changed_at    timestamptz not null default now(),
  changed_by    uuid references users(id) on delete set null
);
create index property_status_history_idx on property_status_history (property_id, changed_at desc);
create index property_status_history_kind_idx on property_status_history (property_id, status_kind, changed_at desc);

-- Mandate terms, which change shape rather than being a single value.
create table property_mandate_history (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references properties(id) on delete cascade,
  mandate_type    text,
  mandate_status  text,
  mandate_start   date,
  mandate_expiry  date,
  reason          text,
  recorded_at     timestamptz not null default now(),
  recorded_by     uuid references users(id) on delete set null
);
create index property_mandate_history_idx on property_mandate_history (property_id, recorded_at desc);

create table property_price_history (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references properties(id) on delete cascade,
  price_kind    text not null default 'asking' check (price_kind in
                  ('asking','estimated','rental','sold')),
  old_price     numeric(14,2),
  new_price     numeric(14,2),
  reason        text,
  changed_at    timestamptz not null default now(),
  changed_by    uuid references users(id) on delete set null
);
create index property_price_history_idx on property_price_history (property_id, changed_at desc);

-- Past sales of this property, including ones GRLP had no part in.
create table property_sale_history (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references properties(id) on delete cascade,
  sale_date      date,
  registered_at  date,
  sale_price     numeric(14,2),
  buyer_id       uuid references people(id) on delete set null,
  seller_id      uuid references people(id) on delete set null,
  agent_id       uuid references users(id) on delete set null,
  sale_outcome   text check (sale_outcome is null or sale_outcome in
                   ('sold_by_us','sold_by_sharing_party','sold_by_third_party','not_sold',
                    'sale_cancelled','pending','not_applicable')),
  transaction_id uuid,
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid references users(id) on delete set null
);
create index property_sale_history_idx on property_sale_history (property_id, sale_date desc);

create table property_rental_history (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references properties(id) on delete cascade,
  lease_start    date,
  lease_end      date,
  monthly_rental numeric(12,2),
  tenant_id      uuid references people(id) on delete set null,
  landlord_id    uuid references people(id) on delete set null,
  agent_id       uuid references users(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid references users(id) on delete set null
);
create index property_rental_history_idx on property_rental_history (property_id, lease_start desc);

create table property_agent_assignments (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references properties(id) on delete cascade,
  agent_id      uuid references users(id) on delete set null,
  assignment    text not null default 'primary' check (assignment in ('primary','secondary')),
  assigned_at   timestamptz not null default now(),
  assigned_by   uuid references users(id) on delete set null,
  unassigned_at timestamptz,
  reason        text
);
create index property_agent_assignments_idx on property_agent_assignments (property_id, assigned_at desc);
create index property_agent_assignments_agent_idx on property_agent_assignments (agent_id);

-- ---------------------------------------------------------------------
-- Marketing (spec 36, 37), kept apart from internal notes
-- ---------------------------------------------------------------------
create table property_marketing (
  property_id        uuid primary key references properties(id) on delete cascade,
  headline           text,
  short_description  text,
  full_description   text,
  key_selling_points text,
  features           text,
  directions         text,
  on_show_info       text,
  marketing_notes    text,
  marketing_status   text not null default 'not_prepared' check (marketing_status in
                       ('not_prepared','ready','published','unpublished','archived')),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references users(id) on delete set null
);

-- V1 records what a person did on a portal. It never claims to have done it.
create table property_marketing_channels (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid not null references properties(id) on delete cascade,
  channel          text not null check (channel in
                     ('grlp_website','property24','private_property','facebook','instagram','other')),
  is_published     boolean not null default false,
  published_at     date,
  removed_at       date,
  source_url       text,
  notes            text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references users(id) on delete set null
);
create unique index property_marketing_channels_idx on property_marketing_channels (property_id, channel);

-- ---------------------------------------------------------------------
-- Photos (spec 34). Files live in private storage; only the key is here.
-- ---------------------------------------------------------------------
create table property_photos (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references properties(id) on delete cascade,
  storage_key    text not null,
  file_name      text not null,
  content_type   text not null,
  byte_size      bigint not null check (byte_size > 0),
  caption        text,
  sort_order     integer not null default 0,
  is_cover       boolean not null default false,
  -- Marketing photos may be used publicly; private ones are internal only.
  is_marketing   boolean not null default true,
  is_archived    boolean not null default false,
  uploaded_at    timestamptz not null default now(),
  uploaded_by    uuid references users(id) on delete set null
);
create index property_photos_idx on property_photos (property_id, sort_order);
create unique index property_photos_one_cover_idx on property_photos (property_id)
  where is_cover and not is_archived;

-- ---------------------------------------------------------------------
-- Universal documents (spec 35, 67)
--
-- One table for every attachment in the CRM, linked to whichever record it
-- belongs to. Visibility is narrowed per category: FICA documents are
-- reachable only with FICA_VIEW, commission documents only with
-- COMMISSION_VIEW, and so on.
-- ---------------------------------------------------------------------
create table documents (
  id             uuid primary key default gen_random_uuid(),
  category       text not null check (category in
                   ('permission_evidence','fica','property','mandate','transaction',
                    'commission','communication','identity','other')),
  document_type  text,
  file_name      text not null,
  content_type   text not null,
  byte_size      bigint not null check (byte_size > 0),
  storage_key    text not null unique,

  -- What it is attached to. At least one link is required.
  person_id         uuid references people(id) on delete cascade,
  property_id       uuid references properties(id) on delete cascade,
  company_id        uuid,
  lead_id           uuid,
  valuation_id      uuid,
  offer_id          uuid,
  transaction_id    uuid,
  rental_application_id uuid,
  communication_id  uuid,
  commission_id     uuid,
  task_id           uuid,
  appointment_id    uuid,

  expires_at     date,
  notes          text,
  -- 'internal' is everyone who can see the parent record; 'restricted' adds
  -- the category's own permission on top.
  visibility     text not null default 'internal'
                   check (visibility in ('internal','restricted')),
  is_archived    boolean not null default false,
  uploaded_at    timestamptz not null default now(),
  uploaded_by    uuid references users(id) on delete set null,

  constraint documents_must_link_somewhere check (
    person_id is not null or property_id is not null or company_id is not null
    or lead_id is not null or valuation_id is not null or offer_id is not null
    or transaction_id is not null or rental_application_id is not null
    or communication_id is not null or commission_id is not null
    or task_id is not null or appointment_id is not null
  )
);
create index documents_person_idx on documents (person_id) where person_id is not null;
create index documents_property_idx on documents (property_id) where property_id is not null;
create index documents_category_idx on documents (category);
create index documents_expiry_idx on documents (expires_at) where expires_at is not null;

-- ---------------------------------------------------------------------
-- Visibility helpers
-- ---------------------------------------------------------------------
create or replace function app.can_see_property(p_property_id uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.has_permission('PROPERTIES_VIEW') and exists (
    select 1 from properties p
    where p.id = p_property_id
      and app.can_access_agent_record(p.primary_agent_id, p.secondary_agent_id)
  );
$$;
revoke all on function app.can_see_property(uuid) from public;
grant execute on function app.can_see_property(uuid) to grlp_app;

create or replace function app.can_edit_property(p_property_id uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.has_permission('PROPERTIES_EDIT') and exists (
    select 1 from properties p
    where p.id = p_property_id
      and app.can_access_agent_record(p.primary_agent_id, p.secondary_agent_id)
  );
$$;
revoke all on function app.can_edit_property(uuid) from public;
grant execute on function app.can_edit_property(uuid) to grlp_app;

-- ---------------------------------------------------------------------
-- Merging properties (spec 33), using the same registry as people
-- ---------------------------------------------------------------------
insert into merge_child_tables (entity_type, table_name, column_name, note) values
  ('property', 'property_people',             'property_id', 'Owners, tenants and contacts'),
  ('property', 'property_status_history',     'property_id', 'Status history'),
  ('property', 'property_mandate_history',    'property_id', 'Mandate history'),
  ('property', 'property_price_history',      'property_id', 'Price history'),
  ('property', 'property_sale_history',       'property_id', 'Past sales'),
  ('property', 'property_rental_history',     'property_id', 'Past rentals'),
  ('property', 'property_agent_assignments',  'property_id', 'Agent assignment history'),
  ('property', 'property_marketing',          'property_id', 'Marketing copy'),
  ('property', 'property_marketing_channels', 'property_id', 'Where it was advertised'),
  ('property', 'property_photos',             'property_id', 'Photographs'),
  ('property', 'documents',                   'property_id', 'Documents');

-- People gained a link to properties in this migration, so the person merge
-- has to move it too.
insert into merge_child_tables (entity_type, table_name, column_name, note) values
  ('person', 'property_people',        'person_id',   'Properties they are linked to'),
  ('person', 'property_sale_history',  'buyer_id',    'Past purchases'),
  ('person', 'property_sale_history',  'seller_id',   'Past sales'),
  ('person', 'property_rental_history','tenant_id',   'Past tenancies'),
  ('person', 'property_rental_history','landlord_id', 'Past lettings'),
  ('person', 'documents',              'person_id',   'Documents');

create or replace function app.merge_properties(
  p_master uuid, p_merged uuid, p_reason text, p_selected jsonb
) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_actor  uuid := app.current_user_id();
  v_master properties%rowtype;
  v_merged properties%rowtype;
  v_counts jsonb;
begin
  if not app.has_permission('MERGE_RECORDS') then
    raise exception 'You do not have permission to merge records.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_master = p_merged then
    raise exception 'A record cannot be merged into itself.' using errcode = 'check_violation';
  end if;

  if p_master < p_merged then
    select * into v_master from properties where id = p_master for update;
    select * into v_merged from properties where id = p_merged for update;
  else
    select * into v_merged from properties where id = p_merged for update;
    select * into v_master from properties where id = p_master for update;
  end if;

  if v_master.id is null or v_merged.id is null then
    raise exception 'One of those properties could not be found.' using errcode = 'no_data_found';
  end if;
  if not app.can_edit_property(p_master) or not app.can_edit_property(p_merged) then
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

  -- property_marketing is one row per property, so the master keeps its own
  -- and the loser's is dropped by the collision handling in reparent.
  v_counts := app.reparent_children('property', p_master, p_merged);

  update properties m
     set notes = case
           when coalesce(v_merged.notes, '') = '' then m.notes
           when coalesce(m.notes, '') = '' then v_merged.notes
           else m.notes || E'\n\n--- Merged from ' || v_merged.property_ref || E' ---\n' || v_merged.notes
         end,
         updated_by = v_actor
   where m.id = p_master;

  update properties
     set merged_into_id = p_master,
         merged_at = now(),
         is_archived = true,
         archived_at = coalesce(archived_at, now()),
         archived_by = coalesce(archived_by, v_actor),
         archive_reason = coalesce(archive_reason, 'Merged into ' || v_master.property_ref),
         updated_by = v_actor
   where id = p_merged;

  insert into merge_records
    (entity_type, master_id, master_reference, merged_id, merged_reference,
     reason, selected_fields, moved_counts, performed_by)
  values
    ('property', p_master, v_master.property_ref, p_merged, v_merged.property_ref,
     p_reason, p_selected, v_counts, v_actor);

  return jsonb_build_object(
    'master_reference', v_master.property_ref,
    'merged_reference', v_merged.property_ref,
    'moved', v_counts
  );
end;
$$;
revoke all on function app.merge_properties(uuid, uuid, text, jsonb) from public;
grant execute on function app.merge_properties(uuid, uuid, text, jsonb) to grlp_app;

-- ---------------------------------------------------------------------
-- Grants. Properties are archived, never deleted.
-- ---------------------------------------------------------------------
grant select, insert, update on properties to grlp_app;
grant select, insert, update, delete on property_people to grlp_app;
grant select, insert on property_status_history, property_mandate_history,
                        property_price_history to grlp_app;
grant select, insert, update, delete on property_sale_history, property_rental_history to grlp_app;
grant select, insert, update on property_agent_assignments to grlp_app;
grant select, insert, update on property_marketing to grlp_app;
grant select, insert, update, delete on property_marketing_channels to grlp_app;
grant select, insert, update on property_photos to grlp_app;
grant select, insert, update on documents to grlp_app;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table properties enable row level security;
alter table property_people enable row level security;
alter table property_status_history enable row level security;
alter table property_mandate_history enable row level security;
alter table property_price_history enable row level security;
alter table property_sale_history enable row level security;
alter table property_rental_history enable row level security;
alter table property_agent_assignments enable row level security;
alter table property_marketing enable row level security;
alter table property_marketing_channels enable row level security;
alter table property_photos enable row level security;
alter table documents enable row level security;

create policy properties_select on properties for select using (
  app.has_permission('PROPERTIES_VIEW')
  and app.can_access_agent_record(primary_agent_id, secondary_agent_id)
);
create policy properties_insert on properties for insert with check (
  app.has_permission('PROPERTIES_CREATE')
  and app.can_access_agent_record(primary_agent_id, secondary_agent_id)
);
create policy properties_update on properties for update using (
  app.has_permission('PROPERTIES_EDIT')
  and app.can_access_agent_record(primary_agent_id, secondary_agent_id)
) with check (
  app.has_permission('PROPERTIES_EDIT')
  and app.can_access_agent_record(primary_agent_id, secondary_agent_id)
);

-- A link between a property and a person needs both sides to be visible, so
-- linking cannot be used to see round either record's restrictions.
create policy property_people_select on property_people for select
  using (app.can_see_property(property_id) and app.can_see_person(person_id));
create policy property_people_write on property_people for all
  using (app.can_edit_property(property_id))
  with check (app.can_edit_property(property_id) and app.can_see_person(person_id));

create policy property_status_history_select on property_status_history for select
  using (app.can_see_property(property_id));
create policy property_status_history_insert on property_status_history for insert
  with check (app.can_edit_property(property_id));

create policy property_mandate_history_select on property_mandate_history for select
  using (app.can_see_property(property_id));
create policy property_mandate_history_insert on property_mandate_history for insert
  with check (app.can_edit_property(property_id));

create policy property_price_history_select on property_price_history for select
  using (app.can_see_property(property_id));
create policy property_price_history_insert on property_price_history for insert
  with check (app.can_edit_property(property_id));

create policy property_sale_history_select on property_sale_history for select
  using (app.can_see_property(property_id) and app.has_permission('SALES_VIEW'));
create policy property_sale_history_write on property_sale_history for all
  using (app.can_edit_property(property_id) and app.has_permission('SALES_EDIT'))
  with check (app.can_edit_property(property_id) and app.has_permission('SALES_EDIT'));

create policy property_rental_history_select on property_rental_history for select
  using (app.can_see_property(property_id) and app.has_permission('RENTALS_VIEW'));
create policy property_rental_history_write on property_rental_history for all
  using (app.can_edit_property(property_id) and app.has_permission('RENTALS_EDIT'))
  with check (app.can_edit_property(property_id) and app.has_permission('RENTALS_EDIT'));

create policy property_assignments_select on property_agent_assignments for select
  using (app.can_see_property(property_id));
create policy property_assignments_insert on property_agent_assignments for insert
  with check (app.has_permission('PROPERTIES_EDIT'));
create policy property_assignments_update on property_agent_assignments for update
  using (app.has_permission('PROPERTIES_EDIT')) with check (app.has_permission('PROPERTIES_EDIT'));

create policy property_marketing_select on property_marketing for select
  using (app.can_see_property(property_id));
create policy property_marketing_write on property_marketing for all
  using (app.can_edit_property(property_id) or app.has_permission('MARKETING_ADMIN'))
  with check (app.can_edit_property(property_id) or app.has_permission('MARKETING_ADMIN'));

create policy property_channels_select on property_marketing_channels for select
  using (app.can_see_property(property_id));
create policy property_channels_write on property_marketing_channels for all
  using (app.can_edit_property(property_id) or app.has_permission('MARKETING_ADMIN'))
  with check (app.can_edit_property(property_id) or app.has_permission('MARKETING_ADMIN'));

create policy property_photos_select on property_photos for select
  using (app.can_see_property(property_id));
create policy property_photos_write on property_photos for all
  using (app.can_edit_property(property_id)) with check (app.can_edit_property(property_id));

-- A document is visible when its parent record is, and, for the sensitive
-- categories, only with that category's own permission as well.
create policy documents_select on documents for select using (
  (
    (person_id is not null and app.can_see_person(person_id))
    or (property_id is not null and app.can_see_property(property_id))
    or (person_id is null and property_id is null and app.is_authenticated())
  )
  and (category <> 'fica' or app.has_permission('FICA_VIEW'))
  and (category <> 'commission' or app.has_permission('COMMISSION_VIEW'))
  and (category <> 'identity' or app.has_permission('PERSON_ID_VIEW'))
);
create policy documents_insert on documents for insert with check (
  (
    (person_id is not null and app.can_edit_person(person_id))
    or (property_id is not null and app.can_edit_property(property_id))
    or (person_id is null and property_id is null and app.is_authenticated())
  )
  and (category <> 'fica' or app.has_permission('FICA_CREATE'))
  and (category <> 'commission' or app.has_permission('COMMISSION_EDIT'))
);
create policy documents_update on documents for update using (
  (person_id is not null and app.can_edit_person(person_id))
  or (property_id is not null and app.can_edit_property(property_id))
  or (person_id is null and property_id is null and app.is_authenticated())
) with check (true);

-- Tags now also apply to properties.
drop policy record_tags_select on record_tags;
drop policy record_tags_write on record_tags;
create policy record_tags_select on record_tags for select using (
  app.is_authenticated()
  and (entity_type <> 'person' or app.can_see_person(entity_id))
  and (entity_type <> 'property' or app.can_see_property(entity_id))
);
create policy record_tags_write on record_tags for all using (
  app.is_authenticated()
  and (entity_type <> 'person' or app.can_edit_person(entity_id))
  and (entity_type <> 'property' or app.can_edit_property(entity_id))
) with check (
  app.is_authenticated()
  and (entity_type <> 'person' or app.can_edit_person(entity_id))
  and (entity_type <> 'property' or app.can_edit_property(entity_id))
);
