import { z } from 'zod';
import type { Ctx } from './actor.ts';
import type { Db } from './db.ts';
import { recordAudit } from './audit.ts';
import { ConcurrencyError, NotFoundError, ValidationError } from './errors.ts';
import { NCC_BATCH_STATUSES, NCC_RESULTS, type NccBatchStatus, type NccResult } from './domain.ts';
import { getNumberSetting } from './settings.ts';
import { normaliseZaPhone } from './phone.ts';
import { detectDelimiter, splitCsvRow, toCsv } from './csv.ts';
import { optionalText, requiredText } from './validate.ts';

/**
 * The National Consumer Commission opt-out register (spec 55, 56).
 *
 * THE CRM IS NOT CONNECTED TO THE REGISTER AND CANNOT CHECK A NUMBER.
 *
 * What it does is keep an honest record of the process the office actually
 * follows: collect the numbers into a batch, export them, send that file to
 * whoever performs the check, and load the answers back in. A number that has
 * not been through that is recorded as "not checked" and the preflight treats
 * it as such. Nothing in this module ever reports a result the office did not
 * receive.
 *
 * The cost per number is read from settings when the batch is created and
 * then stored on the batch, so a later price change does not rewrite what an
 * old batch cost.
 */

const keys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]];

/** There is no integration. Anything that would need one says so. */
export const NCC_CONNECTION_STATUS = 'NOT CONNECTED' as const;

export const batchInputSchema = z.object({
  name: requiredText('A name for the batch', 120),
  notes: optionalText,
});
export type BatchInput = z.infer<typeof batchInputSchema>;

export interface BatchSummary {
  id: string;
  batchRef: string;
  name: string;
  status: NccBatchStatus;
  costPerNumber: string;
  itemCount: number;
  checkedCount: number;
  listedCount: number;
  estimatedCost: number;
  submittedAt: string | null;
  submittedByName: string | null;
  resultsLoadedAt: string | null;
  cancellationReason: string | null;
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
  rowVersion: number;
}

interface BatchDbRow {
  id: string;
  batch_ref: string;
  name: string;
  status: NccBatchStatus;
  cost_per_number: string;
  item_count: number;
  checked_count: number;
  listed_count: number;
  submitted_at: Date | null;
  submitted_by_name: string | null;
  results_loaded_at: Date | null;
  cancellation_reason: string | null;
  notes: string | null;
  created_at: Date;
  created_by_name: string | null;
  row_version: number;
}

const BATCH_SQL = `
  select b.id, b.batch_ref, b.name, b.status, b.cost_per_number,
         b.submitted_at, b.results_loaded_at, b.cancellation_reason, b.notes,
         b.created_at, b.row_version,
         coalesce(s.display_name, s.full_name) as submitted_by_name,
         coalesce(c.display_name, c.full_name) as created_by_name,
         (select count(*)::int from ncc_batch_items i where i.batch_id = b.id) as item_count,
         (select count(*)::int from ncc_batch_items i
           where i.batch_id = b.id and i.result <> 'not_checked') as checked_count,
         (select count(*)::int from ncc_batch_items i
           where i.batch_id = b.id and i.result = 'listed') as listed_count
    from ncc_batches b
    left join users s on s.id = b.submitted_by
    left join users c on c.id = b.created_by
`;

function toBatch(row: BatchDbRow): BatchSummary {
  return {
    id: row.id,
    batchRef: row.batch_ref,
    name: row.name,
    status: row.status,
    costPerNumber: row.cost_per_number,
    itemCount: row.item_count,
    checkedCount: row.checked_count,
    listedCount: row.listed_count,
    estimatedCost: Number(row.cost_per_number) * row.item_count,
    submittedAt: row.submitted_at?.toISOString() ?? null,
    submittedByName: row.submitted_by_name,
    resultsLoadedAt: row.results_loaded_at?.toISOString() ?? null,
    cancellationReason: row.cancellation_reason,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    createdByName: row.created_by_name,
    rowVersion: row.row_version,
  };
}

export async function listBatches(
  db: Db,
  filters: { status?: string; limit?: number } = {},
): Promise<BatchSummary[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.status && filters.status !== 'all') where.push(`b.status = ${add(filters.status)}`);

  const rows = await db.query<BatchDbRow>(
    `${BATCH_SQL} where ${where.length > 0 ? where.join(' and ') : 'true'}
      order by b.created_at desc limit ${add(filters.limit ?? 100)}`,
    params,
  );
  return rows.map(toBatch);
}

