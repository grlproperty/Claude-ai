'use client';

import { useActionState, useId } from 'react';
import Link from 'next/link';
import { createAppointmentAction, updateAppointmentAction } from '../tasks/actions.ts';
import { Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives.tsx';
import { FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import { appointmentStatusOptions, appointmentTypeOptions } from '@/lib/domain.ts';
import type { ActionResult } from '@/lib/action-result.ts';
import type { PipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import type { AppointmentSummary } from '@/lib/tasks.ts';

export function AppointmentForm({
  mode,
  appointment,
  options,
  defaults,
  returnTo,
}: {
  mode: 'create' | 'edit';
  appointment?: AppointmentSummary;
  options: PipelineFormOptions;
  defaults?: { personId?: string; propertyId?: string; leadId?: string };
  returnTo?: string;
}) {
  const formId = useId();
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    mode === 'create' ? createAppointmentAction : updateAppointmentAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <FormResult state={state} />
      {appointment ? (
        <>
          <input type="hidden" name="appointmentId" value={appointment.id} />
          <input type="hidden" name="rowVersion" value={appointment.rowVersion} />
        </>
      ) : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <Card>
        <CardHeader title="When and what?" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Type" htmlFor={`${formId}-type`} required>
            <Select
              id={`${formId}-type`}
              name="appointmentType"
              defaultValue={appointment?.appointmentType ?? 'viewing'}
            >
              {appointmentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor={`${formId}-status`}>
            <Select
              id={`${formId}-status`}
              name="status"
              defaultValue={appointment?.status ?? 'scheduled'}
            >
              {appointmentStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Title"
            htmlFor={`${formId}-title`}
            required
            className="sm:col-span-2"
            error={fieldError(state, 'title')}
          >
            <Input
              id={`${formId}-title`}
              name="title"
              required
              defaultValue={appointment?.title ?? ''}
              placeholder="Viewing at 18 Main Road"
            />
          </Field>
          <Field
            label="Starts"
            htmlFor={`${formId}-start`}
            required
            error={fieldError(state, 'startsAt')}
          >
            <Input
              id={`${formId}-start`}
              name="startsAt"
              type="datetime-local"
              required
              defaultValue={appointment?.startsAt ? appointment.startsAt.slice(0, 16) : ''}
            />
          </Field>
          <Field label="Ends" htmlFor={`${formId}-end`} error={fieldError(state, 'endsAt')}>
            <Input
              id={`${formId}-end`}
              name="endsAt"
              type="datetime-local"
              defaultValue={appointment?.endsAt ? appointment.endsAt.slice(0, 16) : ''}
            />
          </Field>
          <Field label="Where" htmlFor={`${formId}-where`} className="sm:col-span-2">
            <Input
              id={`${formId}-where`}
              name="location"
              defaultValue={appointment?.location ?? ''}
              placeholder="18 Main Road, Wilderness"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Who is it with?" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Agent" htmlFor={`${formId}-agent`}>
            <Select id={`${formId}-agent`} name="agentId" defaultValue={appointment?.agentId ?? ''}>
              <option value="">Me</option>
              {options.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Client" htmlFor={`${formId}-person`}>
            <Select
              id={`${formId}-person`}
              name="personId"
              defaultValue={appointment?.personId ?? defaults?.personId ?? ''}
            >
              <option value="">—</option>
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
              defaultValue={appointment?.propertyId ?? defaults?.propertyId ?? ''}
            >
              <option value="">—</option>
              {options.properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.label}
                </option>
              ))}
            </Select>
          </Field>
          {options.leads.length > 0 ? (
            <Field label="Lead" htmlFor={`${formId}-lead`}>
              <Select
                id={`${formId}-lead`}
                name="leadId"
                defaultValue={appointment?.leadId ?? defaults?.leadId ?? ''}
              >
                <option value="">—</option>
                {options.leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Notes" htmlFor={`${formId}-notes`} className="sm:col-span-2">
            <Textarea id={`${formId}-notes`} name="notes" defaultValue={appointment?.notes ?? ''} />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton tone="primary" size="lg" pendingLabel="Saving…">
          {mode === 'create' ? 'Book it' : 'Save changes'}
        </SubmitButton>
        <Link
          href={returnTo ?? '/calendar'}
          className="tap inline-flex items-center rounded-lg px-4 text-sm font-medium text-ink-soft hover:bg-paper"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
