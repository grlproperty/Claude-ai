import { z } from 'zod';
import type { Ctx } from './actor.ts';
import type { Db } from './db.ts';
import { diff, recordAudit } from './audit.ts';
import { ConcurrencyError, NotFoundError, ValidationError } from './errors.ts';
import { getNumberSetting } from './settings.ts';
import { optionalDate, optionalText, optionalUuid } from './validate.ts';

/**
 * FICA (spec 33 to 38, 115).
 *
 * THE CRM CANNOT VERIFY ANYBODY. It has no connection to Home Affairs, to
 * CIPC, to a deeds office, to a credit bureau or to any sanctions or PEP
 * list. Nothing in this module checks a document or decides whether somebody
 * is politically exposed.
 *
 * What it keeps is the office's own record: which documents were asked for,
 * which arrived, who looked at them against the originals, and what that
 * person concluded. Every verification names a user. The database refuses a
 * 'verified' record with nobody's name and no date on it, so the claim cannot
 * be made by accident or by a careless form.
 */

export const FICA_STATUSES = {
  not_started: 'Not started',
  documents_requested: 'Documents requested',
  documents_received: 'Documents received',
  under_review: 'Being checked',
  verified: 'Verified by us',
  rejected: 'Rejected',
  expired: 'Needs refreshing',
  exempt: 'Exempt',
} as const;
export type FicaStatus = keyof typeof FICA_STATUSES;

export const FICA_CHECK_STATUSES = {
  not_provided: 'Not provided',
  requested: 'Asked for',
  provided: 'Provided',
  seen_against_original: 'Seen against the original',
  rejected: 'Not acceptable',
  not_applicable: 'Does not apply',
} as const;
export type FicaCheckStatus = keyof typeof FICA_CHECK_STATUSES;

export const RISK_RATINGS = { low: 'Low', medium: 'Medium', high: 'High' } as const;
export type RiskRating = keyof typeof RISK_RATINGS;

const keys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]];

export const ficaInputSchema = z
  .object({
    personId: optionalUuid,
    companyId: optionalUuid,
    status: z.enum(keys(FICA_STATUSES)).default('not_started'),
    riskRating: z
      .union([z.enum(keys(RISK_RATINGS)), z.literal('')])
      .optional()
      .transform((value) => (value ? (value as RiskRating) : null)),
    riskNote: optionalText,
    pepDeclared: z
      .union([z.literal('yes'), z.literal('no'), z.literal('')])
      .optional()
      .transform((value) => (value === 'yes' ? true : value === 'no' ? false : null)),
    pepNote: optionalText,
    sanctionsNote: optionalText,
    sourceOfFunds: optionalText,
    purposeOfRelationship: optionalText,
    verificationNote: optionalText,
    rejectionReason: optionalText,
    expiresOn: optionalDate,
    notes: optionalText,
    statusChangeReason: optionalText,
  })
  .superRefine((input, ctx) => {
    const hasPerson = Boolean(input.personId);
    const hasCompany = Boolean(input.companyId);
    if (hasPerson === hasCompany) {
      ctx.addIssue({
        code: 'custom',
        path: ['personId'],
        message: 'A FICA file is about one person or one entity, not both and not neither.',
      });
    }
    if (input.status === 'rejected' && !input.rejectionReason) {
      ctx.addIssue({
        code: 'custom',
        path: ['rejectionReason'],
        message: 'Say why it was rejected.',
      });
    }
    if (input.status === 'exempt' && !input.notes) {
      ctx.addIssue({
        code: 'custom',
        path: ['notes'],
        message: 'Say on what basis this is exempt.',
      });
    }
  });

export type FicaInput = z.infer<typeof ficaInputSchema>;

export interface FicaRecord {
  id: string;
  ficaRef: string;
  personId: string | null;
  personName: string | null;
  personRef: string | null;
  companyId: string | null;
  companyName: string | null;
  companyRef: string | null;
  status: FicaStatus;
  riskRating: RiskRating | null;
  riskNote: string | null;
  pepDeclared: boolean | null;
  pepNote: string | null;
  sanctionsNote: string | null;
  sourceOfFunds: string | null;
  purposeOfRelationship: string | null;
  verifiedById: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  verificationNote: string | null;
  rejectedByName: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  expiresOn: string | null;
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
  rowVersion: number;
  /** Worked out here rather than stored, so it cannot go stale. */
  isExpired: boolean;
  daysUntilExpiry: number | null;
}

