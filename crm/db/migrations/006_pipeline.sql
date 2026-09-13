-- =====================================================================
-- 006 PIPELINE
--
-- Leads, tasks, appointments, viewings, valuations, offers, transactions
-- and rental applications: the whole business lifecycle (spec 122).
--
-- The rule this schema exists to protect is spec 49: a transaction being
-- concluded is not the same as it being registered. They are separate
-- dates, separate statuses, and the database refuses to call a transaction
-- registered without the date to prove it.
--
-- Lead sources, loss reasons and rental screening items are configuration
-- rows rather than check constraints, because GRLP will change them
-- (spec 41, 42, 51).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configurable lists
-- ---------------------------------------------------------------------
create table lead_sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create unique index lead_sources_name_key on lead_sources (lower(name));

insert into lead_sources (name, sort_order) values
  ('Website', 10), ('Facebook', 20), ('Instagram', 30), ('Property24', 40),
  ('Private Property', 50), ('Referral', 60), ('Walk-in', 70),
  ('Existing Client', 80), ('Open Day', 90), ('Signboard', 100),
  ('Phone Enquiry', 110), ('WhatsApp Enquiry', 120), ('Email Enquiry', 130),
  ('PropCtrl', 140), ('Other', 150);

create table lead_loss_reasons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create unique index lead_loss_reasons_name_key on lead_loss_reasons (lower(name));

insert into lead_loss_reasons (name, sort_order) values
  ('Price', 10), ('Location', 20), ('Financing', 30), ('Bought Elsewhere', 40),
  ('Sold Elsewhere', 50), ('No Response', 60), ('Changed Plans', 70),
  ('Property Not Suitable', 80), ('Rental Unavailable', 90),
  ('Found Another Agent', 100), ('Other', 110);

-- ---------------------------------------------------------------------
-- Leads (spec 39, 40)
-- ---------------------------------------------------------------------
create table leads (
  id                 uuid primary key default gen_random_uuid(),
  -- A lead is linked to a person wherever possible, so an enquiry becomes
  -- part of that person's one master record rather than a second one.
  person_id          uuid references people(id) on delete set null,
  property_id        uuid references properties(id) on delete set null,

  business_area      text not null default 'sales'
                       check (business_area in ('sales','rentals','sales_rentals','other')),
  lead_type          text not null check (lead_type in
                       -- sales
                       ('buyer','seller','investor','valuation','property_enquiry',
                        -- rentals
                        'landlord','tenant','rental_enquiry','rental_valuation',
                        'other')),
  status             text not null default 'new' check (status in
                       ('new','contacted','qualified','viewing_appointment','valuation',
                        'mandate_discussion','mandate_signed','offer','under_contract',
                        'won','lost','nurture','archived')),
  source_id          uuid references lead_sources(id) on delete set null,
  loss_reason_id     uuid references lead_loss_reasons(id) on delete set null,

  -- What they are looking for
  enquiry_summary    text,
  requirements       text,
  budget_min         numeric(14,2) check (budget_min is null or budget_min >= 0),
  budget_max         numeric(14,2) check (budget_max is null or budget_max >= 0),
  preferred_areas    text,

  primary_agent_id   uuid references users(id) on delete set null,
  secondary_agent_id uuid references users(id) on delete set null,

  next_follow_up_at  timestamptz,
  won_at             timestamptz,
  lost_at            timestamptz,
  notes              text,

  is_archived        boolean not null default false,
  archived_at        timestamptz,
  archived_by        uuid references users(id) on delete set null,

  created_at         timestamptz not null default now(),
  created_by         uuid references users(id) on delete set null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references users(id) on delete set null,
  row_version        integer not null default 1,

  constraint leads_budget_order check (budget_max is null or budget_min is null or budget_max >= budget_min),
  -- A lost lead has to say why it was lost.
  constraint leads_lost_needs_reason
    check (status <> 'lost' or loss_reason_id is not null)
);
select app.attach_touch('leads');

create index leads_person_idx on leads (person_id);
create index leads_property_idx on leads (property_id);
create index leads_agent_idx on leads (primary_agent_id) where not is_archived;
create index leads_second_agent_idx on leads (secondary_agent_id) where not is_archived;
create index leads_status_idx on leads (status) where not is_archived;
create index leads_type_idx on leads (lead_type) where not is_archived;
create index leads_source_idx on leads (source_id);
create index leads_follow_up_idx on leads (next_follow_up_at) where next_follow_up_at is not null;

create table lead_status_history (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  old_status  text,
  new_status  text not null,
  reason      text,
  changed_at  timestamptz not null default now(),
  changed_by  uuid references users(id) on delete set null
);
create index lead_status_history_idx on lead_status_history (lead_id, changed_at desc);

