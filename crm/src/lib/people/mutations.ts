import { agentToKeep, type Ctx } from '../actor.ts';
import type { Db } from '../db.ts';
import { diff, recordAudit } from '../audit.ts';
import { ConcurrencyError, NotFoundError, ValidationError } from '../errors.ts';
import {
  fingerprintIdentity,
  fingerprintPassport,
  lastThree,
  normaliseIdNumber,
  normalisePassportNumber,
  validateSaIdNumber,
} from '../identity.ts';
import type { PersonInput } from './types.ts';

/**
 * Writes to the people master database.
 *
 * Everything here assumes row level security is doing its job: a query that
 * returns no row means the caller may not touch that record, which becomes a
 * plain "could not be found" rather than a leak about who else exists.
 */

const AUDITED_FIELDS = [
  'title', 'first_name', 'middle_name', 'surname', 'preferred_name',
  'business_area', 'primary_agent_id', 'secondary_agent_id', 'office_id', 'team_id',
  'next_follow_up_at', 'notes', 'is_archived', 'passport_country', 'passport_expiry',
] as const;

export interface PersonWriteResult {
  id: string;
  clientRef: string;
}

/**
 * Creates a person and returns their permanent GRLP client reference.
 *
 * An agent without company-wide access is recorded as the primary agent when
 * none is chosen, because row level security would otherwise hide the record
 * from the person who just created it.
 */
export async function createPerson(
  db: Db,
  ctx: Ctx,
  input: PersonInput,
): Promise<PersonWriteResult> {
  const identity = prepareIdentity(input);
  const primaryAgentId = agentToKeep(ctx.actor, input.primaryAgentId);

  const person = await db.one<{ id: string; client_ref: string }>(
    `insert into people
       (title, first_name, middle_name, surname, preferred_name,
        id_last3, id_fingerprint, passport_last3, passport_fingerprint,
        passport_country, passport_expiry,
        business_area, primary_agent_id, secondary_agent_id, office_id, team_id,
        next_follow_up_at, notes, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)
     returning id, client_ref`,
    [
      input.title, input.firstName, input.middleName, input.surname, input.preferredName,
      identity.idLast3, identity.idFingerprint,
      identity.passportLast3, identity.passportFingerprint,
      input.passportCountry, input.passportExpiry,
      input.businessArea, primaryAgentId, input.secondaryAgentId, input.officeId, input.teamId,
      input.nextFollowUpAt, input.notes, ctx.actor.id,
    ],
  );

  await writeIdentity(db, ctx, person.id, input, { allowClear: false });
  await replaceClientTypes(db, ctx, person.id, input.clientTypes);
  await replaceContacts(db, ctx, person.id, input.contacts);
  await replaceAddresses(db, ctx, person.id, input.addresses);
  await replaceTags(db, ctx, person.id, input.tagIds);

  if (primaryAgentId) {
    await db.query(
      `insert into person_agent_assignments (person_id, agent_id, assignment, assigned_by, reason)
       values ($1,$2,'primary',$3,'Created')`,
      [person.id, primaryAgentId, ctx.actor.id],
    );
  }
  if (input.secondaryAgentId) {
    await db.query(
      `insert into person_agent_assignments (person_id, agent_id, assignment, assigned_by, reason)
       values ($1,$2,'secondary',$3,'Created')`,
      [person.id, input.secondaryAgentId, ctx.actor.id],
    );
  }

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'person.created',
    entityType: 'person',
    entityId: person.id,
    entityLabel: `${person.client_ref} ${input.firstName} ${input.surname}`,
    context: {
      businessArea: input.businessArea,
      clientTypes: input.clientTypes,
      identityRecorded: identity.idFingerprint !== null,
    },
  });

  return { id: person.id, clientRef: person.client_ref };
}

/**
 * Updates a person, refusing to overwrite a change someone else made while
 * this form was open (spec 105).
 */
