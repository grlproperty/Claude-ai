-- =====================================================================
-- 002 ACCESS CONTROL
-- The five GRLP roles, the granular permission catalogue, and the
-- pre-authentication entry points.
--
-- Sessions, login attempts and invitation acceptance all happen before a
-- user id exists, so the application is given no direct table access to
-- them at all -- only the SECURITY DEFINER functions in this file. That
-- is also why users.password_hash was left out of the column grant in 001.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Permission catalogue
-- ---------------------------------------------------------------------
insert into permissions (code, name, category, description, is_sensitive, sort_order) values
  ('PEOPLE_VIEW',          'View people',              'People',        'See client and contact records',            false, 10),
  ('PEOPLE_CREATE',        'Create people',            'People',        'Add new client records',                    false, 11),
  ('PEOPLE_EDIT',          'Edit people',              'People',        'Change client records',                     false, 12),
  ('PEOPLE_DELETE',        'Archive people',           'People',        'Archive client records',                    false, 13),

  ('PROPERTIES_VIEW',      'View properties',          'Properties',    'See property records',                      false, 20),
  ('PROPERTIES_CREATE',    'Create properties',        'Properties',    'Add new property records',                  false, 21),
  ('PROPERTIES_EDIT',      'Edit properties',          'Properties',    'Change property records',                   false, 22),
  ('PROPERTIES_DELETE',    'Archive properties',       'Properties',    'Archive property records',                  false, 23),

  ('SALES_VIEW',           'View sales',               'Sales',         'See sales pipeline and transactions',       false, 30),
  ('SALES_CREATE',         'Create sales',             'Sales',         'Create offers and transactions',            false, 31),
  ('SALES_EDIT',           'Edit sales',               'Sales',         'Change offers and transactions',            false, 32),
  ('SALES_DELETE',         'Cancel sales',             'Sales',         'Cancel or archive sales records',           false, 33),

  ('RENTALS_VIEW',         'View rentals',             'Rentals',       'See rentals and applications',              false, 40),
  ('RENTALS_CREATE',       'Create rentals',           'Rentals',       'Create rental applications and leases',     false, 41),
  ('RENTALS_EDIT',         'Edit rentals',             'Rentals',       'Change rental records',                     false, 42),
  ('RENTALS_DELETE',       'Cancel rentals',           'Rentals',       'Cancel or archive rental records',          false, 43),

  ('LEADS_VIEW',           'View leads',               'Leads',         'See leads',                                 false, 50),
  ('LEADS_CREATE',         'Create leads',             'Leads',         'Add leads',                                 false, 51),
  ('LEADS_EDIT',           'Edit leads',               'Leads',         'Change leads',                              false, 52),
  ('LEADS_DELETE',         'Archive leads',            'Leads',         'Archive leads',                             false, 53),

  ('TASKS_VIEW',           'View tasks',               'Tasks',         'See tasks and appointments',                false, 60),
  ('TASKS_CREATE',         'Create tasks',             'Tasks',         'Add tasks and appointments',                false, 61),
  ('TASKS_EDIT',           'Edit tasks',               'Tasks',         'Change tasks and appointments',             false, 62),
  ('TASKS_DELETE',         'Cancel tasks',             'Tasks',         'Cancel tasks and appointments',             false, 63),

  ('IMPORT_VIEW',          'View imports',             'Import',        'See import history',                        false, 70),
  ('IMPORT_CREATE',        'Run imports',              'Import',        'Upload and run data imports',               false, 71),

  ('COMMUNICATION_VIEW',   'View communications',      'Communication', 'See the communication log',                 false, 80),
  ('COMMUNICATION_CREATE', 'Log communications',       'Communication', 'Record contact with a client',              false, 81),

  ('FICA_VIEW',            'View FICA',                'FICA',          'See FICA records and documents',            true,  90),
  ('FICA_CREATE',          'Create FICA',              'FICA',          'Start FICA verification',                   true,  91),
  ('FICA_EDIT',            'Edit FICA',                'FICA',          'Change FICA records and outcomes',          true,  92),

  ('COMPLIANCE_VIEW',      'View compliance',          'Compliance',    'See contact permissions and DNC',           false, 100),
  ('COMPLIANCE_CREATE',    'Create compliance',        'Compliance',    'Record permissions, evidence and DNC',      false, 101),
  ('COMPLIANCE_EDIT',      'Edit compliance',          'Compliance',    'Change or withdraw permissions',            false, 102),

  ('NCC_ADMIN',            'NCC administration',       'Compliance',    'Manage NCC records and cleansing batches',  false, 110),
  ('MARKETING_ADMIN',      'Marketing administration', 'Marketing',     'Manage property marketing and channels',    false, 120),

  ('COMMISSION_VIEW',      'View commission',          'Commission',    'See commission records',                    true,  130),
  ('COMMISSION_CREATE',    'Create commission',        'Commission',    'Create commission calculations',            true,  131),
  ('COMMISSION_EDIT',      'Edit commission',          'Commission',    'Change commission calculations',            true,  132),
  ('COMMISSION_APPROVE',   'Approve commission',       'Commission',    'Approve and mark commission paid',          true,  133),

  ('REPORTS_VIEW',         'View reports',             'Reports',       'See reporting',                             false, 140),
  ('REPORTS_EXPORT',       'Export reports',           'Reports',       'Export report data',                        false, 141),

  ('USERS_ADMIN',          'User administration',      'Administration','Invite, disable and re-role users',         true,  150),
  ('SETTINGS_ADMIN',       'Settings administration',  'Administration','Change company settings and rules',         true,  151),
  ('AUDIT_LOG_VIEW',       'View audit log',           'Administration','See the audit and sensitive access logs',   true,  152),

  -- Scope and sensitivity permissions. These are not in addition to the
  -- catalogue above for their own sake: they are what separates "own
  -- records" from "company-wide", and ordinary data from protected data.
  ('DATA_VIEW_ALL',        'Company-wide access',      'Scope',         'See records belonging to every agent',      false, 160),
  ('PERSON_ID_VIEW',       'View full ID numbers',     'Scope',         'Unmask South African ID and passport numbers', true, 161),
  ('MERGE_RECORDS',        'Merge records',            'Scope',         'Merge duplicate people and properties',     false, 162),
  ('EXPORT_SENSITIVE',     'Export sensitive data',    'Scope',         'Include protected fields in exports',       true,  163);

