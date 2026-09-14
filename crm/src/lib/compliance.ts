import { z } from 'zod';
import type { Ctx } from './actor.ts';
import type { Db } from './db.ts';
import { recordAudit } from './audit.ts';
import { ConcurrencyError, NotFoundError, ValidationError } from './errors.ts';
import {
  DNC_CHANNELS,
  EVIDENCE_TYPES,
  LAWFUL_BASES,
  PERMISSION_CHANNELS,
  PERMISSION_PURPOSES,
  PERMISSION_STATUSES,
  DNC_SOURCES,
  type DncChannel,
  type DncSource,
  type EvidenceType,
  type LawfulBasis,
  type PermissionChannel,
  type PermissionPurpose,
  type PermissionStatus,
  type PreflightStatus,
} from './domain.ts';
import { optionalText, optionalUuid } from './validate.ts';

/**
 * Contact permissions, the evidence behind them, and do-not-contact
 * (spec 52 to 54).
 *
 * The governing rule is that nothing here is ever destroyed. Changing a
 * permission writes a history row; withdrawing one keeps the row that says it
 * was granted and when. A do-not-contact is released, never deleted, so the
 * period it covered stays on the record. If someone later asks why they were
 * contacted in March, the answer is in the database.
 */

const keys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]];

// ---------------------------------------------------------------------------
// Contact permissions
// ---------------------------------------------------------------------------

export const permissionInputSchema = z.object({
  personId: z.uuid('Which person is this permission for?'),
  channel: z.enum(keys(PERMISSION_CHANNELS)),
  purpose: z.enum(keys(PERMISSION_PURPOSES)),
  status: z.enum(keys(PERMISSION_STATUSES)),
  lawfulBasis: z
    .union([z.enum(keys(LAWFUL_BASES)), z.literal('')])
    .optional()
    .transform((value) => (value ? (value as LawfulBasis) : null)),
  evidenceId: optionalUuid,
  note: optionalText,
  reason: optionalText,
});
export type PermissionInput = z.infer<typeof permissionInputSchema>;

export interface PermissionRow {
  id: string;
  personId: string;
  channel: PermissionChannel;
  purpose: PermissionPurpose;
  status: PermissionStatus;
  lawfulBasis: LawfulBasis | null;
  grantedAt: string | null;
  withdrawnAt: string | null;
  evidenceId: string | null;
  evidenceSummary: string | null;
  note: string | null;
  updatedAt: string;
  updatedByName: string | null;
  rowVersion: number;
}

interface PermissionDbRow {
  id: string;
  person_id: string;
  channel: PermissionChannel;
  purpose: PermissionPurpose;
  status: PermissionStatus;
  lawful_basis: LawfulBasis | null;
  granted_at: Date | null;
  withdrawn_at: Date | null;
  evidence_id: string | null;
  evidence_summary: string | null;
  note: string | null;
  updated_at: Date;
  updated_by_name: string | null;
  row_version: number;
}

const PERMISSION_SQL = `
  select cp.id, cp.person_id, cp.channel, cp.purpose, cp.status, cp.lawful_basis,
         cp.granted_at, cp.withdrawn_at, cp.evidence_id, cp.note,
         cp.updated_at, cp.row_version,
         coalesce(u.display_name, u.full_name) as updated_by_name,
         e.evidence_type || coalesce(' — ' || e.reference, '') as evidence_summary
    from contact_permissions cp
    left join users u on u.id = cp.updated_by
    left join permission_evidence e on e.id = cp.evidence_id
`;

function toPermission(row: PermissionDbRow): PermissionRow {
  return {
    id: row.id,
    personId: row.person_id,
    channel: row.channel,
    purpose: row.purpose,
    status: row.status,
    lawfulBasis: row.lawful_basis,
    grantedAt: row.granted_at?.toISOString() ?? null,
    withdrawnAt: row.withdrawn_at?.toISOString() ?? null,
    evidenceId: row.evidence_id,
    evidenceSummary: row.evidence_summary,
    note: row.note,
    updatedAt: row.updated_at.toISOString(),
    updatedByName: row.updated_by_name,
    rowVersion: row.row_version,
  };
}

