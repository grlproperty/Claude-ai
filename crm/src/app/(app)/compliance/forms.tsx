'use client';

import { useActionState, useId, useState } from 'react';
import {
  addDoNotContactAction,
  addEvidenceAction,
  cancelBatchAction,
  createBatchAction,
  fillBatchAction,
  loadResultsAction,
  releaseDoNotContactAction,
  setComplianceSettingAction,
  setPermissionAction,
  submitBatchAction,
} from './actions.ts';
import { Field, Input, Select, Textarea } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { ConfirmSubmitButton, FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import {
  dncChannelOptions,
  dncSourceOptions,
  evidenceTypeOptions,
  lawfulBasisOptions,
  permissionChannelOptions,
  permissionPurposeOptions,
  permissionStatusOptions,
} from '@/lib/domain.ts';
import type { ActionResult } from '@/lib/action-result.ts';
import type { EvidenceRow, PermissionRow } from '@/lib/compliance.ts';

type State = ActionResult | undefined;

// ---------------------------------------------------------------------------
// Contact permissions
// ---------------------------------------------------------------------------

export function PermissionForm({
  personId,
  evidence,
  existing,
  canEdit,
}: {
  personId: string;
  evidence: EvidenceRow[];
  existing: PermissionRow[];
  canEdit: boolean;
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(setPermissionAction, undefined);
  const [channel, setChannel] = useState('email');
  const [purpose, setPurpose] = useState('direct_marketing');
  const [status, setStatus] = useState('granted');

  const already = existing.find((row) => row.channel === channel && row.purpose === purpose);
  const isChange = Boolean(already);

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="isChange" value={String(isChange)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="How would we reach them?" htmlFor={`${formId}-channel`} required>
          <Select
            id={`${formId}-channel`}
            name="channel"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
          >
            {permissionChannelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="What for?" htmlFor={`${formId}-purpose`} required>
          <Select
            id={`${formId}-purpose`}
            name="purpose"
            value={purpose}
            onChange={(event) => setPurpose(event.target.value)}
          >
            {permissionPurposeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="What did they say?" htmlFor={`${formId}-status`} required>
          <Select
            id={`${formId}-status`}
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {permissionStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="What are we relying on?"
          htmlFor={`${formId}-basis`}
          hint="Consent is not the only lawful basis."
        >
          <Select id={`${formId}-basis`} name="lawfulBasis" defaultValue="consent">
            <option value="">Not recorded</option>
            {lawfulBasisOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="What backs this up?"
          htmlFor={`${formId}-evidence`}
          className="sm:col-span-2"
          hint={
            evidence.length === 0
              ? 'Nothing has been kept yet. Record some below, or this stays flagged for checking.'
              : undefined
          }
        >
          <Select id={`${formId}-evidence`} name="evidenceId" defaultValue="">
            <option value="">Nothing kept</option>
            {evidence.map((item) => (
              <option key={item.id} value={item.id}>
                {item.evidenceType}
                {item.reference ? ` — ${item.reference}` : ''}
              </option>
            ))}
          </Select>
        </Field>

        {isChange ? (
          <Field
            label="Why is this changing?"
            htmlFor={`${formId}-reason`}
            className="sm:col-span-2"
            hint="Kept forever, so the change can be explained later."
            error={fieldError(state, 'reason')}
          >
            <Input id={`${formId}-reason`} name="reason" placeholder="Asked us on the phone" />
          </Field>
        ) : null}

        <Field label="Note" htmlFor={`${formId}-note`} className="sm:col-span-2">
          <Input id={`${formId}-note`} name="note" />
        </Field>
      </div>

      {isChange ? (
        <Alert tone="warn">
          This replaces {already?.status === 'granted' ? 'a granted' : `a ${already?.status}`}{' '}
          permission recorded earlier. The earlier answer stays in the history.
        </Alert>
      ) : null}

      {isChange && !canEdit ? (
        <Alert tone="stop">
          Changing an answer that is already recorded is not something your role can do. Ask
          Management or an administrator.
        </Alert>
      ) : (
        <SubmitButton tone="primary" pendingLabel="Saving…">
          {isChange ? 'Change what was recorded' : 'Record this'}
        </SubmitButton>
      )}
    </form>
  );
}

export function EvidenceForm({ personId }: { personId: string }) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(addEvidenceAction, undefined);

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="personId" value={personId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What is it?" htmlFor={`${formId}-type`} required>
          <Select id={`${formId}-type`} name="evidenceType" defaultValue="signed_form">
            {evidenceTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Where is it?"
          htmlFor={`${formId}-ref`}
          hint="Mandate page 3, the email of 4 March, and so on."
        >
          <Input id={`${formId}-ref`} name="reference" />
        </Field>
        <Field label="Note" htmlFor={`${formId}-notes`} className="sm:col-span-2">
          <Textarea id={`${formId}-notes`} name="notes" rows={2} />
        </Field>
      </div>
      <SubmitButton pendingLabel="Saving…">Keep this as evidence</SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Do not contact
// ---------------------------------------------------------------------------

export function DoNotContactForm({
  personId,
  personName,
}: {
  personId?: string;
  personName?: string;
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(addDoNotContactAction, undefined);

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5">
      <FormResult state={state} />
      {personId ? <input type="hidden" name="personId" value={personId} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {personId ? null : (
          <Field
            label="Number or email address"
            htmlFor={`${formId}-value`}
            required
            error={fieldError(state, 'contactValue')}
            hint="For someone who is not on the register yet."
          >
            <Input id={`${formId}-value`} name="contactValue" />
          </Field>
        )}

        <Field label="What should stop?" htmlFor={`${formId}-channel`} required>
          <Select id={`${formId}-channel`} name="channel" defaultValue="all">
            {dncChannelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="How do we know?" htmlFor={`${formId}-source`} required>
          <Select id={`${formId}-source`} name="source" defaultValue="client_request">
            {dncSourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="What exactly did they say?" htmlFor={`${formId}-reason`} className="sm:col-span-2">
          <Input id={`${formId}-reason`} name="reason" />
        </Field>
      </div>

      <SubmitButton tone="primary" pendingLabel="Saving…">
        {personName ? `Stop contacting ${personName}` : 'Stop contacting this'}
      </SubmitButton>
    </form>
  );
}

export function ReleaseDoNotContactForm({
  entryId,
  rowVersion,
  label,
}: {
  entryId: string;
  rowVersion: number;
  label: string;
}) {
  const [state, action] = useActionState<State, FormData>(releaseDoNotContactAction, undefined);

  return (
    <form action={action} className="mt-2 space-y-2">
      {state ? <FormResult state={state} /> : null}
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />
      <div className="flex flex-wrap items-end gap-2">
        <Input
          name="releaseReason"
          required
          placeholder="Why is this being released?"
          aria-label={`Why is the stop on ${label} being released?`}
          className="h-9 max-w-md flex-1 text-xs"
        />
        <ConfirmSubmitButton
          size="sm"
          pendingLabel="…"
          confirm={`Release the stop on ${label}? They could then be contacted again. The original request stays on record.`}
        >
          Release
        </ConfirmSubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// NCC batches
// ---------------------------------------------------------------------------

export function NewBatchForm() {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(createBatchAction, undefined);

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5">
      <FormResult state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="What is this batch for?"
          htmlFor={`${formId}-name`}
          required
          error={fieldError(state, 'name')}
        >
          <Input id={`${formId}-name`} name="name" required placeholder="September cleanup" />
        </Field>
        <Field label="Note" htmlFor={`${formId}-notes`}>
          <Input id={`${formId}-notes`} name="notes" />
        </Field>
      </div>
      <SubmitButton tone="primary" pendingLabel="Creating…">
        Start a batch
      </SubmitButton>
    </form>
  );
}

export function FillBatchButton({ batchId }: { batchId: string }) {
  const [state, action] = useActionState<State, FormData>(fillBatchAction, undefined);
  return (
    <form action={action}>
      {state ? <FormResult state={state} /> : null}
      <input type="hidden" name="batchId" value={batchId} />
      <SubmitButton size="sm" pendingLabel="Gathering…">
        Gather the numbers needing a check
      </SubmitButton>
    </form>
  );
}

export function SubmitBatchForm({
  batchId,
  rowVersion,
  numbers,
}: {
  batchId: string;
  rowVersion: number;
  numbers: number;
}) {
  const [state, action] = useActionState<State, FormData>(submitBatchAction, undefined);

  return (
    <form action={action} className="space-y-3 p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />
      <Alert tone="neutral">
        Download the file above and send it to whoever performs the check. The CRM has no
        connection to the register and will not send anything itself. Marking this as sent only
        records that you did.
      </Alert>
      <Input name="submittedNote" placeholder="Emailed to the provider on…" className="max-w-lg" />
      <ConfirmSubmitButton
        tone="primary"
        pendingLabel="Recording…"
        confirm={`Record this batch of ${numbers} number${numbers === 1 ? '' : 's'} as sent? The numbers cannot change afterwards.`}
      >
        I have sent it
      </ConfirmSubmitButton>
    </form>
  );
}

export function LoadResultsForm({
  batchId,
  rowVersion,
}: {
  batchId: string;
  rowVersion: number;
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(loadResultsAction, undefined);

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />

      <Alert tone="neutral">
        A number the file says nothing about stays unchecked. It is never assumed to be clear.
        Anything that comes back listed is marked do-not-contact straight away.
      </Alert>

      <Field
        label="The file that came back"
        htmlFor={`${formId}-file`}
        hint="A CSV with a column for the number and a column for the result."
      >
        <Input id={`${formId}-file`} type="file" name="resultsFile" accept=".csv,text/csv,text/plain" />
      </Field>

      <Field label="Or paste it" htmlFor={`${formId}-text`}>
        <Textarea
          id={`${formId}-text`}
          name="resultsText"
          rows={4}
          placeholder={'Number,Result\n0821112222,listed'}
          className="font-mono text-xs"
        />
      </Field>

      <SubmitButton tone="primary" pendingLabel="Loading…">
        Load the results
      </SubmitButton>
    </form>
  );
}

export function CancelBatchForm({
  batchId,
  rowVersion,
}: {
  batchId: string;
  rowVersion: number;
}) {
  const [state, action] = useActionState<State, FormData>(cancelBatchAction, undefined);
  return (
    <form action={action} className="space-y-2 border-t border-line-soft p-4 sm:p-5">
      {state ? <FormResult state={state} /> : null}
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />
      <div className="flex flex-wrap items-end gap-2">
        <Input
          name="cancellationReason"
          required
          placeholder="Why is this being cancelled?"
          aria-label="Why is this batch being cancelled?"
          className="h-9 max-w-md flex-1 text-xs"
        />
        <ConfirmSubmitButton size="sm" pendingLabel="…" confirm="Cancel this batch?">
          Cancel the batch
        </ConfirmSubmitButton>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export function ComplianceSettingForm({
  settingKey,
  label,
  description,
  value,
  kind,
}: {
  settingKey: string;
  label: string;
  description: string | null;
  value: unknown;
  kind: 'number' | 'money' | 'boolean';
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(setComplianceSettingAction, undefined);

  return (
    <form action={action} className="border-b border-line-soft p-4 last:border-0 sm:p-5">
      {state ? <FormResult state={state} /> : null}
      <input type="hidden" name="key" value={settingKey} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label={label} htmlFor={`${formId}-value`} hint={description ?? undefined} className="flex-1">
          {kind === 'boolean' ? (
            <Select id={`${formId}-value`} name="value" defaultValue={String(value === true)}>
              <option value="true">Yes, flag a permission with nothing behind it</option>
              <option value="false">No, a recorded permission is enough</option>
            </Select>
          ) : (
            <Input
              id={`${formId}-value`}
              name="value"
              inputMode="decimal"
              defaultValue={String(value ?? '')}
              step={kind === 'money' ? '0.01' : '1'}
              type="number"
              min="0"
            />
          )}
        </Field>
        <SubmitButton size="sm" pendingLabel="…">
          Save
        </SubmitButton>
      </div>
    </form>
  );
}
