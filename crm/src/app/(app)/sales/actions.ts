'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import { withUser } from '@/lib/db.ts';
import { requestMeta, requirePermission, requireUser } from '@/lib/session.ts';
import { formText, parseOrThrow } from '@/lib/validate.ts';
import type { Ctx } from '@/lib/actor.ts';
import type { OfferStatus } from '@/lib/domain.ts';
import {
  createOffer,
  createTransaction,
  createValuation,
  offerInputSchema,
  recordViewing,
  registerTransaction,
  saveViewingFeedback,
  setOfferStatus,
  setTransactionAgents,
  transactionInputSchema,
  updateOffer,
  updateTransaction,
  updateValuation,
  valuationInputSchema,
  viewingFeedbackInputSchema,
  viewingInputSchema,
} from '@/lib/sales.ts';

async function context(): Promise<Ctx> {
  const user = await requireUser();
  return {
    actor: { id: user.id, email: user.email, permissions: user.permissions },
    meta: await requestMeta(),
  };
}

// --- viewings ---------------------------------------------------------------

export async function recordViewingAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const back = formText(formData, 'returnTo') || '/sales';
  const result = await runAction<undefined>('sales.record-viewing', async () => {
    const user = await requirePermission('SALES_CREATE', 'viewings');
    const ctx = await context();
    const input = parseOrThrow(viewingInputSchema, {
      propertyId: formText(formData, 'propertyId'),
      personId: formText(formData, 'personId'),
      leadId: formText(formData, 'leadId'),
      appointmentId: formText(formData, 'appointmentId'),
      agentId: formText(formData, 'agentId'),
      viewedAt: formText(formData, 'viewedAt'),
      notes: formText(formData, 'notes'),
    });
    await withUser(user.id, (db) => recordViewing(db, ctx, input));
    return { ok: true as const, message: 'Viewing recorded.' };
  });
  if (result.ok) {
    revalidatePath('/sales');
    redirect(back);
  }
  return result;
}

export async function saveViewingFeedbackAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('sales.viewing-feedback', async () => {
    const user = await requirePermission('SALES_EDIT', 'viewing feedback');
    const ctx = await context();
    const input = parseOrThrow(viewingFeedbackInputSchema, {
      outcome: formText(formData, 'outcome'),
      interestLevel: formText(formData, 'interestLevel'),
      objections: formText(formData, 'objections'),
      nextAction: formText(formData, 'nextAction'),
      followUpDate: formText(formData, 'followUpDate'),
    });
    await withUser(user.id, (db) =>
      saveViewingFeedback(db, ctx, formText(formData, 'viewingId'), input),
    );
    return {
      ok: true as const,
      message: input.followUpDate
        ? 'Feedback saved, and a follow-up was created.'
        : 'Feedback saved.',
    };
  });
  if (result.ok) revalidatePath('/sales');
  return result;
}

// --- valuations -------------------------------------------------------------

function readValuationForm(formData: FormData) {
  return parseOrThrow(valuationInputSchema, {
    propertyId: formText(formData, 'propertyId'),
    ownerId: formText(formData, 'ownerId'),
    leadId: formText(formData, 'leadId'),
    appointmentId: formText(formData, 'appointmentId'),
    agentId: formText(formData, 'agentId'),
    requestDate: formText(formData, 'requestDate'),
    estimatedValue: formText(formData, 'estimatedValue'),
    recommendedAskingPrice: formText(formData, 'recommendedAskingPrice'),
    outcome: formText(formData, 'outcome'),
    status: formText(formData, 'status') || 'requested',
    followUpDate: formText(formData, 'followUpDate'),
    notes: formText(formData, 'notes'),
  });
}

export async function createValuationAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const back = formText(formData, 'returnTo') || '/sales';
  const result = await runAction<undefined>('sales.create-valuation', async () => {
    const user = await requirePermission('SALES_CREATE', 'valuations');
    const ctx = await context();
    await withUser(user.id, (db) => createValuation(db, ctx, readValuationForm(formData)));
    return { ok: true as const, message: 'Valuation recorded.' };
  });
  if (result.ok) {
    revalidatePath('/sales');
    redirect(back);
  }
  return result;
}