export async function updatePerson(
  db: Db,
  ctx: Ctx,
  personId: string,
  input: PersonInput,
  expectedVersion: number,
  options: {
    /**
     * Whether a blank identity in the input may clear one already on file.
     *
     * A person editing the form can see that a number is recorded and choose
     * to remove it, so the default is to let somebody with PERSON_ID_VIEW do
     * that. An import passes false: a blank column in a spreadsheet means the
     * spreadsheet did not have the number, not that the office wants the
     * checked one deleted.
     */
    mayClearIdentity?: boolean;
  } = {},
): Promise<PersonWriteResult> {
  const before = await db.maybeOne<Record<string, unknown> & { client_ref: string; row_version: number }>(
    `select id, client_ref, row_version, title, first_name, middle_name, surname, preferred_name,
            business_area, primary_agent_id, secondary_agent_id, office_id, team_id,
            next_follow_up_at, notes, is_archived, passport_country, passport_expiry
       from people where id = $1`,
    [personId],
  );
  if (!before) throw new NotFoundError('That person');
  if (before.row_version !== expectedVersion) throw new ConcurrencyError();

  const identity = prepareIdentity(input);
  const allowClear =
    (options.mayClearIdentity ?? true) && ctx.actor.permissions.has('PERSON_ID_VIEW');
  const primaryAgentId = agentToKeep(
    ctx.actor,
    input.primaryAgentId,
    before.primary_agent_id as string | null,
  );

  const updated = await db.query<Record<string, unknown>>(
    `update people set
       title = $2, first_name = $3, middle_name = $4, surname = $5, preferred_name = $6,
       passport_country = $7, passport_expiry = $8,
       business_area = $9, primary_agent_id = $10, secondary_agent_id = $11,
       office_id = $12, team_id = $13, next_follow_up_at = $14, notes = $15,
       id_last3 = case when $16::text is not null then $16::text
                       when $18::boolean then null else id_last3 end,
       id_fingerprint = case when $17::text is not null then $17::text
                             when $18::boolean then null else id_fingerprint end,
       passport_last3 = case when $19::text is not null then $19::text
                             when $18::boolean then null else passport_last3 end,
       passport_fingerprint = case when $20::text is not null then $20::text
                                   when $18::boolean then null else passport_fingerprint end,
       updated_by = $21
     where id = $1 and row_version = $22
     returning id, client_ref, title, first_name, middle_name, surname, preferred_name,
               business_area, primary_agent_id, secondary_agent_id, office_id, team_id,
               next_follow_up_at, notes, is_archived, passport_country, passport_expiry`,
    [
      personId, input.title, input.firstName, input.middleName, input.surname, input.preferredName,
      input.passportCountry, input.passportExpiry,
      input.businessArea, primaryAgentId, input.secondaryAgentId,
      input.officeId, input.teamId, input.nextFollowUpAt, input.notes,
      identity.idLast3, identity.idFingerprint, allowClear,
      identity.passportLast3, identity.passportFingerprint,
      ctx.actor.id, expectedVersion,
    ],
  );
  const after = updated[0];
  if (!after) throw new ConcurrencyError();

  await writeIdentity(db, ctx, personId, input, { allowClear });
  await replaceClientTypes(db, ctx, personId, input.clientTypes);
  await replaceContacts(db, ctx, personId, input.contacts);
  await replaceAddresses(db, ctx, personId, input.addresses);
  await replaceTags(db, ctx, personId, input.tagIds);
  await recordAgentChange(db, ctx, personId, before, after);

  const changes = diff(before, after, AUDITED_FIELDS);
  if (Object.keys(changes).length > 0 || identity.idFingerprint !== null) {
    await recordAudit(db, ctx.actor, ctx.meta, {
      action: 'person.updated',
      entityType: 'person',
      entityId: personId,
      entityLabel: `${before.client_ref} ${input.firstName} ${input.surname}`,
      changes,
    });
  }

  return { id: personId, clientRef: before.client_ref };
}

