'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import { readAsUser, withUser } from '@/lib/db.ts';
import { recordSensitiveAccess } from '@/lib/audit.ts';
import { ForbiddenError } from '@/lib/errors.ts';
import { requestMeta, requirePermission, requireUser } from '@/lib/session.ts';
import { formList, formRows, formText, parseOrThrow } from '@/lib/validate.ts';
import type { Ctx } from '@/lib/actor.ts';
import { personInputSchema, relationshipInputSchema } from '@/lib/people/types.ts';
import {
  addPersonRelationship,
  archivePerson,
  assignPersonAgent,
  createPerson,
  removePersonRelationship,
  restorePerson,
  updatePerson,
} from '@/lib/people/mutations.ts';
import { findPersonDuplicates, type DuplicateMatch } from '@/lib/people/duplicates.ts';
import { dismissDuplicatePair, mergePeople, type SelectableField } from '@/lib/people/merge.ts';
import { readIdentity } from '@/lib/people/queries.ts';

async function context(): Promise<Ctx> {
  const user = await requireUser();
  return {
    actor: { id: user.id, email: user.email, permissions: user.permissions },
    meta: await requestMeta(),
  };
}

/** Turns the person form into the validated shape the data layer expects. */
function readPersonForm(formData: FormData) {
  const contacts = formRows(formData, 'contacts')
    .filter((row) => (row.value ?? '').length > 0)
    .map((row) => ({
      id: row.id || undefined,
      contactType: row.contactType ?? 'mobile',
      value: row.value ?? '',
      isPrimary: row.isPrimary === 'on' || row.isPrimary === 'true',
      isActive: row.isActive !== 'false',
      notes: row.notes ?? '',
    }));

  const addresses = formRows(formData, 'addresses')
    .filter((row) =>
      [row.line1, row.line2, row.suburb, row.city, row.postalCode].some((v) => (v ?? '').length > 0),
    )
    .map((row) => ({
      id: row.id || undefined,
      addressType: row.addressType ?? 'physical',
      line1: row.line1 ?? '',
      line2: row.line2 ?? '',
      suburb: row.suburb ?? '',
      city: row.city ?? '',
      province: row.province ?? '',
      postalCode: row.postalCode ?? '',
      isPrimary: row.isPrimary === 'on' || row.isPrimary === 'true',
      notes: row.notes ?? '',
    }));

  return parseOrThrow(personInputSchema, {
    title: formText(formData, 'title'),
    firstName: formText(formData, 'firstName'),
    middleName: formText(formData, 'middleName'),
    surname: formText(formData, 'surname'),
    preferredName: formText(formData, 'preferredName'),
    idNumber: formText(formData, 'idNumber'),
    passportNumber: formText(formData, 'passportNumber'),
    passportCountry: formText(formData, 'passportCountry'),
    passportExpiry: formText(formData, 'passportExpiry'),
    businessArea: formText(formData, 'businessArea') || 'sales',
    clientTypes: formList(formData, 'clientTypes'),
    primaryAgentId: formText(formData, 'primaryAgentId'),
    secondaryAgentId: formText(formData, 'secondaryAgentId'),
    officeId: formText(formData, 'officeId'),
    teamId: formText(formData, 'teamId'),
    nextFollowUpAt: formText(formData, 'nextFollowUpAt'),
    notes: formText(formData, 'notes'),
    contacts,
    addresses,
    tagIds: formList(formData, 'tagIds'),
  });
}

/**
 * Duplicate check, run before a person is created (spec 88).
 *
 * Returns candidates for the user to look at. It never creates, merges or
 * dismisses anything by itself.
 */
