-- ---------------------------------------------------------------------
-- 012 — Commission (spec 61-66, 104, 106, 115, 141)
--
-- Commission is where the CRM is most tempting to lie. The three lies it
-- must not tell are:
--
--   "approved"  — without a person having approved it;
--   "paid"      — without a person having recorded the payment, because
--                 the CRM is connected to no bank and knows nothing
--                 about money actually moving;
--   "earned"    — on a sale that has been concluded but not registered,
--                 which is the distinction spec 49 exists to protect.
--
-- Each of those is refused by the database, not merely by a form. Every
-- figure a rule produces is stored beside the figure actually used, so an
-- override is visible rather than silent, and nothing that has happened
-- to a commission can be erased.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- A correction to 011
-- ---------------------------------------------------------------------
-- Migration 011 constrained an entity's business area to a list ending in
-- 'commercial' rather than 'other', which is the fourth value everywhere
-- else in the schema and the only one the form actually offers. Brought
-- into line here rather than by editing a migration that may already have
-- been applied.
alter table companies drop constraint if exists companies_business_area_check;
update companies set business_area = 'other' where business_area = 'commercial';
alter table companies add constraint companies_business_area_check
  check (business_area in ('sales', 'rentals', 'sales_rentals', 'other'));

-- ---------------------------------------------------------------------
-- The office's rules
-- ---------------------------------------------------------------------
-- A rule is configuration, not code (spec 103). Rates change; history
-- must not change with them, so a commission keeps its own snapshot of
-- whichever rule it was worked out from.
create table commission_rules (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  applies_to        text not null default 'sale'
                      check (applies_to in ('sale', 'rental')),
  -- Null means the rule is not limited to one part of the business.
  business_area     text check (business_area in
                      ('sales', 'rentals', 'sales_rentals', 'other')),

  basis             text not null check (basis in
                      ('percent_of_value', 'fixed_amount', 'months_of_rent',
                       'percent_of_annual_rent')),
  rate_percent      numeric(8,4) check (rate_percent is null or
                                        (rate_percent >= 0 and rate_percent <= 100)),
  fixed_amount      numeric(14,2) check (fixed_amount is null or fixed_amount >= 0),
  months            numeric(6,3) check (months is null or months >= 0),

  -- Whether GRLP's commission carries VAT, and at what rate on the day
  -- the rule was written. A rate change is a new rule, not an edit.
  vat_applicable    boolean not null default true,

  minimum_amount    numeric(14,2) check (minimum_amount is null or minimum_amount >= 0),
  notes             text,

  effective_from    date,
  effective_to      date,
  is_default        boolean not null default false,

  -- Archived, never deleted: a rule that produced a figure on a past deal
  -- has to remain readable (spec 104).
  is_archived       boolean not null default false,
  archive_reason    text,

  created_at        timestamptz not null default now(),
  created_by        uuid references users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references users(id) on delete set null,
  row_version       integer not null default 1,

  constraint commission_rules_archive_needs_reason
    check (not is_archived or archive_reason is not null),
  constraint commission_rules_dates_in_order
    check (effective_to is null or effective_from is null or effective_to >= effective_from),
  -- Each basis needs exactly the figure it is meant to work from, so a
  -- rule can never be half-written.
  constraint commission_rules_basis_needs_its_figure check (
    (basis in ('percent_of_value', 'percent_of_annual_rent') and rate_percent is not null
       and fixed_amount is null and months is null)
    or (basis = 'fixed_amount' and fixed_amount is not null
       and rate_percent is null and months is null)
    or (basis = 'months_of_rent' and months is not null
       and rate_percent is null and fixed_amount is null)
  )
);
select app.attach_touch('commission_rules');

-- One default per part of the business, and only among live rules.
create unique index commission_rules_one_default_idx
  on commission_rules (applies_to, coalesce(business_area, '*'))
  where is_default and not is_archived;
create index commission_rules_live_idx on commission_rules (applies_to)
  where not is_archived;

-- ---------------------------------------------------------------------
-- The commission on one deal
-- ---------------------------------------------------------------------
create sequence commission_reference_seq start 1;
grant usage, select on sequence commission_reference_seq to grlp_app;

