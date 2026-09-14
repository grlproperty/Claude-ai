-- ---------------------------------------------------------------------
-- Stage 5: contact permissions, evidence, do-not-contact, the NCC register
-- and the direct-marketing preflight.
--
-- Two rules shape everything here.
--
-- The first is that a withdrawal is never destroyed (spec 104). Permission
-- history is append-only in the database, and a do-not-contact entry is
-- released rather than deleted, so the record of the period it applied to
-- survives. A person who asked not to be contacted can prove they asked.
--
-- The second is that the CRM has no connection to the National Consumer
-- Commission register (spec 115). It cannot check a number and it never
-- pretends to. What it models is the real office process: gather the numbers
-- into a batch, send the batch to whoever does the check, and load what comes
-- back. Until results are loaded, a number's status is "not checked", which
-- is the truth.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Contact permissions (spec 52, 53)
-- ---------------------------------------------------------------------
create table contact_permissions (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references people(id) on delete cascade,
  channel       text not null check (channel in ('call','sms','whatsapp','email','post')),
  purpose       text not null check (purpose in
                  ('direct_marketing','property_alerts','newsletter',
                   'market_reports','service_updates')),
  status        text not null check (status in ('granted','withdrawn','refused')),
  -- Why the office believes it may contact this person at all. Consent is not
  -- the only lawful basis, and recording which one was relied on is the point.
  lawful_basis  text check (lawful_basis in
                  ('consent','contract','legitimate_interest','legal_obligation')),
  granted_at    timestamptz,
  withdrawn_at  timestamptz,
  evidence_id   uuid,
  note          text,
  created_at    timestamptz not null default now(),
  created_by    uuid references users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references users(id) on delete set null,
  row_version   integer not null default 1,

  -- A granted permission has to say when. A withdrawn one has to say when it
  -- was withdrawn, so the period it covered is never ambiguous.
  constraint contact_permissions_granted_needs_date
    check (status <> 'granted' or granted_at is not null),
  constraint contact_permissions_withdrawn_needs_date
    check (status <> 'withdrawn' or withdrawn_at is not null)
);
create unique index contact_permissions_one_per_purpose_idx
  on contact_permissions (person_id, channel, purpose);
create index contact_permissions_person_idx on contact_permissions (person_id);
select app.attach_touch('contact_permissions');

