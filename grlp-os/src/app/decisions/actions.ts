'use server';

import { requireUser } from '../../server/session';
import { recordDecision } from '../../server/decisions';
import { InvalidDecisionError, type DecisionOutcome } from '../../domain/decisions';
import { ForbiddenError } from '../../server/permissions';
// Only async functions may be exported from a 'use server' module — the state
// shape and its initial value live with the form that uses them.
import type { DecisionFormState, DecisionValues } from './form-state';

const OUTCOMES: DecisionOutcome[] = ['APPROVED', 'REJECTED', 'DELEGATED', 'INFORMATION_REQUESTED', 'DEFERRED'];

function isOutcome(value: string): value is DecisionOutcome {
  return (OUTCOMES as string[]).includes(value);
}

function typedValues(formData: FormData): DecisionValues {
  return {
    optionKey: String(formData.get('optionKey') ?? ''),
    assigneeId: String(formData.get('assigneeId') ?? ''),
    note: String(formData.get('note') ?? ''),
    deferUntil: String(formData.get('deferUntil') ?? ''),
  };
}

/**
 * Records a decision taken in the inbox.
 *
 * Errors come back as text to read, not as a thrown page: someone deciding at
 * speed should be told "name the person this goes to" beside the form, with
 * what they already typed still in it.
 */
export async function decide(_previous: DecisionFormState, formData: FormData): Promise<DecisionFormState> {
  const user = await requireUser();
  const values = typedValues(formData);
  const refuse = (...problems: string[]): DecisionFormState => ({ problems, message: null, values });

  const escalationId = String(formData.get('escalationId') ?? '').trim();
  const outcome = String(formData.get('outcome') ?? '').trim();
  if (!escalationId) return refuse('That matter could not be identified.');
  if (!isOutcome(outcome)) return refuse('Choose what you are doing with it.');

  const deferUntil = values.deferUntil.trim() ? new Date(`${values.deferUntil.trim()}T17:00:00`) : undefined;
  if (deferUntil && Number.isNaN(deferUntil.getTime())) return refuse('That date could not be read.');

  try {
    const result = await recordDecision(user, escalationId, {
      outcome,
      optionKey: values.optionKey.trim() || undefined,
      assigneeId: values.assigneeId.trim() || undefined,
      note: values.note,
      deferUntil,
    });

    // No revalidation: every screen here is force-dynamic, so there is no cache
    // to clear, and re-rendering the list would replace the card — and its
    // confirmation — the instant it appeared. Whoever just decided something
    // should be told it happened.
    return { problems: [], message: result.message, values };
  } catch (error) {
    if (error instanceof InvalidDecisionError) return refuse(...error.problems);
    if (error instanceof ForbiddenError) return refuse(error.message);
    throw error;
  }
}