interface FicaDbRow {
  id: string;
  fica_ref: string;
  person_id: string | null;
  person_name: string | null;
  person_ref: string | null;
  company_id: string | null;
  company_name: string | null;
  company_ref: string | null;
  status: FicaStatus;
  risk_rating: RiskRating | null;
  risk_note: string | null;
  pep_declared: boolean | null;
  pep_note: string | null;
  sanctions_note: string | null;
  source_of_funds: string | null;
  purpose_of_relationship: string | null;
  verified_by: string | null;
  verified_by_name: string | null;
  verified_at: Date | null;
  verification_note: string | null;
  rejected_by_name: string | null;
  rejected_at: Date | null;
  rejection_reason: string | null;
  expires_on: Date | null;
  notes: string | null;
  created_at: Date;
  created_by_name: string | null;
  row_version: number;
}

const FICA_SQL = `
  select f.id, f.fica_ref, f.person_id, f.company_id, f.status, f.risk_rating, f.risk_note,
         f.pep_declared, f.pep_note, f.sanctions_note, f.source_of_funds,
         f.purpose_of_relationship, f.verified_by, f.verified_at, f.verification_note,
         f.rejected_at, f.rejection_reason, f.expires_on, f.notes, f.created_at, f.row_version,
         pe.first_name || ' ' || pe.surname as person_name,
         pe.client_ref as person_ref,
         co.registered_name as company_name,
         co.company_ref,
         coalesce(v.display_name, v.full_name) as verified_by_name,
         coalesce(r.display_name, r.full_name) as rejected_by_name,
         coalesce(c.display_name, c.full_name) as created_by_name
    from fica_records f
    left join people pe on pe.id = f.person_id
    left join companies co on co.id = f.company_id
    left join users v on v.id = f.verified_by
    left join users r on r.id = f.rejected_by
    left join users c on c.id = f.created_by
`;

function toFica(row: FicaDbRow): FicaRecord {
  const expiresOn = row.expires_on ? row.expires_on.toISOString().slice(0, 10) : null;
  const daysUntilExpiry = expiresOn
    ? Math.round((new Date(expiresOn).getTime() - Date.now()) / 86_400_000)
    : null;

  return {
    id: row.id,
    ficaRef: row.fica_ref,
    personId: row.person_id,
    personName: row.person_name,
    personRef: row.person_ref,
    companyId: row.company_id,
    companyName: row.company_name,
    companyRef: row.company_ref,
    status: row.status,
    riskRating: row.risk_rating,
    riskNote: row.risk_note,
    pepDeclared: row.pep_declared,
    pepNote: row.pep_note,
    sanctionsNote: row.sanctions_note,
    sourceOfFunds: row.source_of_funds,
    purposeOfRelationship: row.purpose_of_relationship,
    verifiedById: row.verified_by,
    verifiedByName: row.verified_by_name,
    verifiedAt: row.verified_at?.toISOString() ?? null,
    verificationNote: row.verification_note,
    rejectedByName: row.rejected_by_name,
    rejectedAt: row.rejected_at?.toISOString() ?? null,
    rejectionReason: row.rejection_reason,
    expiresOn,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    createdByName: row.created_by_name,
    rowVersion: row.row_version,
    // A file that has gone past its date is out of date whatever the stored
    // status says, because nobody may have looked at it since.
    isExpired:
      row.status === 'expired' ||
      (row.status === 'verified' && daysUntilExpiry !== null && daysUntilExpiry < 0),
    daysUntilExpiry,
  };
}

