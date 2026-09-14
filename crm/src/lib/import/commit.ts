import type { Ctx } from '../actor.ts';
import type { Db } from '../db.ts';
import { recordAudit } from '../audit.ts';
import { ConcurrencyError, NotFoundError, ValidationError } from '../errors.ts';
import { parseOrThrow } from '../validate.ts';
import { findPersonDuplicates } from '../people/duplicates.ts';
import { findPropertyDuplicates } from '../properties/duplicates.ts';
import { createPerson, updatePerson } from '../people/mutations.ts';
import { personInputSchema } from '../people/types.ts';
import { getPerson } from '../people/queries.ts';
import { createProperty, updateProperty } from '../properties/mutations.ts';
import { propertyInputSchema } from '../properties/types.ts';
import { getProperty } from '../properties/queries.ts';
import { getImportBatch, mapRow, type ImportBatch, type RowAction } from './batches.ts';

/**
 * Deciding what to do with each row, then doing it (spec 65, 67, 69, 70).
 *
 * Preview decides and writes nothing. It maps every row, looks for a record
 * the row is probably already about, and records an intention — create,
 * update, skip or error — with a reason a person can read. Then a person
 * looks at it.
 *
 * Commit carries out those intentions inside one transaction. If any row
 * fails in a way that was not foreseen, the whole thing is rolled back by
 * the database and the batch is marked failed with the reason: a half-done
 * import is the outcome this design exists to prevent (spec 106).
 *
 * Crucially, the writes go through the ordinary createPerson / updatePerson
 * and createProperty / updateProperty paths. An import is not a back door:
 * it validates the same way, audits the same way, and is subject to the same
 * row level security, so nobody can import a record they could not have
 * typed in by hand.
 */

export interface PreviewOutcome {
  create: number;
  update: number;
  skip: number;
  error: number;
}

type DecidedAction = Exclude<RowAction, 'pending'>;

/**
 * A row becomes an update only on a 'high' confidence match — something that
 * identifies one specific record, such as the same ID number or the same
 * mobile number. A 'possible' match (a similar name, the same surname in the
 * same suburb) is left as a new record and flagged instead: creating a
 * duplicate somebody can merge on purpose is recoverable, and quietly writing
 * a spreadsheet row into the wrong person's record is not.
 */
const CONFIDENCE_SCORE: Record<'high' | 'possible', number> = { high: 100, possible: 50 };

