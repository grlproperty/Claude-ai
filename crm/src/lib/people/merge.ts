import type { Ctx } from '../actor.ts';
import type { Db } from '../db.ts';
import { recordAudit } from '../audit.ts';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.ts';
import { BUSINESS_AREAS, labelOf } from '../domain.ts';

/**
 * Merging two people into one master record (spec 19, 20).
 *
 * Nothing is ever merged silently. The caller chooses which value survives
 * for each field that differs; the database then moves every child row in a
 * single transaction and writes a merge record naming both references, the
 * user, the reason and the choices made.
 */

/** Only these may be chosen from the losing record. Anything else is ignored. */
const SELECTABLE_FIELDS = {
  title: 'Title',
  first_name: 'First name',
  middle_name: 'Middle name',
  surname: 'Surname',
  preferred_name: 'Preferred name',
  business_area: 'Business area',
  primary_agent_id: 'Primary agent',
  secondary_agent_id: 'Secondary agent',
  office_id: 'Office',
  team_id: 'Team',
  next_follow_up_at: 'Next follow-up',
  passport_country: 'Passport country',
  passport_expiry: 'Passport expiry',
} as const;

export type SelectableField = keyof typeof SELECTABLE_FIELDS;

export interface ComparisonField {
  field: SelectableField;
  label: string;
  masterValue: string;
  mergedValue: string;
  differs: boolean;
}

export interface MergeComparison {
  master: PersonSide;
  merged: PersonSide;
  fields: ComparisonField[];
}

interface PersonSide {
  id: string;
  clientRef: string;
  fullName: string;
  agentName: string | null;
  createdAt: string;
  lastContactAt: string | null;
  counts: {
    contacts: number;
    addresses: number;
    relationships: number;
    clientTypes: number;
  };
}

interface SideRow {
  id: string;
  client_ref: string;
  first_name: string;
  surname: string;
  agent_name: string | null;
  created_at: Date;
  last_contact_at: Date | null;
  merged_into_id: string | null;
  contacts: number;
  addresses: number;
  relationships: number;
  client_types: number;
  [key: string]: unknown;
}

const SIDE_SQL = `
  select p.*,
         coalesce(u.display_name, u.full_name) as agent_name,
         (select count(*)::int from person_contacts c where c.person_id = p.id) as contacts,
         (select count(*)::int from person_addresses a where a.person_id = p.id) as addresses,
         (select count(*)::int from person_relationships r
            where r.person_id = p.id or r.related_person_id = p.id) as relationships,
         (select count(*)::int from person_client_types t where t.person_id = p.id) as client_types
    from people p
    left join users u on u.id = p.primary_agent_id
   where p.id = $1`;

/** Side-by-side view of two records, used by the compare and merge screens. */
export async function getMergeComparison(
  db: Db,
  masterId: string,
  mergedId: string,
): Promise<MergeComparison> {
  const [master, merged] = await Promise.all([
    db.maybeOne<SideRow>(SIDE_SQL, [masterId]),
    db.maybeOne<SideRow>(SIDE_SQL, [mergedId]),
  ]);
  if (!master || !merged) throw new NotFoundError('One of those people');

  const fields: ComparisonField[] = (
    Object.keys(SELECTABLE_FIELDS) as SelectableField[]
  ).map((field) => {
    const masterValue = display(field, master[field]);
    const mergedValue = display(field, merged[field]);
    return {
      field,
      label: SELECTABLE_FIELDS[field],
      masterValue,
      mergedValue,
      differs: masterValue !== mergedValue,
    };
  });

  return { master: toSide(master), merged: toSide(merged), fields };
}

function toSide(row: SideRow): PersonSide {
  return {
    id: row.id,
    clientRef: row.client_ref,
    fullName: `${row.first_name} ${row.surname}`.trim(),
    agentName: row.agent_name,
    createdAt: row.created_at.toISOString(),
    lastContactAt: row.last_contact_at?.toISOString() ?? null,
    counts: {
      contacts: row.contacts,
      addresses: row.addresses,
      relationships: row.relationships,
      clientTypes: row.client_types,
    },
  };
}

