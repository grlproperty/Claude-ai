'use client';

import { useActionState } from 'react';

import { decide } from './actions';
import { NO_DECISION_YET, type DecisionFormState } from './form-state';

export interface OptionChoice {
  key: string;
  label: string;
  reversible: boolean;
}

export interface PersonChoice {
  id: string;
  name: string;
  department: string;
}

/**
 * The part of a decision card that does something.
 *
 * Every field the decision might need is present from the start rather than
 * revealed by the button pressed: someone deciding in ten seconds should not
 * have to press a button to discover that a date was required. What each button
 * needs is said in the labels, and enforced server-side regardless.
 */
export function DecideForm({
  escalationId,
  options,
  people,
  recommendedOptionKey,
}: {
  escalationId: string;
  options: OptionChoice[];
  people: PersonChoice[];
  recommendedOptionKey: string | null;
}) {
  const [state, formAction, pending] = useActionState<DecisionFormState, FormData>(decide, NO_DECISION_YET);

  if (state.message) {
    return (
      <div className="mt-5 rounded border border-line bg-surface-sunken px-3 py-2.5 text-sm">{state.message}</div>
    );
  }

  return (
    <form action={formAction} className="mt-5 border-t border-line pt-4">
      <input type="hidden" name="escalationId" value={escalationId} />

      <div className="grid gap-3 sm:grid-cols-2">
        {options.length ? (
          <label className="block">
            <span className="text-micro uppercase tracking-[0.12em] text-ink-muted">Option — for Approve</span>
            <select
              name="optionKey"
              defaultValue={state.values.optionKey || recommendedOptionKey || ''}
              className="mt-1.5 w-full rounded border border-line bg-white px-3 py-2 text-sm focus:border-maroon"
            >
              <option value="">Choose an option</option>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                  {o.reversible ? '' : ' (not reversible)'}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="block">
          <span className="text-micro uppercase tracking-[0.12em] text-ink-muted">
            Person — for Delegate or Ask
          </span>
          <select
            name="assigneeId"
            defaultValue={state.values.assigneeId}
            className="mt-1.5 w-full rounded border border-line bg-white px-3 py-2 text-sm focus:border-maroon"
          >
            <option value="">Nobody chosen</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.department.toLowerCase().replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-micro uppercase tracking-[0.12em] text-ink-muted">Comes back on — for Defer</span>
          <input
            type="date"
            name="deferUntil"
            defaultValue={state.values.deferUntil}
            className="mt-1.5 w-full rounded border border-line px-3 py-2 text-sm focus:border-maroon"
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-micro uppercase tracking-[0.12em] text-ink-muted">
            Reason, or what you are asking for
          </span>
          <textarea
            name="note"
            rows={2}
            defaultValue={state.values.note}
            className="mt-1.5 w-full rounded border border-line px-3 py-2 text-sm leading-relaxed focus:border-maroon"
            placeholder="Required to reject, to ask, or to defer."
          />
        </label>
      </div>

      {state.problems.length ? (
        <ul className="mt-3 space-y-1 rounded border border-maroon-200 bg-maroon-50 px-3 py-2">
          {state.problems.map((p) => (
            <li key={p} className="text-sm text-maroon">
              {p}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Action value="APPROVED" label="Approve" primary pending={pending} />
        <Action value="REJECTED" label="Reject" pending={pending} />
        <Action value="DELEGATED" label="Delegate" pending={pending} />
        <Action value="INFORMATION_REQUESTED" label="Request information" pending={pending} />
        <Action value="DEFERRED" label="Defer" pending={pending} />
      </div>
    </form>
  );
}

function Action({
  value,
  label,
  primary,
  pending,
}: {
  value: string;
  label: string;
  primary?: boolean;
  pending: boolean;
}) {
  return (
    <button
      type="submit"
      name="outcome"
      value={value}
      disabled={pending}
      className={
        primary
          ? 'rounded bg-maroon px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-50'
          : 'rounded border border-line px-3 py-1.5 text-sm transition hover:border-maroon hover:text-maroon disabled:opacity-50'
      }
    >
      {label}
    </button>
  );
}
