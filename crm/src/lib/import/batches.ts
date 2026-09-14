import { z } from 'zod';
import type { Ctx } from '../actor.ts';
import type { Db } from '../db.ts';
import { recordAudit } from '../audit.ts';
import { ConcurrencyError, NotFoundError, ValidationError } from '../errors.ts';
import { getNumberSetting } from '../settings.ts';
import { optionalText, requiredText } from '../validate.ts';
import { SOURCE_SYSTEMS, type SourceSystem } from './fields.ts';
import {
  applyMapping,
  mappingProblems,
  suggestMapping,
  suggestionsToMapping,
  type Mapping,
} from './mapping.ts';
import type { ParsedSheet } from './parse.ts';

/**
 * An import as a record (spec 59, 65, 67, 69).
 *
 * The batch moves through draft, mapped, previewed and committed. Nothing is
 * written to a person or a property until commit, and commit is one
 * transaction: either the whole file lands or none of it does (spec 106). A
 * committed import can be rolled back, which reverses only the records it
 * created — never one a person has edited since without saying so.
 */

export type ImportStatus =
  | 'draft'
  | 'mapped'
  | 'previewed'
  | 'committed'
  | 'rolled_back'
  | 'cancelled'
  | 'failed';

export type RowAction = 'pending' | 'create' | 'update' | 'skip' | 'error';

export const IMPORT_STATUSES: Record<ImportStatus, string> = {
  draft: 'Draft',
  mapped: 'Columns matched',
  previewed: 'Checked, ready to import',
  committed: 'Imported',
  rolled_back: 'Rolled back',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

export const ROW_ACTIONS: Record<RowAction, string> = {
  pending: 'Not checked yet',
  create: 'New record',
  update: 'Update an existing record',
  skip: 'Leave alone',
  error: 'Cannot import',
};

export const newBatchSchema = z.object({
  name: requiredText('A name for this import', 120),
  entityType: z.enum(['person', 'property']),
  sourceSystem: z.enum(Object.keys(SOURCE_SYSTEMS) as ['generic', ...string[]]),
  notes: optionalText,
});
export type NewBatchInput = z.infer<typeof newBatchSchema>;

export interface ImportBatch {
  id: string;
  batchRef: string;
  name: string;
  entityType: 'person' | 'property';
  sourceKind: 'file' | 'paste' | 'url';
  sourceName: string | null;
  sourceUrl: string | null;
  sourceSystem: SourceSystem;
  contentHash: string | null;
  status: ImportStatus;
  headers: string[];
  mapping: Mapping;
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  previewedAt: string | null;
  committedAt: string | null;
  committedByName: string | null;
  rolledBackAt: string | null;
  rolledBackByName: string | null;
  rollbackReason: string | null;
  failureReason: string | null;
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
  rowVersion: number;
}

interface BatchDbRow {
  id: string;
  batch_ref: string;
  name: string;
  entity_type: 'person' | 'property';
  source_kind: 'file' | 'paste' | 'url';
  source_name: string | null;
  source_url: string | null;
  source_system: SourceSystem;
  content_hash: string | null;
  status: ImportStatus;
  headers: string[];
  mapping: Mapping;
  row_count: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  failed_count: number;
  previewed_at: Date | null;
  committed_at: Date | null;
  committed_by_name: string | null;
  rolled_back_at: Date | null;
  rolled_back_by_name: string | null;
  rollback_reason: string | null;
  failure_reason: string | null;
  notes: string | null;
  created_at: Date;
  created_by_name: string | null;
  row_version: number;
}

const BATCH_SQL = `
  select b.id, b.batch_ref, b.name, b.entity_type, b.source_kind, b.source_name,
         b.source_url, b.source_system, b.content_hash, b.status, b.headers, b.mapping,
         b.row_count, b.created_count, b.updated_count, b.skipped_count, b.failed_count,
         b.previewed_at, b.committed_at, b.rolled_back_at, b.rollback_reason,
         b.failure_reason, b.notes, b.created_at, b.row_version,
         coalesce(c.display_name, c.full_name) as created_by_name,
         coalesce(m.display_name, m.full_name) as committed_by_name,
         coalesce(r.display_name, r.full_name) as rolled_back_by_name
    from import_batches b
    left join users c on c.id = b.created_by
    left join users m on m.id = b.committed_by
    left join users r on r.id = b.rolled_back_by
`;

function toBatch(row: BatchDbRow): ImportBatch {
  return {
    id: row.id,
    batchRef: row.batch_ref,
    name: row.name,
    entityType: row.entity_type,
    sourceKind: row.source_kind,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    sourceSystem: row.source_system,
    contentHash: row.content_hash,
    status: row.status,
    headers: row.headers ?? [],
    mapping: row.mapping ?? {},
    rowCount: row.row_count,
    createdCount: row.created_count,
    updatedCount: row.updated_count,
    skippedCount: row.skipped_count,
    failedCount: row.failed_count,
    previewedAt: row.previewed_at?.toISOString() ?? null,
    committedAt: row.committed_at?.toISOString() ?? null,
    committedByName: row.committed_by_name,
    rolledBackAt: row.rolled_back_at?.toISOString() ?? null,
    rolledBackByName: row.rolled_back_by_name,
    rollbackReason: row.rollback_reason,
    failureReason: row.failure_reason,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    createdByName: row.created_by_name,
    rowVersion: row.row_version,
  };
}

export async function listImportBatches(
  db: Db,
  filters: { status?: string; entityType?: string; limit?: number } = {},
): Promise<ImportBatch[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.status && filters.status !== 'all') where.push(`b.status = ${add(filters.status)}`);
  if (filters.entityType && filters.entityType !== 'all') {
    where.push(`b.entity_type = ${add(filters.entityType)}`);
  }

  const rows = await db.query<BatchDbRow>(
    `${BATCH_SQL} where ${where.length > 0 ? where.join(' and ') : 'true'}
      order by b.created_at desc limit ${add(filters.limit ?? 100)}`,
    params,
  );
  return rows.map(toBatch);
}

