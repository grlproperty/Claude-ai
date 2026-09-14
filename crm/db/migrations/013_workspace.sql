-- ---------------------------------------------------------------------
-- 013 — Working the CRM day to day (spec 84, 87, 88, 89, 93 to 98, 102, 107)
--
-- Saved views, favourites, what somebody looked at recently, and a record
-- of every export. The last of those is the one that matters most: an
-- export takes data out of the CRM, past every policy that was protecting
-- it, so who took what and whether it carried identity numbers is written
-- down permanently and cannot be edited (spec 15, 98, 104).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- Saved views (spec 88)
-- ---------------------------------------------------------------------
create table saved_views (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references users(id) on delete cascade,
  name         text not null,
  entity_type  text not null check (entity_type in
                 ('person', 'property', 'lead', 'task', 'transaction',
                  'rental_application', 'communication', 'commission', 'fica')),
  -- The query string the list page itself understands, so a saved view is
  -- nothing more than a link somebody named.
  query        text not null default '',
  -- A shared view is visible to the whole office; it is still owned by
  -- whoever made it, and only they or management may change it.
  is_shared    boolean not null default false,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  row_version  integer not null default 1
);
select app.attach_touch('saved_views');
create unique index saved_views_name_per_owner_idx
  on saved_views (owner_id, entity_type, lower(name));
create index saved_views_shared_idx on saved_views (entity_type) where is_shared;

-- ---------------------------------------------------------------------
-- Favourites and what was looked at recently (spec 89, 93)
-- ---------------------------------------------------------------------
create table favourites (
  user_id      uuid not null references users(id) on delete cascade,
  entity_type  text not null check (entity_type in
                 ('person', 'property', 'lead', 'transaction',
                  'rental_application', 'commission', 'company')),
  entity_id    uuid not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);
create index favourites_user_idx on favourites (user_id, created_at desc);

create table recently_viewed (
  user_id      uuid not null references users(id) on delete cascade,
  entity_type  text not null check (entity_type in
                 ('person', 'property', 'lead', 'task', 'transaction',
                  'rental_application', 'commission', 'company', 'fica')),
  entity_id    uuid not null,
  label        text not null,
  viewed_at    timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);
create index recently_viewed_user_idx on recently_viewed (user_id, viewed_at desc);

-- Keeps the list short without a scheduled job: one insert, one trim.
create or replace function app.trim_recently_viewed() returns trigger
language plpgsql as $$
begin
  delete from recently_viewed r
   where r.user_id = new.user_id
     and r.viewed_at < (
       select v.viewed_at from recently_viewed v
        where v.user_id = new.user_id
        order by v.viewed_at desc
        offset 30 limit 1
     );
  return null;
end;
$$;
create trigger recently_viewed_trim after insert on recently_viewed
  for each row execute function app.trim_recently_viewed();

-- ---------------------------------------------------------------------
-- Exports (spec 15, 98, 104)
-- ---------------------------------------------------------------------
-- An export leaves the CRM. Every one is written down, with whether it
-- carried anything sensitive, and the log can never be altered or deleted.
create table export_logs (
  id                 bigserial primary key,
  user_id            uuid references users(id) on delete set null,
  entity_type        text not null,
  format             text not null default 'csv' check (format in ('csv')),
  row_count          integer not null check (row_count >= 0),
  -- The column names taken, so a later question about an old export can
  -- be answered exactly.
  columns            text[] not null default '{}',
  -- The filters in force, never any actual data.
  filters            jsonb,
  included_identity  boolean not null default false,
  ip                 inet,
  user_agent         text,
  created_at         timestamptz not null default now()
);
create index export_logs_user_idx on export_logs (user_id, created_at desc);
create index export_logs_identity_idx on export_logs (created_at desc)
  where included_identity;

create trigger export_logs_no_update before update on export_logs
  for each row execute function app.deny_mutation();
create trigger export_logs_no_delete before delete on export_logs
  for each row execute function app.deny_mutation();

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table saved_views enable row level security;
alter table favourites enable row level security;
alter table recently_viewed enable row level security;
alter table export_logs enable row level security;

-- A view is the owner's, unless they shared it with the office.
create policy saved_views_select on saved_views for select
  using (app.is_authenticated() and (owner_id = app.current_user_id() or is_shared));
create policy saved_views_insert on saved_views for insert
  with check (app.is_authenticated() and owner_id = app.current_user_id());
create policy saved_views_update on saved_views for update
  using (owner_id = app.current_user_id() or app.has_permission('SETTINGS_ADMIN'))
  with check (owner_id = app.current_user_id() or app.has_permission('SETTINGS_ADMIN'));
create policy saved_views_delete on saved_views for delete
  using (owner_id = app.current_user_id() or app.has_permission('SETTINGS_ADMIN'));

-- Favourites and recent history are private. Nobody else's are readable,
-- management included: what somebody looked at is not office business.
create policy favourites_own on favourites for all
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());
create policy recently_viewed_own on recently_viewed for all
  using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