export async function previewImport(
  db: Db,
  ctx: Ctx,
  batchId: string,
): Promise<PreviewOutcome> {
  const batch = await getImportBatch(db, batchId);
  if (!batch) throw new NotFoundError('That import');
  if (!['draft', 'mapped', 'previewed'].includes(batch.status)) {
    throw new ValidationError(
      { _form: ['This import has already been run.'] },
      'This import has already been run.',
    );
  }
  if (Object.keys(batch.mapping).length === 0) {
    throw new ValidationError(
      { _form: ['Match the columns to fields first.'] },
      'Match the columns to fields first.',
    );
  }

  const rows = await db.query<{ id: string; row_number: number; raw: Record<string, string> }>(
    'select id, row_number, raw from import_rows where batch_id = $1 order by row_number',
    [batchId],
  );

  const outcome: PreviewOutcome = { create: 0, update: 0, skip: 0, error: 0 };

  // Within one file the same person can appear twice. The second occurrence
  // must not create a second record, so what this run has already decided to
  // create is remembered and matched against.
  const seenInThisFile = new Map<string, number>();

  for (const row of rows) {
    const mapped = mapRow(row.raw, batch);
    let action: DecidedAction = 'create';
    let reason = 'Nothing like this is on the system yet.';
    let targetId: string | null = null;
    let score: number | null = null;
    const errors: string[] = [...mapped.problems];

    if (mapped.empty) {
      action = 'error';
      errors.unshift('This row has nothing in it that could identify a record.');
    } else {
      const fingerprint = rowFingerprint(mapped.values, batch.entityType);
      const duplicateWithinFile = fingerprint ? seenInThisFile.get(fingerprint) : undefined;

      if (duplicateWithinFile) {
        action = 'skip';
        reason = `The same record appears on line ${duplicateWithinFile} of this file.`;
      } else {
        const match = await findExisting(db, batch, mapped.values);
        if (match) {
          score = CONFIDENCE_SCORE[match.confidence];
          if (match.confidence === 'high') {
            action = 'update';
            targetId = match.id;
            reason = `Already on the system as ${match.label} — ${match.reason}. Blank fields will be filled in; nothing already there is overwritten.`;
          } else {
            action = 'create';
            reason = `New record, but it looks similar to ${match.label} — ${match.reason}. Worth a look before you import.`;
          }
        }
        if (fingerprint) seenInThisFile.set(fingerprint, row.row_number);
      }
    }

    // A value that could not be read is worth reporting but does not by
    // itself make the row unimportable; the rest of the row is still useful.
    if (action !== 'error' && errors.length > 0) {
      reason = `${reason} Some values could not be read.`;
    }

    await db.query(
      `update import_rows
          set mapped = $2::jsonb, action = $3, action_reason = $4,
              target_id = $5, match_score = $6, errors = $7::jsonb
        where id = $1`,
      [
        row.id,
        JSON.stringify(mapped.values),
        action,
        reason,
        targetId,
        score,
        JSON.stringify(errors),
      ],
    );

    outcome[action] += 1;
  }

  await db.query(
    `update import_batches
        set status = 'previewed', previewed_at = now(), updated_by = $2,
            created_count = $3, updated_count = $4, skipped_count = $5, failed_count = $6
      where id = $1`,
    [batchId, ctx.actor.id, outcome.create, outcome.update, outcome.skip, outcome.error],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'import.previewed',
    entityType: 'import_batch',
    entityId: batchId,
    context: { batchRef: batch.batchRef, ...outcome },
  });

  return outcome;
}

/** A stable key for "the same record", used only within one file. */
function rowFingerprint(
  values: Record<string, string | string[]>,
  entityType: 'person' | 'property',
): string | null {
  const text = (key: string) => {
    const value = values[key];
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  };

  if (entityType === 'person') {
    if (text('idNumber')) return `id:${text('idNumber')}`;
    if (text('mobile')) return `mobile:${text('mobile')}`;
    if (text('email')) return `email:${text('email')}`;
    const name = `${text('firstName')} ${text('surname')}`.trim();
    return name.length > 0 ? `name:${name}` : null;
  }

  if (text('erfNumber')) {
    return `erf:${text('erfNumber')}/${text('portionNumber')}/${text('township')}`;
  }
  const address = `${text('streetAddress')} ${text('suburb')}`.trim();
  return address.length > 0 ? `address:${address}` : null;
}

interface ExistingMatch {
  id: string;
  label: string;
  reason: string;
  confidence: 'high' | 'possible';
}

/**
 * Looks for a record this row is already about, reusing the very same
 * duplicate detection the capture forms use, so an import and a person
 * typing agree about what counts as the same client.
 */
async function findExisting(
  db: Db,
  batch: ImportBatch,
  values: Record<string, string | string[]>,
): Promise<ExistingMatch | null> {
  const text = (key: string) => {
    const value = values[key];
    return typeof value === 'string' ? value : null;
  };

  if (batch.entityType === 'person') {
    const contactValues = [text('mobile'), text('alternativeMobile'), text('email'), text('whatsapp')]
      .filter((value): value is string => Boolean(value));

    const matches = await findPersonDuplicates(
      db,
      {
        firstName: text('firstName') ?? '',
        surname: text('surname') ?? '',
        idNumber: text('idNumber'),
        contactValues,
        suburb: text('addressSuburb'),
      },
      { limit: 1 },
    );
    const best = matches[0];
    if (!best) return null;
    return {
      id: best.personId,
      label: `${best.fullName} (${best.clientRef})`,
      reason: best.reasons.join(', ').toLowerCase(),
      confidence: best.confidence,
    };
  }

  const matches = await findPropertyDuplicates(
    db,
    {
      erfNumber: text('erfNumber'),
      portionNumber: text('portionNumber'),
      streetAddress: text('streetAddress'),
      propertyName: text('propertyName'),
      suburb: text('suburb'),
      city: text('city'),
    },
    { limit: 1 },
  );
  const best = matches[0];
  if (!best) return null;
  return {
    id: best.propertyId,
    label: `${best.addressLine} (${best.propertyRef})`,
    reason: best.reasons.join(', ').toLowerCase(),
    confidence: best.confidence,
  };
}