export async function getImportBatch(db: Db, id: string): Promise<ImportBatch | null> {
  const row = await db.maybeOne<BatchDbRow>(`${BATCH_SQL} where b.id = $1`, [id]);
  return row ? toBatch(row) : null;
}

export interface ImportRow {
  id: string;
  rowNumber: number;
  raw: Record<string, string>;
  mapped: Record<string, string | string[]> | null;
  action: RowAction;
  actionReason: string | null;
  targetId: string | null;
  targetLabel: string | null;
  targetRef: string | null;
  errors: string[];
  committedAt: string | null;
  createdRecord: boolean;
}

export async function listImportRows(
  db: Db,
  batchId: string,
  filters: { action?: string; limit?: number; offset?: number } = {},
): Promise<ImportRow[]> {
  const where = ['r.batch_id = $1'];
  const params: unknown[] = [batchId];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.action && filters.action !== 'all') where.push(`r.action = ${add(filters.action)}`);

  const rows = await db.query<{
    id: string;
    row_number: number;
    raw: Record<string, string>;
    mapped: Record<string, string | string[]> | null;
    action: RowAction;
    action_reason: string | null;
    target_id: string | null;
    person_label: string | null;
    person_ref: string | null;
    property_label: string | null;
    property_ref: string | null;
    errors: string[];
    committed_at: Date | null;
    created_record: boolean;
  }>(
    `select r.id, r.row_number, r.raw, r.mapped, r.action, r.action_reason, r.target_id,
            r.errors, r.committed_at, r.created_record,
            pe.first_name || ' ' || pe.surname as person_label,
            pe.client_ref as person_ref,
            nullif(concat_ws(', ', pr.street_address, pr.suburb), '') as property_label,
            pr.property_ref as property_ref
       from import_rows r
       left join people pe on pe.id = r.target_id
       left join properties pr on pr.id = r.target_id
      where ${where.join(' and ')}
      order by r.row_number
      limit ${add(Math.min(500, filters.limit ?? 100))}
      offset ${add(filters.offset ?? 0)}`,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    rowNumber: row.row_number,
    raw: row.raw,
    mapped: row.mapped,
    action: row.action,
    actionReason: row.action_reason,
    targetId: row.target_id,
    targetLabel: row.person_label ?? row.property_label,
    targetRef: row.person_ref ?? row.property_ref,
    errors: row.errors ?? [],
    committedAt: row.committed_at?.toISOString() ?? null,
    createdRecord: row.created_record,
  }));
}

export async function importRowCounts(
  db: Db,
  batchId: string,
): Promise<Record<RowAction, number>> {
  const rows = await db.query<{ action: RowAction; n: number }>(
    'select action, count(*)::int as n from import_rows where batch_id = $1 group by action',
    [batchId],
  );
  const counts: Record<RowAction, number> = {
    pending: 0,
    create: 0,
    update: 0,
    skip: 0,
    error: 0,
  };
  for (const row of rows) counts[row.action] = row.n;
  return counts;
}

// ---------------------------------------------------------------------------
// Creating a batch from a parsed file
// ---------------------------------------------------------------------------

export interface CreateBatchResult {
  id: string;
  batchRef: string;
  warnings: string[];
  /** A previous import of the very same bytes, if there was one. */
  sameFileAs: { id: string; batchRef: string; committedAt: string | null } | null;
}

