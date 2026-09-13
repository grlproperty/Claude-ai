'use client';

import { useActionState, useId, useState } from 'react';
import Link from 'next/link';
import {
  createRentalApplicationAction,
  setScreeningItemAction,
  updateRentalApplicationAction,
} from './actions.ts';
import { Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import {
  rentalApplicationStatusOptions,
  screeningItemStatusOptions,
  screeningStatusOptions,
} from '@/lib/domain.ts';
import { today } from '@/lib/format.ts';
import type { ActionResult } from '@/lib/action-result.ts';
import type { PipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import type { RentalApplicationSummary, ScreeningRow } from '@/lib/rentals.ts';

type State = ActionResult | undefined;

export function RentalApplicationForm({
  mode,
  application,
  options,
  defaults,
}: {
  mode: 'create' | 'edit';
  application?: RentalApplicationSummary;
  options: PipelineFormOptions;
  defaults?: { propertyId?: string; applicantId?: string; landlordId?: string; leadId?: string };
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(
    mode === 'create' ? createRentalApplicationAction : updateRentalApplicationAction,
    undefined,
  );
  const [status, setStatus] = useState(application?.applicationStatus ?? 'draft');

  return (
    <form action={action} className="space-y-4">
      <FormResult state={state} />
      {application ? (
        <>
          <input type="hidden" name="applicationId" value={application.id} />
          <input type="hidden" name="rowVersion" value={application.rowVersion} />
          <input type="hidden" name="propertyId" value={application.propertyId} />
        </>
      ) : null}

      <Card>
        <CardHeader title="The application" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          {mode === 'create' ? (
            <Field
              label="Property"
              htmlFor={`${formId}-property`}
              required
              error={fieldError(state, 'propertyId')}
            >
              <Select
                id={`${formId}-property`}
                name="propertyId"
                required
                defaultValue={defaults?.propertyId ?? ''}
              >
                <option value="">Choose the property</option>
                {options.properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Applicant" htmlFor={`${formId}-applicant`}>
            <Select
              id={`${formId}-applicant`}
              name="applicantId"
              defaultValue={application?.applicantId ?? defaults?.applicantId ?? ''}
            >
              <option value="">—</option>
              {options.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Co-applicant"
            htmlFor={`${formId}-co`}
            error={fieldError(state, 'coApplicantId')}
          >
            <Select
              id={`${formId}-co`}
              name="coApplicantId"
              defaultValue={application?.coApplicantId ?? ''}
            >
              <option value="">None</option>
              {options.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Landlord" htmlFor={`${formId}-landlord`}>
            <Select
              id={`${formId}-landlord`}
              name="landlordId"
              defaultValue={application?.landlordId ?? defaults?.landlordId ?? ''}
            >
              <option value="">—</option>
              {options.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Agent" htmlFor={`${formId}-agent`}>
            <Select id={`${formId}-agent`} name="agentId" defaultValue={application?.agentId ?? ''}>
              <option value="">Me</option>
              {options.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Monthly rental" htmlFor={`${formId}-rent`}>
            <Input
              id={`${formId}-rent`}
              name="monthlyRental"
              inputMode="numeric"
              defaultValue={application?.monthlyRental ?? ''}
            />
          </Field>
          <Field label="Deposit" htmlFor={`${formId}-deposit`}>
            <Input
              id={`${formId}-deposit`}
              name="deposit"
              inputMode="numeric"
              defaultValue={application?.deposit ?? ''}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Where it stands" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Application status" htmlFor={`${formId}-status`} required>
            <Select
              id={`${formId}-status`}
              name="applicationStatus"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              {rentalApplicationStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Screening" htmlFor={`${formId}-screening`} hint="Set by the checklist below">
            <Select
              id={`${formId}-screening`}
              name="screeningStatus"
              defaultValue={application?.screeningStatus ?? 'not_started'}
            >
              {screeningStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          {status === 'approved' || status === 'lease_prepared' || status === 'lease_signed' ? (
            <Field
              label="Approved on"
              htmlFor={`${formId}-approved`}
              required
              error={fieldError(state, 'approvalDate')}
            >
              <Input
                id={`${formId}-approved`}
                name="approvalDate"
                type="date"
                defaultValue={application?.approvalDate ?? today()}
              />
            </Field>
          ) : null}

          {status === 'rejected' ? (
            <>
              <Field
                label="Rejected on"
                htmlFor={`${formId}-rejected`}
                required
                error={fieldError(state, 'rejectionDate')}
              >
                <Input
                  id={`${formId}-rejected`}
                  name="rejectionDate"
                  type="date"
                  defaultValue={application?.rejectionDate ?? today()}
                />
              </Field>
              <Field
                label="Why was it rejected?"
                htmlFor={`${formId}-reason`}
                required
                className="sm:col-span-2"
                error={fieldError(state, 'rejectionReason')}
              >
                <Input
                  id={`${formId}-reason`}
                  name="rejectionReason"
                  required
                  defaultValue={application?.rejectionReason ?? ''}
                />
              </Field>
            </>
          ) : null}

          <Field label="Lease start" htmlFor={`${formId}-start`}>
            <Input
              id={`${formId}-start`}
              name="leaseStart"
              type="date"
              defaultValue={application?.leaseStart ?? ''}
            />
          </Field>
          <Field label="Lease end" htmlFor={`${formId}-end`} error={fieldError(state, 'leaseEnd')}>
            <Input
              id={`${formId}-end`}
              name="leaseEnd"
              type="date"
              defaultValue={application?.leaseEnd ?? ''}
            />
          </Field>
          <Field label="Notes" htmlFor={`${formId}-notes`} className="sm:col-span-2">
            <Textarea id={`${formId}-notes`} name="notes" defaultValue={application?.notes ?? ''} />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <SubmitButton tone="primary" size="lg" pendingLabel="Saving…">
          {mode === 'create' ? 'Create the application' : 'Save changes'}
        </SubmitButton>
        <Link
          href={application ? `/rentals/applications/${application.id}` : '/rentals'}
          className="tap inline-flex items-center rounded-lg px-4 text-sm font-medium text-ink-soft hover:bg-paper"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

/**
 * The screening checklist (spec 51).
 *
 * The items themselves are configuration, so what GRLP checks can change
 * without a deployment. Nothing here asserts a legal requirement.
 */
export function ScreeningChecklist({
  applicationId,
  items,
}: {
  applicationId: string;
  items: ScreeningRow[];
}) {
  const [state, action] = useActionState<State, FormData>(setScreeningItemAction, undefined);

  return (
    <div className="p-4 sm:p-5">
      <Alert tone="neutral" className="mb-4">
        These checks are configured by GRLP, not fixed in the software. Recording one here is a
        record of what the office did, not a legal opinion.
      </Alert>
      {state ? <FormResult state={state} /> : null}

      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-lg border border-line-soft p-3">
            <form action={action} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
              <input type="hidden" name="applicationId" value={applicationId} />
              <input type="hidden" name="itemId" value={item.itemId} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {item.name}
                  {item.isRequired ? <span className="ml-1 text-brand">*</span> : null}
                </p>
                {item.description ? (
                  <p className="text-[0.6875rem] text-ink-faint">{item.description}</p>
                ) : null}
                <Input
                  name="notes"
                  defaultValue={item.notes ?? ''}
                  placeholder="Note"
                  className="mt-1.5 h-9 text-xs"
                  aria-label={`Note for ${item.name}`}
                />
              </div>
              <Select
                name="status"
                defaultValue={item.status}
                className="h-9"
                aria-label={`Status for ${item.name}`}
              >
                {screeningItemStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <SubmitButton size="sm" pendingLabel="…">
                Save
              </SubmitButton>
            </form>
            {item.recordedByName ? (
              <p className="mt-1 text-[0.6875rem] text-ink-faint">
                Last recorded by {item.recordedByName}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
