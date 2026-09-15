import type { EscalationOption } from './escalation';

/**
 * Recording a decision (§25).
 *
 * The decision inbox exists so that a matter reaching Mandy takes seconds. That
 * only holds if what she does with it is captured properly — a decision that
 * leaves no owner, no reason, or no date is the same as no decision, and the
 * matter comes back next week with the investigation to do again.
 *
 * So each outcome states what it needs before it counts, and that is checked
 * here rather than in the page. The rules are the point:
 *
 *   Approve   — which option. Not "yes" in the abstract.
 *   Reject    — why. The next person has to know what was wrong with it.
 *   Delegate  — to whom. Never back to the person deciding, and never to a
 *               default: the whole system refuses to assume an owner.
 *   Ask       — of whom, and what. A question nobody owns is not asked.
 *   Defer     — until when, and why. A date, not an intention.
 *
 * Nothing here touches the database. It decides what a decision means; the
 * server module carries it out.
 */

export type DecisionOutcome = 'APPROVED' | 'REJECTED' | 'DELEGATED' | 'INFORMATION_REQUESTED' | 'DEFERRED';

export interface DecisionInput {
  outcome: DecisionOutcome;
  /** The option being approved. Required when the escalation offered options. */
  optionKey?: string;
  /** Who the matter goes to, for a delegation or a question. */
  assigneeId?: string;
  /** Free text: the reason, or the question being asked. */
  note?: string;
  /** When a deferred matter comes back. */
  deferUntil?: Date;
}

export interface DecisionContext {
  escalationId: string;
  /** Who is deciding. */
  deciderId: string;
  options: EscalationOption[];
  recommendation: string;
  alreadyResolved: boolean;
  now?: Date;
}

export class InvalidDecisionError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(' '));
    this.name = 'InvalidDecisionError';
  }
}

export interface DecisionEffect {
  /** Whether the matter leaves the inbox. A question or a deferral does not. */
  resolves: boolean;
  /** Written to Escalation.outcome. */
  outcome: DecisionOutcome;
  /** Written to Escalation.resolutionNote, and to the audit log. */
  resolutionNote: string;
  /** Appended to actionsTaken, so the history reads as one narrative. */
  historyEntry: string;
  /** Set when the decision hands work to a person. */
  task: { ownerId: string; title: string; detail: string; dueAt?: Date } | null;
  /** Set when the matter comes back on a date. */
  newDueAt: Date | null;
  /** The chosen option, where one was chosen. */
  chosenOption: EscalationOption | null;
}

const NEEDS_ASSIGNEE: DecisionOutcome[] = ['DELEGATED', 'INFORMATION_REQUESTED'];

/**
 * Turns a decision into the effects it has. Throws rather than guessing: an
 * incomplete decision recorded as though it were complete is worse than a
 * rejected form, because nobody finds out until the matter is overdue.
 */
export function resolveDecision(input: DecisionInput, context: DecisionContext): DecisionEffect {
  const now = context.now ?? new Date();
  const problems: string[] = [];

  if (context.alreadyResolved) {
    problems.push('This matter has already been decided.');
    throw new InvalidDecisionError(problems);
  }

  const note = input.note?.trim() ?? '';

  // An option must be one that was actually offered — approving something the
  // escalation never proposed would record a decision nobody can act on.
  let chosenOption: EscalationOption | null = null;
  if (input.optionKey) {
    chosenOption = context.options.find((o) => o.key === input.optionKey) ?? null;
    if (!chosenOption) problems.push('That option was not one of the options offered.');
  }

  if (input.outcome === 'APPROVED' && context.options.length > 0 && !input.optionKey) {
    problems.push('Choose which option you are approving.');
  }

  if (input.outcome === 'REJECTED' && !note) {
    problems.push('Say why it is rejected, so the matter does not come back unchanged.');
  }

  if (NEEDS_ASSIGNEE.includes(input.outcome) && !input.assigneeId) {
    problems.push('Name the person this goes to.');
  }

  if (input.assigneeId && input.assigneeId === context.deciderId) {
    problems.push('That is the person deciding — delegating to yourself is not delegating.');
  }

  if (input.outcome === 'INFORMATION_REQUESTED' && !note) {
    problems.push('Say what you are asking for.');
  }

  if (input.outcome === 'DEFERRED') {
    if (!input.deferUntil) problems.push('Give the date it comes back.');
    else if (input.deferUntil.getTime() <= now.getTime()) problems.push('The date it comes back must be in the future.');
    if (!note) problems.push('Say what it is waiting for.');
  }

  if (problems.length) throw new InvalidDecisionError(problems);

  const stamp = now.toLocaleDateString('en-ZA');

  switch (input.outcome) {
    case 'APPROVED': {
      const what = chosenOption ? chosenOption.label : context.recommendation;
      const irreversible = chosenOption && !chosenOption.reversible ? ' This cannot be undone.' : '';
      return {
        resolves: true,
        outcome: 'APPROVED',
        resolutionNote: note ? `${what}. ${note}` : what,
        historyEntry: `${stamp}: approved — ${what}.${irreversible}`,
        task: null,
        newDueAt: null,
        chosenOption,
      };
    }

    case 'REJECTED':
      return {
        resolves: true,
        outcome: 'REJECTED',
        resolutionNote: note,
        historyEntry: `${stamp}: rejected — ${note}`,
        task: null,
        newDueAt: null,
        chosenOption,
      };

    case 'DELEGATED':
      return {
        resolves: true,
        outcome: 'DELEGATED',
        resolutionNote: note || 'Handed over in full.',
        historyEntry: `${stamp}: delegated.${note ? ` ${note}` : ''}`,
        task: {
          ownerId: input.assigneeId!,
          title: `Delegated: ${truncate(context.recommendation, 80)}`,
          detail: note || 'Delegated from the decision inbox. The full history is on the escalation.',
          dueAt: input.deferUntil,
        },
        newDueAt: null,
        chosenOption,
      };

    // The matter stays in the inbox: the question is not the answer, and the
    // decision still has to be taken once the answer arrives.
    case 'INFORMATION_REQUESTED':
      return {
        resolves: false,
        outcome: 'INFORMATION_REQUESTED',
        resolutionNote: '',
        historyEntry: `${stamp}: asked for more information — ${note}`,
        task: {
          ownerId: input.assigneeId!,
          title: `Information needed: ${truncate(note, 80)}`,
          detail: `Asked from the decision inbox. A decision is waiting on this answer.\n\n${note}`,
          dueAt: input.deferUntil,
        },
        newDueAt: null,
        chosenOption,
      };

    case 'DEFERRED':
      return {
        resolves: false,
        outcome: 'DEFERRED',
        resolutionNote: '',
        historyEntry: `${stamp}: deferred to ${input.deferUntil!.toLocaleDateString('en-ZA')} — ${note}`,
        task: null,
        newDueAt: input.deferUntil!,
        chosenOption,
      };
  }
}

function truncate(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}
