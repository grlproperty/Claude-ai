'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import { withUser } from '@/lib/db.ts';
import { requestMeta, requirePermission, requireUser } from '@/lib/session.ts';
import { formList, formText, parseOrThrow } from '@/lib/validate.ts';
import type { Ctx } from '@/lib/actor.ts';
import type { LeadStatus } from '@/lib/domain.ts';
import { archiveLead, createLead, leadInputSchema, setLeadStatus, updateLead } from '@/lib/leads.ts';

async function context(): Promise<Ctx> {
  const user = await requireUser();
  return {
    actor: { id: user.id, email: user.email, permissions: user.permissions },
    meta: await requestMeta(),
  };
}

function readForm(formData: FormData) {
  return parseOrThrow(leadInputSchema, {
    personId: formText(formData, 'personId'),
    propertyId: formText(formData, 'propertyId'),
    businessArea: formText(formData, 'businessArea') || 'sales',
    leadType: formText(formData, 'leadType'),
    status: formText(formData, 'status') || 'new',
    sourceId: formText(formData, 'sourceId'),
    lossReasonId: formText(formData, 'lossReasonId'),
    enquirySummary: formText(formData, 'enquirySummary'),
    requirements: formText(formData, 'requirements'),
    budgetMin: formText(formData, 'budgetMin'),
    budgetMax: formText(formData, 'budgetMax'),
    preferredAreas: formText(formData, 'preferredAreas'),
    primaryAgentId: formText(formData, 'primaryAgentId'),
    secondaryAgentId: formText(formData, 'secondaryAgentId'),
    nextFollowUpAt: formText(formData, 'nextFollowUpAt'),
    notes: formText(formData, 'notes'),
    statusChangeReason: formText(formData, 'statusChangeReason'),
    tagIds: formList(formData, 'tagIds'),
  });
}

export async function createLeadAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  let createdId: string | null = null;
  const result = await runAction<undefined>('leads.create', async () => {
    const user = await requirePermission('LEADS_CREATE', 'leads');
    const ctx = await context();
    const created = await withUser(user.id, (db) => createLead(db, ctx, readForm(formData)));
    createdId = created.id;
    return { ok: true as const, message: 'Lead created.' };
  });
  if (result.ok && createdId) {
    revalidatePath('/leads');
    redirect(`/leads/${createdId}?saved=created`);
  }
  return result;
}

export async function updateLeadAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const leadId = formText(formData, 'leadId');
  const result = await runAction<undefined>('leads.update', async () => {
    const user = await requirePermission('LEADS_EDIT', 'leads');
    const ctx = await context();
    await withUser(user.id, (db) =>
      updateLead(db, ctx, leadId, readForm(formData), Number(formText(formData, 'rowVersion'))),
    );
    return { ok: true as const, message: 'Lead saved.' };
  });
  if (result.ok) {
    revalidatePath(`/leads/${leadId}`);
    redirect(`/leads/${leadId}?saved=updated`);
  }
  return result;
}

export async function setLeadStatusAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const leadId = formText(formData, 'leadId');
  const result = await runAction<undefined>('leads.set-status', async () => {
    const user = await requirePermission('LEADS_EDIT', 'leads');
    const ctx = await context();
    await withUser(user.id, (db) =>
      setLeadStatus(db, ctx, leadId, {
        status: formText(formData, 'status') as LeadStatus,
        lossReasonId: formText(formData, 'lossReasonId') || null,
        reason: formText(formData, 'reason') || null,
      }),
    );
    return { ok: true as const, message: 'Lead status updated.' };
  });
  if (result.ok) {
    revalidatePath(`/leads/${leadId}`);
    revalidatePath('/leads');
  }
  return result;
}

export async function archiveLeadAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const leadId = formText(formData, 'leadId');
  const result = await runAction<undefined>('leads.archive', async () => {
    const user = await requirePermission('LEADS_DELETE', 'archiving leads');
    const ctx = await context();
    await withUser(user.id, (db) =>
      archiveLead(db, ctx, leadId, formText(formData, 'reason') || null),
    );
    return { ok: true as const, message: 'Lead archived.' };
  });
  if (result.ok) revalidatePath(`/leads/${leadId}`);
  return result;
}