export async function getBatch(db: Db, id: string): Promise<BatchSummary | null> {
  const row = await db.maybeOne<BatchDbRow>(`${BATCH_SQL} where b.id = $1`, [id]);
  return row ? toBatch(row) : null;
}

export interface BatchItemRow {
  id: string;
  personId: string | null;
  personName: string | null;
  personRef: string | null;
  contactValue: string;
  result: NccResult;
  resultNote: string | null;
  checkedAt: string | null;
}

export async function listBatchItems(db: Db, batchId: string): Promise<BatchItemRow[]> {
  const rows = await db.query<{
    id: string;
    person_id: string | null;
    person_name: string | null;
    person_ref: string | null;
    contact_value: string;
    result: NccResult;
    result_note: string | null;
    checked_at: Date | null;
  }>(
    `select i.id, i.person_id, i.contact_value, i.result, i.result_note, i.checked_at,
            pe.first_name || ' ' || pe.surname as person_name,
            pe.client_ref as person_ref
       from ncc_batch_items i
       left join people pe on pe.id = i.person_id
      where i.batch_id = $1
      order by pe.surname nulls last, i.contact_value`,
    [batchId],
  );
  return rows.map((row) => ({
    id: row.id,
    personId: row.person_id,
    personName: row.person_name,
    personRef: row.person_ref,
    contactValue: row.contact_value,
    result: row.result,
    resultNote: row.result_note,
    checkedAt: row.checked_at?.toISOString() ?? null,
  }));
}

export async function createBatch(
  db: Db,
  ctx: Ctx,
  input: BatchInput,
): Promise<{ id: string; batchRef: string }> {
  const costPerNumber = await getNumberSetting(db, 'ncc.cost_per_number', 0);

  const row = await db.one<{ id: string; batch_ref: string }>(
    `insert into ncc_batches (name, notes, cost_per_number, created_by, updated_by)
     values ($1,$2,$3,$4,$4) returning id, batch_ref`,
    [input.name, input.notes, costPerNumber, ctx.actor.id],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'ncc.batch_created',
    entityType: 'ncc_batch',
    entityId: row.id,
    context: { batchRef: row.batch_ref, costPerNumber },
  });
  return { id: row.id, batchRef: row.batch_ref };
}

function assertDraft(status: NccBatchStatus): void {
  if (status !== 'draft') {
    throw new ValidationError(
      { _form: ['This batch has already been sent, so its numbers cannot change.'] },
      'This batch has already been sent, so its numbers cannot change.',
    );
  }
}

/**
 * Fills a draft batch with the numbers that actually need checking: active
 * phone numbers with no current result. Nothing already checked recently is
 * added, because the office pays per number.
 */
export async function fillBatchWithUncheckedNumbers(
  db: Db,
  ctx: Ctx,
  batchId: string,
  options: { limit?: number } = {},
): Promise<{ added: number }> {
  const batch = await getBatch(db, batchId);
  if (!batch) throw new NotFoundError('That batch');
  assertDraft(batch.status);

  const validDays = await getNumberSetting(db, 'ncc.result_valid_days', 180);
  const limit = Math.min(5000, Math.max(1, options.limit ?? 1000));

  const added = await db.count(
    `insert into ncc_batch_items (batch_id, person_id, contact_value)
     select $1, pc.person_id, pc.value
       from person_contacts pc
       join people p on p.id = pc.person_id
      where pc.is_active
        and pc.contact_type in ('mobile','alternative_mobile','landline','whatsapp')
        and pc.value_normalised is not null
        and p.merged_into_id is null and not p.is_archived
        and not exists (
          select 1 from ncc_batch_items existing
           where existing.batch_id = $1
             and existing.contact_value_normalised = pc.value_normalised
        )
        and not exists (
          select 1 from ncc_batch_items done
           where done.contact_value_normalised = pc.value_normalised
             and done.result <> 'not_checked'
             and done.checked_at > now() - make_interval(days => $2::int)
        )
      limit $3`,
    [batchId, validDays, limit],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'ncc.batch_filled',
    entityType: 'ncc_batch',
    entityId: batchId,
    context: { added, batchRef: batch.batchRef },
  });
  return { added };
}

