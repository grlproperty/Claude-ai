'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import { withUser } from '@/lib/db.ts';
import { requestMeta, requirePermission, requireUser } from '@/lib/session.ts';
import { formText, parseOrThrow } from '@/lib/validate.ts';
import type { Ctx } from '@/lib/actor.ts';
import type { ScreeningItemStatus } from '@/lib/domain.ts';
import {
  createRentalApplication,
  rentalApplicationInputSchema,
  setScreeningItem,
  updateRentalApplication,
} from '@/lib/rentals.ts';

async function context(): Promise<Ctx> {
  const user = await requireUser();
  return {
    actor: { id: user.id, email: user.email, permissions: user.permissions },
    meta: await requestMeta(),
  };
}

function readForm(formData: FormData) {
  return parseOrThrow(rentalApplicationInputSchema, {
    propertyId: formText(formData, 'propertyId'),
    applicantId: formText(formData, 'applicantId'),
    coApplicantId: formText(formData, 'coApplicantId'),
    landlordId: formText(formData, 'landlordId'),
    agentId: formText(formData, 'agentId'),
    leadId: formText(formData, 'leadId'),
    monthlyRental: formText(formData, 'monthlyRental'),
    deposit: formText(formData, 'deposit'),
    applicationStatus: formText(formData, 'applicationStatus') || 'draft',
    screeningStatus: formText(formData, 'screeningStatus') || 'not_started',
    approvalDate: formText(formData, 'approvalDate'),
    rejectionDate: formText(formData, 'rejectionDate'),
    rejectionReason: formText(formData, 'rejectionReason'),
    leaseStart: formText(formData, 'leaseStart'),
    leaseEnd: formText(formData, 'leaseEnd'),
    notes: formText(formData, 'notes'),
  });
}

export async function createRentalApplicationAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  let createdId: string | null = null;
  const result = await runAction<undefined>('rentals.create-application', async () => {
    const user = await requirePermission('RENTALS_CREATE', 'rental applications');
    const ctx = await context();
    const created = await withUser(user.id, (db) =>
      createRentalApplication(db, ctx, readForm(formData)),
    );
    createdId = created.id;
    return { ok: true as const, message: `${created.applicationRef} created.` };
  });
  if (result.ok && createdId) {
    revalidatePath('/rentals');
    redirect(`/rentals/applications/${createdId}?saved=created`);
  }
  return result;
}

export async function updateRentalApplicationAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const applicationId = formText(formData, 'applicationId');
  const result = await runAction<undefined>('rentals.update-application', async () => {
    const user = await requirePermission('RENTALS_EDIT', 'rental applications');
    const ctx = await context();
    await withUser(user.id, (db) =>
      updateRentalApplication(
        db,
        ctx,
        applicationId,
        readForm(formData),
        Number(formText(formData, 'rowVersion')),
      ),
    );
    return { ok: true as const, message: 'Application saved.' };
  });
  if (result.ok) {
    revalidatePath(`/rentals/applications/${applicationId}`);
    redirect(`/rentals/applications/${applicationId}?saved=updated`);
  }
  return result;
}

export async function setScreeningItemAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const applicationId = formText(formData, 'applicationId');
  const result = await runAction<undefined>('rentals.set-screening', async () => {
    const user = await requirePermission('RENTALS_EDIT', 'rental screening');
    const ctx = await context();
    await withUser(user.id, (db) =>
      setScreeningItem(db, ctx, applicationId, {
        itemId: formText(formData, 'itemId'),
        status: formText(formData, 'status') as ScreeningItemStatus,
        notes: formText(formData, 'notes') || null,
      }),
    );
    return { ok: true as const, message: 'Screening updated.' };
  });
  if (result.ok) revalidatePath(`/rentals/applications/${applicationId}`);
  return result;
}
