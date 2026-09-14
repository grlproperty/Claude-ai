import type { Ctx } from './actor.ts';
import type { Db } from './db.ts';
import { holds } from './actor.ts';
import { ForbiddenError, ValidationError } from './errors.ts';
import { getNumberSetting } from './settings.ts';
import { recordAudit } from './audit.ts';
import { safeFilename, toCsv } from './csv.ts';

/**
 * Exports (spec 98, and spec 15 above all).
 *
 * An export is the one operation that takes data past every policy
 * protecting it. Three rules follow, and none of them is optional:
 *
 *   1. An identity number is never exported. Not masked, not hashed, not
 *      "for authorised users" — the column does not exist in any export
 *      this module can produce, because a spreadsheet leaves the CRM and
 *      nothing here can follow it.
 *   2. Every export is written to a log that cannot be altered or
 *      deleted: who, what, how many rows, which columns, and under which
 *      filters.
 *   3. Row level security still applies. An agent exports the records
 *      they may see and nothing else, because the query runs on their own
 *      connection.
 *
 * Values are escaped against formula injection in csv.ts, so a cell
 * beginning with =, +, - or @ cannot execute when the file is opened.
 */

export interface ExportRequest {
  entityType: string;
  /** Headings in order, exactly as they will appear in the file. */
  columns: { key: string; header: string }[];
  rows: Record<string, unknown>[];
  /** The filters in force. Never any actual data. */
  filters?: Record<string, unknown>;
}

export interface ExportResult {
  filename: string;
  csv: string;
  rowCount: number;
}

/** Column headings no export may carry, whatever the caller asks for. */
const FORBIDDEN_COLUMNS = [
  'id number',
  'identity number',
  'id_number',
  'idnumber',
  'sa id',
  'passport number',
  'passport_number',
  'id fingerprint',
  'password',
  'password_hash',
  'token',
];

export function refusesColumn(heading: string): boolean {
  const needle = heading.trim().toLowerCase();
  return FORBIDDEN_COLUMNS.some((forbidden) => needle === forbidden || needle.includes(forbidden));
}

/**
 * Builds a CSV and records that it was taken.
 *
 * The log is written in the same transaction as the read, so an export
 * that reaches the user is always an export that was logged.
 */
export async function buildExport(
  db: Db,
  ctx: Ctx,
  request: ExportRequest,
): Promise<ExportResult> {
  if (!holds(ctx.actor, 'REPORTS_EXPORT')) throw new ForbiddenError('exports');

  const offending = request.columns.find(
    (column) => refusesColumn(column.header) || refusesColumn(column.key),
  );
  if (offending) {
    // Refused rather than dropped, so a caller cannot quietly ship it by
    // renaming the heading and hoping.
    throw new ValidationError(
      { columns: [`"${offending.header}" may not be exported.`] },
      'Identity numbers, passport numbers and credentials are never exported.',
    );
  }

  const maxRows = await getNumberSetting(db, 'export.max_rows', 10_000);
  if (request.rows.length > maxRows) {
    throw new ValidationError(
      { rows: [`That is ${request.rows.length} rows; the office limit is ${maxRows}.`] },
      'Narrow the filters and export again, rather than taking the whole database out at once.',
    );
  }

  const csv = toCsv(request.columns, request.rows);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = safeFilename(`grlp-${request.entityType}-${stamp}`, 'csv');

  await db.query(
    `insert into export_logs
       (user_id, entity_type, format, row_count, columns, filters,
        included_identity, ip, user_agent)
     values ($1,$2,'csv',$3,$4::text[],$5::jsonb,false,$6,$7)`,
    [
      ctx.actor.id,
      request.entityType,
      request.rows.length,
      request.columns.map((column) => column.header),
      JSON.stringify(request.filters ?? {}),
      ctx.meta.ip,
      ctx.meta.userAgent,
    ],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'data.exported',
    entityType: 'export',
    entityId: request.entityType,
    context: {
      rows: request.rows.length,
      columns: request.columns.map((column) => column.header),
      filters: request.filters ?? {},
    },
  });

  return { filename, csv, rowCount: request.rows.length };
}

export interface ExportLogRow {
  id: number;
  userName: string | null;
  entityType: string;
  rowCount: number;
  columns: string[];
  filters: Record<string, unknown> | null;
  includedIdentity: boolean;
  ip: string | null;
  createdAt: string;
}

export async function listExportLog(db: Db, limit = 100): Promise<ExportLogRow[]> {
  const rows = await db.query<{
    id: number;
    user_name: string | null;
    entity_type: string;
    row_count: number;
    columns: string[];
    filters: Record<string, unknown> | null;
    included_identity: boolean;
    ip: string | null;
    created_at: Date;
  }>(
    `select e.id, coalesce(u.display_name, u.full_name) as user_name,
            e.entity_type, e.row_count, e.columns, e.filters,
            e.included_identity, e.ip::text as ip, e.created_at
       from export_logs e
       left join users u on u.id = e.user_id
      order by e.created_at desc limit $1`,
    [Math.min(limit, 500)],
  );

  return rows.map((row) => ({
    id: Number(row.id),
    userName: row.user_name,
    entityType: row.entity_type,
    rowCount: Number(row.row_count),
    columns: row.columns ?? [],
    filters: row.filters,
    includedIdentity: row.included_identity,
    ip: row.ip,
    createdAt: row.created_at.toISOString(),
  }));
}