function display(field: SelectableField, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (field === 'business_area') return labelOf(BUSINESS_AREAS, String(value));
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export interface MergeResult {
  masterReference: string;
  mergedReference: string;
  moved: Record<string, { moved: number; dropped: number }>;
}

/**
 * Performs the merge. Everything below happens in the caller's transaction,
 * so a failure anywhere leaves both records exactly as they were.
 */
export async function mergePeople(
  db: Db,
  ctx: Ctx,
  input: {
    masterId: string;
    mergedId: string;
    /** field -> 'master' | 'merged'. Anything missing keeps the master's value. */
    choices: Partial<Record<SelectableField, 'master' | 'merged'>>;
    reason: string | null;
  },
): Promise<MergeResult> {
  if (!ctx.actor.permissions.has('MERGE_RECORDS')) {
    throw new ForbiddenError('merging records');
  }
  if (input.masterId === input.mergedId) {
    throw new ValidationError(
      { _form: ['A record cannot be merged into itself.'] },
      'A record cannot be merged into itself.',
    );
  }

  const merged = await db.maybeOne<SideRow>(SIDE_SQL, [input.mergedId]);
  const master = await db.maybeOne<SideRow>(SIDE_SQL, [input.masterId]);
  if (!merged || !master) throw new NotFoundError('One of those people');

  // Apply the chosen surviving values to the master before the history moves.
  const takeFromMerged = (Object.keys(input.choices) as SelectableField[]).filter(
    (field) => input.choices[field] === 'merged' && field in SELECTABLE_FIELDS,
  );
  if (takeFromMerged.length > 0) {
    const assignments = takeFromMerged.map((field, index) => `${field} = $${index + 2}`);
    await db.query(
      `update people set ${assignments.join(', ')}, updated_by = $${takeFromMerged.length + 2}
        where id = $1`,
      [input.masterId, ...takeFromMerged.map((field) => merged[field] ?? null), ctx.actor.id],
    );
  }

  const selected = Object.fromEntries(
    (Object.keys(SELECTABLE_FIELDS) as SelectableField[]).map((field) => [
      field,
      input.choices[field] ?? 'master',
    ]),
  );

  const row = await db.one<{
    merge_people: {
      master_reference: string;
      merged_reference: string;
      moved: Record<string, { moved: number; dropped: number }>;
    };
  }>('select app.merge_people($1, $2, $3, $4::jsonb) as merge_people', [
    input.masterId,
    input.mergedId,
    input.reason,
    JSON.stringify(selected),
  ]);
  const result: MergeResult = {
    masterReference: row.merge_people.master_reference,
    mergedReference: row.merge_people.merged_reference,
    moved: row.merge_people.moved ?? {},
  };

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'person.merged',
    entityType: 'person',
    entityId: input.masterId,
    entityLabel: `${master.client_ref} ← ${merged.client_ref}`,
    context: {
      masterReference: master.client_ref,
      mergedReference: merged.client_ref,
      reason: input.reason,
      choices: selected,
      moved: result.moved,
    },
  });

  return result;
}

/** Records that a pair is not a duplicate, so it stops being offered (spec 21). */
export async function dismissDuplicatePair(
  db: Db,
  ctx: Ctx,
  input: {
    entityType: 'person' | 'property';
    firstId: string;
    secondId: string;
    decision: 'not_duplicate' | 'review_later';
    reason: string | null;
  },
): Promise<void> {
  // The table stores the pair in a fixed order so one pair cannot be filed twice.
  const [leftId, rightId] =
    input.firstId < input.secondId ? [input.firstId, input.secondId] : [input.secondId, input.firstId];

  await db.query(
    `insert into duplicate_dismissals (entity_type, left_id, right_id, decision, reason, decided_by)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (entity_type, left_id, right_id) do update
       set decision = excluded.decision, reason = excluded.reason,
           decided_at = now(), decided_by = excluded.decided_by`,
    [input.entityType, leftId, rightId, input.decision, input.reason, ctx.actor.id],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'duplicate.dismissed',
    entityType: input.entityType,
    entityId: leftId,
    context: { pairedWith: rightId, decision: input.decision, reason: input.reason },
  });
}