// ---------------------------------------------------------------------------
// Committing
// ---------------------------------------------------------------------------

export interface CommitOutcome {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

/**
 * Carries out the previewed intentions.
 *
 * Must be called inside a write transaction (withUser does this), so a
 * failure anywhere takes the whole import with it rather than leaving half
 * of it behind.
 */
export async function commitImport(
  db: Db,
  ctx: Ctx,
  batchId: string,
  expectedVersion: number,
): Promise<CommitOutcome> {
  const batch = await getImportBatch(db, batchId);
  if (!batch) throw new NotFoundError('That import');
  if (batch.status !== 'previewed') {
    throw new ValidationError(
      { _form: ['Check the import first, so you can see what it is going to do.'] },
      'Check the import first, so you can see what it is going to do.',
    );
  }
  if (batch.rowVersion !== expectedVersion) throw new ConcurrencyError();

  const rows = await db.query<{
    id: string;
    row_number: number;
    mapped: Record<string, string | string[]> | null;
    action: RowAction;
    target_id: string | null;
  }>(
    `select id, row_number, mapped, action, target_id
       from import_rows
      where batch_id = $1 and action in ('create','update') and committed_at is null
      order by row_number`,
    [batchId],
  );

  const outcome: CommitOutcome = { created: 0, updated: 0, skipped: 0, failed: 0 };

  for (const row of rows) {
    const values = row.mapped ?? {};
    try {
      if (row.action === 'create') {
        const id = await createFromRow(db, ctx, batch, values);
        await db.query(
          `update import_rows
              set target_id = $2, committed_at = now(), created_record = true
            where id = $1`,
          [row.id, id],
        );
        // Provenance on the record itself, so the question "where did this
        // come from" is answerable from the record.
        await db.query(
          batch.entityType === 'person'
            ? 'update people set imported_from_batch_id = $2 where id = $1'
            : 'update properties set imported_from_batch_id = $2 where id = $1',
          [id, batchId],
        );
        outcome.created += 1;
      } else if (row.target_id) {
        await updateFromRow(db, ctx, batch, row.target_id, values);
        await db.query('update import_rows set committed_at = now() where id = $1', [row.id]);
        outcome.updated += 1;
      }
    } catch (error) {
      // One bad row must not leave the rest half-applied, so the whole
      // transaction is abandoned. What failed and why is on the batch.
      const detail = error instanceof Error ? error.message : 'Unknown problem';
      throw new ValidationError(
        {
          _form: [
            `Line ${row.row_number} could not be imported (${detail}), so nothing was imported. ` +
              'Fix that row in the file and try again.',
          ],
        },
        `Line ${row.row_number} could not be imported, so nothing was imported.`,
      );
    }
  }

  const counts = await db.one<{ skipped: number; failed: number }>(
    `select count(*) filter (where action = 'skip')::int as skipped,
            count(*) filter (where action = 'error')::int as failed
       from import_rows where batch_id = $1`,
    [batchId],
  );
  outcome.skipped = counts.skipped;
  outcome.failed = counts.failed;

  const changed = await db.count(
    `update import_batches
        set status = 'committed', committed_at = now(), committed_by = $2, updated_by = $2,
            created_count = $3, updated_count = $4, skipped_count = $5, failed_count = $6
      where id = $1 and row_version = $7 and status = 'previewed'`,
    [
      batchId,
      ctx.actor.id,
      outcome.created,
      outcome.updated,
      outcome.skipped,
      outcome.failed,
      expectedVersion,
    ],
  );
  if (changed === 0) throw new ConcurrencyError();

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'import.committed',
    entityType: 'import_batch',
    entityId: batchId,
    context: { batchRef: batch.batchRef, ...outcome },
  });

  return outcome;
}