-- ---------------------------------------------------------------------
-- Tasks and follow-ups (spec 43, 44, 94)
-- ---------------------------------------------------------------------
create table tasks (
  id                uuid primary key default gen_random_uuid(),
  assigned_user_id  uuid references users(id) on delete set null,
  person_id         uuid references people(id) on delete cascade,
  property_id       uuid references properties(id) on delete cascade,
  lead_id           uuid references leads(id) on delete cascade,
  transaction_id    uuid,

  task_type         text not null default 'follow_up' check (task_type in
                      ('follow_up','call','whatsapp','email','meeting','viewing','valuation',
                       'paperwork','fica','compliance','marketing','commission','other')),
  title             text not null,
  due_at            timestamptz,
  priority          text not null default 'normal'
                      check (priority in ('low','normal','high','urgent')),
  status            text not null default 'to_do'
                      check (status in ('to_do','in_progress','completed','cancelled')),
  notes             text,

  -- Recurrence is deliberately simple: a completed recurring task creates
  -- the next one rather than the schema modelling a calendar rule.
  recurrence        text not null default 'none'
                      check (recurrence in ('none','daily','weekly','fortnightly','monthly')),
  recurrence_until  date,

  completed_at      timestamptz,
  completed_by      uuid references users(id) on delete set null,

  created_at        timestamptz not null default now(),
  created_by        uuid references users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references users(id) on delete set null,
  row_version       integer not null default 1,

  -- A completed task has to say when it was completed.
  constraint tasks_completed_consistent
    check ((status = 'completed') = (completed_at is not null))
);
select app.attach_touch('tasks');

create index tasks_assigned_idx on tasks (assigned_user_id, status, due_at);
create index tasks_due_idx on tasks (due_at) where status in ('to_do','in_progress');
create index tasks_person_idx on tasks (person_id);
create index tasks_property_idx on tasks (property_id);
create index tasks_lead_idx on tasks (lead_id);

-- ---------------------------------------------------------------------
-- Calendar (spec 45)
-- ---------------------------------------------------------------------
create table appointments (
  id                uuid primary key default gen_random_uuid(),
  appointment_type  text not null default 'viewing' check (appointment_type in
                      ('viewing','valuation','meeting','inspection','rental_appointment','other')),
  title             text not null,
  agent_id          uuid references users(id) on delete set null,
  person_id         uuid references people(id) on delete cascade,
  property_id       uuid references properties(id) on delete cascade,
  lead_id           uuid references leads(id) on delete cascade,

  starts_at         timestamptz not null,
  ends_at           timestamptz,
  location          text,
  status            text not null default 'scheduled' check (status in
                      ('scheduled','completed','cancelled','no_show')),
  notes             text,

  created_at        timestamptz not null default now(),
  created_by        uuid references users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references users(id) on delete set null,
  row_version       integer not null default 1,

  constraint appointments_end_after_start check (ends_at is null or ends_at >= starts_at)
);
select app.attach_touch('appointments');

create index appointments_agent_idx on appointments (agent_id, starts_at);
create index appointments_when_idx on appointments (starts_at);
create index appointments_property_idx on appointments (property_id);
create index appointments_person_idx on appointments (person_id);
create index appointments_lead_idx on appointments (lead_id);

-- ---------------------------------------------------------------------
-- Viewings and feedback (spec 46)
-- ---------------------------------------------------------------------
create table viewings (
  id              uuid primary key default gen_random_uuid(),
  property_id     uuid not null references properties(id) on delete cascade,
  person_id       uuid references people(id) on delete set null,
  lead_id         uuid references leads(id) on delete set null,
  appointment_id  uuid references appointments(id) on delete set null,
  agent_id        uuid references users(id) on delete set null,
  viewed_at       timestamptz not null default now(),
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid references users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references users(id) on delete set null
);
select app.attach_touch('viewings');
create index viewings_property_idx on viewings (property_id, viewed_at desc);
create index viewings_person_idx on viewings (person_id);
create index viewings_agent_idx on viewings (agent_id, viewed_at desc);

create table viewing_feedback (
  viewing_id      uuid primary key references viewings(id) on delete cascade,
  outcome         text check (outcome is null or outcome in
                    ('offer_expected','wants_second_viewing','thinking','not_proceeding','other')),
  interest_level  text check (interest_level is null or interest_level in
                    ('very_interested','interested','considering','not_interested','not_suitable')),
  objections      text,
  next_action     text,
  follow_up_date  date,
  recorded_at     timestamptz not null default now(),
  recorded_by     uuid references users(id) on delete set null
);