export async function updateValuationAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const back = formText(formData, 'returnTo') || '/sales';
  const result = await runAction<undefined>('sales.update-valuation', async () => {
    const user = await requirePermission('SALES_EDIT', 'valuations');
    const ctx = await context();
    await withUser(user.id, (db) =>
      updateValuation(
        db,
        ctx,
        formText(formData, 'valuationId'),
        readValuationForm(formData),
        Number(formText(formData, 'rowVersion')),
      ),
    );
    return { ok: true as const, message: 'Valuation saved.' };
  });
  if (result.ok) {
    revalidatePath('/sales');
    redirect(back);
  }
  return result;
}

// --- offers -----------------------------------------------------------------

function readOfferForm(formData: FormData) {
  return parseOrThrow(offerInputSchema, {
    propertyId: formText(formData, 'propertyId'),
    buyerId: formText(formData, 'buyerId'),
    sellerId: formText(formData, 'sellerId'),
    agentId: formText(formData, 'agentId'),
    leadId: formText(formData, 'leadId'),
    transactionId: formText(formData, 'transactionId'),
    amount: formText(formData, 'amount'),
    offerDate: formText(formData, 'offerDate'),
    conditions: formText(formData, 'conditions'),
    financeStatus: formText(formData, 'financeStatus') || 'not_applicable',
    deposit: formText(formData, 'deposit'),
    expiresAt: formText(formData, 'expiresAt'),
    status: formText(formData, 'status') || 'submitted',
    counterOfferOf: formText(formData, 'counterOfferOf'),
    notes: formText(formData, 'notes'),
  });
}

export async function createOfferAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const back = formText(formData, 'returnTo') || '/sales';
  const result = await runAction<undefined>('sales.create-offer', async () => {
    const user = await requirePermission('SALES_CREATE', 'offers');
    const ctx = await context();
    await withUser(user.id, (db) => createOffer(db, ctx, readOfferForm(formData)));
    return { ok: true as const, message: 'Offer recorded.' };
  });
  if (result.ok) {
    revalidatePath('/sales');
    redirect(back);
  }
  return result;
}

export async function updateOfferAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('sales.update-offer', async () => {
    const user = await requirePermission('SALES_EDIT', 'offers');
    const ctx = await context();
    await withUser(user.id, (db) =>
      updateOffer(
        db,
        ctx,
        formText(formData, 'offerId'),
        readOfferForm(formData),
        Number(formText(formData, 'rowVersion')),
      ),
    );
    return { ok: true as const, message: 'Offer saved.' };
  });
  if (result.ok) revalidatePath('/sales');
  return result;
}

export async function setOfferStatusAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('sales.set-offer-status', async () => {
    const user = await requirePermission('SALES_EDIT', 'offers');
    const ctx = await context();
    await withUser(user.id, (db) =>
      setOfferStatus(db, ctx, formText(formData, 'offerId'), {
        status: formText(formData, 'status') as OfferStatus,
        date: formText(formData, 'date') || null,
        notes: formText(formData, 'notes') || null,
      }),
    );
    return { ok: true as const, message: 'Offer updated. Earlier offers keep their own history.' };
  });
  if (result.ok) revalidatePath('/sales');
  return result;
}

// --- transactions -----------------------------------------------------------