export async function listPermissions(db: Db, personId: string): Promise<PermissionRow[]> {
  const rows = await db.query<PermissionDbRow>(
    `${PERMISSION_SQL} where cp.person_id = $1 order by cp.purpose, cp.channel`,
    [personId],
  );
  return rows.map(toPermission);
}

/**
 * Records what someone said about being contacted.
 *
 * One row per person, channel and purpose, updated in place — but every
 * change also appends to the history, which the database will not let anyone
 * alter afterwards.
 */
export async function setPermission(
  db: Db,
  ctx: Ctx,
  input: PermissionInput,
): Promise<{ id: string }> {
  const existing = await db.maybeOne<{ id: string; status: PermissionStatus }>(
    `select id, status from contact_permissions
      where person_id = $1 and channel = $2 and purpose = $3`,
    [input.personId, input.channel, input.purpose],
  );

  const row = await db.one<{ id: string }>(
    `insert into contact_permissions
       (person_id, channel, purpose, status, lawful_basis, evidence_id, note,
        granted_at, withdrawn_at, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,
             case when $4 = 'granted' then now() end,
             case when $4 = 'withdrawn' then now() end,
             $8,$8)
     on conflict (person_id, channel, purpose) do update set
       status = excluded.status,
       lawful_basis = excluded.lawful_basis,
       evidence_id = excluded.evidence_id,
       note = excluded.note,
       granted_at = case when excluded.status = 'granted'
                         then coalesce(contact_permissions.granted_at, now()) end,
       withdrawn_at = case when excluded.status = 'withdrawn' then now() end,
       updated_by = excluded.updated_by
     returning id`,
    [
      input.personId, input.channel, input.purpose, input.status,
      input.lawfulBasis, input.evidenceId, input.note, ctx.actor.id,
    ],
  );

  await db.query(
    `insert into contact_permission_history
       (permission_id, person_id, channel, purpose, old_status, new_status,
        lawful_basis, evidence_id, reason, changed_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      row.id, input.personId, input.channel, input.purpose, existing?.status ?? null,
      input.status, input.lawfulBasis, input.evidenceId, input.reason, ctx.actor.id,
    ],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: existing ? 'permission.changed' : 'permission.recorded',
    entityType: 'person',
    entityId: input.personId,
    changes: existing
      ? { permission: { from: existing.status, to: input.status } }
      : undefined,
    context: {
      channel: input.channel,
      purpose: input.purpose,
      status: input.status,
      reason: input.reason,
    },
  });

  return { id: row.id };
}

export interface PermissionHistoryRow {
  channel: PermissionChannel;
  purpose: PermissionPurpose;
  oldStatus: string | null;
  newStatus: string;
  reason: string | null;
  changedAt: string;
  changedByName: string | null;
}

export async function permissionHistory(
  db: Db,
  personId: string,
): Promise<PermissionHistoryRow[]> {
  const rows = await db.query<{
    channel: PermissionChannel;
    purpose: PermissionPurpose;
    old_status: string | null;
    new_status: string;
    reason: string | null;
    changed_at: Date;
    changed_by_name: string | null;
  }>(
    `select h.channel, h.purpose, h.old_status, h.new_status, h.reason, h.changed_at,
            coalesce(u.display_name, u.full_name) as changed_by_name
       from contact_permission_history h
       left join users u on u.id = h.changed_by
      where h.person_id = $1
      order by h.changed_at desc limit 100`,
    [personId],
  );
  return rows.map((row) => ({
    channel: row.channel,
    purpose: row.purpose,
    oldStatus: row.old_status,
    newStatus: row.new_status,
    reason: row.reason,
    changedAt: row.changed_at.toISOString(),
    changedByName: row.changed_by_name,
  }));
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const evidenceInputSchema = z.object({
  personId: z.uuid('Which person is this evidence for?'),
  evidenceType: z.enum(keys(EVIDENCE_TYPES)),
  reference: optionalText,
  documentId: optionalUuid,
  notes: optionalText,
});
export type EvidenceInput = z.infer<typeof evidenceInputSchema>;

export interface EvidenceRow {
  id: string;
  evidenceType: EvidenceType;
  reference: string | null;
  capturedAt: string;
  documentId: string | null;
  notes: string | null;
  createdByName: string | null;
}

export async function listEvidence(db: Db, personId: string): Promise<EvidenceRow[]> {
  const rows = await db.query<{
    id: string;
    evidence_type: EvidenceType;
    reference: string | null;
    captured_at: Date;
    document_id: string | null;
    notes: string | null;
    created_by_name: string | null;
  }>(
    `select e.id, e.evidence_type, e.reference, e.captured_at, e.document_id, e.notes,
            coalesce(u.display_name, u.full_name) as created_by_name
       from permission_evidence e
       left join users u on u.id = e.created_by
      where e.person_id = $1 order by e.captured_at desc`,
    [personId],
  );
  return rows.map((row) => ({
    id: row.id,
    evidenceType: row.evidence_type,
    reference: row.reference,
    capturedAt: row.captured_at.toISOString(),
    documentId: row.document_id,
    notes: row.notes,
    createdByName: row.created_by_name,
  }));
}

export async function addEvidence(
  db: Db,
  ctx: Ctx,
  input: EvidenceInput,
): Promise<{ id: string }> {
  const row = await db.one<{ id: string }>(
    `insert into permission_evidence
       (person_id, evidence_type, reference, document_id, notes, created_by)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [input.personId, input.evidenceType, input.reference, input.documentId, input.notes, ctx.actor.id],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'permission.evidence_added',
    entityType: 'person',
    entityId: input.personId,
    context: { evidenceType: input.evidenceType, reference: input.reference },
  });
  return { id: row.id };
}