export async function createImportBatch(
  db: Db,
  ctx: Ctx,
  input: NewBatchInput & {
    sourceKind: 'file' | 'paste' | 'url';
    sourceName?: string | null;
    sourceUrl?: string | null;
  },
  sheet: ParsedSheet,
): Promise<CreateBatchResult> {
  const maxRows = await getNumberSetting(db, 'import.max_rows', 5000);
  if (sheet.rows.length === 0) {
    throw new ValidationError(
      { _form: ['That file has a heading row but no data.'] },
      'That file has a heading row but no data.',
    );
  }
  if (sheet.rows.length > maxRows) {
    throw new ValidationError(
      {
        _form: [
          `That file has ${sheet.rows.length} rows, and imports are limited to ${maxRows}. ` +
            'Please split it.',
        ],
      },
      `That file has more than ${maxRows} rows.`,
    );
  }

  // Has this exact file been through before (spec 68)? Told, not prevented:
  // re-importing a corrected file is a legitimate thing to do.
  const previous = await db.maybeOne<{ id: string; batch_ref: string; committed_at: Date | null }>(
    `select id, batch_ref, committed_at from import_batches
      where entity_type = $1 and content_hash = $2 and status <> 'cancelled'
      order by created_at desc limit 1`,
    [input.entityType, sheet.contentHash],
  );

  const suggestions = suggestMapping(
    sheet.headers,
    input.entityType,
    input.sourceSystem as SourceSystem,
  );
  const mapping = suggestionsToMapping(suggestions);

  const batch = await db.one<{ id: string; batch_ref: string }>(
    `insert into import_batches
       (name, entity_type, source_kind, source_name, source_url, source_system,
        content_hash, status, headers, mapping, row_count, notes, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,'draft',$8::jsonb,$9::jsonb,$10,$11,$12,$12)
     returning id, batch_ref`,
    [
      input.name,
      input.entityType,
      input.sourceKind,
      input.sourceName ?? null,
      input.sourceUrl ?? null,
      input.sourceSystem,
      sheet.contentHash,
      JSON.stringify(sheet.headers),
      JSON.stringify(mapping),
      sheet.rows.length,
      input.notes,
      ctx.actor.id,
    ],
  );

  // The file's own rows, kept exactly as read.
  for (const [index, raw] of sheet.rows.entries()) {
    await db.query(
      `insert into import_rows (batch_id, row_number, raw) values ($1,$2,$3::jsonb)`,
      [batch.id, index + 1, JSON.stringify(raw)],
    );
  }

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'import.created',
    entityType: 'import_batch',
    entityId: batch.id,
    context: {
      batchRef: batch.batch_ref,
      entity: input.entityType,
      rows: sheet.rows.length,
      sourceKind: input.sourceKind,
      sourceName: input.sourceName ?? input.sourceUrl ?? null,
      repeatOf: previous?.batch_ref ?? null,
    },
  });

  return {
    id: batch.id,
    batchRef: batch.batch_ref,
    warnings: sheet.warnings,
    sameFileAs: previous
      ? {
          id: previous.id,
          batchRef: previous.batch_ref,
          committedAt: previous.committed_at?.toISOString() ?? null,
        }
      : null,
  };
}

function assertChangeable(batch: ImportBatch): void {
  if (!['draft', 'mapped', 'previewed'].includes(batch.status)) {
    throw new ValidationError(
      { _form: ['This import has already been run, so it cannot be changed.'] },
      'This import has already been run, so it cannot be changed.',
    );
  }
}

export async function saveMapping(
  db: Db,
  ctx: Ctx,
  batchId: string,
  mapping: Mapping,
  expectedVersion: number,
): Promise<void> {
  const batch = await getImportBatch(db, batchId);
  if (!batch) throw new NotFoundError('That import');
  assertChangeable(batch);

  // A mapping may only name columns the file actually has, and only real
  // fields. Anything else is a stale form or a tampered one.
  const known = new Set(batch.headers);
  for (const header of Object.keys(mapping)) {
    if (!known.has(header)) {
      throw new ValidationError(
        { _form: [`This file has no column called "${header}". Please reload the page.`] },
        'That mapping does not match this file.',
      );
    }
  }

  const problems = mappingProblems(mapping, batch.entityType);
  if (problems.length > 0) {
    throw new ValidationError({ _form: problems }, problems[0]!);
  }

  const changed = await db.count(
    `update import_batches
        set mapping = $2::jsonb, status = 'mapped', updated_by = $3
      where id = $1 and row_version = $4 and status in ('draft','mapped','previewed')`,
    [batchId, JSON.stringify(mapping), ctx.actor.id, expectedVersion],
  );
  if (changed === 0) throw new ConcurrencyError();

  // The previous preview is no longer about this mapping.
  await db.query(
    `update import_rows
        set action = 'pending', action_reason = null, mapped = null,
            target_id = null, match_score = null, errors = '[]'::jsonb
      where batch_id = $1 and committed_at is null`,
    [batchId],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'import.mapped',
    entityType: 'import_batch',
    entityId: batchId,
    context: { batchRef: batch.batchRef, columns: Object.keys(mapping).length },
  });
}

export async function cancelImportBatch(
  db: Db,
  ctx: Ctx,
  batchId: string,
  expectedVersion: number,
): Promise<void> {
  const changed = await db.count(
    `update import_batches
        set status = 'cancelled', cancelled_at = now(), updated_by = $2
      where id = $1 and row_version = $3 and status in ('draft','mapped','previewed')`,
    [batchId, ctx.actor.id, expectedVersion],
  );
  if (changed === 0) throw new ConcurrencyError();

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'import.cancelled',
    entityType: 'import_batch',
    entityId: batchId,
  });
}

/** Re-reads a row through the batch's mapping, for the preview. */
export function mapRow(
  raw: Record<string, string>,
  batch: Pick<ImportBatch, 'mapping' | 'entityType'>,
) {
  return applyMapping(raw, batch.mapping, batch.entityType);
}