-- ---------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------
insert into roles (code, name, description, sort_order) values
  ('MANAGEMENT', 'Management',           'Company-wide access, user management, reporting, commission, compliance and audit.', 10),
  ('ADMIN',      'Admin',                'Day to day CRM administration. Not automatically given FICA or financial access.',   20),
  ('ACCOUNTS',   'Accounts / FICA Officer','Financial, FICA and compliance access.',                                           30),
  ('AGENT',      'Agent',                'Own and assigned clients, properties, leads, tasks and commission.',                  40),
  ('LIMITED',    'Limited / Support',    'Restricted operational access.',                                                      50);

-- Management: everything.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p where r.code = 'MANAGEMENT';

-- Admin: full CRM administration, company-wide, but no FICA, no commission,
-- no user or settings administration, no ID unmasking, no audit log.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in (
  'PEOPLE_VIEW','PEOPLE_CREATE','PEOPLE_EDIT','PEOPLE_DELETE',
  'PROPERTIES_VIEW','PROPERTIES_CREATE','PROPERTIES_EDIT','PROPERTIES_DELETE',
  'SALES_VIEW','SALES_CREATE','SALES_EDIT',
  'RENTALS_VIEW','RENTALS_CREATE','RENTALS_EDIT',
  'LEADS_VIEW','LEADS_CREATE','LEADS_EDIT','LEADS_DELETE',
  'TASKS_VIEW','TASKS_CREATE','TASKS_EDIT','TASKS_DELETE',
  'IMPORT_VIEW','IMPORT_CREATE',
  'COMMUNICATION_VIEW','COMMUNICATION_CREATE',
  'COMPLIANCE_VIEW','COMPLIANCE_CREATE','COMPLIANCE_EDIT',
  'MARKETING_ADMIN','REPORTS_VIEW','REPORTS_EXPORT',
  'DATA_VIEW_ALL','MERGE_RECORDS'
) where r.code = 'ADMIN';