// ---------------------------------------------------------------------------
// Do not contact
// ---------------------------------------------------------------------------

export const dncInputSchema = z
  .object({
    personId: optionalUuid,
    contactValue: optionalText,
    channel: z.enum(keys(DNC_CHANNELS)).default('all'),
    source: z.enum(keys(DNC_SOURCES)),
    reason: optionalText,
  })
  .superRefine((input, ctx) => {
    if (!input.personId && !input.contactValue) {
      ctx.addIssue({
        code: 'custom',
        path: ['contactValue'],
        message: 'Give a person or a number or address to stop contacting.',
      });
    }
  });
export type DncInput = z.infer<typeof dncInputSchema>;

export interface DncRow {
  id: string;
  personId: string | null;
  personName: string | null;
  personRef: string | null;
  contactValue: string | null;
  channel: DncChannel;
  source: DncSource;
  reason: string | null;
  addedAt: string;
  addedByName: string | null;
  releasedAt: string | null;
  releasedByName: string | null;
  releaseReason: string | null;
  rowVersion: number;
}

interface DncDbRow {
  id: string;
  person_id: string | null;
  person_name: string | null;
  person_ref: string | null;
  contact_value: string | null;
  channel: DncChannel;
  source: DncSource;
  reason: string | null;
  added_at: Date;
  added_by_name: string | null;
  released_at: Date | null;
  released_by_name: string | null;
  release_reason: string | null;
  row_version: number;
}

const DNC_SQL = `
  select d.id, d.person_id, d.contact_value, d.channel, d.source, d.reason,
         d.added_at, d.released_at, d.release_reason, d.row_version,
         pe.first_name || ' ' || pe.surname as person_name,
         pe.client_ref as person_ref,
         coalesce(a.display_name, a.full_name) as added_by_name,
         coalesce(r.display_name, r.full_name) as released_by_name
    from do_not_contact d
    left join people pe on pe.id = d.person_id
    left join users a on a.id = d.added_by
    left join users r on r.id = d.released_by
`;