export async function listFicaRecords(
  db: Db,
  filters: { status?: string; query?: string; expiringWithinDays?: number; limit?: number } = {},
): Promise<FicaRecord[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (filters.status && filters.status !== 'all') where.push(`f.status = ${add(filters.status)}`);
  if (filters.expiringWithinDays !== undefined) {
    where.push(
      `f.status = 'verified' and f.expires_on is not null
        and f.expires_on <= current_date + ${add(filters.expiringWithinDays)}::int`,
    );
  }
  if (filters.query && filters.query.trim().length > 0) {
    const like = add(`%${filters.query.trim().toLowerCase()}%`);
    where.push(`(
      lower(coalesce(pe.first_name || ' ' || pe.surname, '')) like ${like}
      or lower(coalesce(pe.client_ref, '')) like ${like}
      or lower(coalesce(co.registered_name, '')) like ${like}
      or lower(coalesce(co.company_ref, '')) like ${like}
      or lower(f.fica_ref) like ${like}
    )`);
  }

  const rows = await db.query<FicaDbRow>(
    `${FICA_SQL} where ${where.length > 0 ? where.join(' and ') : 'true'}
      order by f.created_at desc limit ${add(filters.limit ?? 200)}`,
    params,
  );
  return rows.map(toFica);
}

export async function getFicaRecord(db: Db, id: string): Promise<FicaRecord | null> {
  const row = await db.maybeOne<FicaDbRow>(`${FICA_SQL} where f.id = $1`, [id]);
  return row ? toFica(row) : null;
}

export async function ficaFor(
  db: Db,
  subject: { personId?: string; companyId?: string },
): Promise<FicaRecord | null> {
  const column = subject.personId ? 'person_id' : 'company_id';
  const id = subject.personId ?? subject.companyId;
  if (!id) return null;
  const row = await db.maybeOne<FicaDbRow>(`${FICA_SQL} where f.${column} = $1`, [id]);
  return row ? toFica(row) : null;
}

const AUDITED = [
  'status', 'risk_rating', 'pep_declared', 'source_of_funds', 'purpose_of_relationship',
  'verified_by', 'verified_at', 'expires_on',
] as const;

export async function startFicaRecord(
  db: Db,
  ctx: Ctx,
  input: FicaInput,
): Promise<{ id: string; ficaRef: string }> {
  const row = await db.one<{ id: string; fica_ref: string }>(
    `insert into fica_records
       (person_id, company_id, status, risk_rating, risk_note, pep_declared, pep_note,
        sanctions_note, source_of_funds, purpose_of_relationship, expires_on, notes,
        created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
     returning id, fica_ref`,
    [
      input.personId, input.companyId, input.status, input.riskRating, input.riskNote,
      input.pepDeclared, input.pepNote, input.sanctionsNote, input.sourceOfFunds,
      input.purposeOfRelationship, input.expiresOn, input.notes, ctx.actor.id,
    ],
  );

  await db.query(
    `insert into fica_status_history (fica_record_id, old_status, new_status, reason, changed_by)
     values ($1, null, $2, 'File opened', $3)`,
    [row.id, input.status, ctx.actor.id],
  );

  // Every item the office asks for, so the file starts as a to-do list
  // rather than a blank page.
  await db.query(
    `insert into fica_document_checks (fica_record_id, item_id, status, updated_by)
     select $1, i.id, 'not_provided', $2
       from fica_checklist_items i
      where i.is_active
        and (i.applies_to = 'both' or i.applies_to = $3)`,
    [row.id, ctx.actor.id, input.personId ? 'person' : 'company'],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'fica.opened',
    entityType: 'fica_record',
    entityId: row.id,
    context: {
      ficaRef: row.fica_ref,
      personId: input.personId,
      companyId: input.companyId,
      status: input.status,
    },
  });

  return { id: row.id, ficaRef: row.fica_ref };
}

/**
 * Changing a FICA file.
 *
 * Reaching 'verified' stamps the acting user and the moment onto the record.
 * That is the only way the status can be reached, and the database refuses it
 * otherwise, so "verified" always means "a named person verified this on a
 * known date" and never "the software decided" (spec 115).
 */
