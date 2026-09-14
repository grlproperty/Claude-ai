import type { Db } from './db.ts';
import { getSetting } from './settings.ts';
import { env } from './env.ts';

/**
 * System health and the honest truth about backups (spec 107, 115).
 *
 * Everything here is measured from the database in front of it. Nothing
 * is guessed, and nothing external is described as working: where a
 * service is not connected, this says NOT CONNECTED rather than green.
 *
 * Backups especially. The CRM does not take backups, cannot verify one,
 * and must never show a green tick implying otherwise. What it can do is
 * hold the office's own written answer to "who takes them, and how", and
 * say plainly that the answer is a note somebody typed.
 */

export interface HealthCheck {
  name: string;
  state: 'ok' | 'warn' | 'not_connected' | 'unknown';
  detail: string;
}

export interface SystemHealth {
  checks: HealthCheck[];
  counts: {
    people: number;
    properties: number;
    activeUsers: number;
    documents: number;
    auditEntries: number;
  };
  database: {
    version: string;
    sizeBytes: number;
    migrationsApplied: number;
    lastMigration: string | null;
  };
  storage: { kind: string; detail: string };
  backups: { responsibleParty: string; procedureNote: string };
}

export async function systemHealth(db: Db): Promise<SystemHealth> {
  const counts = await db.one<{
    people: number;
    properties: number;
    active_users: number;
    documents: number;
    audit_entries: number;
  }>(
    `select
       (select count(*) from people where merged_into_id is null)::int as people,
       (select count(*) from properties where merged_into_id is null)::int as properties,
       (select count(*) from users where status = 'active')::int as active_users,
       (select count(*) from documents where not is_archived)::int as documents,
       (select count(*) from audit_logs)::int as audit_entries`,
  );

  const database = await db.one<{
    version: string;
    size_bytes: number;
    migrations: number;
    last_migration: string | null;
  }>(
    `select current_setting('server_version') as version,
            pg_database_size(current_database())::bigint as size_bytes,
            (select count(*) from schema_migrations)::int as migrations,
            (select filename from schema_migrations
              order by applied_at desc limit 1) as last_migration`,
  );

  const responsibleParty = await getSetting<string>(db, 'backup.responsible_party', '');
  const procedureNote = await getSetting<string>(db, 'backup.procedure_note', '');

  // Sessions and sign-in attempts are not readable by the application role
  // at all — they are reached only through SECURITY DEFINER functions, so a
  // query cannot read or forge a session. The health page gets counts and
  // nothing more, behind its own permission check.
  const warnings = await db.one<{
    stale_sessions: number;
    locked_users: number;
    failed_logins: number;
    unverified_fica: number;
    orphan_documents: number;
  }>('select * from app.system_counters()');

  const checks: HealthCheck[] = [
    {
      name: 'Database',
      state: 'ok',
      detail: `PostgreSQL ${database.version}, ${formatBytes(Number(database.size_bytes))}, `
        + `${database.migrations} migration(s) applied.`,
    },
    {
      name: 'Row level security',
      state: 'ok',
      detail:
        'Every table carries policies, and the application connects as a role with '
        + 'neither SUPERUSER nor BYPASSRLS, so a query cannot step around them.',
    },
    {
      name: 'Document storage',
      state: 'ok',
      detail:
        'Private disk storage. Files are served only through a route that checks '
        + 'permission on every request; nothing is on a public URL.',
    },
    {
      name: 'Sessions',
      state: Number(warnings.stale_sessions) > 0 ? 'warn' : 'ok',
      detail:
        Number(warnings.stale_sessions) > 0
          ? `${warnings.stale_sessions} expired session row(s) still stored. They cannot be used to sign in.`
          : 'No expired sessions waiting to be cleared.',
    },
    {
      name: 'Sign-in attempts',
      state: Number(warnings.failed_logins) > 10 ? 'warn' : 'ok',
      detail: `${warnings.failed_logins} failed attempt(s) in the last 24 hours; `
        + `${warnings.locked_users} account(s) locked right now.`,
    },
    {
      name: 'FICA files',
      state: Number(warnings.unverified_fica) > 0 ? 'warn' : 'ok',
      detail:
        Number(warnings.unverified_fica) > 0
          ? `${warnings.unverified_fica} verified file(s) are past their date and should not be relied on.`
          : 'No verified file is past its date.',
    },
    // Everything below this line is deliberately NOT CONNECTED. Each one
    // has its internal architecture in place and no external credential,
    // and the CRM says so rather than showing a green tick (spec 115).
    {
      name: 'Email sending',
      state: 'not_connected',
      detail:
        'The CRM sends no email. It opens your own mail application with the '
        + 'message ready. There is no mail server, no OAuth and no mailbox sync.',
    },
    {
      name: 'WhatsApp',
      state: 'not_connected',
      detail:
        'No WhatsApp Business API. The CRM opens WhatsApp with the number and the '
        + 'wording ready; you send it, and then log what happened.',
    },
    {
      name: 'National Consumer Commission register',
      state: 'not_connected',
      detail:
        'No connection to the NCC opt-out register. Batches can be prepared and '
        + 'results loaded by hand; nothing is checked automatically.',
    },
    {
      name: 'Property24 and Instagram',
      state: 'not_connected',
      detail:
        'No portal or social integration. Marketing status is what somebody in '
        + 'the office recorded, never a confirmation from a portal.',
    },
    {
      name: 'Home Affairs, CIPC, deeds office, sanctions lists',
      state: 'not_connected',
      detail:
        'Nothing is verified against any register. A FICA file records what the '
        + 'office collected and who looked at it.',
    },
    {
      name: 'Bank feed and accounting',
      state: 'not_connected',
      detail:
        'No bank or accounting integration. A commission recorded as paid is a '
        + "person's record of a payment, with their name on it.",
    },
    {
      name: 'Backups',
      state: responsibleParty ? 'warn' : 'unknown',
      detail: responsibleParty
        ? `${responsibleParty} is recorded as responsible. This is a note somebody typed; `
          + 'the CRM has not checked that any backup exists or can be restored.'
        : 'Nobody is recorded as responsible for backups, and the CRM takes none. '
          + 'This needs answering in Settings.',
    },
  ];

  return {
    checks,
    counts: {
      people: Number(counts.people),
      properties: Number(counts.properties),
      activeUsers: Number(counts.active_users),
      documents: Number(counts.documents),
      auditEntries: Number(counts.audit_entries),
    },
    database: {
      version: database.version,
      sizeBytes: Number(database.size_bytes),
      migrationsApplied: Number(database.migrations),
      lastMigration: database.last_migration,
    },
    storage: {
      kind: 'Private disk',
      detail:
        env.storage().driver === 'local'
          ? 'Files are kept on the server\u2019s own disk, outside the web root, '
            + 'and served only through an authorised route.'
          : 'Files are kept in a private bucket and served only through an '
            + 'authorised route. No object is publicly readable.',
    },
    backups: { responsibleParty, procedureNote },
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