function contactsFrom(values: Record<string, string | string[]>) {
  const contacts: { contactType: string; value: string; isPrimary: boolean }[] = [];
  const add = (contactType: string, key: string, isPrimary = false) => {
    const value = values[key];
    if (typeof value === 'string' && value.length > 0) {
      contacts.push({ contactType, value, isPrimary });
    }
  };
  add('mobile', 'mobile', true);
  add('alternative_mobile', 'alternativeMobile');
  add('landline', 'landline');
  add('whatsapp', 'whatsapp');
  add('email', 'email', true);
  return contacts;
}

function addressesFrom(values: Record<string, string | string[]>) {
  const line1 = values.addressLine1;
  const suburb = values.addressSuburb;
  const city = values.addressCity;
  if (
    typeof line1 !== 'string' &&
    typeof suburb !== 'string' &&
    typeof city !== 'string'
  ) {
    return [];
  }
  return [
    {
      addressType: 'physical',
      line1: typeof line1 === 'string' ? line1 : null,
      line2: typeof values.addressLine2 === 'string' ? values.addressLine2 : null,
      suburb: typeof suburb === 'string' ? suburb : null,
      city: typeof city === 'string' ? city : null,
      province: typeof values.addressProvince === 'string' ? values.addressProvince : '',
      postalCode:
        typeof values.addressPostalCode === 'string' ? values.addressPostalCode : null,
    },
  ];
}

async function createFromRow(
  db: Db,
  ctx: Ctx,
  batch: ImportBatch,
  values: Record<string, string | string[]>,
): Promise<string> {
  if (batch.entityType === 'person') {
    const input = parseOrThrow(personInputSchema, {
      title: values.title,
      firstName: values.firstName ?? '(not given)',
      middleName: values.middleName,
      surname: values.surname ?? '(not given)',
      preferredName: values.preferredName,
      idNumber: values.idNumber,
      passportNumber: values.passportNumber,
      passportCountry: values.passportCountry,
      passportExpiry: values.passportExpiry,
      businessArea: values.businessArea ?? 'sales',
      clientTypes: Array.isArray(values.clientTypes) ? values.clientTypes : [],
      notes: values.notes,
      contacts: contactsFrom(values),
      addresses: addressesFrom(values),
    });
    const result = await createPerson(db, ctx, input);
    return result.id;
  }

  const input = parseOrThrow(propertyInputSchema, {
    erfNumber: values.erfNumber,
    portionNumber: values.portionNumber,
    township: values.township,
    propertyName: values.propertyName,
    streetAddress: values.streetAddress,
    suburb: values.suburb,
    city: values.city,
    province: values.province ?? '',
    postalCode: values.postalCode,
    propertyType: values.propertyType ?? 'house',
    bedrooms: values.bedrooms,
    bathrooms: values.bathrooms,
    garages: values.garages,
    parking: values.parking,
    landSizeSqm: values.landSizeSqm,
    buildingSizeSqm: values.buildingSizeSqm,
    originalAskingPrice: values.originalAskingPrice,
    currentAskingPrice: values.currentAskingPrice,
    estimatedValue: values.estimatedValue,
    monthlyRental: values.monthlyRental,
    businessArea: values.businessArea ?? 'sales',
    propertyStatus: values.propertyStatus ?? 'active',
    salesStatus: values.salesStatus ?? 'prospect',
    rentalStatus: values.rentalStatus ?? 'rental_prospect',
    mandateStatus: values.mandateStatus ?? 'no_mandate',
    mandateType: values.mandateType ?? '',
    mandateStart: values.mandateStart,
    mandateExpiry: values.mandateExpiry,
    notes: values.notes,
  });
  const result = await createProperty(db, ctx, input);
  return result.id;
}

/**
 * Updating an existing record from a row.
 *
 * Deliberately additive: an imported value fills a field that is empty, and
 * never overwrites something a person has already put there. A spreadsheet
 * is usually older than the CRM record by the time it is imported, and
 * silently replacing a corrected mobile number with a stale one would be the
 * worst kind of data loss — the kind nobody notices (spec 69).
 */