function toDnc(row: DncDbRow): DncRow {
  return {
    id: row.id,
    personId: row.person_id,
    personName: row.person_name,
    personRef: row.person_ref,
    contactValue: row.contact_value,
    channel: row.channel,
    source: row.source,
    reason: row.reason,
    addedAt: row.added_at.toISOString(),
    addedByName: row.added_by_name,
    releasedAt: row.released_at?.toISOString() ?? null,
    releasedByName: row.released_by_name,
    releaseReason: row.release_reason,
    rowVersion: row.row_version,
  };
}

export async function listDoNotContact(
  db: Db,
  filters: { personId?: string; state?: 'active' | 'released' | 'all'; query?: string; limit?: number } = {},
): Promise<DncRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  switch (filters.state ?? 'active') {
    case 'active':
      where.push('d.released_at is null');
      break;
    case 'released':
      where.push('d.released_at is not null');
      break;
    default:
      break;
  }
  if (filters.personId) where.push(`d.person_id = ${add(filters.personId)}`);
  if (filters.query && filters.query.trim().length > 0) {
    const like = add(`%${filters.query.trim().toLowerCase()}%`);
    where.push(`(
      lower(coalesce(d.contact_value, '')) like ${like}
      or lower(coalesce(pe.first_name || ' ' || pe.surname, '')) like ${like}
      or lower(coalesce(pe.client_ref, '')) like ${like}
    )`);
  }

  const rows = await db.query<DncDbRow>(
    `${DNC_SQL} where ${where.length > 0 ? where.join(' and ') : 'true'}
      order by d.added_at desc limit ${add(filters.limit ?? 200)}`,
    params,
  );
  return rows.map(toDnc);
}

export async function addDoNotContact(
  db: Db,
  ctx: Ctx,
  input: DncInput,
): Promise<{ id: string }> {
  const row = await db.one<{ id: string }>(
    `insert into do_not_contact
       (person_id, contact_value, channel, source, reason, added_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$6) returning id`,
    [input.personId, input.contactValue, input.channel, input.source, input.reason, ctx.actor.id],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'dnc.added',
    entityType: input.personId ? 'person' : 'contact',
    entityId: input.personId ?? row.id,
    context: { channel: input.channel, source: input.source, reason: input.reason },
  });
  return { id: row.id };
}

/**
 * Releasing a do-not-contact.
 *
 * This is the one act in the whole module that makes it possible to contact
 * someone who asked not to be, so it needs the higher permission, it needs a
 * reason, and the released row stays exactly where it was.
 */
export async function releaseDoNotContact(
  db: Db,
  ctx: Ctx,
  id: string,
  reason: string,
  expectedVersion: number,
): Promise<void> {
  if (reason.trim().length === 0) {
    throw new ValidationError(
      { releaseReason: ['Say why this is being released.'] },
      'Say why this is being released.',
    );
  }

  const before = await db.maybeOne<{ row_version: number; released_at: Date | null }>(
    'select row_version, released_at from do_not_contact where id = $1',
    [id],
  );
  if (!before) throw new NotFoundError('That do-not-contact entry');
  if (before.released_at) {
    throw new ValidationError(
      { _form: ['That entry has already been released.'] },
      'That entry has already been released.',
    );
  }
  if (before.row_version !== expectedVersion) throw new ConcurrencyError();

  const changed = await db.count(
    `update do_not_contact
        set released_at = now(), released_by = $2, release_reason = $3, updated_by = $2
      where id = $1 and row_version = $4 and released_at is null`,
    [id, ctx.actor.id, reason.trim(), expectedVersion],
  );
  if (changed === 0) throw new ConcurrencyError();

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'dnc.released',
    entityType: 'contact',
    entityId: id,
    context: { reason: reason.trim() },
  });
}

// ---------------------------------------------------------------------------
// The direct-marketing preflight (spec 57)
// ---------------------------------------------------------------------------