export async function addNumberToBatch(
  db: Db,
  ctx: Ctx,
  batchId: string,
  contactValue: string,
  personId: string | null = null,
): Promise<void> {
  const batch = await getBatch(db, batchId);
  if (!batch) throw new NotFoundError('That batch');
  assertDraft(batch.status);

  const normalised = normaliseZaPhone(contactValue);
  if (!normalised) {
    throw new ValidationError(
      { contactValue: ['That does not look like a phone number.'] },
      'That does not look like a phone number.',
    );
  }

  await db.query(
    `insert into ncc_batch_items (batch_id, person_id, contact_value)
     select $1, $2, $3
      where not exists (
        select 1 from ncc_batch_items i
         where i.batch_id = $1 and i.contact_value_normalised = app.normalise_za_phone($3)
      )`,
    [batchId, personId, contactValue],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'ncc.number_added',
    entityType: 'ncc_batch',
    entityId: batchId,
    context: { personId },
  });
}

export async function removeNumberFromBatch(
  db: Db,
  ctx: Ctx,
  batchId: string,
  itemId: string,
): Promise<void> {
  const batch = await getBatch(db, batchId);
  if (!batch) throw new NotFoundError('That batch');
  assertDraft(batch.status);

  await db.query('delete from ncc_batch_items where id = $1 and batch_id = $2', [itemId, batchId]);
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'ncc.number_removed',
    entityType: 'ncc_batch',
    entityId: batchId,
  });
}

/**
 * The file that goes to whoever performs the check.
 *
 * This is the only "integration" there is: a file a person sends. It is
 * written through the safe CSV writer so a number cannot carry a formula into
 * the spreadsheet at the other end.
 */
export async function batchAsCsv(db: Db, batchId: string): Promise<string> {
  const items = await listBatchItems(db, batchId);
  return toCsv(
    [
      { key: 'reference', header: 'Our reference' },
      { key: 'number', header: 'Number' },
      { key: 'name', header: 'Name' },
    ],
    items.map((item) => ({
      reference: item.personRef ?? '',
      number: item.contactValue,
      name: item.personName ?? '',
    })),
  );
}

export async function markBatchSubmitted(
  db: Db,
  ctx: Ctx,
  batchId: string,
  note: string | null,
  expectedVersion: number,
): Promise<void> {
  const batch = await getBatch(db, batchId);
  if (!batch) throw new NotFoundError('That batch');
  assertDraft(batch.status);
  if (batch.itemCount === 0) {
    throw new ValidationError(
      { _form: ['There is nothing in this batch to send.'] },
      'There is nothing in this batch to send.',
    );
  }

  const changed = await db.count(
    `update ncc_batches
        set status = 'submitted', submitted_at = now(), submitted_by = $2,
            submitted_note = $3, updated_by = $2
      where id = $1 and row_version = $4 and status = 'draft'`,
    [batchId, ctx.actor.id, note, expectedVersion],
  );
  if (changed === 0) throw new ConcurrencyError();

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'ncc.batch_submitted',
    entityType: 'ncc_batch',
    entityId: batchId,
    context: { batchRef: batch.batchRef, numbers: batch.itemCount, note },
  });
}

export const resultLineSchema = z.object({
  number: z.string().min(1),
  result: z.enum(keys(NCC_RESULTS)),
  note: optionalText,
});
export type ResultLine = z.infer<typeof resultLineSchema>;

/**
 * Loads the answers that came back.
 *
 * A number that is not in the returned file keeps its "not checked" state
 * rather than being assumed clear, which is the whole point: silence is not a
 * result. Anything that comes back listed also raises a do-not-contact, so
 * the register's answer has an effect rather than sitting in a table.
 */
