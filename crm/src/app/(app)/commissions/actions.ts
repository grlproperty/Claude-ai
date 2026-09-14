'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import { withUser } from '@/lib/db.ts';
import { requestMeta, requirePermission, requireUser } from '@/lib/session.ts';
import { formBool, formText, parseOrThrow } from '@/lib/validate.ts';
import type { Ctx } from '@/lib/actor.ts';
import { archiveRule, createRule, ruleInputSchema, updateRule } from '@/lib/commission/rules.ts';
import { commissionInputSchema } from '@/lib/commission/records.ts';
import { createCommission } from '@/lib/commission/create.ts';
import {
  addDeduction,
  deductionInputSchema,
  removeDeduction,
  removeSplit,
  setSplit,
  splitInputSchema,
  updateCommission,
} from '@/lib/commission/edit.ts';
import {
  approveCommission,
  cancelCommission,
  invoiceCommission,
  markCommissionPaid,
  rejectCommission,
  submitCommission,
} from '@/lib/commission/workflow.ts';

async function context(): Promise<Ctx> {
  const user = await requireUser();
  return {
    actor: { id: user.id, email: user.email, permissions: user.permissions },
    meta: await requestMeta(),
  };
}

const version = (formData: FormData) => Number(formText(formData, 'rowVersion'));

function readCommissionForm(formData: FormData) {
  return parseOrThrow(commissionInputSchema, {
    transactionId: formText(formData, 'transactionId'),
    rentalId: formText(formData, 'rentalId'),
    ruleId: formText(formData, 'ruleId'),
    basis: formText(formData, 'basis'),
    ratePercent: formText(formData, 'ratePercent'),
    fixedAmount: formText(formData, 'fixedAmount'),
    months: formText(formData, 'months'),
    baseAmount: formText(formData, 'baseAmount'),
    vatApplicable: formBool(formData, 'vatApplicable'),
    overrideExclVat: formText(formData, 'overrideExclVat'),
    overrideReason: formText(formData, 'overrideReason'),
    notes: formText(formData, 'notes'),
  });
}

export async function createCommissionAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  let createdId: string | null = null;

  const result = await runAction<undefined>('commission.create', async () => {
    const user = await requirePermission('COMMISSION_CREATE', 'commission');
    const ctx = await context();
    const created = await withUser(user.id, (db) =>
      createCommission(db, ctx, readCommissionForm(formData)),
    );
    createdId = created.id;
    return {
      ok: true as const,
      message: `${created.commissionRef} opened as a draft. Nothing is approved yet.`,
    };
  });

  if (result.ok && createdId) {
    revalidatePath('/commissions');
    redirect(`/commissions/${createdId}?saved=created`);
  }
  return result;
}

export async function updateCommissionAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'commissionId');

  const result = await runAction<undefined>('commission.update', async () => {
    const user = await requirePermission('COMMISSION_EDIT', 'commission');
    const ctx = await context();
    await withUser(user.id, (db) =>
      updateCommission(db, ctx, id, readCommissionForm(formData), version(formData)),
    );
    return { ok: true as const, message: 'Worked out again and saved.' };
  });

  if (result.ok) {
    revalidatePath(`/commissions/${id}`);
    redirect(`/commissions/${id}?saved=updated`);
  }
  return result;
}

export async function setSplitAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'commissionId');

  const result = await runAction<undefined>('commission.set-split', async () => {
    const user = await requirePermission('COMMISSION_EDIT', 'commission');
    const ctx = await context();
    await withUser(user.id, (db) =>
      setSplit(
        db,
        ctx,
        id,
        parseOrThrow(splitInputSchema, {
          agentId: formText(formData, 'agentId'),
          partyName: formText(formData, 'partyName'),
          role: formText(formData, 'role'),
          sharePercent: formText(formData, 'sharePercent'),
          notes: formText(formData, 'notes'),
        }),
      ),
    );
    return { ok: true as const, message: 'Share saved, and every amount worked out again.' };
  });

  if (result.ok) revalidatePath(`/commissions/${id}`);
  return result;
}