async function updateFromRow(
  db: Db,
  ctx: Ctx,
  batch: ImportBatch,
  targetId: string,
  values: Record<string, string | string[]>,
): Promise<void> {
  const keep = <T>(existing: T, incoming: unknown): T | string =>
    existing === null || existing === undefined || existing === ''
      ? typeof incoming === 'string'
        ? incoming
        : existing
      : existing;

  if (batch.entityType === 'person') {
    const person = await getPerson(db, targetId);
    if (!person) throw new NotFoundError('That person');

    // Contacts are added rather than replaced; a number the record does not
    // have yet is worth having, and one it already has is left as it is.
    const existingValues = new Set(person.contacts.map((contact) => contact.value));
    const extra = contactsFrom(values).filter((contact) => !existingValues.has(contact.value));

    const input = parseOrThrow(personInputSchema, {
      title: keep(person.title, values.title),
      firstName: person.firstName,
      middleName: keep(person.middleName, values.middleName),
      surname: person.surname,
      preferredName: keep(person.preferredName, values.preferredName),
      // An identity number already on file is never touched by an import: it
      // was entered and checked by a person, and the read model deliberately
      // does not hand back the number for it to be echoed. mayClearIdentity
      // below is what stops the blank going through as a deletion.
      idNumber: person.idIsRecorded ? undefined : values.idNumber,
      passportNumber: person.passportIsRecorded ? undefined : values.passportNumber,
      passportCountry: keep(person.passportCountry, values.passportCountry),
      businessArea: person.businessArea,
      clientTypes: [
        ...new Set([
          ...person.clientTypes,
          ...(Array.isArray(values.clientTypes) ? values.clientTypes : []),
        ]),
      ],
      primaryAgentId: person.primaryAgentId ?? '',
      secondaryAgentId: person.secondaryAgentId ?? '',
      notes: person.notes
        ? typeof values.notes === 'string' && !person.notes.includes(values.notes)
          ? `${person.notes}\n\nFrom ${batch.batchRef}: ${values.notes}`
          : person.notes
        : values.notes,
      contacts: [
        ...person.contacts.map((contact) => ({
          id: contact.id,
          contactType: contact.contactType,
          value: contact.value,
          isPrimary: contact.isPrimary,
          isActive: contact.isActive,
        })),
        ...extra,
      ],
      addresses: person.addresses.length > 0 ? person.addresses.map((address) => ({
        id: address.id,
        addressType: address.addressType,
        line1: address.line1,
        line2: address.line2,
        suburb: address.suburb,
        city: address.city,
        province: address.province ?? '',
        postalCode: address.postalCode,
      })) : addressesFrom(values),
      tagIds: person.tags.map((tag) => tag.id),
    });

    await updatePerson(db, ctx, targetId, input, person.rowVersion, {
      mayClearIdentity: false,
    });
    return;
  }

  const property = await getProperty(db, targetId);
  if (!property) throw new NotFoundError('That property');

  const input = parseOrThrow(propertyInputSchema, {
    erfNumber: keep(property.erfNumber, values.erfNumber),
    portionNumber: keep(property.portionNumber, values.portionNumber),
    township: keep(property.township, values.township),
    propertyName: keep(property.propertyName, values.propertyName),
    streetAddress: keep(property.streetAddress, values.streetAddress),
    suburb: keep(property.suburb, values.suburb),
    city: keep(property.city, values.city),
    province: property.province ?? (typeof values.province === 'string' ? values.province : ''),
    postalCode: keep(property.postalCode, values.postalCode),
    propertyType: property.propertyType,
    bedrooms: property.bedrooms ?? values.bedrooms,
    bathrooms: property.bathrooms ?? values.bathrooms,
    garages: property.garages ?? values.garages,
    parking: property.parking ?? values.parking,
    landSizeSqm: property.landSizeSqm ?? values.landSizeSqm,
    buildingSizeSqm: property.buildingSizeSqm ?? values.buildingSizeSqm,
    originalAskingPrice: property.originalAskingPrice ?? values.originalAskingPrice,
    currentAskingPrice: property.currentAskingPrice ?? values.currentAskingPrice,
    estimatedValue: property.estimatedValue ?? values.estimatedValue,
    monthlyRental: property.monthlyRental ?? values.monthlyRental,
    businessArea: property.businessArea,
    // Every status is left exactly as it is. A status is a business decision
    // somebody made in the CRM, and a spreadsheet does not get to change it
    // (spec 141).
    propertyStatus: property.propertyStatus,
    salesStatus: property.salesStatus,
    rentalStatus: property.rentalStatus,
    mandateStatus: property.mandateStatus,
    mandateType: property.mandateType ?? '',
    saleOutcome: property.saleOutcome,
    mandateStart: property.mandateStart ?? values.mandateStart,
    mandateExpiry: property.mandateExpiry ?? values.mandateExpiry,
    primaryAgentId: property.primaryAgentId ?? '',
    secondaryAgentId: property.secondaryAgentId ?? '',
    notes: property.notes
      ? typeof values.notes === 'string' && !property.notes.includes(values.notes)
        ? `${property.notes}\n\nFrom ${batch.batchRef}: ${values.notes}`
        : property.notes
      : values.notes,
    tagIds: property.tags.map((tag) => tag.id),
  });

  await updateProperty(db, ctx, targetId, input, property.rowVersion);
}