-- ---------------------------------------------------------------------
-- Valuations (spec 47)
-- ---------------------------------------------------------------------
create table valuations (
  id                        uuid primary key default gen_random_uuid(),
  property_id               uuid references properties(id) on delete cascade,
  owner_id                  uuid references people(id) on delete set null,
  lead_id                   uuid references leads(id) on delete set null,
  appointment_id            uuid references appointments(id) on delete set null,
  agent_id                  uuid references users(id) on delete set null,

  request_date              date not null default current_date,
  estimated_value           numeric(14,2) check (estimated_value is null or estimated_value >= 0),
  recommended_asking_price  numeric(14,2)
                              check (recommended_asking_price is null or recommended_asking_price >= 0),
  outcome                   text,
  status                    text not null default 'requested' check (status in
                              ('requested','scheduled','completed','mandate_discussion',
                               'mandate_signed','not_proceeding','cancelled')),
  follow_up_date            date,
  notes                     text,

  created_at                timestamptz not null default now(),
  created_by                uuid references users(id) on delete set null,
  updated_at                timestamptz not null default now(),
  updated_by                uuid references users(id) on delete set null,
  row_version               integer not null default 1
);
select app.attach_touch('valuations');
create index valuations_property_idx on valuations (property_id);
create index valuations_agent_idx on valuations (agent_id, request_date desc);
create index valuations_status_idx on valuations (status);

-- ---------------------------------------------------------------------
-- Transactions (spec 49)
--
-- Created before offers so an offer can point at the transaction it led to.
-- ---------------------------------------------------------------------
create sequence transaction_reference_seq start 1;
grant usage, select on sequence transaction_reference_seq to grlp_app;

create table transactions (
  id                        uuid primary key default gen_random_uuid(),
  transaction_ref           text not null unique,
  property_id               uuid not null references properties(id) on delete restrict,
  buyer_id                  uuid references people(id) on delete set null,
  seller_id                 uuid references people(id) on delete set null,
  offer_id                  uuid,
  lead_id                   uuid references leads(id) on delete set null,

  transaction_value         numeric(14,2) check (transaction_value is null or transaction_value >= 0),

  -- Concluded and registered are different events, months apart (spec 49).
  sale_date                 date,
  expected_registration_date date,
  actual_registration_date  date,

  conditions                text,
  finance_status            text not null default 'not_applicable' check (finance_status in
                              ('not_applicable','cash','bond_applied','bond_approved',
                               'bond_declined','bond_pending','other')),
  legal_status              text,
  conveyancer               text,

  status                    text not null default 'draft' check (status in
                              ('draft','offer','offer_accepted','sale_pending',
                               'suspensive_conditions','sale_concluded','awaiting_registration',
                               'registered','cancelled','failed','other')),
  cancellation_reason       text,
  notes                     text,

  created_at                timestamptz not null default now(),
  created_by                uuid references users(id) on delete set null,
  updated_at                timestamptz not null default now(),
  updated_by                uuid references users(id) on delete set null,
  row_version               integer not null default 1,

  -- The point of the whole table: registered means registered, with a date.
  constraint transactions_registered_needs_date
    check (status <> 'registered' or actual_registration_date is not null),
  -- And a registration date cannot precede the sale.
  constraint transactions_registration_after_sale
    check (actual_registration_date is null or sale_date is null
           or actual_registration_date >= sale_date),
  constraint transactions_cancelled_needs_reason
    check (status not in ('cancelled','failed') or cancellation_reason is not null)
);

create or replace function app.assign_transaction_ref() returns trigger
language plpgsql as $$
begin
  if new.transaction_ref is null or new.transaction_ref = '' then
    new.transaction_ref := 'GRLP-T-' || lpad(nextval('transaction_reference_seq')::text, 8, '0');
  end if;
  return new;
end;
$$;
create trigger transactions_assign_ref before insert on transactions
  for each row execute function app.assign_transaction_ref();
select app.attach_touch('transactions');

create index transactions_property_idx on transactions (property_id);
create index transactions_buyer_idx on transactions (buyer_id);
create index transactions_seller_idx on transactions (seller_id);
create index transactions_status_idx on transactions (status);
create index transactions_sale_date_idx on transactions (sale_date desc);
create index transactions_registration_idx on transactions (actual_registration_date desc);

-- Several agents can share one deal (spec 78).
create table transaction_agents (
  transaction_id  uuid not null references transactions(id) on delete cascade,
  agent_id        uuid not null references users(id) on delete restrict,
  role            text not null default 'primary'
                    check (role in ('primary','sharing','referral')),
  share_percent   numeric(6,3) check (share_percent is null or
                                      (share_percent >= 0 and share_percent <= 100)),
  added_at        timestamptz not null default now(),
  added_by        uuid references users(id) on delete set null,
  primary key (transaction_id, agent_id)
);
create index transaction_agents_agent_idx on transaction_agents (agent_id);