-- Accounts / FICA officer: authorised financial, FICA and compliance access.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in (
  'PEOPLE_VIEW','PROPERTIES_VIEW','SALES_VIEW','RENTALS_VIEW','LEADS_VIEW',
  'TASKS_VIEW','TASKS_CREATE','TASKS_EDIT',
  'COMMUNICATION_VIEW','COMMUNICATION_CREATE',
  'FICA_VIEW','FICA_CREATE','FICA_EDIT',
  'COMPLIANCE_VIEW','COMPLIANCE_CREATE','COMPLIANCE_EDIT','NCC_ADMIN',
  'COMMISSION_VIEW','COMMISSION_CREATE','COMMISSION_EDIT',
  'REPORTS_VIEW','REPORTS_EXPORT','EXPORT_SENSITIVE',
  'DATA_VIEW_ALL','PERSON_ID_VIEW'
) where r.code = 'ACCOUNTS';

-- Agent: own and assigned records only. No DATA_VIEW_ALL, so RLS confines
-- every query to records where the agent is primary or secondary.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in (
  'PEOPLE_VIEW','PEOPLE_CREATE','PEOPLE_EDIT',
  'PROPERTIES_VIEW','PROPERTIES_CREATE','PROPERTIES_EDIT',
  'SALES_VIEW','SALES_CREATE','SALES_EDIT',
  'RENTALS_VIEW','RENTALS_CREATE','RENTALS_EDIT',
  'LEADS_VIEW','LEADS_CREATE','LEADS_EDIT',
  'TASKS_VIEW','TASKS_CREATE','TASKS_EDIT','TASKS_DELETE',
  'COMMUNICATION_VIEW','COMMUNICATION_CREATE',
  'COMPLIANCE_VIEW','COMPLIANCE_CREATE',
  'COMMISSION_VIEW',
  'REPORTS_VIEW'
) where r.code = 'AGENT';

-- Limited / support: restricted operational access.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.code in (
  'PEOPLE_VIEW','PROPERTIES_VIEW','LEADS_VIEW',
  'TASKS_VIEW','TASKS_CREATE','TASKS_EDIT',
  'COMMUNICATION_VIEW','COMMUNICATION_CREATE'
) where r.code = 'LIMITED';

-- ---------------------------------------------------------------------
-- Pre-authentication entry points
-- ---------------------------------------------------------------------

-- True while no user has ever activated. Guards first-run setup.
create or replace function app.bootstrap_needed() returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select not exists (select 1 from users where status = 'active');
$$;

-- Creates the very first Management user. The advisory lock plus the
-- re-check inside the transaction means two simultaneous first visitors
-- cannot both become Management.
create or replace function app.bootstrap_management(
  p_email text, p_full_name text, p_password_hash text
) returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_user_id uuid;
  v_role_id uuid;
  v_office_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('grlp_bootstrap'));
  if exists (select 1 from users where status = 'active') then
    raise exception 'Setup has already been completed.' using errcode = 'unique_violation';
  end if;

  select id into v_office_id from offices order by created_at limit 1;
  if v_office_id is null then
    insert into offices (name) values ('Garden Route Lifestyle Property') returning id into v_office_id;
  end if;

  select id into v_role_id from roles where code = 'MANAGEMENT';

  insert into users (email, full_name, status, password_hash, password_set_at, office_id)
  values (lower(p_email), p_full_name, 'active', p_password_hash, now(), v_office_id)
  on conflict (lower(email)) do update
    set status = 'active', password_hash = excluded.password_hash,
        password_set_at = now(), full_name = excluded.full_name
  returning id into v_user_id;

  insert into user_roles (user_id, role_id) values (v_user_id, v_role_id)
  on conflict do nothing;

  return v_user_id;
end;
$$;