/** Archived, never deleted: the history and the reference both survive (spec 104). */
export async function archivePerson(
  db: Db,
  ctx: Ctx,
  personId: string,
  reason: string | null,
): Promise<void> {
  const row = await db.maybeOne<{ client_ref: string; is_archived: boolean }>(
    'select client_ref, is_archived from people where id = $1',
    [personId],
  );
  if (!row) throw new NotFoundError('That person');
  if (row.is_archived) return;

  await db.query(
    `update people set is_archived = true, archived_at = now(), archived_by = $2,
            archive_reason = $3, updated_by = $2
       where id = $1`,
    [personId, ctx.actor.id, reason],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'person.archived',
    entityType: 'person',
    entityId: personId,
    entityLabel: row.client_ref,
    context: { reason },
  });
}

export async function restorePerson(db: Db, ctx: Ctx, personId: string): Promise<void> {
  const row = await db.maybeOne<{ client_ref: string; merged_into_id: string | null }>(
    'select client_ref, merged_into_id from people where id = $1',
    [personId],
  );
  if (!row) throw new NotFoundError('That person');
  if (row.merged_into_id) {
    throw new ValidationError(
      { _form: ['That record was merged into another and cannot be restored on its own.'] },
      'That record was merged into another and cannot be restored on its own.',
    );
  }
  await db.query(
    `update people set is_archived = false, archived_at = null, archived_by = null,
            archive_reason = null, updated_by = $2 where id = $1`,
    [personId, ctx.actor.id],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'person.restored',
    entityType: 'person',
    entityId: personId,
    entityLabel: row.client_ref,
  });
}

/** Reassignment keeps the previous assignment in the history (spec 65). */
export async function assignPersonAgent(
  db: Db,
  ctx: Ctx,
  personId: string,
  input: { primaryAgentId: string | null; secondaryAgentId: string | null; reason: string | null },
): Promise<void> {
  const before = await db.maybeOne<{
    client_ref: string;
    primary_agent_id: string | null;
    secondary_agent_id: string | null;
  }>('select client_ref, primary_agent_id, secondary_agent_id from people where id = $1', [personId]);
  if (!before) throw new NotFoundError('That person');

  await db.query(
    `update people set primary_agent_id = $2, secondary_agent_id = $3, updated_by = $4 where id = $1`,
    [personId, input.primaryAgentId, input.secondaryAgentId, ctx.actor.id],
  );
  await recordAgentChange(
    db,
    ctx,
    personId,
    before,
    { primary_agent_id: input.primaryAgentId, secondary_agent_id: input.secondaryAgentId },
    input.reason,
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'person.agent_assigned',
    entityType: 'person',
    entityId: personId,
    entityLabel: before.client_ref,
    changes: diff(before, {
      primary_agent_id: input.primaryAgentId,
      secondary_agent_id: input.secondaryAgentId,
    }, ['primary_agent_id', 'secondary_agent_id']),
    context: { reason: input.reason },
  });
}

// --- child collections ------------------------------------------------------

async function replaceClientTypes(
  db: Db,
  ctx: Ctx,
  personId: string,
  clientTypes: string[],
): Promise<void> {
  await db.query(
    'delete from person_client_types where person_id = $1 and client_type <> all($2::text[])',
    [personId, clientTypes],
  );
  if (clientTypes.length > 0) {
    await db.query(
      `insert into person_client_types (person_id, client_type, added_by)
       select $1, unnest($2::text[]), $3
       on conflict (person_id, client_type) do nothing`,
      [personId, clientTypes, ctx.actor.id],
    );
  }
}

async function replaceContacts(
  db: Db,
  ctx: Ctx,
  personId: string,
  contacts: PersonInput['contacts'],
): Promise<void> {
  const keepIds = contacts.map((c) => c.id).filter((id): id is string => Boolean(id));
  await db.query('delete from person_contacts where person_id = $1 and id <> all($2::uuid[])', [
    personId,
    keepIds,
  ]);

  for (const contact of contacts) {
    if (contact.id) {
      await db.query(
        `update person_contacts
            set contact_type = $3, value = $4, is_primary = $5, is_active = $6,
                notes = $7, updated_by = $8
          where id = $1 and person_id = $2`,
        [
          contact.id, personId, contact.contactType, contact.value,
          contact.isPrimary, contact.isActive, contact.notes, ctx.actor.id,
        ],
      );
    } else {
      await db.query(
        `insert into person_contacts
           (person_id, contact_type, value, is_primary, is_active, notes, created_by, updated_by)
         values ($1,$2,$3,$4,$5,$6,$7,$7)
         on conflict do nothing`,
        [
          personId, contact.contactType, contact.value, contact.isPrimary,
          contact.isActive, contact.notes, ctx.actor.id,
        ],
      );
    }
  }
}