-- Everybody may record their own export; reading the log needs the audit
-- permission, because it is a record of who took data out.
create policy export_logs_insert on export_logs for insert
  with check (app.is_authenticated() and user_id = app.current_user_id());
create policy export_logs_select on export_logs for select
  using (app.has_permission('AUDIT_LOG_VIEW') or user_id = app.current_user_id());

-- ---------------------------------------------------------------------
-- Telling somebody something (spec 90)
-- ---------------------------------------------------------------------
-- The policy on notifications keeps each person's to themselves, which is
-- right for reading and wrong for writing: assigning a task has to be able
-- to tell the person it was assigned to. This is the one way to write a
-- notification for somebody else, and it is deliberately narrow —
-- authenticated callers only, one row, no way to read anybody's back.
--
-- IN-APP ONLY. There is no mail server, no SMS gateway and no push
-- service behind this. A notification waits inside the CRM until the
-- person next opens it (spec 6, 115, 143).
create or replace function app.notify(
  p_user_id     uuid,
  p_kind        text,
  p_title       text,
  p_body        text default null,
  p_href        text default null,
  p_entity_type text default null,
  p_entity_id   text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_id uuid;
begin
  if not app.is_authenticated() then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;
  if p_user_id is null or p_title is null or p_kind is null then
    raise exception 'A notification needs somebody to tell, a kind and a title.'
      using errcode = 'null_value_not_allowed';
  end if;
  -- Only an active user is told anything; a disabled account is not a
  -- person who will read it.
  if not exists (select 1 from users u where u.id = p_user_id and u.status = 'active') then
    return null;
  end if;

  insert into notifications (user_id, kind, title, body, href, entity_type, entity_id)
  values (p_user_id, p_kind, left(p_title, 200), p_body, p_href, p_entity_type, p_entity_id)
  returning id into v_id;

  return v_id;
end;
$$;
grant execute on function app.notify(uuid, text, text, text, text, text, text) to grlp_app;

-- ---------------------------------------------------------------------
-- Operational counters for the health page (spec 107)
-- ---------------------------------------------------------------------
-- Sessions and sign-in attempts are deliberately NOT granted to the
-- application role: they are reached only through the SECURITY DEFINER
-- functions in migration 002, so a query cannot read or forge a session.
-- The health page needs counts from them, and nothing more, so it gets
-- exactly that — behind a permission check, since the numbers say
-- something about how the office is being attacked.
create or replace function app.system_counters() returns table (
  stale_sessions   integer,
  locked_users     integer,
  failed_logins    integer,
  unverified_fica  integer,
  orphan_documents integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not app.has_permission('SETTINGS_ADMIN') then
    raise exception 'You do not have permission to see system health.'
      using errcode = 'insufficient_privilege';
  end if;

  return query select
    (select count(*) from user_sessions
      where expires_at < now() and revoked_at is null)::int,
    (select count(*) from users where locked_until > now())::int,
    (select count(*) from login_attempts
      where succeeded = false and attempted_at > now() - interval '24 hours')::int,
    (select count(*) from fica_records
      where status = 'verified' and expires_on < current_date)::int,
    (select count(*) from documents d
      where not d.is_archived and d.person_id is null and d.property_id is null
        and d.transaction_id is null and d.company_id is null)::int;
end;
$$;
grant execute on function app.system_counters() to grlp_app;

-- ---------------------------------------------------------------------
-- Reading the schema's own record of itself
-- ---------------------------------------------------------------------
-- The system health page counts applied migrations. Filenames and dates
-- only, nothing sensitive, and read-only: no insert, update or delete.
grant select on schema_migrations to grlp_app;

-- ---------------------------------------------------------------------
-- Settings the office may want to change
-- ---------------------------------------------------------------------
insert into settings (key, value, category, label, description) values
  ('export.max_rows', '10000'::jsonb, 'Reports',
   'Largest export allowed',
   'How many rows one export may contain. Bigger requests are refused '
   || 'rather than quietly truncated.'),
  ('dashboard.stale_lead_days', '14'::jsonb, 'Dashboard',
   'A lead is stale after this many days',
   'How long a lead may sit with no contact before the dashboard raises it.'),
  ('dashboard.mandate_warn_days', '30'::jsonb, 'Dashboard',
   'Warn this many days before a mandate expires',
   'How much notice the office wants on an expiring mandate.'),
  ('backup.responsible_party', '""'::jsonb, 'System',
   'Who is responsible for backups',
   'The CRM does not take its own backups. Recording who does, and how, '
   || 'is the only honest thing it can do about them.'),
  ('backup.procedure_note', '""'::jsonb, 'System',
   'How backups are taken and tested',
   'Written down here so the answer is not lost. The CRM cannot verify '
   || 'any of it and never claims a backup succeeded.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Grants. An export log is written once and never touched again.
-- ---------------------------------------------------------------------
grant select, insert, update, delete on saved_views to grlp_app;
grant select, insert, delete on favourites to grlp_app;
grant select, insert, update, delete on recently_viewed to grlp_app;
grant select, insert on export_logs to grlp_app;
grant usage, select on sequence export_logs_id_seq to grlp_app;
