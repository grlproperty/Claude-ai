'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import { withUser } from '@/lib/db.ts';
import { requestMeta, requirePermission, requireUser } from '@/lib/session.ts';
import { formText, parseOrThrow } from '@/lib/validate.ts';
import type { Ctx } from '@/lib/actor.ts';
import {
  addDoNotContact,
  addEvidence,
  dncInputSchema,
  evidenceInputSchema,
  permissionInputSchema,
  releaseDoNotContact,
  setPermission,
} from '@/lib/compliance.ts';
import {
  addNumberToBatch,
  batchInputSchema,
  cancelBatch,
  createBatch,
  fillBatchWithUncheckedNumbers,
  loadBatchResults,
  markBatchSubmitted,
  parseResultsCsv,
  removeNumberFromBatch,
} from '@/lib/ncc.ts';
import { setSetting } from '@/lib/settings.ts';

async function context(): Promise<Ctx> {
  const user = await requireUser();
  return {
    actor: { id: user.id, email: user.email, permissions: user.permissions },
    meta: await requestMeta(),
  };
}

// --- contact permissions ----------------------------------------------------

export async function setPermissionAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const personId = formText(formData, 'personId');
  const result = await runAction<undefined>('compliance.set-permission', async () => {
    const status = formText(formData, 'status');
    // Changing an existing answer is a different act from recording one for
    // the first time, and needs the higher permission.
    const isChange = formText(formData, 'isChange') === 'true';
    const user = await requirePermission(
      isChange ? 'COMPLIANCE_EDIT' : 'COMPLIANCE_CREATE',
      'contact permissions',
    );
    const ctx = await context();
    await withUser(user.id, (db) =>
      setPermission(
        db,
        ctx,
        parseOrThrow(permissionInputSchema, {
          personId,
          channel: formText(formData, 'channel'),
          purpose: formText(formData, 'purpose'),
          status,
          lawfulBasis: formText(formData, 'lawfulBasis'),
          evidenceId: formText(formData, 'evidenceId'),
          note: formText(formData, 'note'),
          reason: formText(formData, 'reason'),
        }),
      ),
    );
    return { ok: true as const, message: 'Recorded.' };
  });
  if (result.ok) revalidatePath(`/people/${personId}/compliance`);
  return result;
}

export async function addEvidenceAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const personId = formText(formData, 'personId');
  const result = await runAction<undefined>('compliance.add-evidence', async () => {
    const user = await requirePermission('COMPLIANCE_CREATE', 'permission evidence');
    const ctx = await context();
    await withUser(user.id, (db) =>
      addEvidence(
        db,
        ctx,
        parseOrThrow(evidenceInputSchema, {
          personId,
          evidenceType: formText(formData, 'evidenceType'),
          reference: formText(formData, 'reference'),
          documentId: formText(formData, 'documentId'),
          notes: formText(formData, 'notes'),
        }),
      ),
    );
    return { ok: true as const, message: 'Evidence recorded.' };
  });
  if (result.ok) revalidatePath(`/people/${personId}/compliance`);
  return result;
}

// --- do not contact ---------------------------------------------------------

export async function addDoNotContactAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const personId = formText(formData, 'personId');
  const result = await runAction<undefined>('compliance.add-dnc', async () => {
    const user = await requirePermission('COMPLIANCE_CREATE', 'do-not-contact');
    const ctx = await context();
    await withUser(user.id, (db) =>
      addDoNotContact(
        db,
        ctx,
        parseOrThrow(dncInputSchema, {
          personId,
          contactValue: formText(formData, 'contactValue'),
          channel: formText(formData, 'channel') || 'all',
          source: formText(formData, 'source'),
          reason: formText(formData, 'reason'),
        }),
      ),
    );
    return { ok: true as const, message: 'Recorded. They will not be contacted.' };
  });
  if (result.ok) {
    revalidatePath('/compliance/do-not-contact');
    if (personId) revalidatePath(`/people/${personId}/compliance`);
  }
  return result;
}

export async function releaseDoNotContactAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('compliance.release-dnc', async () => {
    const user = await requirePermission('COMPLIANCE_EDIT', 'releasing a do-not-contact');
    const ctx = await context();
    await withUser(user.id, (db) =>
      releaseDoNotContact(
        db,
        ctx,
        formText(formData, 'entryId'),
        formText(formData, 'releaseReason'),
        Number(formText(formData, 'rowVersion')),
      ),
    );
    return { ok: true as const, message: 'Released. The original request is still on record.' };
  });
  if (result.ok) revalidatePath('/compliance/do-not-contact');
  return result;
}

// --- the NCC register -------------------------------------------------------

export async function createBatchAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  let createdId: string | null = null;
  const result = await runAction<undefined>('ncc.create-batch', async () => {
    const user = await requirePermission('NCC_ADMIN', 'NCC batches');
    const ctx = await context();
    const created = await withUser(user.id, (db) =>
      createBatch(
        db,
        ctx,
        parseOrThrow(batchInputSchema, {
          name: formText(formData, 'name'),
          notes: formText(formData, 'notes'),
        }),
      ),
    );
    createdId = created.id;
    return { ok: true as const, message: `${created.batchRef} created.` };
  });
  if (result.ok && createdId) {
    revalidatePath('/compliance/ncc');
    redirect(`/compliance/ncc/${createdId}`);
  }
  return result;
}