export async function updateFicaRecord(
  db: Db,
  ctx: Ctx,
  id: string,
  input: FicaInput,
  expectedVersion: number,
): Promise<void> {
  const before = await db.maybeOne<Record<string, unknown> & { row_version: number }>(
    'select * from fica_records where id = $1',
    [id],
  );
  if (!before) throw new NotFoundError('That FICA file');
  if (before.row_version !== expectedVersion) throw new ConcurrencyError();

  // Verifying is a decision, so it needs the checklist to have been done.
  if (input.status === 'verified' && before.status !== 'verified') {
    const outstanding = await db.query<{ name: string }>(
      `select i.name
         from fica_document_checks c
         join fica_checklist_items i on i.id = c.item_id
        where c.fica_record_id = $1
          and i.is_required
          and c.status not in ('seen_against_original','not_applicable')`,
      [id],
    );
    if (outstanding.length > 0) {
      throw new ValidationError(
        {
          status: [
            `Still outstanding: ${outstanding.map((row) => row.name).join(', ')}. ` +
              'Mark each one as seen against the original, or as not applicable, first.',
          ],
        },
        'The file cannot be verified while required documents are outstanding.',
      );
    }
  }

  const verifying = input.status === 'verified';
  const rejecting = input.status === 'rejected';

  const validMonths = await getNumberSetting(db, 'fica.valid_months', 24);
  const expiresOn =
    input.expiresOn ??
    (verifying && !before.expires_on
      ? new Date(Date.now() + validMonths * 30 * 86_400_000).toISOString().slice(0, 10)
      : ((before.expires_on as Date | null)?.toISOString().slice(0, 10) ?? null));

  const updated = await db.query<Record<string, unknown>>(
    `update fica_records set
        status=$2, risk_rating=$3, risk_note=$4, pep_declared=$5, pep_note=$6,
        sanctions_note=$7, source_of_funds=$8, purpose_of_relationship=$9,
        verification_note = case when $10::boolean then $11 else verification_note end,
        verified_by = case when $10::boolean then coalesce(verified_by, $12) else verified_by end,
        verified_at = case when $10::boolean then coalesce(verified_at, now()) else verified_at end,
        rejection_reason = case when $13::boolean then $14 else rejection_reason end,
        rejected_by = case when $13::boolean then $12 else rejected_by end,
        rejected_at = case when $13::boolean then now() else rejected_at end,
        expires_on=$15, notes=$16, updated_by=$12
      where id=$1 and row_version=$17
      returning *`,
    [
      id, input.status, input.riskRating, input.riskNote, input.pepDeclared, input.pepNote,
      input.sanctionsNote, input.sourceOfFunds, input.purposeOfRelationship,
      verifying, input.verificationNote, ctx.actor.id,
      rejecting, input.rejectionReason,
      expiresOn, input.notes, expectedVersion,
    ],
  );
  const after = updated[0];
  if (!after) throw new ConcurrencyError();

  if (before.status !== after.status) {
    await db.query(
      `insert into fica_status_history
         (fica_record_id, old_status, new_status, reason, changed_by)
       values ($1,$2,$3,$4,$5)`,
      [id, before.status, after.status, input.statusChangeReason, ctx.actor.id],
    );
  }

  const changes = diff(before, after, AUDITED);
  if (Object.keys(changes).length > 0) {
    await recordAudit(db, ctx.actor, ctx.meta, {
      action: verifying ? 'fica.verified' : 'fica.updated',
      entityType: 'fica_record',
      entityId: id,
      changes,
      context: { reason: input.statusChangeReason },
    });
  }
}

// ---------------------------------------------------------------------------
// The checklist
// ---------------------------------------------------------------------------

export interface FicaCheckRow {
  id: string;
  itemId: string;
  code: string;
  name: string;
  description: string | null;
  isRequired: boolean;
  status: FicaCheckStatus;
  documentId: string | null;
  documentName: string | null;
  note: string | null;
  checkedByName: string | null;
  checkedAt: string | null;
}

export async function listFicaChecks(db: Db, ficaRecordId: string): Promise<FicaCheckRow[]> {
  const rows = await db.query<{
    id: string;
    item_id: string;
    code: string;
    name: string;
    description: string | null;
    is_required: boolean;
    status: FicaCheckStatus;
    document_id: string | null;
    document_name: string | null;
    note: string | null;
    checked_by_name: string | null;
    checked_at: Date | null;
  }>(
    `select c.id, c.item_id, i.code, i.name, i.description, i.is_required,
            c.status, c.document_id, c.note, c.checked_at,
            d.file_name as document_name,
            coalesce(u.display_name, u.full_name) as checked_by_name
       from fica_document_checks c
       join fica_checklist_items i on i.id = c.item_id
       left join documents d on d.id = c.document_id
       left join users u on u.id = c.checked_by
      where c.fica_record_id = $1
      order by i.sort_order, i.name`,
    [ficaRecordId],
  );

  return rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    code: row.code,
    name: row.name,
    description: row.description,
    isRequired: row.is_required,
    status: row.status,
    documentId: row.document_id,
    documentName: row.document_name,
    note: row.note,
    checkedByName: row.checked_by_name,
    checkedAt: row.checked_at?.toISOString() ?? null,
  }));
}