export async function checkForDuplicatesAction(
  formData: FormData,
): Promise<ActionResult<DuplicateMatch[]>> {
  return runAction('people.duplicate-check', async () => {
    const user = await requirePermission('PEOPLE_CREATE', 'client records');
    const contactValues = formRows(formData, 'contacts')
      .map((row) => row.value ?? '')
      .filter((value) => value.length > 0);

    const matches = await readAsUser(user.id, (db) =>
      findPersonDuplicates(db, {
        firstName: formText(formData, 'firstName'),
        surname: formText(formData, 'surname'),
        idNumber: formText(formData, 'idNumber') || null,
        passportNumber: formText(formData, 'passportNumber') || null,
        passportCountry: formText(formData, 'passportCountry') || null,
        contactValues,
        suburb: formRows(formData, 'addresses')[0]?.suburb ?? null,
      }),
    );

    return {
      ok: true as const,
      data: matches,
      message:
        matches.length === 0
          ? 'No possible duplicates found.'
          : `${matches.length} possible ${matches.length === 1 ? 'match' : 'matches'} found. Please check before creating a new record.`,
    };
  });
}

export async function createPersonAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  let createdId: string | null = null;

  const result = await runAction<undefined>('people.create', async () => {
    const user = await requirePermission('PEOPLE_CREATE', 'client records');
    const ctx = await context();
    const input = readPersonForm(formData);

    // The duplicate check has to have been seen and acknowledged. The screen
    // sends this back once the results have been shown.
    if (formText(formData, 'duplicateCheck') !== 'acknowledged') {
      return {
        ok: false as const,
        message: 'Please run the duplicate check before creating a new person.',
      };
    }

    const created = await withUser(user.id, (db) => createPerson(db, ctx, input));
    createdId = created.id;
    return { ok: true as const, message: `${created.clientRef} created.` };
  });

  if (result.ok && createdId) {
    revalidatePath('/people');
    redirect(`/people/${createdId}?saved=created`);
  }
  return result;
}

export async function updatePersonAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const personId = formText(formData, 'personId');

  const result = await runAction<undefined>('people.update', async () => {
    const user = await requirePermission('PEOPLE_EDIT', 'client records');
    const ctx = await context();
    const input = readPersonForm(formData);
    const expectedVersion = Number(formText(formData, 'rowVersion'));

    await withUser(user.id, (db) => updatePerson(db, ctx, personId, input, expectedVersion));
    return { ok: true as const, message: 'Client saved.' };
  });

  if (result.ok) {
    revalidatePath(`/people/${personId}`);
    redirect(`/people/${personId}?saved=updated`);
  }
  return result;
}

export async function archivePersonAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const personId = formText(formData, 'personId');
  const result = await runAction<undefined>('people.archive', async () => {
    const user = await requirePermission('PEOPLE_DELETE', 'archiving clients');
    const ctx = await context();
    await withUser(user.id, (db) =>
      archivePerson(db, ctx, personId, formText(formData, 'reason') || null),
    );
    return { ok: true as const, message: 'Client archived.' };
  });
  if (result.ok) revalidatePath(`/people/${personId}`);
  return result;
}

export async function restorePersonAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const personId = formText(formData, 'personId');
  const result = await runAction<undefined>('people.restore', async () => {
    const user = await requirePermission('PEOPLE_DELETE', 'restoring clients');
    const ctx = await context();
    await withUser(user.id, (db) => restorePerson(db, ctx, personId));
    return { ok: true as const, message: 'Client restored.' };
  });
  if (result.ok) revalidatePath(`/people/${personId}`);
  return result;
}

export async function assignAgentAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const personId = formText(formData, 'personId');
  const result = await runAction<undefined>('people.assign-agent', async () => {
    const user = await requirePermission('PEOPLE_EDIT', 'client records');
    const ctx = await context();
    await withUser(user.id, (db) =>
      assignPersonAgent(db, ctx, personId, {
        primaryAgentId: formText(formData, 'primaryAgentId') || null,
        secondaryAgentId: formText(formData, 'secondaryAgentId') || null,
        reason: formText(formData, 'reason') || null,
      }),
    );
    return { ok: true as const, message: 'Agent assignment updated.' };
  });
  if (result.ok) revalidatePath(`/people/${personId}`);
  return result;
}

export async function addRelationshipAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const personId = formText(formData, 'personId');
  const result = await runAction<undefined>('people.add-relationship', async () => {
    const user = await requirePermission('PEOPLE_EDIT', 'client records');
    const ctx = await context();
    const input = parseOrThrow(relationshipInputSchema, {
      relatedPersonId: formText(formData, 'relatedPersonId'),
      relationshipType: formText(formData, 'relationshipType'),
      startDate: formText(formData, 'startDate'),
      endDate: formText(formData, 'endDate'),
      notes: formText(formData, 'notes'),
    });
    await withUser(user.id, (db) => addPersonRelationship(db, ctx, personId, input));
    return { ok: true as const, message: 'Relationship added.' };
  });
  if (result.ok) revalidatePath(`/people/${personId}`);
  return result;
}

