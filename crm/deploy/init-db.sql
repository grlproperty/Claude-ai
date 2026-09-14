-- ---------------------------------------------------------------------
-- The two database roles, and why there are two.
--
-- RUN THIS ONCE, as a superuser, before the first migration.
--
-- The whole authorisation model rests on the application connecting as a
-- role that cannot step around row level security:
--
--   * grlp_owner  owns the schema and runs migrations. Nothing serves a
--                 request as this role.
--   * grlp_app    serves every request. It has neither SUPERUSER nor
--                 BYPASSRLS, and — just as importantly — it does not own
--                 the tables, because a table's owner bypasses its own
--                 policies unless FORCE ROW LEVEL SECURITY is set.
--
-- Get this wrong and every policy in the schema becomes decoration.
-- ---------------------------------------------------------------------

-- CHANGE BOTH PASSWORDS. Generate them with:
--   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
\set owner_password 'CHANGE_ME_owner'
\set app_password   'CHANGE_ME_app'

create role grlp_owner login password :'owner_password';
create role grlp_app   login password :'app_password' nosuperuser nocreatedb nocreaterole noinherit nobypassrls;

create database grlp_crm owner grlp_owner encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0;

-- Only the owner may create things; the application is granted exactly what
-- each migration hands it, table by table and column by column.
revoke all on database grlp_crm from public;
grant connect on database grlp_crm to grlp_app;

\connect grlp_crm

revoke all on schema public from public;
alter schema public owner to grlp_owner;
grant usage on schema public to grlp_app;

-- Extensions the schema relies on, installed by a superuser because the
-- owner is deliberately not one.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- A sanity check worth reading the output of. If bypassrls is true for
-- grlp_app, stop and fix it: nothing else in this CRM protects anything.
select rolname, rolsuper, rolbypassrls, rolcreaterole
  from pg_roles where rolname in ('grlp_owner', 'grlp_app');