export interface Preflight {
  status: PreflightStatus;
  reasons: string[];
}

/**
 * Asks the database whether a message may go out.
 *
 * The verdict comes from app.marketing_preflight, which runs as the schema
 * owner on purpose: a reader who cannot see a do-not-contact entry must not
 * be told the person is clear to contact. What comes back is only the
 * verdict and the plain-language reasons for it, never the underlying rows.
 */
export async function preflight(
  db: Db,
  personId: string,
  channel: PermissionChannel,
  purpose: PermissionPurpose = 'direct_marketing',
): Promise<Preflight> {
  const row = await db.one<{ result: Preflight }>(
    'select app.marketing_preflight($1,$2,$3) as result',
    [personId, channel, purpose],
  );
  return row.result;
}

/** The same verdict for every channel at once, for a person's profile. */
export async function preflightAllChannels(
  db: Db,
  personId: string,
  purpose: PermissionPurpose = 'direct_marketing',
): Promise<Record<PermissionChannel, Preflight>> {
  const channels = keys(PERMISSION_CHANNELS);
  const results = await Promise.all(
    channels.map((channel) => preflight(db, personId, channel, purpose)),
  );
  return Object.fromEntries(
    channels.map((channel, index) => [channel, results[index]!]),
  ) as Record<PermissionChannel, Preflight>;
}

/**
 * The preflight across a list of people, for deciding who a campaign may
 * actually go to before any of it is sent.
 */
export async function preflightMany(
  db: Db,
  personIds: string[],
  channel: PermissionChannel,
  purpose: PermissionPurpose = 'direct_marketing',
): Promise<{ personId: string; name: string; clientRef: string; verdict: Preflight }[]> {
  if (personIds.length === 0) return [];
  const rows = await db.query<{
    id: string;
    name: string;
    client_ref: string;
    verdict: Preflight;
  }>(
    `select p.id, p.first_name || ' ' || p.surname as name, p.client_ref,
            app.marketing_preflight(p.id, $2, $3) as verdict
       from people p
      where p.id = any($1::uuid[]) and p.merged_into_id is null
      order by p.surname, p.first_name`,
    [personIds, channel, purpose],
  );
  return rows.map((row) => ({
    personId: row.id,
    name: row.name,
    clientRef: row.client_ref,
    verdict: row.verdict,
  }));
}

/** Headline counts for the compliance dashboard (spec 58). */
export async function complianceSummary(db: Db): Promise<{
  activeDnc: number;
  releasedDnc: number;
  permissionsGranted: number;
  permissionsWithdrawn: number;
  peopleWithNoPermission: number;
  numbersNeverChecked: number;
}> {
  const row = await db.one<{
    active_dnc: number;
    released_dnc: number;
    granted: number;
    withdrawn: number;
    no_permission: number;
    never_checked: number;
  }>(
    `select
       (select count(*)::int from do_not_contact where released_at is null) as active_dnc,
       (select count(*)::int from do_not_contact where released_at is not null) as released_dnc,
       (select count(*)::int from contact_permissions where status = 'granted') as granted,
       (select count(*)::int from contact_permissions where status = 'withdrawn') as withdrawn,
       (select count(*)::int from people p
          where p.merged_into_id is null and not p.is_archived
            and not exists (select 1 from contact_permissions cp
                             where cp.person_id = p.id and cp.status = 'granted')) as no_permission,
       (select count(*)::int from person_contacts pc
          where pc.is_active
            and pc.contact_type in ('mobile','alternative_mobile','landline','whatsapp')
            and not exists (select 1 from ncc_batch_items i
                             where i.contact_value_normalised = pc.value_normalised
                               and i.result <> 'not_checked')) as never_checked`,
  );
  return {
    activeDnc: row.active_dnc,
    releasedDnc: row.released_dnc,
    permissionsGranted: row.granted,
    permissionsWithdrawn: row.withdrawn,
    peopleWithNoPermission: row.no_permission,
    numbersNeverChecked: row.never_checked,
  };
}