create table commissions (
  id                  uuid primary key default gen_random_uuid(),
  commission_ref      text not null unique,

  -- A commission belongs to a sale or to a lease, never to both.
  transaction_id      uuid references transactions(id) on delete restrict,
  rental_id           uuid references property_rental_history(id) on delete restrict,
  -- Carried directly so row level security can reach the property without
  -- a join, and so the record survives a rental history row being replaced.
  property_id         uuid not null references properties(id) on delete restrict,

  -- The rule it came from, and a snapshot of that rule as it read then.
  rule_id             uuid references commission_rules(id) on delete set null,
  rule_name           text,
  basis               text not null check (basis in
                        ('percent_of_value', 'fixed_amount', 'months_of_rent',
                         'percent_of_annual_rent')),
  rate_percent        numeric(8,4),
  fixed_amount        numeric(14,2),
  months              numeric(6,3),

  -- What the percentage was applied to: the sale price, or a year's rent.
  base_amount         numeric(14,2) not null check (base_amount >= 0),

  -- What the rule produced, kept whether or not it was used.
  calculated_excl_vat numeric(14,2) not null check (calculated_excl_vat >= 0),
  -- What the office is actually claiming. Differs from the above only when
  -- somebody overrode it, and then only with a reason.
  gross_excl_vat      numeric(14,2) not null check (gross_excl_vat >= 0),
  is_overridden       boolean not null default false,
  override_reason     text,

  vat_applicable      boolean not null default true,
  vat_rate            numeric(6,3) not null default 15
                        check (vat_rate >= 0 and vat_rate <= 100),
  vat_amount          numeric(14,2) not null default 0 check (vat_amount >= 0),
  gross_incl_vat      numeric(14,2) not null check (gross_incl_vat >= 0),

  deductions_total    numeric(14,2) not null default 0 check (deductions_total >= 0),
  -- What is left to share out, excluding VAT. VAT is never anybody's share.
  net_excl_vat        numeric(14,2) not null check (net_excl_vat >= 0),

  status              text not null default 'draft' check (status in
                        ('draft', 'submitted', 'approved', 'rejected',
                         'invoiced', 'paid', 'cancelled')),

  submitted_by        uuid references users(id) on delete set null,
  submitted_at        timestamptz,

  approved_by         uuid references users(id) on delete set null,
  approved_at         timestamptz,
  approval_note       text,

  rejected_by         uuid references users(id) on delete set null,
  rejected_at         timestamptz,
  rejection_reason    text,

  invoice_number      text,
  invoice_date        date,

  paid_on             date,
  payment_reference   text,
  marked_paid_by      uuid references users(id) on delete set null,
  marked_paid_at      timestamptz,

  cancellation_reason text,
  notes               text,

  created_at          timestamptz not null default now(),
  created_by          uuid references users(id) on delete set null,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references users(id) on delete set null,
  row_version         integer not null default 1,

  constraint commissions_one_deal
    check ((transaction_id is not null) <> (rental_id is not null)),
  constraint commissions_override_needs_reason
    check (not is_overridden or override_reason is not null),
  constraint commissions_override_matches_figures
    check (is_overridden or gross_excl_vat = calculated_excl_vat),
  constraint commissions_basis_needs_its_figure check (
    (basis in ('percent_of_value', 'percent_of_annual_rent') and rate_percent is not null)
    or (basis = 'fixed_amount' and fixed_amount is not null)
    or (basis = 'months_of_rent' and months is not null)
  ),
  -- No VAT claimed unless VAT applies.
  constraint commissions_vat_only_when_applicable
    check (vat_applicable or vat_amount = 0),

  -- Approval belongs to a person. The database will not hold an approved
  -- commission with nobody's name on it (spec 115).
  constraint commissions_approved_needs_a_person
    check (status <> 'approved' or (approved_by is not null and approved_at is not null)),
  constraint commissions_rejected_needs_a_reason
    check (status <> 'rejected'
           or (rejected_by is not null and rejected_at is not null
               and rejection_reason is not null)),
  constraint commissions_submitted_needs_a_person
    check (status <> 'submitted' or (submitted_by is not null and submitted_at is not null)),
  constraint commissions_cancelled_needs_a_reason
    check (status <> 'cancelled' or cancellation_reason is not null),

  -- Invoicing and payment come after approval, and an invoice has a number.
  constraint commissions_payment_needs_approval
    check (status not in ('invoiced', 'paid') or approved_by is not null),
  constraint commissions_invoiced_needs_a_number
    check (status not in ('invoiced', 'paid') or invoice_number is not null),

  -- "Paid" is somebody's word with their name against it, not a fact the
  -- CRM established: it has no bank feed and no payment integration.
  constraint commissions_paid_needs_a_person
    check (status <> 'paid'
           or (paid_on is not null and marked_paid_by is not null
               and marked_paid_at is not null))
);