export async function removeSplitAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'commissionId');

  const result = await runAction<undefined>('commission.remove-split', async () => {
    const user = await requirePermission('COMMISSION_EDIT', 'commission');
    const ctx = await context();
    await withUser(user.id, (db) => removeSplit(db, ctx, id, formText(formData, 'splitId')));
    return {
      ok: true as const,
      message: 'Share removed. It stays in the record of what changed.',
    };
  });

  if (result.ok) revalidatePath(`/commissions/${id}`);
  return result;
}

export async function addDeductionAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'commissionId');

  const result = await runAction<undefined>('commission.add-deduction', async () => {
    const user = await requirePermission('COMMISSION_EDIT', 'commission');
    const ctx = await context();
    await withUser(user.id, (db) =>
      addDeduction(
        db,
        ctx,
        id,
        parseOrThrow(deductionInputSchema, {
          label: formText(formData, 'label'),
          amount: formText(formData, 'amount'),
          note: formText(formData, 'note'),
        }),
      ),
    );
    return { ok: true as const, message: 'Deduction recorded and the shares worked out again.' };
  });

  if (result.ok) revalidatePath(`/commissions/${id}`);
  return result;
}

export async function removeDeductionAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'commissionId');

  const result = await runAction<undefined>('commission.remove-deduction', async () => {
    const user = await requirePermission('COMMISSION_EDIT', 'commission');
    const ctx = await context();
    await withUser(user.id, (db) =>
      removeDeduction(db, ctx, id, formText(formData, 'deductionId')),
    );
    return { ok: true as const, message: 'Deduction removed.' };
  });

  if (result.ok) revalidatePath(`/commissions/${id}`);
  return result;
}

export async function submitCommissionAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'commissionId');

  const result = await runAction<undefined>('commission.submit', async () => {
    const user = await requirePermission('COMMISSION_EDIT', 'commission');
    const ctx = await context();
    await withUser(user.id, (db) => submitCommission(db, ctx, id, version(formData)));
    return { ok: true as const, message: 'Sent for approval. Nobody has approved it yet.' };
  });

  if (result.ok) revalidatePath(`/commissions/${id}`);
  return result;
}

/**
 * Approving.
 *
 * The whole step runs in one transaction (spec 106), and the database
 * refuses an approved commission with nobody's name on it, so this cannot
 * half-happen.
 */
export async function approveCommissionAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'commissionId');

  const result = await runAction<undefined>('commission.approve', async () => {
    const user = await requirePermission('COMMISSION_APPROVE', 'commission approval');
    const ctx = await context();
    await withUser(user.id, (db) =>
      approveCommission(db, ctx, id, version(formData), formText(formData, 'approvalNote') || null),
    );
    return { ok: true as const, message: 'Approved, with your name and the date against it.' };
  });

  if (result.ok) revalidatePath(`/commissions/${id}`);
  return result;
}

export async function rejectCommissionAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'commissionId');

  const result = await runAction<undefined>('commission.reject', async () => {
    const user = await requirePermission('COMMISSION_APPROVE', 'commission approval');
    const ctx = await context();
    await withUser(user.id, (db) =>
      rejectCommission(db, ctx, id, version(formData), formText(formData, 'rejectionReason')),
    );
    return { ok: true as const, message: 'Sent back, with your reason on the record.' };
  });

  if (result.ok) revalidatePath(`/commissions/${id}`);
  return result;
}

export async function invoiceCommissionAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'commissionId');

  const result = await runAction<undefined>('commission.invoice', async () => {
    const user = await requirePermission('COMMISSION_EDIT', 'commission');
    const ctx = await context();
    await withUser(user.id, (db) =>
      invoiceCommission(db, ctx, id, version(formData), {
        invoiceNumber: formText(formData, 'invoiceNumber'),
        invoiceDate: formText(formData, 'invoiceDate') || null,
      }),
    );
    return {
      ok: true as const,
      message: 'Invoice number recorded. The CRM did not raise the invoice.',
    };
  });

  if (result.ok) revalidatePath(`/commissions/${id}`);
  return result;
}

