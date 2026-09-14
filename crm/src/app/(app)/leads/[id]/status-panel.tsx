'use client';

import { useActionState, useState } from 'react';
import { archiveLeadAction, setLeadStatusAction } from '../actions.ts';
import { Field, Input, Select } from '@/components/ui/primitives.tsx';
import { ConfirmSubmitButton, FormResult, SubmitButton } from '@/components/ui/form.tsx';
import { leadStatusOptions } from '@/lib/domain.ts';
import type { ActionResult } from '@/lib/action-result.ts';

/** Moving a lead along without opening the whole form. */
export function LeadStatusPanel({
  leadId,
  status,
  lossReasons,
}: {
  leadId: string;
  status: string;
  lossReasons: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    setLeadStatusAction,
    undefined,
  );
  const [next, setNext] = useState(status);

  return (
    <form action={action} className="space-y-3 p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="leadId" value={leadId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Move to" htmlFor="lead-status">
          <Select
            id="lead-status"
            name="status"
            value={next}
            onChange={(event) => setNext(event.target.value)}
          >
            {leadStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        {next === 'lost' ? (
          <Field label="Why was it lost?" htmlFor="lead-loss" required>
            <Select id="lead-loss" name="lossReasonId" required defaultValue="">
              <option value="">Choose a reason</option>
              {lossReasons.map((reason) => (
                <option key={reason.id} value={reason.id}>
                  {reason.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Note" htmlFor="lead-reason" className="sm:col-span-2">
          <Input id="lead-reason" name="reason" placeholder="Kept in the lead's history" />
        </Field>
      </div>
      <SubmitButton tone="primary" pendingLabel="Updating…">
        Update status
      </SubmitButton>
    </form>
  );
}

export function ArchiveLeadPanel({ leadId }: { leadId: string }) {
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    archiveLeadAction,
    undefined,
  );
  return (
    <form action={action} className="space-y-3 border-t border-line-soft p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="leadId" value={leadId} />
      <p className="text-[0.8125rem] text-ink-soft">
        Archiving hides this lead from the active list. Its history stays.
      </p>
      <Field label="Reason" htmlFor="lead-archive-reason">
        <Input id="lead-archive-reason" name="reason" />
      </Field>
      <ConfirmSubmitButton
        tone="danger"
        confirm="Archive this lead? Nothing is deleted."
        pendingLabel="Archiving…"
      >
        Archive this lead
      </ConfirmSubmitButton>
    </form>
  );
}