export async function fillBatchAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const batchId = formText(formData, 'batchId');
  const result = await runAction<undefined>('ncc.fill-batch', async () => {
    const user = await requirePermission('NCC_ADMIN', 'NCC batches');
    const ctx = await context();
    const outcome = await withUser(user.id, (db) =>
      fillBatchWithUncheckedNumbers(db, ctx, batchId),
    );
    return {
      ok: true as const,
      message:
        outcome.added === 0
          ? 'There were no numbers left needing a check.'
          : `${outcome.added} number${outcome.added === 1 ? '' : 's'} added.`,
    };
  });
  if (result.ok) revalidatePath(`/compliance/ncc/${batchId}`);
  return result;
}

export async function addNumberAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const batchId = formText(formData, 'batchId');
  const result = await runAction<undefined>('ncc.add-number', async () => {
    const user = await requirePermission('NCC_ADMIN', 'NCC batches');
    const ctx = await context();
    await withUser(user.id, (db) =>
      addNumberToBatch(
        db,
        ctx,
        batchId,
        formText(formData, 'contactValue'),
        formText(formData, 'personId') || null,
      ),
    );
    return { ok: true as const, message: 'Added.' };
  });
  if (result.ok) revalidatePath(`/compliance/ncc/${batchId}`);
  return result;
}

export async function removeNumberAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const batchId = formText(formData, 'batchId');
  const result = await runAction<undefined>('ncc.remove-number', async () => {
    const user = await requirePermission('NCC_ADMIN', 'NCC batches');
    const ctx = await context();
    await withUser(user.id, (db) => removeNumberFromBatch(db, ctx, batchId, formText(formData, 'itemId')));
    return { ok: true as const, message: 'Removed.' };
  });
  if (result.ok) revalidatePath(`/compliance/ncc/${batchId}`);
  return result;
}

export async function submitBatchAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const batchId = formText(formData, 'batchId');
  const result = await runAction<undefined>('ncc.submit-batch', async () => {
    const user = await requirePermission('NCC_ADMIN', 'NCC batches');
    const ctx = await context();
    await withUser(user.id, (db) =>
      markBatchSubmitted(
        db,
        ctx,
        batchId,
        formText(formData, 'submittedNote') || null,
        Number(formText(formData, 'rowVersion')),
      ),
    );
    return {
      ok: true as const,
      // Deliberate wording: the CRM recorded that a person sent it. It did
      // not send anything itself and must never imply that it did.
      message: 'Recorded as sent. Nothing was transmitted by the CRM.',
    };
  });
  if (result.ok) revalidatePath(`/compliance/ncc/${batchId}`);
  return result;
}

export async function loadResultsAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const batchId = formText(formData, 'batchId');
  const result = await runAction<undefined>('ncc.load-results', async () => {
    const user = await requirePermission('NCC_ADMIN', 'NCC results');
    const ctx = await context();

    const file = formData.get('resultsFile');
    const pasted = formText(formData, 'resultsText');
    let text = pasted;
    if (file instanceof File && file.size > 0) {
      if (file.size > 5_000_000) {
        return { ok: false as const, message: 'That file is too large to read here.' };
      }
      text = await file.text();
    }
    if (!text || text.trim().length === 0) {
      return { ok: false as const, message: 'Choose a results file, or paste the results.' };
    }

    const parsed = parseResultsCsv(text);
    if (parsed.lines.length === 0) {
      return {
        ok: false as const,
        message: parsed.problems[0] ?? 'Nothing in that file could be read as a result.',
      };
    }

    const outcome = await withUser(user.id, (db) =>
      loadBatchResults(db, ctx, batchId, parsed.lines, Number(formText(formData, 'rowVersion'))),
    );

    const notes = [`${outcome.matched} result${outcome.matched === 1 ? '' : 's'} loaded.`];
    if (outcome.listed > 0) {
      notes.push(
        `${outcome.listed} on the register, each now marked do-not-contact.`,
      );
    }
    if (outcome.unmatched.length > 0) {
      notes.push(`${outcome.unmatched.length} were not in this batch and were ignored.`);
    }
    if (parsed.problems.length > 0) {
      notes.push(`${parsed.problems.length} line(s) could not be read.`);
    }
    return { ok: true as const, message: notes.join(' ') };
  });
  if (result.ok) revalidatePath(`/compliance/ncc/${batchId}`);
  return result;
}

export async function cancelBatchAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const batchId = formText(formData, 'batchId');
  const result = await runAction<undefined>('ncc.cancel-batch', async () => {
    const user = await requirePermission('NCC_ADMIN', 'NCC batches');
    const ctx = await context();
    await withUser(user.id, (db) =>
      cancelBatch(
        db,
        ctx,
        batchId,
        formText(formData, 'cancellationReason'),
        Number(formText(formData, 'rowVersion')),
      ),
    );
    return { ok: true as const, message: 'Batch cancelled.' };
  });
  if (result.ok) revalidatePath(`/compliance/ncc/${batchId}`);
  return result;
}

export async function setComplianceSettingAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('compliance.set-setting', async () => {
    const user = await requirePermission('SETTINGS_ADMIN', 'compliance settings');
    const ctx = await context();
    const key = formText(formData, 'key');
    const raw = formText(formData, 'value');

    if (!['ncc.cost_per_number', 'ncc.result_valid_days', 'compliance.require_evidence'].includes(key)) {
      return { ok: false as const, message: 'That is not a compliance setting.' };
    }

    let value: unknown = raw;
    if (key === 'compliance.require_evidence') {
      value = raw === 'true' || raw === 'on';
    } else {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return { ok: false as const, message: 'That needs to be a number that is not negative.' };
      }
      value = key === 'ncc.result_valid_days' ? Math.round(parsed) : parsed;
    }

    await withUser(user.id, (db) => setSetting(db, ctx, key, value));
    return { ok: true as const, message: 'Saved.' };
  });
  if (result.ok) revalidatePath('/compliance/settings');
  return result;
}
