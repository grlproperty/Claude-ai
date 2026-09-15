/**
 * The state the decision form carries between submissions.
 *
 * It lives apart from the action because a 'use server' module may export
 * nothing but async functions: a plain constant exported from there arrives on
 * the client as undefined.
 */

/**
 * What was typed. React resets a form once its action completes, so a rejected
 * submission would otherwise throw away the reason someone just wrote. Sending
 * the values back makes the fields fill themselves in again.
 */
export interface DecisionValues {
  optionKey: string;
  assigneeId: string;
  note: string;
  deferUntil: string;
}

export interface DecisionFormState {
  /** What is wrong, in the words the person needs to fix it. */
  problems: string[];
  /** What happened, once it did. */
  message: string | null;
  values: DecisionValues;
}

export const NOTHING_TYPED: DecisionValues = { optionKey: '', assigneeId: '', note: '', deferUntil: '' };

export const NO_DECISION_YET: DecisionFormState = { problems: [], message: null, values: NOTHING_TYPED };
