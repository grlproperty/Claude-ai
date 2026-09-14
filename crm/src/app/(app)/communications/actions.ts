'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import { readAsUser, withUser } from '@/lib/db.ts';
import { requestMeta, requirePermission, requireUser } from '@/lib/session.ts';
import { formBool, formText, parseOrThrow } from '@/lib/validate.ts';
import type { Ctx } from '@/lib/actor.ts';
import {
  communicationInputSchema,
  logCommunication,
  updateCommunication,
} from '@/lib/communications.ts';
import {
  createTemplate,
  getTemplate,
  mergeValuesFor,
  renderTemplate,
  templateInputSchema,
  updateTemplate,
} from '@/lib/templates.ts';
import { getPerson } from '@/lib/people/queries.ts';
import { getProperty } from '@/lib/properties/queries.ts';

async function context(): Promise<Ctx> {
  const user = await requireUser();
  return {
    actor: { id: user.id, email: user.email, permissions: user.permissions },
    meta: await requestMeta(),
  };
}

function readForm(formData: FormData) {
  return parseOrThrow(communicationInputSchema, {
    personId: formText(formData, 'personId'),
    propertyId: formText(formData, 'propertyId'),
    leadId: formText(formData, 'leadId'),
    transactionId: formText(formData, 'transactionId'),
    rentalApplicationId: formText(formData, 'rentalApplicationId'),
    direction: formText(formData, 'direction') || 'outgoing',
    channel: formText(formData, 'channel'),
    subject: formText(formData, 'subject'),
    body: formText(formData, 'body'),
    occurredAt: formText(formData, 'occurredAt'),
    durationMinutes: formText(formData, 'durationMinutes'),
    outcome: formText(formData, 'outcome'),
    agentId: formText(formData, 'agentId'),
    templateId: formText(formData, 'templateId'),
    isImportant: formBool(formData, 'isImportant'),
    followUpAt: formText(formData, 'followUpAt'),
    followUpTitle: formText(formData, 'followUpTitle'),
  });
}

/**
 * Recording what was said.
 *
 * Note what this does NOT do: it does not send anything. The person has
 * already had the conversation, on their own phone or in their own mail
 * application. This writes down what happened (spec 6, 143).
 */
export async function logCommunicationAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  let outcome: { id: string; taskId: string | null } | null = null;

  const result = await runAction<undefined>('communication.log', async () => {
    const user = await requirePermission('COMMUNICATION_CREATE', 'the communication log');
    const ctx = await context();
    const logged = await withUser(user.id, (db) => logCommunication(db, ctx, readForm(formData)));
    outcome = logged;

    return {
      ok: true as const,
      message: logged.taskId
        ? 'Recorded, and the follow-up is on your task list.'
        : 'Recorded.',
    };
  });

  if (result.ok && outcome) {
    const returnTo = formText(formData, 'returnTo');
    revalidatePath('/communications');
    const personId = formText(formData, 'personId');
    if (personId) revalidatePath(`/people/${personId}`);
    const { taskId } = outcome as { id: string; taskId: string | null };
    redirect(`${returnTo || '/communications'}?logged=${taskId ? 'with-follow-up' : 'yes'}`);
  }
  return result;
}

export async function updateCommunicationAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'communicationId');

  const result = await runAction<undefined>('communication.correct', async () => {
    const user = await requirePermission('COMMUNICATION_CREATE', 'the communication log');
    const ctx = await context();
    await withUser(user.id, (db) =>
      updateCommunication(db, ctx, id, readForm(formData), Number(formText(formData, 'rowVersion'))),
    );
    return {
      ok: true as const,
      // Deliberate wording: the original is not gone.
      message: 'Corrected. The change is in the audit log.',
    };
  });

  if (result.ok) {
    revalidatePath('/communications');
    redirect(`/communications/${id}?saved=corrected`);
  }
  return result;
}

/**
 * Fills a template in for the record in front of the user.
 *
 * Returns the wording only. What the person does with it — paste it into
 * WhatsApp, send it from their own mail application — is up to them, and the
 * CRM has no part in it.
 */
export async function composeFromTemplateAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult<{ subject: string | null; body: string; unfilled: string[] }>> {
  return runAction<{ subject: string | null; body: string; unfilled: string[] }>(
    'communication.compose',
    async () => {
      const user = await requirePermission('COMMUNICATION_VIEW', 'message templates');

      const templateId = formText(formData, 'templateId');
      const personId = formText(formData, 'personId');
      const propertyId = formText(formData, 'propertyId');

      const composed = await readAsUser(user.id, async (db) => {
        const template = await getTemplate(db, templateId);
        if (!template) return null;

        // Only records this reader can already open contribute values, because
        // getPerson and getProperty are themselves subject to row level
        // security. A template can never become a way to read something else.
        const person = personId ? await getPerson(db, personId) : null;
        const property = propertyId ? await getProperty(db, propertyId) : null;

        return renderTemplate(
          template,
          mergeValuesFor({
            person,
            property,
            agent: {
              name: user.displayName ?? user.fullName,
              phone: null,
              email: user.email,
            },
          }),
        );
      });

      if (!composed) {
        return { ok: false as const, message: 'That template could not be found.' };
      }

      const notes = ['Wording ready. Copy it into WhatsApp or your own email — the CRM does not send it.'];
      if (composed.unfilled.length > 0) {
        notes.push(
          `${composed.unfilled.length} field(s) had nothing behind them and are still showing as placeholders: ${composed.unfilled.join(', ')}.`,
        );
      }

      return {
        ok: true as const,
        message: notes.join(' '),
        data: {
          subject: composed.subject,
          body: composed.body,
          unfilled: composed.unfilled,
        },
      };
    },
  );
}

// --- templates --------------------------------------------------------------

function readTemplateForm(formData: FormData) {
  return parseOrThrow(templateInputSchema, {
    name: formText(formData, 'name'),
    category: formText(formData, 'category') || 'general',
    channel: formText(formData, 'channel') || 'any',
    subject: formText(formData, 'subject'),
    body: formText(formData, 'body'),
    isActive: formBool(formData, 'isActive'),
  });
}

export async function createTemplateAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('template.create', async () => {
    const user = await requirePermission('SETTINGS_ADMIN', 'message templates');
    const ctx = await context();
    await withUser(user.id, (db) => createTemplate(db, ctx, readTemplateForm(formData)));
    return { ok: true as const, message: 'Template saved.' };
  });

  if (result.ok) {
    revalidatePath('/communications/templates');
    redirect('/communications/templates?saved=created');
  }
  return result;
}

export async function updateTemplateAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const id = formText(formData, 'templateId');

  const result = await runAction<undefined>('template.update', async () => {
    const user = await requirePermission('SETTINGS_ADMIN', 'message templates');
    const ctx = await context();
    await withUser(user.id, (db) =>
      updateTemplate(db, ctx, id, readTemplateForm(formData), Number(formText(formData, 'rowVersion'))),
    );
    return { ok: true as const, message: 'Template saved.' };
  });

  if (result.ok) {
    revalidatePath('/communications/templates');
    redirect('/communications/templates?saved=updated');
  }
  return result;
}