create table transaction_status_history (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null references transactions(id) on delete cascade,
  old_status      text,
  new_status      text not null,
  reason          text,
  changed_at      timestamptz not null default now(),
  changed_by      uuid references users(id) on delete set null
);
create index transaction_status_history_idx
  on transaction_status_history (transaction_id, changed_at desc);

-- ---------------------------------------------------------------------
-- Offers (spec 48)
-- ---------------------------------------------------------------------
create table offers (
  id                uuid primary key default gen_random_uuid(),
  property_id       uuid not null references properties(id) on delete cascade,
  buyer_id          uuid references people(id) on delete set null,
  seller_id         uuid references people(id) on delete set null,
  agent_id          uuid references users(id) on delete set null,
  lead_id           uuid references leads(id) on delete set null,
  transaction_id    uuid references transactions(id) on delete set null,

  amount            numeric(14,2) not null check (amount >= 0),
  offer_date        date not null default current_date,
  conditions        text,
  finance_status    text not null default 'not_applicable' check (finance_status in
                      ('not_applicable','cash','bond_applied','bond_approved',
                       'bond_declined','bond_pending','other')),
  deposit           numeric(14,2) check (deposit is null or deposit >= 0),
  expires_at        date,

  status            text not null default 'draft' check (status in
                      ('draft','submitted','under_review','counter_offer','accepted',
                       'rejected','withdrawn','expired','cancelled')),
  -- A counter offer is a new offer that points at the one it answers, so the
  -- original is never overwritten (spec 48).
  counter_offer_of  uuid references offers(id) on delete set null,
  acceptance_date   date,
  rejection_date    date,
  notes             text,

  created_at        timestamptz not null default now(),
  created_by        uuid references users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references users(id) on delete set null,
  row_version       integer not null default 1,

  constraint offers_accepted_needs_date
    check (status <> 'accepted' or acceptance_date is not null),
  constraint offers_rejected_needs_date
    check (status <> 'rejected' or rejection_date is not null),
  constraint offers_not_counter_of_self check (counter_offer_of is null or counter_offer_of <> id)
);
select app.attach_touch('offers');

create index offers_property_idx on offers (property_id, offer_date desc);
create index offers_buyer_idx on offers (buyer_id);
create index offers_agent_idx on offers (agent_id);
create index offers_status_idx on offers (status);
create index offers_transaction_idx on offers (transaction_id);
create index offers_counter_idx on offers (counter_offer_of) where counter_offer_of is not null;

alter table transactions
  add constraint transactions_offer_fk foreign key (offer_id) references offers(id) on delete set null;

-- ---------------------------------------------------------------------
-- Rental applications and screening (spec 50, 51, 52)
-- ---------------------------------------------------------------------
create sequence rental_application_reference_seq start 1;
grant usage, select on sequence rental_application_reference_seq to grlp_app;

create table rental_applications (
  id                 uuid primary key default gen_random_uuid(),
  application_ref    text not null unique,
  property_id        uuid not null references properties(id) on delete restrict,
  applicant_id       uuid references people(id) on delete set null,
  co_applicant_id    uuid references people(id) on delete set null,
  landlord_id        uuid references people(id) on delete set null,
  agent_id           uuid references users(id) on delete set null,
  lead_id            uuid references leads(id) on delete set null,

  monthly_rental     numeric(12,2) check (monthly_rental is null or monthly_rental >= 0),
  deposit            numeric(12,2) check (deposit is null or deposit >= 0),

  application_status text not null default 'draft' check (application_status in
                       ('draft','submitted','under_review','documents_required','screening',
                        'approved','rejected','withdrawn','cancelled','lease_prepared',
                        'lease_signed')),
  screening_status   text not null default 'not_started' check (screening_status in
                       ('not_started','in_progress','complete','failed')),
  approval_date      date,
  rejection_date     date,
  rejection_reason   text,
  lease_start        date,
  lease_end          date,
  notes              text,

  created_at         timestamptz not null default now(),
  created_by         uuid references users(id) on delete set null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references users(id) on delete set null,
  row_version        integer not null default 1,

  constraint rental_applications_approved_needs_date
    check (application_status <> 'approved' or approval_date is not null),
  constraint rental_applications_rejected_needs_reason
    check (application_status <> 'rejected'
           or (rejection_date is not null and rejection_reason is not null)),
  constraint rental_applications_lease_order
    check (lease_end is null or lease_start is null or lease_end >= lease_start),
  constraint rental_applications_distinct_applicants
    check (co_applicant_id is null or applicant_id is null or co_applicant_id <> applicant_id)
);

