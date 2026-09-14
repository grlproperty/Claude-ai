'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import { withUser } from '@/lib/db.ts';
import { requestMeta, requirePermission, requireUser } from '@/lib/session.ts';
import { formText, parseOrThrow } from '@/lib/validate.ts';
import type { Ctx } from '@/lib/actor.ts';
import {
  ficaInputSchema,
  setFicaCheck,
  startFicaRecord,
  updateFicaRecord,
  type FicaCheckStatus,
} from '@/lib/fica.ts';

async function context(): Promise<Ctx> {
  const user = await requireUser();
  return {
    actor: { id: user.id, email: user.email, permissions: user.permissions },
    meta: await requestMeta(),
  };
}

function readForm(formData: FormData) {
  return parseOrThrow(ficaInputSchema, {
    personId: formText(formData, 'personId'),
    companyId: formText(formData, 'companyId'),
    status: formText(formData, 'status') || 'not_started',
    riskRating: formText(formData, 'riskRating'),
    riskNote: formText(formData, 'riskNote'),
    pepDeclared: formText(formData, 'pepDeclared'),
    pepNote: formText(formData, 'pepNote'),
    sanctionsNote: formText(formData, 'sanctionsNote'),
    sourceOfFunds: formText(formData, 'sourceOfFunds'),
    purposeOfRelationship: formText(formData, 'purposeOfRelationship'),
    verificationNote: formText(formData, 'verificationNote'),
    rejectionReason: formText(formData, 'rejectionReason'),
    expiresOn: formText(formData, 'expiresOn'),
    notes: formText(formData, 'notes'),
    statusChangeReason: formText(formData, 'statusChangeReason'),
  });
}

export async function startFicaAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  let createdId: string | null = null;

  const result = await runAction<undefined>('fica.start', async () => {
    const user = await requirePermission('FICA_CREATE', 'FICA files');
    const ctx = await context();
    const created = await withUser(user.id, (db) => startFicaRecord(db, ctx, readForm(formData)));
    createdId = created.id;
    return {
      ok: true as const,
      message: `${created.ficaRef} opened, with the office's checklist to work through.`,
    };
  });

  if (result.ok && createdId) {
    revalidatePath('/fica');
    redirect(`/fica/${createdId}`);
  }
  return result;
}

/**
 * Changing a FICA file, including verifying it.
 *
 * Verifying stamps the acting user and the moment onto the record. The
 * database will not accept 'verified' any other way, so the claim always
 * belongs to a person (spec 115).
 */
export async function updateFicaAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'ficaRecordId');

  const result = await runAction<undefined>('fica.update', async () => {
    const user = await requirePermission('FICA_EDIT', 'FICA files');
    const ctx = await context();
    const input = readForm(formData);
    await withUser(user.id, (db) =>
      updateFicaRecord(db, ctx, id, input, Number(formText(formData, 'rowVersion'))),
    );
    return {
      ok: true as const,
      message:
        input.status === 'verified'
          ? 'Recorded as verified by you, with your name and the date against it.'
          : 'Saved.',
    };
  });

  if (result.ok) {
    revalidatePath(`/fica/${id}`);
    redirect(`/fica/${id}?saved=yes`);
  }
  return result;
}

export async function setFicaCheckAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const recordId = formText(formData, 'ficaRecordId');

  const result = await runAction<undefined>('fica.set-check', async () => {
    const user = await requirePermission('FICA_EDIT', 'FICA documents');
    const ctx = await context();
    await withUser(user.id, (db) =>
      setFicaCheck(db, ctx, recordId, {
        itemId: formText(formData, 'itemId'),
        status: formText(formData, 'status') as FicaCheckStatus,
        note: formText(formData, 'note') || null,
      }),
    );
    return { ok: true as const, message: 'Recorded, with your name against it.' };
  });

  if (result.ok) revalidatePath(`/fica/${recordId}`);
  return result;
}
