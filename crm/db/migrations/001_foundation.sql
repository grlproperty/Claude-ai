-- =====================================================================
-- 001 FOUNDATION
-- Users, roles, granular permissions, offices/teams, sessions,
-- invitations, audit, sensitive-access logging, settings, notifications.
--
-- Security model
-- --------------
-- Migrations run as the owner role (grlp_owner). The application connects
-- as grlp_app, which is neither SUPERUSER nor BYPASSRLS, so every policy
-- below is genuinely enforced and cannot be bypassed from application code.
--
-- The application sets `app.user_id` with SET LOCAL at the start of every
-- transaction. Policies read it through app.current_user_id().
--
-- Permission lookups are SECURITY DEFINER so that policies never recurse
-- into the RLS of the tables they are reading.
-- =====================================================================

create extension if not exists pg_trgm;
create extension if not exists unaccent;

create schema if not exists app;
grant usage on schema app to grlp_app;

-- ---------------------------------------------------------------------
-- Session context
-- ---------------------------------------------------------------------
create or replace function app.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

-- ---------------------------------------------------------------------
-- Offices and teams (Office -> Team -> Agent, deliberately shallow)
-- ---------------------------------------------------------------------
create table offices (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index offices_name_key on offices (lower(name));

create table teams (
  id            uuid primary key default gen_random_uuid(),
  office_id     uuid not null references offices(id) on delete restrict,
  name          text not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index teams_office_name_key on teams (office_id, lower(name));
create index teams_office_idx on teams (office_id);

-- ---------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------
create table users (
  id                uuid primary key default gen_random_uuid(),
  email             text not null,
  full_name         text not null,
  display_name      text,
  phone             text,
  job_title         text,
  office_id         uuid references offices(id) on delete set null,
  team_id           uuid references teams(id) on delete set null,
  -- 'invited' users have not yet set a password and cannot sign in.
  status            text not null default 'invited'
                      check (status in ('invited','active','suspended','disabled')),
  password_hash     text,
  password_set_at   timestamptz,
  last_login_at     timestamptz,
  failed_logins     integer not null default 0,
  locked_until      timestamptz,
  is_active         boolean generated always as (status = 'active') stored,
  created_at        timestamptz not null default now(),
  created_by        uuid references users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references users(id) on delete set null,
  row_version       integer not null default 1
);
create unique index users_email_key on users (lower(email));
create index users_office_idx on users (office_id);
create index users_status_idx on users (status);

-- ---------------------------------------------------------------------
-- Roles and granular permissions
-- ---------------------------------------------------------------------
create table roles (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  description   text,
  is_system     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

create table permissions (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  category      text not null,
  description   text,
  is_sensitive  boolean not null default false,
  sort_order    integer not null default 0
);

create table role_permissions (
  role_id       uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table user_roles (
  user_id       uuid not null references users(id) on delete cascade,
  role_id       uuid not null references roles(id) on delete restrict,
  assigned_at   timestamptz not null default now(),
  assigned_by   uuid references users(id) on delete set null,
  primary key (user_id, role_id)
);
create index user_roles_role_idx on user_roles (role_id);

-- Per-user grant or deny on top of role permissions. A deny always wins,
-- which is what makes "Admin is not automatically granted FICA" expressible
-- without inventing a new role.
create table user_permission_overrides (
  user_id       uuid not null references users(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  effect        text not null check (effect in ('grant','deny')),
  reason        text,
  created_at    timestamptz not null default now(),
  created_by    uuid references users(id) on delete set null,
  primary key (user_id, permission_id)
);

-- ---------------------------------------------------------------------
-- Permission helper functions (SECURITY DEFINER: policies must not recurse)
-- ---------------------------------------------------------------------
create or replace function app.has_permission(p_code text) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  with me as (select app.current_user_id() as uid)
  select case
    when (select uid from me) is null then false
    when not exists (
      select 1 from users u, me where u.id = me.uid and u.status = 'active'
    ) then false
    when exists (
      select 1
      from user_permission_overrides o
      join permissions p on p.id = o.permission_id
      , me
      where o.user_id = me.uid and p.code = p_code and o.effect = 'deny'
    ) then false
    when exists (
      select 1
      from user_permission_overrides o
      join permissions p on p.id = o.permission_id
      , me
      where o.user_id = me.uid and p.code = p_code and o.effect = 'grant'
    ) then true
    else exists (
      select 1
      from user_roles ur
      join role_permissions rp on rp.role_id = ur.role_id
      join permissions p on p.id = rp.permission_id
      , me
      where ur.user_id = me.uid and p.code = p_code
    )
  end;
$$;
revoke all on function app.has_permission(text) from public;
grant execute on function app.has_permission(text) to grlp_app;

create or replace function app.is_authenticated() returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select exists (
    select 1 from users u
    where u.id = app.current_user_id() and u.status = 'active'
  );
$$;
revoke all on function app.is_authenticated() from public;
grant execute on function app.is_authenticated() to grlp_app;

-- Company-wide visibility. Agents do not have it; management does.
create or replace function app.can_view_all() returns boolean
language sql stable as $$ select app.has_permission('DATA_VIEW_ALL'); $$;
grant execute on function app.can_view_all() to grlp_app;

-- The standard agent-scoping test used by every agent-owned table.
-- Unassigned records are visible only to company-wide users, so nothing
-- leaks into an agent's view by being left blank.
create or replace function app.can_access_agent_record(p_primary uuid, p_secondary uuid default null)
returns boolean language sql stable as $$
  select app.can_view_all()
      or (p_primary is not null and p_primary = app.current_user_id())
      or (p_secondary is not null and p_secondary = app.current_user_id());
$$;
grant execute on function app.can_access_agent_record(uuid, uuid) to grlp_app;

-- ---------------------------------------------------------------------
-- Shared triggers: updated_at and optimistic concurrency (row_version)
-- ---------------------------------------------------------------------
create or replace function app.touch_row() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if to_jsonb(new) ? 'row_version' then
    new.row_version := old.row_version + 1;
  end if;
  return new;
end;
$$;

create or replace function app.attach_touch(p_table regclass) returns void
language plpgsql as $$
begin
  execute format(
    'create trigger %I before update on %s for each row execute function app.touch_row()',
    'trg_touch_' || replace(p_table::text, '.', '_'), p_table);
end;
$$;

select app.attach_touch('users');
select app.attach_touch('offices');
select app.attach_touch('teams');

-- ---------------------------------------------------------------------
-- Sessions, login attempts, invitations
--
-- These are reached before a user id exists, so the application gets no
-- direct table access at all: only the SECURITY DEFINER functions below.
-- ---------------------------------------------------------------------
create table user_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  token_hash      text not null unique,
  issued_at       timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  ip_address      inet,
  user_agent      text
);
create index user_sessions_user_idx on user_sessions (user_id);
create index user_sessions_expiry_idx on user_sessions (expires_at);

create table login_attempts (
  id            bigserial primary key,
  email         text not null,
  ip_address    inet,
  succeeded     boolean not null,
  reason        text,
  attempted_at  timestamptz not null default now()
);
create index login_attempts_email_idx on login_attempts (lower(email), attempted_at desc);
create index login_attempts_ip_idx on login_attempts (ip_address, attempted_at desc);

create table user_invitations (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  full_name       text not null,
  role_id         uuid not null references roles(id) on delete restrict,
  office_id       uuid references offices(id) on delete set null,
  team_id         uuid references teams(id) on delete set null,
  token_hash      text not null unique,
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  accepted_user_id uuid references users(id) on delete set null,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now(),
  created_by      uuid references users(id) on delete set null
);
create index user_invitations_email_idx on user_invitations (lower(email));

-- ---------------------------------------------------------------------
-- Audit and sensitive-access logging (append only)
-- ---------------------------------------------------------------------
create table audit_logs (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid references users(id) on delete set null,
  actor_email   text,
  action        text not null,
  entity_type   text not null,
  entity_id     text,
  entity_label  text,
  -- Field-level before/after. Values that are sensitive are recorded as
  -- markers by the application, never as the underlying value.
  changes       jsonb,
  context       jsonb,
  ip_address    inet,
  user_agent    text
);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id, occurred_at desc);
create index audit_logs_actor_idx on audit_logs (actor_id, occurred_at desc);
create index audit_logs_occurred_idx on audit_logs (occurred_at desc);

create table sensitive_access_logs (
  id            bigserial primary key,
  occurred_at   timestamptz not null default now(),
  actor_id      uuid references users(id) on delete set null,
  actor_email   text,
  -- what was looked at, never the value that was looked at
  access_type   text not null,
  entity_type   text not null,
  entity_id     text,
  entity_label  text,
  reason        text,
  ip_address    inet,
  user_agent    text
);
create index sensitive_access_entity_idx on sensitive_access_logs (entity_type, entity_id, occurred_at desc);
create index sensitive_access_actor_idx on sensitive_access_logs (actor_id, occurred_at desc);

-- Append-only in the database, not merely by convention.
create or replace function app.deny_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'This log is append-only and cannot be % .', lower(tg_op)
    using errcode = 'insufficient_privilege';
end;
$$;
create trigger audit_logs_no_update before update or delete on audit_logs
  for each statement execute function app.deny_mutation();
create trigger sensitive_access_no_update before update or delete on sensitive_access_logs
  for each statement execute function app.deny_mutation();

-- ---------------------------------------------------------------------
-- Settings: every configurable business value lives here, never in code
-- ---------------------------------------------------------------------
create table settings (
  key           text primary key,
  value         jsonb not null,
  category      text not null default 'general',
  label         text not null,
  description   text,
  is_sensitive  boolean not null default false,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references users(id) on delete set null
);

-- ---------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------
create table notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  kind          text not null,
  title         text not null,
  body          text,
  entity_type   text,
  entity_id     text,
  href          text,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, read_at nulls first, created_at desc);

-- ---------------------------------------------------------------------
-- Grants
--
-- password_hash is deliberately excluded from the column grant: the
-- application can only reach it through app.auth_credentials().
-- ---------------------------------------------------------------------
grant select (id, email, full_name, display_name, phone, job_title, office_id,
              team_id, status, password_set_at, last_login_at, locked_until,
              is_active, created_at, created_by, updated_at, updated_by, row_version)
  on users to grlp_app;
grant insert, update, delete on users to grlp_app;

grant select, insert, update, delete on offices, teams to grlp_app;
grant select on roles, permissions, role_permissions to grlp_app;
grant select, insert, delete on user_roles to grlp_app;
grant select, insert, update, delete on user_permission_overrides to grlp_app;
grant select, insert, update, delete on user_invitations to grlp_app;
grant select, insert on audit_logs, sensitive_access_logs to grlp_app;
grant usage on sequence audit_logs_id_seq, sensitive_access_logs_id_seq to grlp_app;
grant select, insert, update on settings to grlp_app;
grant select, insert, update, delete on notifications to grlp_app;

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------
alter table users enable row level security;
alter table offices enable row level security;
alter table teams enable row level security;
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table user_roles enable row level security;
alter table user_permission_overrides enable row level security;
alter table user_invitations enable row level security;
alter table audit_logs enable row level security;
alter table sensitive_access_logs enable row level security;
alter table settings enable row level security;
alter table notifications enable row level security;

-- Any signed-in user may read the staff directory (agent pickers need it),
-- but only USERS_ADMIN may change it.
create policy users_select on users for select using (app.is_authenticated());
create policy users_insert on users for insert with check (app.has_permission('USERS_ADMIN'));
create policy users_update on users for update
  using (app.has_permission('USERS_ADMIN') or id = app.current_user_id())
  with check (app.has_permission('USERS_ADMIN') or id = app.current_user_id());
create policy users_delete on users for delete using (false);

create policy offices_select on offices for select using (app.is_authenticated());
create policy offices_write on offices for all
  using (app.has_permission('SETTINGS_ADMIN')) with check (app.has_permission('SETTINGS_ADMIN'));
create policy teams_select on teams for select using (app.is_authenticated());
create policy teams_write on teams for all
  using (app.has_permission('SETTINGS_ADMIN')) with check (app.has_permission('SETTINGS_ADMIN'));

create policy roles_select on roles for select using (app.is_authenticated());
create policy permissions_select on permissions for select using (app.is_authenticated());
create policy role_permissions_select on role_permissions for select using (app.is_authenticated());

create policy user_roles_select on user_roles for select using (app.is_authenticated());
create policy user_roles_write on user_roles for all
  using (app.has_permission('USERS_ADMIN')) with check (app.has_permission('USERS_ADMIN'));

create policy user_overrides_select on user_permission_overrides for select
  using (app.has_permission('USERS_ADMIN') or user_id = app.current_user_id());
create policy user_overrides_write on user_permission_overrides for all
  using (app.has_permission('USERS_ADMIN')) with check (app.has_permission('USERS_ADMIN'));

create policy invitations_rw on user_invitations for all
  using (app.has_permission('USERS_ADMIN')) with check (app.has_permission('USERS_ADMIN'));

create policy audit_select on audit_logs for select using (app.has_permission('AUDIT_LOG_VIEW'));
create policy audit_insert on audit_logs for insert with check (app.is_authenticated());
create policy sensitive_select on sensitive_access_logs for select using (app.has_permission('AUDIT_LOG_VIEW'));
create policy sensitive_insert on sensitive_access_logs for insert with check (app.is_authenticated());

create policy settings_select on settings for select
  using (app.is_authenticated() and (not is_sensitive or app.has_permission('SETTINGS_ADMIN')));
create policy settings_write on settings for all
  using (app.has_permission('SETTINGS_ADMIN')) with check (app.has_permission('SETTINGS_ADMIN'));

create policy notifications_own on notifications for all
  using (user_id = app.current_user_id()) with check (user_id = app.current_user_id());