// ---------------------------------------------------------------------------
// Rolling back
// ---------------------------------------------------------------------------

export interface RollbackOutcome {
  archived: number;
  leftAlone: number;
}

/**
 * Undoing a committed import (spec 70).
 *
 * Only the records the import CREATED are reversed, and they are archived
 * rather than deleted, because something may already point at them — a lead,
 * a task, a note somebody wrote this morning. Records the import merely
 * updated are left exactly as they are: their earlier values are in the audit
 * log, and silently reverting a field somebody has since corrected would be
 * a second mistake on top of the first.
 */
export async function rollbackImport(
  db: Db,
  ctx: Ctx,
  batchId: string,
  reason: string,
  expectedVersion: number,
): Promise<RollbackOutcome> {
  if (reason.trim().length === 0) {
    throw new ValidationError(
      { rollbackReason: ['Say why this import is being rolled back.'] },
      'Say why this import is being rolled back.',
    );
  }

  const batch = await getImportBatch(db, batchId);
  if (!batch) throw new NotFoundError('That import');
  if (batch.status !== 'committed') {
    throw new ValidationError(
      { _form: ['Only an import that has been run can be rolled back.'] },
      'Only an import that has been run can be rolled back.',
    );
  }

  const created = await db.query<{ target_id: string }>(
    `select target_id from import_rows
      where batch_id = $1 and created_record and target_id is not null`,
    [batchId],
  );

  let archived = 0;
  for (const row of created) {
    const affected = await db.count(
      batch.entityType === 'person'
        ? `update people
              set is_archived = true, archived_at = now(), archived_by = $2,
                  archive_reason = $3, updated_by = $2
            where id = $1 and not is_archived`
        : `update properties
              set is_archived = true, archived_at = now(), archived_by = $2,
                  archive_reason = $3, updated_by = $2
            where id = $1 and not is_archived`,
      [row.target_id, ctx.actor.id, `Import ${batch.batchRef} rolled back: ${reason.trim()}`],
    );
    archived += affected;
  }

  const changed = await db.count(
    `update import_batches
        set status = 'rolled_back', rolled_back_at = now(), rolled_back_by = $2,
            rollback_reason = $3, updated_by = $2
      where id = $1 and row_version = $4 and status = 'committed'`,
    [batchId, ctx.actor.id, reason.trim(), expectedVersion],
  );
  if (changed === 0) throw new ConcurrencyError();

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'import.rolled_back',
    entityType: 'import_batch',
    entityId: batchId,
    context: {
      batchRef: batch.batchRef,
      archived,
      updatedLeftAlone: batch.updatedCount,
      reason: reason.trim(),
    },
  });

  return { archived, leftAlone: batch.updatedCount };
}
