'use client';

import { useActionState } from 'react';
import { mergePropertiesAction } from '../../actions.ts';
import { Field, Input } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { ConfirmSubmitButton, FormResult } from '@/components/ui/form.tsx';
import type { ActionResult } from '@/lib/action-result.ts';
import type { PropertyMergeComparison } from '@/lib/properties/merge.ts';

/** Property merge. Same rules as people: nothing is merged silently. */
export function PropertyMergeForm({ comparison }: { comparison: PropertyMergeComparison }) {
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    mergePropertiesAction,
    undefined,
  );
  const differing = comparison.fields.filter((field) => field.differs);

  return (
    <form action={action} className="space-y-4">
      <FormResult state={state} />
      <input type="hidden" name="masterId" value={comparison.master.id} />
      <input type="hidden" name="mergedId" value={comparison.merged.id} />

      <Alert tone="warn" title="This cannot be undone">
        {comparison.merged.propertyRef} will be marked as merged into{' '}
        {comparison.master.propertyRef}. Its owners, photographs, documents, status history,
        mandate history and past sales all move across; its reference is kept for ever.
      </Alert>

      {differing.length === 0 ? (
        <Alert tone="neutral">
          These two records hold the same values in every field, so there is nothing to choose.
        </Alert>
      ) : (
        <div className="table-scroll overflow-hidden rounded-lg border border-line">
          <table className="w-full min-w-[36rem] text-sm">
            <caption className="sr-only">Choose which value survives for each field</caption>
            <thead>
              <tr className="bg-paper">
                <th scope="col" className="px-3 py-2 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                  Field
                </th>
                <th scope="col" className="px-3 py-2 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                  Keep from {comparison.master.propertyRef}
                </th>
                <th scope="col" className="px-3 py-2 text-left text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                  Take from {comparison.merged.propertyRef}
                </th>
              </tr>
            </thead>
            <tbody>
              {differing.map((field) => (
                <tr key={field.field} className="border-t border-line-soft">
                  <th scope="row" className="px-3 py-2.5 text-left font-medium text-ink">
                    {field.label}
                  </th>
                  <td className="px-3 py-2.5">
                    <label className="flex items-start gap-2">
                      <input
                        type="radio"
                        name={`choice[${field.field}]`}
                        value="master"
                        defaultChecked
                        className="mt-1 accent-[#991c1f]"
                      />
                      <span>{field.masterValue || <span className="text-ink-faint">Blank</span>}</span>
                    </label>
                  </td>
                  <td className="px-3 py-2.5">
                    <label className="flex items-start gap-2">
                      <input
                        type="radio"
                        name={`choice[${field.field}]`}
                        value="merged"
                        className="mt-1 accent-[#991c1f]"
                      />
                      <span>{field.mergedValue || <span className="text-ink-faint">Blank</span>}</span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Field
        label="Reason for merging"
        htmlFor="merge-reason"
        hint="Recorded on the merge record with your name and the date"
      >
        <Input
          id="merge-reason"
          name="reason"
          placeholder="For example: the same erf captured twice"
        />
      </Field>

      <ConfirmSubmitButton
        tone="danger"
        size="lg"
        confirm={`Merge ${comparison.merged.propertyRef} into ${comparison.master.propertyRef}? This cannot be undone.`}
        pendingLabel="Merging…"
      >
        Merge these records
      </ConfirmSubmitButton>
    </form>
  );
}