create or replace function app.assign_rental_application_ref() returns trigger
language plpgsql as $$
begin
  if new.application_ref is null or new.application_ref = '' then
    new.application_ref :=
      'GRLP-R-' || lpad(nextval('rental_application_reference_seq')::text, 8, '0');
  end if;
  return new;
end;
$$;
create trigger rental_applications_assign_ref before insert on rental_applications
  for each row execute function app.assign_rental_application_ref();
select app.attach_touch('rental_applications');

create index rental_applications_property_idx on rental_applications (property_id);
create index rental_applications_applicant_idx on rental_applications (applicant_id);
create index rental_applications_agent_idx on rental_applications (agent_id);
create index rental_applications_status_idx on rental_applications (application_status);

-- What GRLP checks, as configuration. Nothing legal is hardcoded (spec 51).
create table screening_checklist_items (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  is_required  boolean not null default true,
  is_active    boolean not null default true,
  sort_order   integer not null default 0
);
create unique index screening_checklist_items_name_key on screening_checklist_items (lower(name));

insert into screening_checklist_items (name, description, is_required, sort_order) values
  ('Identity verified', 'Identity document seen and matches the applicant.', true, 10),
  ('Income information', 'Stated income recorded.', true, 20),
  ('Proof of income', 'Payslips or bank statements received.', true, 30),
  ('References', 'Previous landlord or employer contacted.', true, 40),
  ('Documents complete', 'Everything on the checklist has been received.', true, 50),
  ('Screening complete', 'All checks finished and reviewed.', true, 60),
  ('Approved', 'Landlord has approved the applicant.', false, 70);

create table rental_screening (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references rental_applications(id) on delete cascade,
  item_id         uuid not null references screening_checklist_items(id) on delete restrict,
  status          text not null default 'not_started' check (status in
                    ('not_started','requested','received','verified','failed','not_applicable')),
  notes           text,
  recorded_at     timestamptz not null default now(),
  recorded_by     uuid references users(id) on delete set null,
  unique (application_id, item_id)
);
create index rental_screening_application_idx on rental_screening (application_id);

