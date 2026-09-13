'use client';

import { useActionState, useId } from 'react';
import Link from 'next/link';
import { createTaskAction, updateTaskAction } from './actions.ts';
import { Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives.tsx';
import { FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import {
  taskPriorityOptions,
  taskRecurrenceOptions,
  taskStatusOptions,
  taskTypeOptions,
} from '@/lib/domain.ts';
import type { ActionResult } from '@/lib/action-result.ts';
import type { PipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import type { TaskSummary } from '@/lib/tasks.ts';

export function TaskForm({
  mode,
  task,
  options,
  defaults,
  returnTo,
}: {
  mode: 'create' | 'edit';
  task?: TaskSummary;
  options: PipelineFormOptions;
  defaults?: { personId?: string; propertyId?: string; leadId?: string; transactionId?: string };
  returnTo?: string;
}) {
  const formId = useId();
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    mode === 'create' ? createTaskAction : updateTaskAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <FormResult state={state} />
      {task ? (
        <>
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="rowVersion" value={task.rowVersion} />
        </>
      ) : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <Card>
        <CardHeader title="What needs doing?" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field
            label="Task"
            htmlFor={`${formId}-title`}
            required
            className="sm:col-span-2"
            error={fieldError(state, 'title')}
          >
            <Input
              id={`${formId}-title`}
              name="title"
              required
              defaultValue={task?.title ?? ''}
              placeholder="Phone the seller about the price reduction"
            />
          </Field>

          <Field label="Type" htmlFor={`${formId}-type`}>
            <Select id={`${formId}-type`} name="taskType" defaultValue={task?.taskType ?? 'follow_up'}>
              {taskTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Due" htmlFor={`${formId}-due`}>
            <Input
              id={`${formId}-due`}
              name="dueAt"
              type="datetime-local"
              defaultValue={task?.dueAt ? task.dueAt.slice(0, 16) : ''}
            />
          </Field>

          <Field label="Priority" htmlFor={`${formId}-priority`}>
            <Select id={`${formId}-priority`} name="priority" defaultValue={task?.priority ?? 'normal'}>
              {taskPriorityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" htmlFor={`${formId}-status`}>
            <Select id={`${formId}-status`} name="status" defaultValue={task?.status ?? 'to_do'}>
              {taskStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Assigned to" htmlFor={`${formId}-assigned`}>
            <Select
              id={`${formId}-assigned`}
              name="assignedUserId"
              defaultValue={task?.assignedUserId ?? ''}
            >
              <option value="">Me</option>
              {options.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Repeats" htmlFor={`${formId}-recurrence`}>
            <Select
              id={`${formId}-recurrence`}
              name="recurrence"
              defaultValue={task?.recurrence ?? 'none'}
            >
              {taskRecurrenceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Stop repeating after"
            htmlFor={`${formId}-until`}
            hint="Leave blank to keep repeating"
          >
            <Input id={`${formId}-until`} name="recurrenceUntil" type="date" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="What is it about?" description="Linking it puts the task on that record too." />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Client" htmlFor={`${formId}-person`}>
            <Select
              id={`${formId}-person`}
              name="personId"
              defaultValue={task?.personId ?? defaults?.personId ?? ''}
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
              defaultValue={task?.propertyId ?? defaults?.propertyId ?? ''}
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
                defaultValue={task?.leadId ?? defaults?.leadId ?? ''}
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
          {options.transactions.length > 0 ? (
            <Field label="Transaction" htmlFor={`${formId}-transaction`}>
              <Select
                id={`${formId}-transaction`}
                name="transactionId"
                defaultValue={defaults?.transactionId ?? ''}
              >
                <option value="">—</option>
                {options.transactions.map((transaction) => (
                  <option key={transaction.id} value={transaction.id}>
                    {transaction.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Notes" htmlFor={`${formId}-notes`} className="sm:col-span-2">
            <Textarea id={`${formId}-notes`} name="notes" defaultValue={task?.notes ?? ''} />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton tone="primary" size="lg" pendingLabel="Saving…">
          {mode === 'create' ? 'Create follow-up' : 'Save changes'}
        </SubmitButton>
        <Link
          href={returnTo ?? '/tasks'}
          className="tap inline-flex items-center rounded-lg px-4 text-sm font-medium text-ink-soft hover:bg-paper"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