async function replaceAddresses(
  db: Db,
  ctx: Ctx,
  personId: string,
  addresses: PersonInput['addresses'],
): Promise<void> {
  const keepIds = addresses.map((a) => a.id).filter((id): id is string => Boolean(id));
  await db.query('delete from person_addresses where person_id = $1 and id <> all($2::uuid[])', [
    personId,
    keepIds,
  ]);

  for (const address of addresses) {
    const empty =
      !address.line1 && !address.line2 && !address.suburb && !address.city && !address.postalCode;
    if (empty && !address.id) continue;

    if (address.id) {
      await db.query(
        `update person_addresses set address_type=$3, line1=$4, line2=$5, suburb=$6, city=$7,
                province=$8, postal_code=$9, is_primary=$10, notes=$11, updated_by=$12
          where id=$1 and person_id=$2`,
        [
          address.id, personId, address.addressType, address.line1, address.line2,
          address.suburb, address.city, address.province, address.postalCode,
          address.isPrimary, address.notes, ctx.actor.id,
        ],
      );
    } else {
      await db.query(
        `insert into person_addresses
           (person_id, address_type, line1, line2, suburb, city, province, postal_code,
            is_primary, notes, created_by, updated_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
        [
          personId, address.addressType, address.line1, address.line2, address.suburb,
          address.city, address.province, address.postalCode, address.isPrimary,
          address.notes, ctx.actor.id,
        ],
      );
    }
  }
}

async function replaceTags(db: Db, ctx: Ctx, personId: string, tagIds: string[]): Promise<void> {
  await db.query(
    `delete from record_tags
      where entity_type = 'person' and entity_id = $1 and tag_id <> all($2::uuid[])`,
    [personId, tagIds],
  );
  if (tagIds.length > 0) {
    await db.query(
      `insert into record_tags (tag_id, entity_type, entity_id, added_by)
       select unnest($2::uuid[]), 'person', $1, $3
       on conflict do nothing`,
      [personId, tagIds, ctx.actor.id],
    );
  }
}

/**
 * Identity numbers.
 *
 * A blank submission only clears a stored number when the person submitting
 * it could actually see what they were clearing. Without PERSON_ID_VIEW the
 * field renders masked, so an empty box means "unchanged", not "delete".
 */
async function writeIdentity(
  db: Db,
  ctx: Ctx,
  personId: string,
  input: PersonInput,
  options: { allowClear: boolean },
): Promise<void> {
  const hasId = Boolean(input.idNumber);
  const hasPassport = Boolean(input.passportNumber);
  if (!hasId && !hasPassport && !options.allowClear) return;

  if (hasId) {
    const check = validateSaIdNumber(input.idNumber as string);
    if (!check.valid) throw new ValidationError({ idNumber: [check.reason as string] });
  }

  const idNumber = hasId ? normaliseIdNumber(input.idNumber as string) : null;
  const passportNumber = hasPassport
    ? normalisePassportNumber(input.passportNumber as string)
    : null;
  const params = [personId, idNumber, passportNumber, ctx.actor.id, options.allowClear];

  // Update first, then insert if there was nothing to update.
  //
  // ON CONFLICT DO UPDATE would be shorter, but under row level security it
  // also requires the SELECT policy to pass, and that policy needs
  // PERSON_ID_VIEW. Splitting the two keeps the intended rule: an agent may
  // record a number they are looking at without being able to read back the
  // numbers held against anybody else.
  const updated = await db.count(
    `update person_identity
        set id_number = case when $5::boolean then $2::text else coalesce($2::text, id_number) end,
            passport_number = case when $5::boolean then $3::text
                                   else coalesce($3::text, passport_number) end,
            updated_at = now(), updated_by = $4
      where person_id = $1`,
    params,
  );
  if (updated === 0) {
    await db.query(
      `insert into person_identity (person_id, id_number, passport_number, recorded_by, updated_by)
       values ($1,$2,$3,$4,$4)`,
      [personId, idNumber, passportNumber, ctx.actor.id],
    );
  }

  if (hasId || hasPassport) {
    await recordAudit(db, ctx.actor, ctx.meta, {
      action: 'person.identity_recorded',
      entityType: 'person',
      entityId: personId,
      // The number itself is never written to the log.
      context: { recorded: [hasId ? 'ID number' : null, hasPassport ? 'Passport' : null].filter(Boolean) },
    });
  }
}

function prepareIdentity(input: PersonInput): {
  idLast3: string | null;
  idFingerprint: string | null;
  passportLast3: string | null;
  passportFingerprint: string | null;
} {
  const idLast3 = input.idNumber ? lastThree(input.idNumber) : null;
  const idFingerprint = input.idNumber ? fingerprintIdentity(input.idNumber) || null : null;
  const passportLast3 = input.passportNumber ? lastThree(input.passportNumber) : null;
  const passportFingerprint = input.passportNumber
    ? fingerprintPassport(input.passportNumber, input.passportCountry) || null
    : null;
  return { idLast3, idFingerprint, passportLast3, passportFingerprint };
}

async function recordAgentChange(
  db: Db,
  ctx: Ctx,
  personId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  reason: string | null = null,
): Promise<void> {
  for (const [assignment, field] of [
    ['primary', 'primary_agent_id'],
    ['secondary', 'secondary_agent_id'],
  ] as const) {
    const previous = (before[field] ?? null) as string | null;
    const next = (after[field] ?? null) as string | null;
    if (previous === next) continue;

    if (previous) {
      await db.query(
        `update person_agent_assignments set unassigned_at = now()
          where person_id = $1 and assignment = $2 and agent_id = $3 and unassigned_at is null`,
        [personId, assignment, previous],
      );
    }
    if (next) {
      await db.query(
        `insert into person_agent_assignments
           (person_id, agent_id, assignment, assigned_by, reason)
         values ($1,$2,$3,$4,$5)`,
        [personId, next, assignment, ctx.actor.id, reason],
      );
    }
  }
}

// --- relationships ----------------------------------------------------------

export async function addPersonRelationship(
  db: Db,
  ctx: Ctx,
  personId: string,
  input: {
    relatedPersonId: string;
    relationshipType: string;
    startDate: string | null;
    endDate: string | null;
    notes: string | null;
  },
): Promise<void> {
  if (personId === input.relatedPersonId) {
    throw new ValidationError({
      relatedPersonId: ['A person cannot be related to themselves.'],
    });
  }
  await db.query(
    `insert into person_relationships
       (person_id, related_person_id, relationship_type, start_date, end_date, notes,
        created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$7)
     on conflict (person_id, related_person_id, relationship_type) do update
       set start_date = excluded.start_date, end_date = excluded.end_date,
           notes = excluded.notes, updated_by = excluded.updated_by`,
    [
      personId, input.relatedPersonId, input.relationshipType,
      input.startDate, input.endDate, input.notes, ctx.actor.id,
    ],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'person.relationship_added',
    entityType: 'person',
    entityId: personId,
    context: { relationshipType: input.relationshipType, relatedPersonId: input.relatedPersonId },
  });
}

export async function removePersonRelationship(
  db: Db,
  ctx: Ctx,
  personId: string,
  relationshipId: string,
): Promise<void> {
  const removed = await db.count(
    'delete from person_relationships where id = $1 and (person_id = $2 or related_person_id = $2)',
    [relationshipId, personId],
  );
  if (removed === 0) throw new NotFoundError('That relationship');
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'person.relationship_removed',
    entityType: 'person',
    entityId: personId,
    context: { relationshipId },
  });
}