-- ---------------------------------------------------------------------
-- Visibility helpers
-- ---------------------------------------------------------------------
create or replace function app.can_see_lead(p_lead_id uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.has_permission('LEADS_VIEW') and exists (
    select 1 from leads l
    where l.id = p_lead_id
      and app.can_access_agent_record(l.primary_agent_id, l.secondary_agent_id)
  );
$$;
revoke all on function app.can_see_lead(uuid) from public;
grant execute on function app.can_see_lead(uuid) to grlp_app;

create or replace function app.can_edit_lead(p_lead_id uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.has_permission('LEADS_EDIT') and exists (
    select 1 from leads l
    where l.id = p_lead_id
      and app.can_access_agent_record(l.primary_agent_id, l.secondary_agent_id)
  );
$$;
revoke all on function app.can_edit_lead(uuid) from public;
grant execute on function app.can_edit_lead(uuid) to grlp_app;

/**
 * A transaction is visible to the agents on it, and to anybody with
 * company-wide sales access.
 */
create or replace function app.can_see_transaction(p_transaction_id uuid) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select app.has_permission('SALES_VIEW') and (
    app.can_view_all()
    or exists (select 1 from transaction_agents ta
                where ta.transaction_id = p_transaction_id
                  and ta.agent_id = app.current_user_id())
    or exists (select 1 from transactions t
                join properties p on p.id = t.property_id
               where t.id = p_transaction_id
                 and app.can_access_agent_record(p.primary_agent_id, p.secondary_agent_id))
  );
$$;
revoke all on function app.can_see_transaction(uuid) from public;
grant execute on function app.can_see_transaction(uuid) to grlp_app;

-- ---------------------------------------------------------------------
-- A completed recurring task creates the next one (spec 94)
-- ---------------------------------------------------------------------
create or replace function app.roll_recurring_task() returns trigger
language plpgsql as $$
declare
  v_next timestamptz;
begin
  if new.status <> 'completed' or old.status = 'completed' then return new; end if;
  if new.recurrence = 'none' or new.due_at is null then return new; end if;

  v_next := case new.recurrence
    when 'daily'       then new.due_at + interval '1 day'
    when 'weekly'      then new.due_at + interval '7 days'
    when 'fortnightly' then new.due_at + interval '14 days'
    when 'monthly'     then new.due_at + interval '1 month'
  end;

  if new.recurrence_until is not null and v_next::date > new.recurrence_until then
    return new;
  end if;

  insert into tasks
    (assigned_user_id, person_id, property_id, lead_id, transaction_id, task_type, title,
     due_at, priority, status, notes, recurrence, recurrence_until, created_by, updated_by)
  values
    (new.assigned_user_id, new.person_id, new.property_id, new.lead_id, new.transaction_id,
     new.task_type, new.title, v_next, new.priority, 'to_do', new.notes,
     new.recurrence, new.recurrence_until, new.completed_by, new.completed_by);

  return new;
end;
$$;
create trigger tasks_roll_recurring after update on tasks
  for each row execute function app.roll_recurring_task();

-- ---------------------------------------------------------------------
-- Merge registry additions, so a person or property merge moves all of this
-- ---------------------------------------------------------------------
insert into merge_child_tables (entity_type, table_name, column_name, note) values
  ('person', 'leads',                'person_id',       'Leads'),
  ('person', 'tasks',                'person_id',       'Tasks'),
  ('person', 'appointments',         'person_id',       'Appointments'),
  ('person', 'viewings',             'person_id',       'Viewings'),
  ('person', 'valuations',           'owner_id',        'Valuations as owner'),
  ('person', 'offers',               'buyer_id',        'Offers as buyer'),
  ('person', 'offers',               'seller_id',       'Offers as seller'),
  ('person', 'transactions',         'buyer_id',        'Transactions as buyer'),
  ('person', 'transactions',         'seller_id',       'Transactions as seller'),
  ('person', 'rental_applications',  'applicant_id',    'Rental applications'),
  ('person', 'rental_applications',  'co_applicant_id', 'Rental applications as co-applicant'),
  ('person', 'rental_applications',  'landlord_id',     'Rental applications as landlord'),
  ('property', 'leads',               'property_id', 'Leads'),
  ('property', 'tasks',               'property_id', 'Tasks'),
  ('property', 'appointments',        'property_id', 'Appointments'),
  ('property', 'viewings',            'property_id', 'Viewings'),
  ('property', 'valuations',          'property_id', 'Valuations'),
  ('property', 'offers',              'property_id', 'Offers'),
  ('property', 'transactions',        'property_id', 'Transactions'),
  ('property', 'rental_applications', 'property_id', 'Rental applications');

-- ---------------------------------------------------------------------
-- Grants. Nothing in the pipeline is deletable except a link row.
-- ---------------------------------------------------------------------
grant select on lead_sources, lead_loss_reasons, screening_checklist_items to grlp_app;
grant select, insert, update on leads to grlp_app;
grant select, insert on lead_status_history to grlp_app;
grant select, insert, update on tasks to grlp_app;
grant select, insert, update on appointments to grlp_app;
grant select, insert, update on viewings to grlp_app;
grant select, insert, update on viewing_feedback to grlp_app;
grant select, insert, update on valuations to grlp_app;
grant select, insert, update on offers to grlp_app;
grant select, insert, update on transactions to grlp_app;
grant select, insert, update, delete on transaction_agents to grlp_app;
grant select, insert on transaction_status_history to grlp_app;
grant select, insert, update on rental_applications to grlp_app;
grant select, insert, update, delete on rental_screening to grlp_app;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table lead_sources enable row level security;
alter table lead_loss_reasons enable row level security;
alter table screening_checklist_items enable row level security;
alter table leads enable row level security;
alter table lead_status_history enable row level security;
alter table tasks enable row level security;
alter table appointments enable row level security;
alter table viewings enable row level security;
alter table viewing_feedback enable row level security;
alter table valuations enable row level security;
alter table offers enable row level security;
alter table transactions enable row level security;
alter table transaction_agents enable row level security;
alter table transaction_status_history enable row level security;
alter table rental_applications enable row level security;
alter table rental_screening enable row level security;

create policy lead_sources_select on lead_sources for select using (app.is_authenticated());
create policy lead_loss_reasons_select on lead_loss_reasons for select using (app.is_authenticated());
create policy screening_items_select on screening_checklist_items for select
  using (app.is_authenticated());

create policy leads_select on leads for select using (
  app.has_permission('LEADS_VIEW')
  and app.can_access_agent_record(primary_agent_id, secondary_agent_id)
);
create policy leads_insert on leads for insert with check (
  app.has_permission('LEADS_CREATE')
  and app.can_access_agent_record(primary_agent_id, secondary_agent_id)
);
create policy leads_update on leads for update using (
  app.has_permission('LEADS_EDIT')
  and app.can_access_agent_record(primary_agent_id, secondary_agent_id)
) with check (
  app.has_permission('LEADS_EDIT')
  and app.can_access_agent_record(primary_agent_id, secondary_agent_id)
);

create policy lead_status_history_select on lead_status_history for select
  using (app.can_see_lead(lead_id));
create policy lead_status_history_insert on lead_status_history for insert
  with check (app.can_edit_lead(lead_id));

-- A task belongs to the person it is assigned to, and to whoever set it.
create policy tasks_select on tasks for select using (
  app.has_permission('TASKS_VIEW')
  and (app.can_view_all() or assigned_user_id = app.current_user_id()
       or created_by = app.current_user_id())
);
create policy tasks_insert on tasks for insert with check (
  app.has_permission('TASKS_CREATE')
  and (app.can_view_all() or assigned_user_id = app.current_user_id()
       or created_by = app.current_user_id())
);
create policy tasks_update on tasks for update using (
  app.has_permission('TASKS_EDIT')
  and (app.can_view_all() or assigned_user_id = app.current_user_id()
       or created_by = app.current_user_id())
) with check (
  app.has_permission('TASKS_EDIT')
  and (app.can_view_all() or assigned_user_id = app.current_user_id()
       or created_by = app.current_user_id())
);

create policy appointments_select on appointments for select using (
  app.has_permission('TASKS_VIEW')
  and (app.can_view_all() or agent_id = app.current_user_id()
       or created_by = app.current_user_id())
);
create policy appointments_insert on appointments for insert with check (
  app.has_permission('TASKS_CREATE')
  and (app.can_view_all() or agent_id = app.current_user_id()
       or created_by = app.current_user_id())
);
create policy appointments_update on appointments for update using (
  app.has_permission('TASKS_EDIT')
  and (app.can_view_all() or agent_id = app.current_user_id()
       or created_by = app.current_user_id())
) with check (
  app.has_permission('TASKS_EDIT')
  and (app.can_view_all() or agent_id = app.current_user_id()
       or created_by = app.current_user_id())
);

-- A viewing follows the property it happened at.
create policy viewings_select on viewings for select
  using (app.can_see_property(property_id));
create policy viewings_insert on viewings for insert
  with check (app.can_edit_property(property_id) or app.has_permission('SALES_CREATE'));
create policy viewings_update on viewings for update
  using (app.can_see_property(property_id) and app.has_permission('SALES_EDIT'))
  with check (app.can_see_property(property_id) and app.has_permission('SALES_EDIT'));

create policy viewing_feedback_select on viewing_feedback for select using (
  exists (select 1 from viewings v where v.id = viewing_id and app.can_see_property(v.property_id))
);
create policy viewing_feedback_write on viewing_feedback for all using (
  exists (select 1 from viewings v where v.id = viewing_id and app.can_see_property(v.property_id))
) with check (
  exists (select 1 from viewings v where v.id = viewing_id and app.can_see_property(v.property_id))
);

create policy valuations_select on valuations for select using (
  app.has_permission('SALES_VIEW')
  and (app.can_view_all() or agent_id = app.current_user_id()
       or (property_id is not null and app.can_see_property(property_id)))
);
create policy valuations_insert on valuations for insert with check (
  app.has_permission('SALES_CREATE')
  and (app.can_view_all() or agent_id = app.current_user_id())
);
create policy valuations_update on valuations for update using (
  app.has_permission('SALES_EDIT')
  and (app.can_view_all() or agent_id = app.current_user_id())
) with check (
  app.has_permission('SALES_EDIT')
  and (app.can_view_all() or agent_id = app.current_user_id())
);

create policy offers_select on offers for select using (
  app.has_permission('SALES_VIEW')
  and (app.can_view_all() or agent_id = app.current_user_id()
       or app.can_see_property(property_id))
);
create policy offers_insert on offers for insert with check (
  app.has_permission('SALES_CREATE')
  and (app.can_view_all() or agent_id = app.current_user_id()
       or app.can_see_property(property_id))
);
create policy offers_update on offers for update using (
  app.has_permission('SALES_EDIT')
  and (app.can_view_all() or agent_id = app.current_user_id()
       or app.can_see_property(property_id))
) with check (
  app.has_permission('SALES_EDIT')
  and (app.can_view_all() or agent_id = app.current_user_id()
       or app.can_see_property(property_id))
);

create policy transactions_select on transactions for select using (
  app.has_permission('SALES_VIEW')
  and (app.can_view_all()
       or app.can_see_property(property_id)
       or exists (select 1 from transaction_agents ta
                   where ta.transaction_id = id and ta.agent_id = app.current_user_id()))
);
create policy transactions_insert on transactions for insert with check (
  app.has_permission('SALES_CREATE') and app.can_see_property(property_id)
);
create policy transactions_update on transactions for update using (
  app.has_permission('SALES_EDIT')
  and (app.can_view_all()
       or app.can_see_property(property_id)
       or exists (select 1 from transaction_agents ta
                   where ta.transaction_id = id and ta.agent_id = app.current_user_id()))
) with check (app.has_permission('SALES_EDIT'));

create policy transaction_agents_select on transaction_agents for select
  using (app.can_see_transaction(transaction_id));
create policy transaction_agents_write on transaction_agents for all
  using (app.has_permission('SALES_EDIT') and app.can_see_transaction(transaction_id))
  with check (app.has_permission('SALES_EDIT') and app.can_see_transaction(transaction_id));

create policy transaction_status_history_select on transaction_status_history for select
  using (app.can_see_transaction(transaction_id));
create policy transaction_status_history_insert on transaction_status_history for insert
  with check (app.has_permission('SALES_EDIT'));

create policy rental_applications_select on rental_applications for select using (
  app.has_permission('RENTALS_VIEW')
  and (app.can_view_all() or agent_id = app.current_user_id()
       or app.can_see_property(property_id))
);
create policy rental_applications_insert on rental_applications for insert with check (
  app.has_permission('RENTALS_CREATE')
  and (app.can_view_all() or agent_id = app.current_user_id()
       or app.can_see_property(property_id))
);
create policy rental_applications_update on rental_applications for update using (
  app.has_permission('RENTALS_EDIT')
  and (app.can_view_all() or agent_id = app.current_user_id()
       or app.can_see_property(property_id))
) with check (app.has_permission('RENTALS_EDIT'));

create policy rental_screening_select on rental_screening for select using (
  exists (select 1 from rental_applications r
           where r.id = application_id and app.has_permission('RENTALS_VIEW')
             and (app.can_view_all() or r.agent_id = app.current_user_id()
                  or app.can_see_property(r.property_id)))
);
create policy rental_screening_write on rental_screening for all using (
  app.has_permission('RENTALS_EDIT') and exists (
    select 1 from rental_applications r
     where r.id = application_id
       and (app.can_view_all() or r.agent_id = app.current_user_id()
            or app.can_see_property(r.property_id)))
) with check (
  app.has_permission('RENTALS_EDIT') and exists (
    select 1 from rental_applications r
     where r.id = application_id
       and (app.can_view_all() or r.agent_id = app.current_user_id()
            or app.can_see_property(r.property_id)))
);

-- Documents can now be attached to the pipeline records too.
drop policy documents_select on documents;
drop policy documents_insert on documents;
create policy documents_select on documents for select using (
  (
    (person_id is not null and app.can_see_person(person_id))
    or (property_id is not null and app.can_see_property(property_id))
    or (lead_id is not null and app.can_see_lead(lead_id))
    or (transaction_id is not null and app.can_see_transaction(transaction_id))
    or (
      person_id is null and property_id is null and lead_id is null
      and transaction_id is null and app.is_authenticated()
    )
  )
  and (category <> 'fica' or app.has_permission('FICA_VIEW'))
  and (category <> 'commission' or app.has_permission('COMMISSION_VIEW'))
  and (category <> 'identity' or app.has_permission('PERSON_ID_VIEW'))
);
create policy documents_insert on documents for insert with check (
  (
    (person_id is not null and app.can_edit_person(person_id))
    or (property_id is not null and app.can_edit_property(property_id))
    or (lead_id is not null and app.can_edit_lead(lead_id))
    or (transaction_id is not null and app.has_permission('SALES_EDIT'))
    or (
      person_id is null and property_id is null and lead_id is null
      and transaction_id is null and app.is_authenticated()
    )
  )
  and (category <> 'fica' or app.has_permission('FICA_CREATE'))
  and (category <> 'commission' or app.has_permission('COMMISSION_EDIT'))
);

-- Tags can now be applied to leads, transactions and rental applications.
drop policy record_tags_select on record_tags;
drop policy record_tags_write on record_tags;
create policy record_tags_select on record_tags for select using (
  app.is_authenticated()
  and (entity_type <> 'person' or app.can_see_person(entity_id))
  and (entity_type <> 'property' or app.can_see_property(entity_id))
  and (entity_type <> 'lead' or app.can_see_lead(entity_id))
  and (entity_type <> 'transaction' or app.can_see_transaction(entity_id))
);
create policy record_tags_write on record_tags for all using (
  app.is_authenticated()
  and (entity_type <> 'person' or app.can_edit_person(entity_id))
  and (entity_type <> 'property' or app.can_edit_property(entity_id))
  and (entity_type <> 'lead' or app.can_edit_lead(entity_id))
  and (entity_type <> 'transaction' or app.has_permission('SALES_EDIT'))
) with check (
  app.is_authenticated()
  and (entity_type <> 'person' or app.can_edit_person(entity_id))
  and (entity_type <> 'property' or app.can_edit_property(entity_id))
  and (entity_type <> 'lead' or app.can_edit_lead(entity_id))
  and (entity_type <> 'transaction' or app.has_permission('SALES_EDIT'))
);