create or replace function app.set_commission_ref() returns trigger
language plpgsql as $$
begin
  if new.commission_ref is null or new.commission_ref = '' then
    new.commission_ref := 'GRLP-M-' || lpad(nextval('commission_reference_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
create trigger commissions_set_ref before insert on commissions
  for each row execute function app.set_commission_ref();
select app.attach_touch('commissions');

-- One commission per deal. A second one would make every total ambiguous.
create unique index commissions_one_per_transaction_idx
  on commissions (transaction_id) where transaction_id is not null;
create unique index commissions_one_per_rental_idx
  on commissions (rental_id) where rental_id is not null;
create index commissions_property_idx on commissions (property_id);
create index commissions_status_idx on commissions (status);
create index commissions_paid_idx on commissions (paid_on desc) where paid_on is not null;

-- ---------------------------------------------------------------------
-- Spec 49, made a rule the database keeps
-- ---------------------------------------------------------------------
-- A sale being concluded is not a sale being registered, and commission is
-- only earned on registration. Invoicing or paying against an unregistered
-- transfer is refused unless GRLP deliberately switches that off.
create or replace function app.commission_registration_guard() returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_transaction_status text;
  v_allowed            boolean;
begin
  if new.status not in ('invoiced', 'paid') then
    return new;
  end if;
  if new.transaction_id is null then
    return new;  -- a lease is not registered in a deeds office
  end if;

  select coalesce((value)::text::boolean, false) into v_allowed
    from settings where key = 'commission.allow_before_registration';

  if coalesce(v_allowed, false) then
    return new;
  end if;

  select t.status into v_transaction_status
    from transactions t where t.id = new.transaction_id;

  if v_transaction_status is distinct from 'registered' then
    raise exception
      'Commission cannot be invoiced or paid before the transfer is registered. The transaction is %.',
      coalesce(v_transaction_status, 'not found')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
create trigger commissions_registration_guard
  before insert or update of status on commissions
  for each row execute function app.commission_registration_guard();

-- ---------------------------------------------------------------------
-- Who gets what
-- ---------------------------------------------------------------------
-- Several agents can share one deal (spec 78), and the office keeps a
-- share of its own. A referrer who is not a CRM user is recorded by name.
create table commission_splits (
  id              uuid primary key default gen_random_uuid(),
  commission_id   uuid not null references commissions(id) on delete cascade,
  agent_id        uuid references users(id) on delete restrict,
  party_name      text,
  role            text not null default 'primary' check (role in
                    ('primary', 'sharing', 'referral', 'introducer', 'office')),
  share_percent   numeric(7,3) not null
                    check (share_percent >= 0 and share_percent <= 100),
  amount          numeric(14,2) not null default 0 check (amount >= 0),
  notes           text,
  created_at      timestamptz not null default now(),
  created_by      uuid references users(id) on delete set null,

  -- Somebody has to be named, whether or not they use the CRM.
  constraint commission_splits_somebody
    check (agent_id is not null or party_name is not null),
  -- The office's own share is not an agent's share.
  constraint commission_splits_office_has_no_agent
    check (role <> 'office' or agent_id is null)
);
create unique index commission_splits_one_per_agent_idx
  on commission_splits (commission_id, agent_id) where agent_id is not null;
-- The office is one party, so its share is one row that gets edited rather
-- than a second row that quietly doubles it.
create unique index commission_splits_one_office_idx
  on commission_splits (commission_id) where role = 'office';
create index commission_splits_agent_idx on commission_splits (agent_id);
create index commission_splits_commission_idx on commission_splits (commission_id);

-- Shares cannot add up to more than the whole. Checked per statement so a
-- swap of two rows in one transaction is judged on its result, not midway.
create or replace function app.commission_split_total_guard() returns trigger
language plpgsql as $$
declare
  v_commission_id uuid;
  v_total         numeric(10,3);
begin
  for v_commission_id in
    select distinct commission_id from new_rows
  loop
    select coalesce(sum(share_percent), 0) into v_total
      from commission_splits where commission_id = v_commission_id;
    if v_total > 100.001 then
      -- The per cent sign is built into the argument, because RAISE reads
      -- a bare one as a placeholder.
      raise exception 'The shares on this commission add up to %, which is more than the whole.',
        trim(to_char(v_total, '990.999')) || '%'
        using errcode = 'check_violation';
    end if;
  end loop;
  return null;
end;
$$;
create trigger commission_splits_total_insert
  after insert on commission_splits
  referencing new table as new_rows
  for each statement execute function app.commission_split_total_guard();
create trigger commission_splits_total_update
  after update on commission_splits
  referencing new table as new_rows
  for each statement execute function app.commission_split_total_guard();

-- ---------------------------------------------------------------------
-- Named deductions
-- ---------------------------------------------------------------------
-- A referral fee, a franchise fee, a bond originator's cut. Named rather
-- than squeezed into fixed columns, because the office knows its own costs
-- better than a schema does.
create table commission_deductions (
  id            uuid primary key default gen_random_uuid(),
  commission_id uuid not null references commissions(id) on delete cascade,
  label         text not null,
  amount        numeric(14,2) not null check (amount >= 0),
  note          text,
  created_at    timestamptz not null default now(),
  created_by    uuid references users(id) on delete set null
);
create index commission_deductions_idx on commission_deductions (commission_id);

-- ---------------------------------------------------------------------
-- What has happened to it, kept forever (spec 104)
-- ---------------------------------------------------------------------
create table commission_history (
  id            bigserial primary key,
  commission_id uuid not null references commissions(id) on delete cascade,
  event         text not null check (event in
                  ('opened', 'recalculated', 'overridden', 'split_changed',
                   'deduction_changed', 'status_changed', 'invoiced', 'paid',
                   'note')),
  old_status    text,
  new_status    text,
  -- Figures and names only. Nothing sensitive belongs here (spec 15).
  detail        jsonb,
  reason        text,
  changed_at    timestamptz not null default now(),
  changed_by    uuid references users(id) on delete set null
);
create index commission_history_idx on commission_history (commission_id, changed_at desc);

create trigger commission_history_no_update before update on commission_history
  for each row execute function app.deny_mutation();
create trigger commission_history_no_delete before delete on commission_history
  for each row execute function app.deny_mutation();

-- ---------------------------------------------------------------------
-- Visibility
-- ---------------------------------------------------------------------
-- An agent sees the commission on a deal they are on, which includes their
-- own share. Everybody else's figures need DATA_VIEW_ALL.
create or replace function app.is_on_commission_split(p_commission_id uuid) returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from commission_splits s
     where s.commission_id = p_commission_id
       and s.agent_id = app.current_user_id()
  );
$$;
grant execute on function app.is_on_commission_split(uuid) to grlp_app;

create or replace function app.can_see_commission(p_commission_id uuid) returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select app.has_permission('COMMISSION_VIEW')
     and exists (
       select 1 from commissions c
        where c.id = p_commission_id
          and (app.can_view_all()
               or app.can_see_property(c.property_id)
               or app.is_on_commission_split(c.id))
     );
$$;
grant execute on function app.can_see_commission(uuid) to grlp_app;

alter table commission_rules enable row level security;
alter table commissions enable row level security;
alter table commission_splits enable row level security;
alter table commission_deductions enable row level security;
alter table commission_history enable row level security;

-- Rules are the office's published terms: anybody who may see commission
-- may read them; only SETTINGS_ADMIN may write them.
create policy commission_rules_select on commission_rules for select
  using (app.has_permission('COMMISSION_VIEW'));
create policy commission_rules_insert on commission_rules for insert
  with check (app.has_permission('SETTINGS_ADMIN'));
create policy commission_rules_update on commission_rules for update
  using (app.has_permission('SETTINGS_ADMIN'))
  with check (app.has_permission('SETTINGS_ADMIN'));

create policy commissions_select on commissions for select using (
  app.has_permission('COMMISSION_VIEW')
  and (app.can_view_all()
       or app.can_see_property(property_id)
       or app.is_on_commission_split(id))
);
create policy commissions_insert on commissions for insert with check (
  app.has_permission('COMMISSION_CREATE') and app.can_see_property(property_id)
);
-- Editing needs COMMISSION_EDIT; approving needs COMMISSION_APPROVE, which
-- the application checks before it writes the approval columns and which
-- the constraints above make impossible to fake.
create policy commissions_update on commissions for update using (
  (app.has_permission('COMMISSION_EDIT') or app.has_permission('COMMISSION_APPROVE'))
  and (app.can_view_all()
       or app.can_see_property(property_id)
       or app.is_on_commission_split(id))
) with check (
  app.has_permission('COMMISSION_EDIT') or app.has_permission('COMMISSION_APPROVE')
);

create policy commission_splits_select on commission_splits for select
  using (app.can_see_commission(commission_id));
create policy commission_splits_insert on commission_splits for insert
  with check (app.has_permission('COMMISSION_EDIT')
              and app.can_see_commission(commission_id));
create policy commission_splits_update on commission_splits for update
  using (app.has_permission('COMMISSION_EDIT') and app.can_see_commission(commission_id))
  with check (app.has_permission('COMMISSION_EDIT'));
create policy commission_splits_delete on commission_splits for delete
  using (app.has_permission('COMMISSION_EDIT') and app.can_see_commission(commission_id));

create policy commission_deductions_select on commission_deductions for select
  using (app.can_see_commission(commission_id));
create policy commission_deductions_insert on commission_deductions for insert
  with check (app.has_permission('COMMISSION_EDIT')
              and app.can_see_commission(commission_id));
create policy commission_deductions_delete on commission_deductions for delete
  using (app.has_permission('COMMISSION_EDIT') and app.can_see_commission(commission_id));

create policy commission_history_select on commission_history for select
  using (app.can_see_commission(commission_id));
create policy commission_history_insert on commission_history for insert
  with check (app.has_permission('COMMISSION_CREATE')
              or app.has_permission('COMMISSION_EDIT')
              or app.has_permission('COMMISSION_APPROVE'));

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------
insert into settings (key, value, category, label, description) values
  ('commission.vat_rate', '15'::jsonb, 'Commission',
   'VAT rate applied to commission (%)',
   'Used when a new commission is worked out. Changing it does not alter '
   || 'commission already recorded.'),
  ('commission.allow_before_registration', 'false'::jsonb, 'Commission',
   'Allow invoicing before registration',
   'Off by default. A sale being concluded is not a sale being registered, '
   || 'and commission is only earned on registration. With this off the '
   || 'database refuses to invoice or pay against an unregistered transfer.'),
  ('commission.require_separate_approver', 'false'::jsonb, 'Commission',
   'Somebody other than the author must approve',
   'When on, whoever worked a commission out cannot be the one who approves '
   || 'it. Useful once more than one person holds approval.'),
  ('commission.office_share_percent', '50'::jsonb, 'Commission',
   'The office share suggested on a new commission (%)',
   'A starting point only. Every share is editable on the commission itself.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Rules to start from. GRLP can change or archive any of these.
-- ---------------------------------------------------------------------
insert into commission_rules
  (name, applies_to, business_area, basis, rate_percent, months, vat_applicable,
   is_default, notes)
values
  ('Standard sale commission', 'sale', null, 'percent_of_value', 5.0000, null, true, true,
   'The usual mandated rate. Override on the deal where the mandate says otherwise.'),
  ('Standard residential letting commission', 'rental', null, 'months_of_rent', null, 1.000,
   true, true,
   'One month''s rent on a new lease, which is the common arrangement.');

-- ---------------------------------------------------------------------
-- Grants. Nothing about a commission is ever deleted, only superseded,
-- so there is no delete on commissions or on its history.
-- ---------------------------------------------------------------------
grant select, insert, update on commission_rules to grlp_app;
grant select, insert, update on commissions to grlp_app;
grant select, insert, update, delete on commission_splits to grlp_app;
grant select, insert, delete on commission_deductions to grlp_app;
grant select, insert on commission_history to grlp_app;
grant usage, select on sequence commission_history_id_seq to grlp_app;