-- Returns the stored credential for one email address. This is the only
-- route to password_hash; the column is not granted to the app role.
create or replace function app.auth_credentials(p_email text)
returns table (
  user_id uuid, email text, full_name text, status text,
  password_hash text, locked_until timestamptz, failed_logins integer
)
language sql stable security definer set search_path = public, app, pg_temp as $$
  select u.id, u.email, u.full_name, u.status, u.password_hash, u.locked_until, u.failed_logins
  from users u where lower(u.email) = lower(p_email);
$$;

-- Records the outcome of a sign-in attempt and maintains the lockout counter.
create or replace function app.auth_record_attempt(
  p_email text, p_ip inet, p_ok boolean, p_reason text,
  p_max_failures integer default 8, p_lock_minutes integer default 15
) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  insert into login_attempts (email, ip_address, succeeded, reason)
  values (lower(p_email), p_ip, p_ok, p_reason);

  if p_ok then
    update users set failed_logins = 0, locked_until = null, last_login_at = now()
    where lower(email) = lower(p_email);
  else
    update users
      set failed_logins = failed_logins + 1,
          locked_until = case when failed_logins + 1 >= p_max_failures
                              then now() + make_interval(mins => p_lock_minutes)
                              else locked_until end
    where lower(email) = lower(p_email);
  end if;
end;
$$;

-- Failed attempts from one address in a window, for request rate limiting.
create or replace function app.auth_recent_failures(p_ip inet, p_seconds integer)
returns integer
language sql stable security definer set search_path = public, app, pg_temp as $$
  select count(*)::integer from login_attempts
  where ip_address is not distinct from p_ip
    and not succeeded
    and attempted_at > now() - make_interval(secs => p_seconds);
$$;

create or replace function app.session_create(
  p_user_id uuid, p_token_hash text, p_expires_at timestamptz, p_ip inet, p_user_agent text
) returns uuid
language sql security definer set search_path = public, app, pg_temp as $$
  insert into user_sessions (user_id, token_hash, expires_at, ip_address, user_agent)
  values (p_user_id, p_token_hash, p_expires_at, p_ip, p_user_agent)
  returning id;
$$;

-- Resolves a session cookie to the signed-in user plus their effective
-- permissions. A suspended or disabled user resolves to nothing, so
-- disabling an account ends access immediately rather than at expiry.
create or replace function app.session_load(p_token_hash text)
returns table (
  session_id uuid, user_id uuid, email text, full_name text, display_name text,
  status text, office_id uuid, team_id uuid, expires_at timestamptz,
  role_codes text[], permission_codes text[]
)
language sql stable security definer set search_path = public, app, pg_temp as $$
  select
    s.id, u.id, u.email, u.full_name, u.display_name, u.status,
    u.office_id, u.team_id, s.expires_at,
    coalesce((select array_agg(r.code order by r.sort_order)
              from user_roles ur join roles r on r.id = ur.role_id
              where ur.user_id = u.id), '{}'::text[]),
    coalesce((
      select array_agg(distinct code) from (
        select p.code
        from user_roles ur
        join role_permissions rp on rp.role_id = ur.role_id
        join permissions p on p.id = rp.permission_id
        where ur.user_id = u.id
        union
        select p.code
        from user_permission_overrides o
        join permissions p on p.id = o.permission_id
        where o.user_id = u.id and o.effect = 'grant'
        except
        select p.code
        from user_permission_overrides o
        join permissions p on p.id = o.permission_id
        where o.user_id = u.id and o.effect = 'deny'
      ) eff
    ), '{}'::text[])
  from user_sessions s
  join users u on u.id = s.user_id
  where s.token_hash = p_token_hash
    and s.revoked_at is null
    and s.expires_at > now()
    and u.status = 'active';
$$;

create or replace function app.session_touch(p_token_hash text) returns void
language sql security definer set search_path = public, app, pg_temp as $$
  update user_sessions set last_seen_at = now()
  where token_hash = p_token_hash and revoked_at is null;
$$;

