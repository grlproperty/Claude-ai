-- ---------------------------------------------------------------------
-- Runs once, on first start of a fresh database volume.
--
-- The postgres image has already created grlp_owner and the database. All
-- that is left is the role every request actually uses — and the point of
-- it is what it cannot do.
--
-- grlp_app has no SUPERUSER, no BYPASSRLS, and does not own the tables. A
-- table's owner bypasses its own row level security policies, so if the
-- application connected as the owner every policy in the schema would be
-- decoration. This file is the reason it does not.
--
-- The password is substituted by the entrypoint from DB_APP_PASSWORD via
-- the app container's own connection string; set it in .env.production.
-- ---------------------------------------------------------------------
\set app_password `echo "$DB_APP_PASSWORD"`

create role grlp_app login password :'app_password'
  nosuperuser nocreatedb nocreaterole noinherit nobypassrls noreplication;

grant connect on database grlp_crm to grlp_app;
revoke all on schema public from public;
grant usage on schema public to grlp_app;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Worth reading in the container logs on first start. If rolbypassrls is
-- true for grlp_app, stop and fix it before putting any data in.
\echo '--- role check: rolbypassrls MUST be false for grlp_app ---'
select rolname, rolsuper, rolbypassrls, rolcreaterole
  from pg_roles where rolname in ('grlp_owner', 'grlp_app');