/**
 * Records what happened to one item on the checklist.
 *
 * Anything past "asked for" stamps the acting user and the time, because
 * "provided" with nobody's name against it is not a record of anything. The
 * database refuses it too.
 */
export async function setFicaCheck(
  db: Db,
  ctx: Ctx,
  ficaRecordId: string,
  input: { itemId: string; status: FicaCheckStatus; documentId?: string | null; note?: string | null },
): Promise<void> {
  const needsChecker = !['not_provided', 'requested'].includes(input.status);

  const changed = await db.count(
    `update fica_document_checks set
        status = $3,
        document_id = coalesce($4::uuid, document_id),
        note = $5,
        checked_by = case when $6::boolean then $7::uuid else null end,
        checked_at = case when $6::boolean then now() else null end,
        updated_by = $7
      where fica_record_id = $1 and item_id = $2`,
    [
      ficaRecordId, input.itemId, input.status, input.documentId ?? null,
      input.note ?? null, needsChecker, ctx.actor.id,
    ],
  );
  if (changed === 0) throw new NotFoundError('That checklist item');

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'fica.check_recorded',
    entityType: 'fica_record',
    entityId: ficaRecordId,
    context: { itemId: input.itemId, status: input.status },
  });
}

export interface FicaHistoryRow {
  oldStatus: string | null;
  newStatus: string;
  reason: string | null;
  changedAt: string;
  changedByName: string | null;
}

export async function ficaHistory(db: Db, ficaRecordId: string): Promise<FicaHistoryRow[]> {
  const rows = await db.query<{
    old_status: string | null;
    new_status: string;
    reason: string | null;
    changed_at: Date;
    changed_by_name: string | null;
  }>(
    `select h.old_status, h.new_status, h.reason, h.changed_at,
            coalesce(u.display_name, u.full_name) as changed_by_name
       from fica_status_history h
       left join users u on u.id = h.changed_by
      where h.fica_record_id = $1 order by h.changed_at desc`,
    [ficaRecordId],
  );
  return rows.map((row) => ({
    oldStatus: row.old_status,
    newStatus: row.new_status,
    reason: row.reason,
    changedAt: row.changed_at.toISOString(),
    changedByName: row.changed_by_name,
  }));
}

/** Headline counts for the FICA dashboard (spec 38). */
export async function ficaSummary(db: Db): Promise<{
  byStatus: { status: string; count: number }[];
  verified: number;
  outstanding: number;
  expiringSoon: number;
  expired: number;
  peopleWithNoFile: number;
}> {
  const warnDays = await getNumberSetting(db, 'fica.warn_days_before_expiry', 60);

  const [byStatus, totals] = await Promise.all([
    db.query<{ status: string; count: number }>(
      'select status, count(*)::int as count from fica_records group by status order by count desc',
    ),
    db.one<{
      verified: number;
      outstanding: number;
      expiring: number;
      expired: number;
      no_file: number;
    }>(
      `select
         count(*) filter (where status = 'verified')::int as verified,
         count(*) filter (where status in
           ('not_started','documents_requested','documents_received','under_review'))::int
           as outstanding,
         count(*) filter (where status = 'verified' and expires_on is not null
                            and expires_on between current_date
                                              and current_date + $1::int)::int as expiring,
         count(*) filter (where status = 'expired'
                            or (status = 'verified' and expires_on is not null
                                and expires_on < current_date))::int as expired,
         (select count(*)::int from people p
           where p.merged_into_id is null and not p.is_archived
             and not exists (select 1 from fica_records f where f.person_id = p.id))
           as no_file
       from fica_records`,
      [warnDays],
    ),
  ]);

  return {
    byStatus,
    verified: totals.verified,
    outstanding: totals.outstanding,
    expiringSoon: totals.expiring,
    expired: totals.expired,
    peopleWithNoFile: totals.no_file,
  };
}
