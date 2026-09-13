'use client';

import { useActionState } from 'react';
import {
  addRelationshipAction,
  archivePersonAction,
  assignAgentAction,
  removeRelationshipAction,
  restorePersonAction,
} from '../actions.ts';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { ConfirmSubmitButton, FormResult, SubmitButton } from '@/components/ui/form.tsx';
import { relationshipTypeOptions } from '@/lib/domain.ts';
import type { ActionResult } from '@/lib/action-result.ts';

export function AssignAgentPanel({
  personId,
  agents,
  primaryAgentId,
  secondaryAgentId,
}: {
  personId: string;
  agents: { id: string; name: string }[];
  primaryAgentId: string | null;
  secondaryAgentId: string | null;
}) {
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    assignAgentAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-3 p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="personId" value={personId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Primary agent" htmlFor="assign-primary">
          <Select id="assign-primary" name="primaryAgentId" defaultValue={primaryAgentId ?? ''}>
            <option value="">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Secondary agent" htmlFor="assign-secondary">
          <Select id="assign-secondary" name="secondaryAgentId" defaultValue={secondaryAgentId ?? ''}>
            <option value="">None</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Reason" htmlFor="assign-reason" hint="Kept in the assignment history">
        <Input id="assign-reason" name="reason" placeholder="For example: Ayden to Johan" />
      </Field>
      <SubmitButton tone="primary" pendingLabel="Reassigning…">
        Update assignment
      </SubmitButton>
    </form>
  );
}

export function RelationshipPanel({
  personId,
  people,
}: {
  personId: string;
  people: { id: string; label: string }[];
}) {
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    addRelationshipAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-3 p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="personId" value={personId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Person" htmlFor="rel-person" required>
          <Select id="rel-person" name="relatedPersonId" required defaultValue="">
            <option value="" disabled>
              Choose a person
            </option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Relationship" htmlFor="rel-type" required>
          <Select id="rel-type" name="relationshipType" required defaultValue="spouse">
            {relationshipTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="rel-start">
          <Input id="rel-start" name="startDate" type="date" />
        </Field>
        <Field label="Until" htmlFor="rel-end">
          <Input id="rel-end" name="endDate" type="date" />
        </Field>
        <Field label="Notes" htmlFor="rel-notes" className="sm:col-span-2">
          <Textarea id="rel-notes" name="notes" rows={2} />
        </Field>
      </div>
      <SubmitButton tone="primary" pendingLabel="Adding…">
        Add relationship
      </SubmitButton>
    </form>
  );
}

export function RemoveRelationshipButton({
  personId,
  relationshipId,
}: {
  personId: string;
  relationshipId: string;
}) {
  const [, action] = useActionState<ActionResult | undefined, FormData>(
    removeRelationshipAction,
    undefined,
  );
  return (
    <form action={action}>
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <ConfirmSubmitButton
        tone="quiet"
        size="sm"
        confirm="Remove this relationship? The rest of both records is unaffected."
      >
        Remove
      </ConfirmSubmitButton>
    </form>
  );
}

export function ArchivePanel({
  personId,
  isArchived,
  clientRef,
}: {
  personId: string;
  isArchived: boolean;
  clientRef: string;
}) {
  const [archiveState, archive] = useActionState<ActionResult | undefined, FormData>(
    archivePersonAction,
    undefined,
  );
  const [restoreState, restore] = useActionState<ActionResult | undefined, FormData>(
    restorePersonAction,
    undefined,
  );

  if (isArchived) {
    return (
      <form action={restore} className="space-y-3 p-4 sm:p-5">
        <FormResult state={restoreState} />
        <input type="hidden" name="personId" value={personId} />
        <Alert tone="warn">
          This record is archived. Its history is intact and it is hidden from the active list.
        </Alert>
        <SubmitButton pendingLabel="Restoring…">Restore this client</SubmitButton>
      </form>
    );
  }

  return (
    <form action={archive} className="space-y-3 p-4 sm:p-5">
      <FormResult state={archiveState} />
      <input type="hidden" name="personId" value={personId} />
      <p className="text-[0.8125rem] text-ink-soft">
        Archiving hides this client from the active list. Nothing is deleted: the communications,
        permissions and history all remain, and {clientRef} is never given to anyone else.
      </p>
      <Field label="Reason" htmlFor="archive-reason">
        <Input id="archive-reason" name="reason" placeholder="For example: moved overseas" />
      </Field>
      <ConfirmSubmitButton
        tone="danger"
        confirm="Archive this client? They will be hidden from the active list. Nothing is deleted."
        pendingLabel="Archiving…"
      >
        Archive this client
      </ConfirmSubmitButton>
    </form>
  );
}

export { Button };