export async function loadBatchResults(
  db: Db,
  ctx: Ctx,
  batchId: string,
  lines: ResultLine[],
  expectedVersion: number,
): Promise<{ matched: number; unmatched: string[]; listed: number }> {
  const batch = await getBatch(db, batchId);
  if (!batch) throw new NotFoundError('That batch');
  if (batch.status !== 'submitted' && batch.status !== 'results_loaded') {
    throw new ValidationError(
      { _form: ['Results can only be loaded for a batch that has been sent.'] },
      'Results can only be loaded for a batch that has been sent.',
    );
  }

  let matched = 0;
  let listed = 0;
  const unmatched: string[] = [];

  for (const line of lines) {
    const normalised = normaliseZaPhone(line.number) ?? line.number.trim().toLowerCase();
    const updated = await db.query<{ id: string; person_id: string | null; contact_value: string }>(
      `update ncc_batch_items
          set result = $3, result_note = $4,
              checked_at = case when $3 = 'not_checked' then null else now() end
        where batch_id = $1 and contact_value_normalised = $2
        returning id, person_id, contact_value`,
      [batchId, normalised, line.result, line.note],
    );

    if (updated.length === 0) {
      unmatched.push(line.number);
      continue;
    }
    matched += updated.length;

    if (line.result === 'listed') {
      listed += updated.length;
      for (const item of updated) {
        // The register's answer becomes a real do-not-contact, not a note.
        await db.query(
          `insert into do_not_contact
             (person_id, contact_value, channel, source, reason, added_by, updated_by)
           select $1, $2, 'all', 'ncc_register',
                  'Returned as listed on the NCC register in batch ' || $3, $4, $4
            where not exists (
              select 1 from do_not_contact d
               where d.released_at is null
                 and d.channel = 'all'
                 and ((d.person_id is not null and d.person_id = $1)
                      or (d.person_id is null and $1::uuid is null
                          and d.contact_value_normalised = app.normalise_za_phone($2)))
            )`,
          [item.person_id, item.contact_value, batch.batchRef, ctx.actor.id],
        );
      }
    }
  }

  const changed = await db.count(
    `update ncc_batches
        set status = 'results_loaded', results_loaded_at = now(),
            results_loaded_by = $2, updated_by = $2
      where id = $1 and row_version = $3`,
    [batchId, ctx.actor.id, expectedVersion],
  );
  if (changed === 0) throw new ConcurrencyError();

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'ncc.results_loaded',
    entityType: 'ncc_batch',
    entityId: batchId,
    context: {
      batchRef: batch.batchRef,
      matched,
      unmatched: unmatched.length,
      listed,
    },
  });

  return { matched, unmatched, listed };
}

export async function cancelBatch(
  db: Db,
  ctx: Ctx,
  batchId: string,
  reason: string,
  expectedVersion: number,
): Promise<void> {
  if (reason.trim().length === 0) {
    throw new ValidationError(
      { cancellationReason: ['Say why this batch is being cancelled.'] },
      'Say why this batch is being cancelled.',
    );
  }
  const changed = await db.count(
    `update ncc_batches
        set status = 'cancelled', cancelled_at = now(), cancellation_reason = $3, updated_by = $2
      where id = $1 and row_version = $4 and status in ('draft','submitted')`,
    [batchId, ctx.actor.id, reason.trim(), expectedVersion],
  );
  if (changed === 0) throw new ConcurrencyError();

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'ncc.batch_cancelled',
    entityType: 'ncc_batch',
    entityId: batchId,
    context: { reason: reason.trim() },
  });
}

/**
 * Parses a returned results file.
 *
 * Deliberately forgiving about column order and about what the provider calls
 * "listed", because the file comes from outside and the office should not
 * have to hand-edit it. Anything it cannot read is reported rather than
 * guessed at.
 */
export function parseResultsCsv(text: string): {
  lines: ResultLine[];
  problems: string[];
} {
  const problems: string[] = [];
  const lines: ResultLine[] = [];

  const rows = text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0);
  if (rows.length === 0) return { lines, problems: ['That file is empty.'] };

  const separator = detectDelimiter(rows[0]!);
  const header = splitCsvRow(rows[0]!, separator).map((cell) => cell.trim().toLowerCase());
  const numberAt = header.findIndex((cell) => /number|msisdn|cell|phone/.test(cell));
  const resultAt = header.findIndex((cell) => /result|status|listed|outcome/.test(cell));
  const noteAt = header.findIndex((cell) => /note|comment|reason/.test(cell));

  if (numberAt === -1 || resultAt === -1) {
    return {
      lines,
      problems: ['The file needs a column for the number and a column for the result.'],
    };
  }

  for (const [index, row] of rows.slice(1).entries()) {
    const cells = splitCsvRow(row, separator);
    const number = cells[numberAt]?.trim();
    const rawResult = cells[resultAt]?.trim().toLowerCase() ?? '';
    if (!number) {
      problems.push(`Line ${index + 2} has no number.`);
      continue;
    }

    let result: NccResult;
    if (/^(listed|yes|y|true|1|opted.?out|registered)$/.test(rawResult)) result = 'listed';
    else if (/^(not.?listed|no|n|false|0|clear|clean)$/.test(rawResult)) result = 'not_listed';
    else if (/invalid|bad|unusable|malformed/.test(rawResult)) result = 'invalid_number';
    else {
      problems.push(`Line ${index + 2}: "${rawResult}" is not a result this can read.`);
      continue;
    }

    lines.push({ number, result, note: noteAt >= 0 ? (cells[noteAt]?.trim() || null) : null });
  }

  return { lines, problems };
}

export const BATCH_STATUS_LABELS = NCC_BATCH_STATUSES;