/**
 * Recording a payment.
 *
 * The message deliberately says "recorded", because the CRM has no bank
 * feed and cannot know that money moved (spec 115).
 */
export async function markPaidAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'commissionId');

  const result = await runAction<undefined>('commission.mark-paid', async () => {
    const user = await requirePermission('COMMISSION_APPROVE', 'recording payment');
    const ctx = await context();
    await withUser(user.id, (db) =>
      markCommissionPaid(db, ctx, id, version(formData), {
        paidOn: formText(formData, 'paidOn') || null,
        paymentReference: formText(formData, 'paymentReference') || null,
        invoiceNumber: formText(formData, 'invoiceNumber') || null,
      }),
    );
    return {
      ok: true as const,
      message: 'Recorded as paid by you. The CRM checked no bank account.',
    };
  });

  if (result.ok) revalidatePath(`/commissions/${id}`);
  return result;
}

export async function cancelCommissionAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'commissionId');

  const result = await runAction<undefined>('commission.cancel', async () => {
    const user = await requirePermission('COMMISSION_EDIT', 'commission');
    const ctx = await context();
    await withUser(user.id, (db) =>
      cancelCommission(db, ctx, id, version(formData), formText(formData, 'cancellationReason')),
    );
    return { ok: true as const, message: 'Cancelled. Nothing was deleted.' };
  });

  if (result.ok) revalidatePath(`/commissions/${id}`);
  return result;
}

// ---------------------------------------------------------------------
// The office's rules
// ---------------------------------------------------------------------

function readRuleForm(formData: FormData) {
  return parseOrThrow(ruleInputSchema, {
    name: formText(formData, 'name'),
    appliesTo: formText(formData, 'appliesTo'),
    businessArea: formText(formData, 'businessArea'),
    basis: formText(formData, 'basis'),
    ratePercent: formText(formData, 'ratePercent'),
    fixedAmount: formText(formData, 'fixedAmount'),
    months: formText(formData, 'months'),
    vatApplicable: formBool(formData, 'vatApplicable'),
    minimumAmount: formText(formData, 'minimumAmount'),
    notes: formText(formData, 'notes'),
    effectiveFrom: formText(formData, 'effectiveFrom'),
    effectiveTo: formText(formData, 'effectiveTo'),
    isDefault: formBool(formData, 'isDefault'),
  });
}

export async function createRuleAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('commission_rule.create', async () => {
    const user = await requirePermission('SETTINGS_ADMIN', 'commission rules');
    const ctx = await context();
    await withUser(user.id, (db) => createRule(db, ctx, readRuleForm(formData)));
    return { ok: true as const, message: 'Rule added.' };
  });

  if (result.ok) {
    revalidatePath('/commissions/rules');
    redirect('/commissions/rules?saved=created');
  }
  return result;
}

export async function updateRuleAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('commission_rule.update', async () => {
    const user = await requirePermission('SETTINGS_ADMIN', 'commission rules');
    const ctx = await context();
    await withUser(user.id, (db) =>
      updateRule(db, ctx, formText(formData, 'ruleId'), readRuleForm(formData), version(formData)),
    );
    return { ok: true as const, message: 'Rule saved. Past commissions keep their own figures.' };
  });

  if (result.ok) {
    revalidatePath('/commissions/rules');
    redirect('/commissions/rules?saved=updated');
  }
  return result;
}

export async function archiveRuleAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('commission_rule.archive', async () => {
    const user = await requirePermission('SETTINGS_ADMIN', 'commission rules');
    const ctx = await context();
    await withUser(user.id, (db) =>
      archiveRule(db, ctx, formText(formData, 'ruleId'), formText(formData, 'archiveReason')),
    );
    return {
      ok: true as const,
      message: 'Retired. Every commission worked out from it keeps its own figures.',
    };
  });

  if (result.ok) revalidatePath('/commissions/rules');
  return result;
}