-- Evidence for a permission: the signed form, the reply, the web submission.
create table permission_evidence (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid not null references people(id) on delete cascade,
  evidence_type  text not null check (evidence_type in
                   ('signed_form','email_reply','whatsapp_reply','website_form',
                    'verbal_noted','imported_record','other')),
  reference      text,
  captured_at    timestamptz not null default now(),
  document_id    uuid references documents(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid references users(id) on delete set null
);
create index permission_evidence_person_idx on permission_evidence (person_id, captured_at desc);

alter table contact_permissions
  add constraint contact_permissions_evidence_fk
  foreign key (evidence_id) references permission_evidence(id) on delete set null;

-- Every change to a permission, kept forever (spec 104).
create table contact_permission_history (
  id             bigserial primary key,
  permission_id  uuid references contact_permissions(id) on delete set null,
  person_id      uuid not null references people(id) on delete cascade,
  channel        text not null,
  purpose        text not null,
  old_status     text,
  new_status     text not null,
  lawful_basis   text,
  evidence_id    uuid references permission_evidence(id) on delete set null,
  reason         text,
  changed_at     timestamptz not null default now(),
  changed_by     uuid references users(id) on delete set null
);
create index contact_permission_history_person_idx
  on contact_permission_history (person_id, changed_at desc);

create trigger contact_permission_history_no_change
  before update or delete on contact_permission_history
  for each statement execute function app.deny_mutation();

-- ---------------------------------------------------------------------
-- Do not contact (spec 54)
--
-- A do-not-contact may attach to a person, to a bare number or address that
-- is not on anyone's record yet, or to both. It is never deleted: it is
-- released, with a reason, and the released row stays.
-- ---------------------------------------------------------------------
create table do_not_contact (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid references people(id) on delete cascade,
  -- Held normalised so a number written any of the usual ways still matches.
  contact_value  text,
  contact_value_normalised text generated always as (
    case when contact_value is null then null
         when position('@' in contact_value) > 0 then app.normalise_email(contact_value)
         else coalesce(app.normalise_za_phone(contact_value), lower(btrim(contact_value)))
    end
  ) stored,
  channel        text not null default 'all'
                   check (channel in ('all','call','sms','whatsapp','email','post')),
  source         text not null check (source in
                   ('client_request','ncc_register','complaint','bounced','deceased','other')),
  reason         text,
  requested_at   timestamptz not null default now(),
  added_at       timestamptz not null default now(),
  added_by       uuid references users(id) on delete set null,
  released_at    timestamptz,
  released_by    uuid references users(id) on delete set null,
  release_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references users(id) on delete set null,
  row_version    integer not null default 1,

  constraint do_not_contact_needs_a_subject
    check (person_id is not null or contact_value is not null),
  -- Releasing one is a deliberate act and has to say why.
  constraint do_not_contact_release_needs_reason
    check (released_at is null or nullif(btrim(coalesce(release_reason, '')), '') is not null)
);
create index do_not_contact_person_idx on do_not_contact (person_id) where released_at is null;
create index do_not_contact_value_idx
  on do_not_contact (contact_value_normalised) where released_at is null;
-- The same person cannot be listed twice for the same channel while active.
create unique index do_not_contact_one_active_per_person_idx
  on do_not_contact (person_id, channel) where released_at is null and person_id is not null;
select app.attach_touch('do_not_contact');

-- ---------------------------------------------------------------------
-- The National Consumer Commission opt-out register (spec 55, 56)
--
-- There is no connection to the register. A batch is a record of what was
-- sent away to be checked and what came back, with the cost the office was
-- charged. The cost per number is configuration, not a constant in code.
-- ---------------------------------------------------------------------
create sequence ncc_batch_reference_seq start 1;
grant usage, select on sequence ncc_batch_reference_seq to grlp_app;

create table ncc_batches (
  id                 uuid primary key default gen_random_uuid(),
  batch_ref          text not null unique,
  name               text not null,
  status             text not null default 'draft'
                       check (status in ('draft','submitted','results_loaded','cancelled')),
  -- Copied from settings when the batch is created, so a later change to the
  -- price does not silently rewrite what an old batch cost.
  cost_per_number    numeric(12,2) not null default 0,
  submitted_at       timestamptz,
  submitted_by       uuid references users(id) on delete set null,
  submitted_note     text,
  results_loaded_at  timestamptz,
  results_loaded_by  uuid references users(id) on delete set null,
  cancelled_at       timestamptz,
  cancellation_reason text,
  notes              text,
  created_at         timestamptz not null default now(),
  created_by         uuid references users(id) on delete set null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references users(id) on delete set null,
  row_version        integer not null default 1,

  constraint ncc_batches_submitted_needs_date
    check (status not in ('submitted','results_loaded') or submitted_at is not null),
  constraint ncc_batches_results_need_date
    check (status <> 'results_loaded' or results_loaded_at is not null),
  constraint ncc_batches_cancelled_needs_reason
    check (status <> 'cancelled'
           or nullif(btrim(coalesce(cancellation_reason, '')), '') is not null)
);
select app.attach_touch('ncc_batches');

create or replace function app.set_ncc_batch_ref() returns trigger
language plpgsql as $$
begin
  if new.batch_ref is null then
    new.batch_ref := 'GRLP-NCC-' || lpad(nextval('ncc_batch_reference_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
create trigger ncc_batches_reference before insert on ncc_batches
  for each row execute function app.set_ncc_batch_ref();

create table ncc_batch_items (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid not null references ncc_batches(id) on delete cascade,
  person_id      uuid references people(id) on delete set null,
  contact_value  text not null,
  contact_value_normalised text generated always as (
    coalesce(app.normalise_za_phone(contact_value), lower(btrim(contact_value)))
  ) stored,
  -- 'not_checked' is the honest default and stays until a result is loaded.
  result         text not null default 'not_checked'
                   check (result in ('not_checked','not_listed','listed','invalid_number')),
  result_note    text,
  checked_at     timestamptz,
  created_at     timestamptz not null default now(),

  constraint ncc_batch_items_result_needs_date
    check (result = 'not_checked' or checked_at is not null)
);
create index ncc_batch_items_batch_idx on ncc_batch_items (batch_id);
create index ncc_batch_items_person_idx on ncc_batch_items (person_id);
create index ncc_batch_items_value_idx
  on ncc_batch_items (contact_value_normalised, checked_at desc)
  where result <> 'not_checked';

-- ---------------------------------------------------------------------
-- Settings this stage introduces. Every one of these is a business value the
-- office can change without a deployment.
-- ---------------------------------------------------------------------
insert into settings (key, value, category, label, description) values
  ('ncc.cost_per_number', '1.50'::jsonb, 'Compliance',
   'NCC cost per number',
   'What the office is charged for each number checked against the register.'),
  ('ncc.result_valid_days', '180'::jsonb, 'Compliance',
   'How long an NCC result stays current (days)',
   'After this many days a number is treated as needing checking again.'),
  ('compliance.require_evidence', 'true'::jsonb, 'Compliance',
   'Require evidence before a permission counts as clear',
   'When on, a granted permission with nothing to back it up is flagged for '
   || 'checking rather than shown as clear.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- The direct-marketing preflight (spec 57)
--
-- Deliberately SECURITY DEFINER. The verdict must never come back green
-- merely because the person asking could not see the do-not-contact entry
-- that would have made it red. The verdict is not sensitive; the evidence
-- behind it is, and that is read through the ordinary policies elsewhere.
-- ---------------------------------------------------------------------
create or replace function app.marketing_preflight(
  p_person_id uuid,
  p_channel   text,
  p_purpose   text default 'direct_marketing'
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_reasons      text[] := '{}';
  v_status       text := 'green';
  v_perm_status  text;
  v_perm_evidence uuid;
  v_has_permission boolean := false;
  v_valid_days   integer;
  v_need_evidence boolean;
  v_has_contact  boolean;
  v_listed       boolean;
  v_unchecked    boolean;
begin
  select coalesce((value #>> '{}')::integer, 180) into v_valid_days
    from settings where key = 'ncc.result_valid_days';
  v_valid_days := coalesce(v_valid_days, 180);

  select coalesce((value #>> '{}')::boolean, true) into v_need_evidence
    from settings where key = 'compliance.require_evidence';
  v_need_evidence := coalesce(v_need_evidence, true);

  -- Red: an active do-not-contact covering this channel.
  if exists (
    select 1 from do_not_contact d
     where d.released_at is null
       and d.person_id = p_person_id
       and d.channel in ('all', p_channel)
  ) then
    v_status := 'red';
    v_reasons := array_append(v_reasons, 'This person has asked not to be contacted.');
  end if;

  -- Red: the permission was withdrawn or refused.
  -- Held in plain variables rather than read back from FOUND, which belongs to
  -- whichever statement ran last and would be true again by the time the amber
  -- checks below need to know whether anything was recorded at all.
  select cp.status, cp.evidence_id into v_perm_status, v_perm_evidence
    from contact_permissions cp
   where cp.person_id = p_person_id and cp.channel = p_channel and cp.purpose = p_purpose;
  v_has_permission := v_perm_status is not null;

  if v_perm_status in ('withdrawn','refused') then
    v_status := 'red';
    v_reasons := array_append(v_reasons, case v_perm_status
      when 'withdrawn' then 'Permission for this channel was withdrawn.'
      else 'Permission for this channel was refused.' end);
  end if;

  -- Red: a number of theirs came back listed on the register.
  select exists (
    select 1
      from person_contacts pc
      join ncc_batch_items i
        on i.contact_value_normalised = pc.value_normalised
     where pc.person_id = p_person_id and pc.is_active
       and i.result = 'listed'
  ) into v_listed;
  if v_listed and p_channel in ('call','sms','whatsapp') then
    v_status := 'red';
    v_reasons := array_append(v_reasons, 'A number for this person is on the NCC opt-out register.');
  end if;

  if v_status = 'red' then
    return jsonb_build_object('status', 'red', 'reasons', to_jsonb(v_reasons));
  end if;

  -- Amber: nothing recorded either way.
  if not v_has_permission then
    v_status := 'amber';
    v_reasons := array_append(v_reasons, 'No permission has been recorded for this channel.');
  elsif v_need_evidence and v_perm_evidence is null then
    v_status := 'amber';
    v_reasons := array_append(v_reasons, 'Permission is recorded but nothing was kept to back it up.');
  end if;

  -- Amber: no usable contact detail for the channel.
  select exists (
    select 1 from person_contacts pc
     where pc.person_id = p_person_id and pc.is_active
       and pc.contact_type = any (case p_channel
             when 'email' then array['email']
             when 'post'  then array['other']
             when 'whatsapp' then array['whatsapp','mobile','alternative_mobile']
             else array['mobile','alternative_mobile','landline'] end)
  ) into v_has_contact;
  if not v_has_contact and p_channel <> 'post' then
    v_status := 'amber';
    v_reasons := array_append(v_reasons, 'There is no active contact detail for this channel.');
  end if;

  -- Amber: the register was never checked, or the check has gone stale.
  if p_channel in ('call','sms','whatsapp') then
    select exists (
      select 1 from person_contacts pc
       where pc.person_id = p_person_id and pc.is_active
         and pc.contact_type in ('mobile','alternative_mobile','landline','whatsapp')
         and not exists (
           select 1 from ncc_batch_items i
            where i.contact_value_normalised = pc.value_normalised
              and i.result <> 'not_checked'
              and i.checked_at > now() - make_interval(days => v_valid_days)
         )
    ) into v_unchecked;
    if v_unchecked then
      v_status := 'amber';
      v_reasons := array_append(
        v_reasons,
        'A number for this person has not been checked against the NCC register recently.');
    end if;
  end if;

  if v_status = 'green' then
    v_reasons := array_append(v_reasons, 'Permission is recorded, evidenced and current.');
  end if;

  return jsonb_build_object('status', v_status, 'reasons', to_jsonb(v_reasons));
end;
$$;
grant execute on function app.marketing_preflight(uuid, text, text) to grlp_app;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table contact_permissions        enable row level security;
alter table permission_evidence        enable row level security;
alter table contact_permission_history enable row level security;
alter table do_not_contact             enable row level security;
alter table ncc_batches                enable row level security;
alter table ncc_batch_items            enable row level security;

-- Row level security is enabled but deliberately not forced, as everywhere
-- else in this schema. The application connects as grlp_app, which owns
-- nothing and holds neither SUPERUSER nor BYPASSRLS, so every application
-- query is policed. Migrations and the SECURITY DEFINER preflight run as the
-- owner, which is what lets the preflight see a do-not-contact the caller
-- cannot and so never return green for want of permission.

create policy contact_permissions_select on contact_permissions for select using (
  app.has_permission('COMPLIANCE_VIEW') and app.can_see_person(person_id)
);
create policy contact_permissions_insert on contact_permissions for insert with check (
  app.has_permission('COMPLIANCE_CREATE') and app.can_see_person(person_id)
);
create policy contact_permissions_update on contact_permissions for update using (
  app.has_permission('COMPLIANCE_EDIT') and app.can_see_person(person_id)
) with check (
  app.has_permission('COMPLIANCE_EDIT') and app.can_see_person(person_id)
);

create policy permission_evidence_select on permission_evidence for select using (
  app.has_permission('COMPLIANCE_VIEW') and app.can_see_person(person_id)
);
create policy permission_evidence_insert on permission_evidence for insert with check (
  app.has_permission('COMPLIANCE_CREATE') and app.can_see_person(person_id)
);

create policy contact_permission_history_select on contact_permission_history for select using (
  app.has_permission('COMPLIANCE_VIEW') and app.can_see_person(person_id)
);
create policy contact_permission_history_insert on contact_permission_history for insert
  with check (app.has_permission('COMPLIANCE_CREATE') and app.can_see_person(person_id));

-- A do-not-contact against a bare number belongs to nobody in particular, so
-- it is visible to anyone who may see compliance at all.
create policy do_not_contact_select on do_not_contact for select using (
  app.has_permission('COMPLIANCE_VIEW')
  and (person_id is null or app.can_see_person(person_id))
);
create policy do_not_contact_insert on do_not_contact for insert with check (
  app.has_permission('COMPLIANCE_CREATE')
  and (person_id is null or app.can_see_person(person_id))
);
-- Releasing one needs the higher permission: it is the act that lets
-- marketing reach someone who asked it not to.
create policy do_not_contact_update on do_not_contact for update using (
  app.has_permission('COMPLIANCE_EDIT')
  and (person_id is null or app.can_see_person(person_id))
) with check (
  app.has_permission('COMPLIANCE_EDIT')
  and (person_id is null or app.can_see_person(person_id))
);

create policy ncc_batches_select on ncc_batches for select
  using (app.has_permission('COMPLIANCE_VIEW'));
create policy ncc_batches_write on ncc_batches for insert
  with check (app.has_permission('NCC_ADMIN'));
create policy ncc_batches_update on ncc_batches for update
  using (app.has_permission('NCC_ADMIN')) with check (app.has_permission('NCC_ADMIN'));

create policy ncc_batch_items_select on ncc_batch_items for select
  using (app.has_permission('COMPLIANCE_VIEW'));
create policy ncc_batch_items_write on ncc_batch_items for insert
  with check (app.has_permission('NCC_ADMIN'));
create policy ncc_batch_items_update on ncc_batch_items for update
  using (app.has_permission('NCC_ADMIN')) with check (app.has_permission('NCC_ADMIN'));
create policy ncc_batch_items_delete on ncc_batch_items for delete
  using (app.has_permission('NCC_ADMIN'));

-- ---------------------------------------------------------------------
-- A merge must carry compliance with it, or a withdrawal could be lost by
-- tidying up two records into one (spec 104).
-- ---------------------------------------------------------------------
insert into merge_child_tables (entity_type, table_name, column_name, note) values
  ('person', 'contact_permissions',        'person_id', 'Contact permissions'),
  ('person', 'permission_evidence',        'person_id', 'Permission evidence'),
  ('person', 'contact_permission_history', 'person_id', 'Permission history'),
  ('person', 'do_not_contact',             'person_id', 'Do not contact'),
  ('person', 'ncc_batch_items',            'person_id', 'NCC batch entries');

-- ---------------------------------------------------------------------
-- Grants. Nothing here is deletable except an unsent batch line.
-- ---------------------------------------------------------------------
grant select, insert, update on contact_permissions to grlp_app;
grant select, insert on permission_evidence to grlp_app;
grant select, insert on contact_permission_history to grlp_app;
grant usage, select on sequence contact_permission_history_id_seq to grlp_app;
grant select, insert, update on do_not_contact to grlp_app;
grant select, insert, update on ncc_batches to grlp_app;
grant select, insert, update, delete on ncc_batch_items to grlp_app;