create or replace function app.session_revoke(p_token_hash text) returns void
language sql security definer set search_path = public, app, pg_temp as $$
  update user_sessions set revoked_at = now()
  where token_hash = p_token_hash and revoked_at is null;
$$;

create or replace function app.session_revoke_all(p_user_id uuid) returns void
language sql security definer set search_path = public, app, pg_temp as $$
  update user_sessions set revoked_at = now()
  where user_id = p_user_id and revoked_at is null;
$$;

-- Invitation details for the "choose your password" screen. Deliberately
-- returns no token and nothing sensitive.
create or replace function app.invitation_load(p_token_hash text)
returns table (invitation_id uuid, email text, full_name text, role_name text, expires_at timestamptz)
language sql stable security definer set search_path = public, app, pg_temp as $$
  select i.id, i.email, i.full_name, r.name, i.expires_at
  from user_invitations i join roles r on r.id = i.role_id
  where i.token_hash = p_token_hash
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now();
$$;

-- Accepting an invitation creates the user, applies the invited role and
-- burns the token, all in one transaction.
create or replace function app.invitation_accept(p_token_hash text, p_password_hash text)
returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  v_inv user_invitations%rowtype;
  v_user_id uuid;
begin
  select * into v_inv from user_invitations
  where token_hash = p_token_hash and accepted_at is null and revoked_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'This invitation is no longer valid.' using errcode = 'no_data_found';
  end if;

  insert into users (email, full_name, status, password_hash, password_set_at, office_id, team_id, created_by)
  values (lower(v_inv.email), v_inv.full_name, 'active', p_password_hash, now(),
          v_inv.office_id, v_inv.team_id, v_inv.created_by)
  on conflict (lower(email)) do update
    set status = 'active', password_hash = excluded.password_hash, password_set_at = now()
  returning id into v_user_id;

  insert into user_roles (user_id, role_id, assigned_by)
  values (v_user_id, v_inv.role_id, v_inv.created_by)
  on conflict do nothing;

  update user_invitations
    set accepted_at = now(), accepted_user_id = v_user_id
  where id = v_inv.id;

  return v_user_id;
end;
$$;

-- Changing your own password, which also ends every other session.
create or replace function app.set_password(p_user_id uuid, p_password_hash text) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  update users
    set password_hash = p_password_hash, password_set_at = now(),
        failed_logins = 0, locked_until = null
  where id = p_user_id;
end;
$$;

revoke all on function app.bootstrap_needed() from public;
revoke all on function app.bootstrap_management(text, text, text) from public;
revoke all on function app.auth_credentials(text) from public;
revoke all on function app.auth_record_attempt(text, inet, boolean, text, integer, integer) from public;
revoke all on function app.auth_recent_failures(inet, integer) from public;
revoke all on function app.session_create(uuid, text, timestamptz, inet, text) from public;
revoke all on function app.session_load(text) from public;
revoke all on function app.session_touch(text) from public;
revoke all on function app.session_revoke(text) from public;
revoke all on function app.session_revoke_all(uuid) from public;
revoke all on function app.invitation_load(text) from public;
revoke all on function app.invitation_accept(text, text) from public;
revoke all on function app.set_password(uuid, text) from public;

grant execute on function app.bootstrap_needed() to grlp_app;
grant execute on function app.bootstrap_management(text, text, text) to grlp_app;
grant execute on function app.auth_credentials(text) to grlp_app;
grant execute on function app.auth_record_attempt(text, inet, boolean, text, integer, integer) to grlp_app;
grant execute on function app.auth_recent_failures(inet, integer) to grlp_app;
grant execute on function app.session_create(uuid, text, timestamptz, inet, text) to grlp_app;
grant execute on function app.session_load(text) to grlp_app;
grant execute on function app.session_touch(text) to grlp_app;
grant execute on function app.session_revoke(text) to grlp_app;
grant execute on function app.session_revoke_all(uuid) to grlp_app;
grant execute on function app.invitation_load(text) to grlp_app;
grant execute on function app.invitation_accept(text, text) to grlp_app;
grant execute on function app.set_password(uuid, text) to grlp_app;