function readTransactionForm(formData: FormData) {
  return parseOrThrow(transactionInputSchema, {
    propertyId: formText(formData, 'propertyId'),
    buyerId: formText(formData, 'buyerId'),
    sellerId: formText(formData, 'sellerId'),
    offerId: formText(formData, 'offerId'),
    leadId: formText(formData, 'leadId'),
    transactionValue: formText(formData, 'transactionValue'),
    saleDate: formText(formData, 'saleDate'),
    expectedRegistrationDate: formText(formData, 'expectedRegistrationDate'),
    actualRegistrationDate: formText(formData, 'actualRegistrationDate'),
    conditions: formText(formData, 'conditions'),
    financeStatus: formText(formData, 'financeStatus') || 'not_applicable',
    legalStatus: formText(formData, 'legalStatus'),
    conveyancer: formText(formData, 'conveyancer'),
    status: formText(formData, 'status') || 'draft',
    cancellationReason: formText(formData, 'cancellationReason'),
    notes: formText(formData, 'notes'),
    statusChangeReason: formText(formData, 'statusChangeReason'),
  });
}

export async function createTransactionAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  let createdId: string | null = null;
  const result = await runAction<undefined>('sales.create-transaction', async () => {
    const user = await requirePermission('SALES_CREATE', 'transactions');
    const ctx = await context();
    const created = await withUser(user.id, (db) =>
      createTransaction(db, ctx, readTransactionForm(formData)),
    );
    createdId = created.id;
    return { ok: true as const, message: `${created.transactionRef} created.` };
  });
  if (result.ok && createdId) {
    revalidatePath('/sales');
    redirect(`/sales/transactions/${createdId}?saved=created`);
  }
  return result;
}

export async function updateTransactionAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const transactionId = formText(formData, 'transactionId');
  const result = await runAction<undefined>('sales.update-transaction', async () => {
    const user = await requirePermission('SALES_EDIT', 'transactions');
    const ctx = await context();
    await withUser(user.id, (db) =>
      updateTransaction(
        db,
        ctx,
        transactionId,
        readTransactionForm(formData),
        Number(formText(formData, 'rowVersion')),
      ),
    );
    return { ok: true as const, message: 'Transaction saved.' };
  });
  if (result.ok) {
    revalidatePath(`/sales/transactions/${transactionId}`);
    redirect(`/sales/transactions/${transactionId}?saved=updated`);
  }
  return result;
}

/**
 * Registration, as its own act (spec 49). Concluding a sale and registering
 * it are different events, so they are different buttons.
 */
export async function registerTransactionAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const transactionId = formText(formData, 'transactionId');
  const result = await runAction<undefined>('sales.register-transaction', async () => {
    const user = await requirePermission('SALES_EDIT', 'transactions');
    const ctx = await context();
    const registrationDate = formText(formData, 'registrationDate');
    if (!registrationDate) {
      return {
        ok: false as const,
        message: 'Enter the date the transfer was registered at the deeds office.',
      };
    }
    await withUser(user.id, (db) =>
      registerTransaction(db, ctx, transactionId, {
        registrationDate,
        notes: formText(formData, 'notes') || null,
      }),
    );
    return { ok: true as const, message: 'Recorded as registered.' };
  });
  if (result.ok) {
    revalidatePath(`/sales/transactions/${transactionId}`);
    revalidatePath('/sales');
  }
  return result;
}

export async function setTransactionAgentsAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const transactionId = formText(formData, 'transactionId');
  const result = await runAction<undefined>('sales.set-transaction-agents', async () => {
    const user = await requirePermission('SALES_EDIT', 'transactions');
    const ctx = await context();

    const agents: { agentId: string; role: string; sharePercent: string | null }[] = [];
    for (const [key, value] of formData.entries()) {
      const match = /^agentRole\[(.+)\]$/.exec(key);
      if (!match || typeof value !== 'string' || value === '') continue;
      const agentId = match[1] as string;
      const share = formText(formData, `agentShare[${agentId}]`);
      agents.push({ agentId, role: value, sharePercent: share || null });
    }

    await withUser(user.id, (db) => setTransactionAgents(db, ctx, transactionId, agents));
    return { ok: true as const, message: 'Agents on the deal updated.' };
  });
  if (result.ok) revalidatePath(`/sales/transactions/${transactionId}`);
  return result;
}
