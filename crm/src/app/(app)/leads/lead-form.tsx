'use client';

import { useActionState, useId, useState } from 'react';
import Link from 'next/link';
import { createLeadAction, updateLeadAction } from './actions.ts';
import {
  Card,
  CardHeader,
  Checkbox,
  Field,
  Input,
  Legend,
  Select,
  Textarea,
} from '@/components/ui/primitives.tsx';
import { FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import {
  businessAreaOptions,
  leadStatusOptions,
  rentalLeadTypeOptions,
  salesLeadTypeOptions,
} from '@/lib/domain.ts';
import type { ActionResult } from '@/lib/action-result.ts';
import type { LeadDetail } from '@/lib/leads.ts';

export interface LeadFormOptions {
  agents: { id: string; name: string }[];
  sources: { id: string; name: string }[];
  lossReasons: { id: string; name: string }[];
  people: { id: string; label: string }[];
  properties: { id: string; label: string }[];
  tags: { id: string; name: string; colour: string }[];
  selectedTagIds?: string[];
}

export function LeadForm({
  mode,
  lead,
  options,
  defaults,
}: {
  mode: 'create' | 'edit';
  lead?: LeadDetail;
  options: LeadFormOptions;
  defaults?: { personId?: string; propertyId?: string };
}) {
  const formId = useId();
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    mode === 'create' ? createLeadAction : updateLeadAction,
    undefined,
  );

  const [businessArea, setBusinessArea] = useState(lead?.businessArea ?? 'sales');
  const [status, setStatus] = useState(lead?.status ?? 'new');

  // Sales and rental enquiries are different work, so the type list follows
  // the business area rather than offering all of them at once.
  const typeOptions =
    businessArea === 'rentals'
      ? rentalLeadTypeOptions
      : businessArea === 'sales_rentals'
        ? [...salesLeadTypeOptions, ...rentalLeadTypeOptions]
        : salesLeadTypeOptions;

  return (
    <form action={action} className="space-y-4">
      <FormResult state={state} />
      {lead ? (
        <>
          <input type="hidden" name="leadId" value={lead.id} />
          <input type="hidden" name="rowVersion" value={lead.rowVersion} />
        </>
      ) : null}

      <Card>
        <CardHeader
          title="What is the enquiry?"
          description="Link it to a person wherever you can, so it joins their one master record."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Business area" htmlFor={`${formId}-area`} required>
            <Select
              id={`${formId}-area`}
              name="businessArea"
              value={businessArea}
              onChange={(event) => setBusinessArea(event.target.value as typeof businessArea)}
            >
              {businessAreaOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Lead type"
            htmlFor={`${formId}-type`}
            required
            error={fieldError(state, 'leadType')}
          >
            <Select id={`${formId}-type`} name="leadType" defaultValue={lead?.leadType ?? 'buyer'}>
              {typeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Person" htmlFor={`${formId}-person`}>
            <Select
              id={`${formId}-person`}
              name="personId"
              defaultValue={lead?.personId ?? defaults?.personId ?? ''}
            >
              <option value="">Not linked yet</option>
              {options.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Property" htmlFor={`${formId}-property`}>
            <Select
              id={`${formId}-property`}
              name="propertyId"
              defaultValue={lead?.propertyId ?? defaults?.propertyId ?? ''}
            >
              <option value="">Not about one property</option>
              {options.properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Where did it come from?" htmlFor={`${formId}-source`}>
            <Select id={`${formId}-source`} name="sourceId" defaultValue={lead?.sourceId ?? ''}>
              <option value="">Not recorded</option>
              {options.sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" htmlFor={`${formId}-status`} required>
            <Select
              id={`${formId}-status`}
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              {leadStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          {status === 'lost' ? (
            <Field
              label="Why was it lost?"
              htmlFor={`${formId}-loss`}
              required
              error={fieldError(state, 'lossReasonId')}
              hint="This is what makes the lost-lead report worth reading."
            >
              <Select
                id={`${formId}-loss`}
                name="lossReasonId"
                defaultValue={lead?.lossReasonId ?? ''}
              >
                <option value="">Choose a reason</option>
                {options.lossReasons.map((reason) => (
                  <option key={reason.id} value={reason.id}>
                    {reason.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Summary of the enquiry" htmlFor={`${formId}-summary`} className="sm:col-span-2">
            <Textarea
              id={`${formId}-summary`}
              name="enquirySummary"
              rows={2}
              defaultValue={lead?.enquirySummary ?? ''}
              placeholder="Three bedrooms in Wilderness, wants to be walking distance from the beach"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="What are they looking for?" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Budget from" htmlFor={`${formId}-min`} error={fieldError(state, 'budgetMin')}>
            <Input
              id={`${formId}-min`}
              name="budgetMin"
              inputMode="numeric"
              defaultValue={lead?.budgetMin ?? ''}
            />
          </Field>
          <Field label="Budget to" htmlFor={`${formId}-max`} error={fieldError(state, 'budgetMax')}>
            <Input
              id={`${formId}-max`}
              name="budgetMax"
              inputMode="numeric"
              defaultValue={lead?.budgetMax ?? ''}
            />
          </Field>
          <Field label="Preferred areas" htmlFor={`${formId}-areas`}>
            <Input
              id={`${formId}-areas`}
              name="preferredAreas"
              defaultValue={lead?.preferredAreas ?? ''}
              placeholder="Wilderness, Sedgefield"
            />
          </Field>
          <Field label="Requirements" htmlFor={`${formId}-req`} className="sm:col-span-2">
            <Textarea
              id={`${formId}-req`}
              name="requirements"
              rows={3}
              defaultValue={lead?.requirements ?? ''}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Who is handling it, and what happens next?" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Primary agent" htmlFor={`${formId}-agent`}>
            <Select
              id={`${formId}-agent`}
              name="primaryAgentId"
              defaultValue={lead?.primaryAgentId ?? ''}
            >
              <option value="">{options.agents.length > 1 ? 'Unassigned' : 'You'}</option>
              {options.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Secondary agent" htmlFor={`${formId}-agent2`}>
            <Select
              id={`${formId}-agent2`}
              name="secondaryAgentId"
              defaultValue={lead?.secondaryAgentId ?? ''}
            >
              <option value="">None</option>
              {options.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Next follow-up" htmlFor={`${formId}-follow`}>
            <Input
              id={`${formId}-follow`}
              name="nextFollowUpAt"
              type="datetime-local"
              defaultValue={lead?.nextFollowUpAt ? lead.nextFollowUpAt.slice(0, 16) : ''}
            />
          </Field>
          <Field label="Reason for a status change" htmlFor={`${formId}-reason`}>
            <Input id={`${formId}-reason`} name="statusChangeReason" />
          </Field>

          {options.tags.length > 0 ? (
            <fieldset className="sm:col-span-2">
              <Legend>Tags</Legend>
              <div className="flex flex-wrap gap-2">
                {options.tags.map((tag) => (
                  <label
                    key={tag.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-xs"
                  >
                    <Checkbox
                      name="tagIds"
                      value={tag.id}
                      defaultChecked={(options.selectedTagIds ?? []).includes(tag.id)}
                    />
                    {tag.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <Field label="Notes" htmlFor={`${formId}-notes`} className="sm:col-span-2">
            <Textarea id={`${formId}-notes`} name="notes" defaultValue={lead?.notes ?? ''} />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-0 -mx-3 flex flex-wrap items-center gap-2 border-t border-line bg-white px-3 py-3 sm:mx-0 sm:rounded-lg sm:border sm:px-4">
        <SubmitButton tone="primary" size="lg" pendingLabel="Saving…">
          {mode === 'create' ? 'Create lead' : 'Save changes'}
        </SubmitButton>
        <Link
          href={lead ? `/leads/${lead.id}` : '/leads'}
          className="tap inline-flex items-center rounded-lg px-4 text-sm font-medium text-ink-soft hover:bg-paper"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