export async function removeRelationshipAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const personId = formText(formData, 'personId');
  const result = await runAction<undefined>('people.remove-relationship', async () => {
    const user = await requirePermission('PEOPLE_EDIT', 'client records');
    const ctx = await context();
    await withUser(user.id, (db) =>
      removePersonRelationship(db, ctx, personId, formText(formData, 'relationshipId')),
    );
    return { ok: true as const, message: 'Relationship removed.' };
  });
  if (result.ok) revalidatePath(`/people/${personId}`);
  return result;
}

export async function mergePeopleAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const masterId = formText(formData, 'masterId');
  let done = false;

  const result = await runAction<undefined>('people.merge', async () => {
    const user = await requirePermission('MERGE_RECORDS', 'merging records');
    const ctx = await context();
    const mergedId = formText(formData, 'mergedId');

    const choices: Partial<Record<SelectableField, 'master' | 'merged'>> = {};
    for (const [key, value] of formData.entries()) {
      const match = /^choice\[([a-z_]+)\]$/.exec(key);
      if (match && (value === 'master' || value === 'merged')) {
        choices[match[1] as SelectableField] = value;
      }
    }

    const merged = await withUser(user.id, (db) =>
      mergePeople(db, ctx, {
        masterId,
        mergedId,
        choices,
        reason: formText(formData, 'reason') || null,
      }),
    );
    done = true;
    return {
      ok: true as const,
      message: `${merged.mergedReference} was merged into ${merged.masterReference}.`,
    };
  });

  if (result.ok && done) {
    revalidatePath('/people');
    redirect(`/people/${masterId}?saved=merged`);
  }
  return result;
}

export async function dismissDuplicateAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('people.dismiss-duplicate', async () => {
    const user = await requirePermission('MERGE_RECORDS', 'the duplicates review');
    const ctx = await context();
    const decision = formText(formData, 'decision');
    await withUser(user.id, (db) =>
      dismissDuplicatePair(db, ctx, {
        entityType: 'person',
        firstId: formText(formData, 'firstId'),
        secondId: formText(formData, 'secondId'),
        decision: decision === 'review_later' ? 'review_later' : 'not_duplicate',
        reason: formText(formData, 'reason') || null,
      }),
    );
    return {
      ok: true as const,
      message: decision === 'review_later' ? 'Marked to review later.' : 'Marked as not a duplicate.',
    };
  });
  if (result.ok) revalidatePath('/people/duplicates');
  return result;
}

/**
 * Reveals an identity number to a user who is authorised to see it, and
 * records that it was looked at. The log says "ID viewed"; it never records
 * the number (spec 15).
 */
export async function revealIdentityAction(
  _previous: ActionResult<{ idNumber: string | null; passportNumber: string | null }> | undefined,
  formData: FormData,
): Promise<ActionResult<{ idNumber: string | null; passportNumber: string | null }>> {
  return runAction('people.reveal-identity', async () => {
    const user = await requirePermission('PERSON_ID_VIEW', 'identity numbers');
    const personId = formText(formData, 'personId');
    const meta = await requestMeta();

    const identity = await withUser(user.id, async (db) => {
      const person = await db.maybeOne<{ client_ref: string }>(
        'select client_ref from people where id = $1',
        [personId],
      );
      if (!person) throw new ForbiddenError('that client record');

      const found = await readIdentity(db, personId);
      await recordSensitiveAccess(
        db,
        { id: user.id, email: user.email },
        meta,
        {
          accessType: 'ID viewed',
          entityType: 'person',
          entityId: personId,
          entityLabel: person.client_ref,
          reason: formText(formData, 'reason') || null,
        },
      );
      return found;
    });

    return {
      ok: true as const,
      data: identity ?? { idNumber: null, passportNumber: null },
    };
  });
}
