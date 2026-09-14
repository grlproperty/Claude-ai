'use client';

import { useActionState, useId, useState } from 'react';
import {
  cancelImportAction,
  commitImportAction,
  previewImportAction,
  rollbackImportAction,
  saveMappingAction,
  setAllowedHostsAction,
  startImportAction,
} from './actions.ts';
import { Field, Input, Select, Textarea } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { ConfirmSubmitButton, FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import { SOURCE_SYSTEMS, fieldsFor } from '@/lib/import/fields.ts';
import type { MappingSuggestion } from '@/lib/import/mapping.ts';
import type { ActionResult } from '@/lib/action-result.ts';

type State = ActionResult | undefined;

const SOURCES = [
  { value: 'file', label: 'A file from my computer' },
  { value: 'paste', label: 'Paste the rows' },
  { value: 'url', label: 'Fetch from a web address' },
] as const;

export function StartImportForm({ urlImportsEnabled }: { urlImportsEnabled: boolean }) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(startImportAction, undefined);
  const [how, setHow] = useState<'file' | 'paste' | 'url'>('file');

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5">
      <FormResult state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="What is this import?"
          htmlFor={`${formId}-name`}
          required
          error={fieldError(state, 'name')}
          hint="Something you would recognise in a list next year."
        >
          <Input
            id={`${formId}-name`}
            name="name"
            required
            placeholder="PropCtrl clients, September"
          />
        </Field>

        <Field label="What is in it?" htmlFor={`${formId}-entity`} required>
          <Select id={`${formId}-entity`} name="entityType" defaultValue="person">
            <option value="person">People</option>
            <option value="property">Properties</option>
          </Select>
        </Field>

        <Field
          label="Where did it come from?"
          htmlFor={`${formId}-system`}
          hint="Naming the system lets the CRM recognise its column names."
        >
          <Select id={`${formId}-system`} name="sourceSystem" defaultValue="generic">
            {Object.entries(SOURCE_SYSTEMS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="How are you giving it to us?" htmlFor={`${formId}-how`}>
          <Select
            id={`${formId}-how`}
            name="how"
            value={how}
            onChange={(event) => setHow(event.target.value as typeof how)}
          >
            {SOURCES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {how === 'file' ? (
        <Field
          label="The file"
          htmlFor={`${formId}-file`}
          hint="A CSV or an .xlsx spreadsheet. The first row must be the column headings."
        >
          <Input
            id={`${formId}-file`}
            type="file"
            name="file"
            accept=".csv,.xlsx,.xlsm,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          />
        </Field>
      ) : null}

      {how === 'paste' ? (
        <Field
          label="The rows"
          htmlFor={`${formId}-paste`}
          hint="Headings on the first line. Copying straight out of a spreadsheet works."
        >
          <Textarea
            id={`${formId}-paste`}
            name="pasted"
            rows={8}
            className="font-mono text-xs"
            placeholder={'First Name,Surname,Cell\nJohan,Bekker,082 123 4567'}
          />
        </Field>
      ) : null}

      {how === 'url' ? (
        <>
          {urlImportsEnabled ? (
            <Alert tone="neutral">
              Only the hosts an administrator has listed can be fetched, only over https, and a
              redirect is refused rather than followed.
            </Alert>
          ) : (
            <Alert tone="warn" title="Fetching from a web address is switched off">
              An administrator has not listed any hosts imports may fetch from. Until they do, use
              a file or paste the rows.
            </Alert>
          )}
          <Field
            label="The address"
            htmlFor={`${formId}-url`}
            error={fieldError(state, 'sourceUrl')}
          >
            <Input
              id={`${formId}-url`}
              name="sourceUrl"
              type="url"
              inputMode="url"
              placeholder="https://exports.example.com/clients.csv"
              disabled={!urlImportsEnabled}
            />
          </Field>
        </>
      ) : null}

      <Field label="Note" htmlFor={`${formId}-notes`}>
        <Input id={`${formId}-notes`} name="notes" />
      </Field>

      <Alert tone="neutral">
        Nothing is written to a client or a property yet. The next step shows you what the file
        says and what the CRM would do with it.
      </Alert>

      <SubmitButton tone="primary" size="lg" pendingLabel="Reading…">
        Read the file
      </SubmitButton>
    </form>
  );
}

/**
 * The mapping step.
 *
 * Every column gets a select. The proposal is pre-selected and labelled with
 * how confident it was, so a guess is visibly a guess.
 */
export function MappingForm({
  batchId,
  rowVersion,
  entityType,
  suggestions,
  sample,
}: {
  batchId: string;
  rowVersion: number;
  entityType: 'person' | 'property';
  suggestions: MappingSuggestion[];
  sample: Record<string, string>[];
}) {
  const [state, action] = useActionState<State, FormData>(saveMappingAction, undefined);
  const fields = fieldsFor(entityType);

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />

      <ul className="space-y-3">
        {suggestions.map((suggestion) => {
          const examples = sample
            .map((row) => row[suggestion.header])
            .filter((value): value is string => Boolean(value))
            .slice(0, 2);

          return (
            <li
              key={suggestion.header}
              className="grid gap-2 rounded-lg border border-line-soft p-3 sm:grid-cols-[1fr_1fr] sm:items-start"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{suggestion.header}</p>
                <p className="text-[0.6875rem] text-ink-faint">
                  {examples.length > 0 ? `e.g. ${examples.join(', ')}` : 'no values in this column'}
                </p>
                {suggestion.confidence === 'guess' ? (
                  <p className="text-[0.6875rem] font-medium text-warn">{suggestion.reason}</p>
                ) : (
                  <p className="text-[0.6875rem] text-ink-faint">{suggestion.reason}</p>
                )}
              </div>

              <Select
                name={`column:${suggestion.header}`}
                defaultValue={suggestion.fieldKey ?? ''}
                aria-label={`What is "${suggestion.header}"?`}
              >
                <option value="">Do not import this column</option>
                {fields.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </Select>
            </li>
          );
        })}
      </ul>

      <SubmitButton tone="primary" size="lg" pendingLabel="Saving…">
        Save the column matching
      </SubmitButton>
    </form>
  );
}

export function PreviewButton({ batchId }: { batchId: string }) {
  const [state, action] = useActionState<State, FormData>(previewImportAction, undefined);
  return (
    <form action={action} className="space-y-2 p-4 sm:p-5">
      {state ? <FormResult state={state} /> : null}
      <input type="hidden" name="batchId" value={batchId} />
      <SubmitButton tone="primary" pendingLabel="Checking…">
        Check what this will do
      </SubmitButton>
      <p className="text-[0.6875rem] text-ink-faint">
        Reads every row and decides what it would do with it. Still writes nothing.
      </p>
    </form>
  );
}

export function CommitForm({
  batchId,
  rowVersion,
  create,
  update,
  error,
}: {
  batchId: string;
  rowVersion: number;
  create: number;
  update: number;
  error: number;
}) {
  const [state, action] = useActionState<State, FormData>(commitImportAction, undefined);

  return (
    <form action={action} className="space-y-3 p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />

      <Alert tone="neutral">
        Either every row goes in or none does. If anything fails, nothing at all is imported and
        you can fix the file and try again.
      </Alert>

      {error > 0 ? (
        <Alert tone="warn">
          {error} row{error === 1 ? '' : 's'} cannot be imported and will be left out. The rest
          will go in.
        </Alert>
      ) : null}

      <ConfirmSubmitButton
        tone="primary"
        size="lg"
        pendingLabel="Importing…"
        confirm={`Import ${create} new record(s) and update ${update}? This can be rolled back afterwards.`}
      >
        Import {create + update} record{create + update === 1 ? '' : 's'}
      </ConfirmSubmitButton>
    </form>
  );
}

export function RollbackForm({
  batchId,
  rowVersion,
  created,
  updated,
}: {
  batchId: string;
  rowVersion: number;
  created: number;
  updated: number;
}) {
  const [state, action] = useActionState<State, FormData>(rollbackImportAction, undefined);

  return (
    <form action={action} className="space-y-3 border-t border-line-soft p-4 sm:p-5">
      {state ? <FormResult state={state} /> : null}
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />

      <Alert tone="warn" title="What rolling back does">
        The {created} record{created === 1 ? '' : 's'} this import created will be archived, not
        deleted, because something may already point at them.
        {updated > 0
          ? ` The ${updated} it only updated will be left exactly as they are — reverting a field somebody has since corrected would be a second mistake. Their earlier values are in the audit log.`
          : ''}
      </Alert>

      <div className="flex flex-wrap items-end gap-2">
        <Input
          name="rollbackReason"
          required
          placeholder="Why is this being rolled back?"
          aria-label="Why is this import being rolled back?"
          className="h-9 max-w-md flex-1 text-xs"
        />
        <ConfirmSubmitButton
          size="sm"
          pendingLabel="…"
          confirm={`Roll back this import? ${created} record(s) will be archived.`}
        >
          Roll it back
        </ConfirmSubmitButton>
      </div>
    </form>
  );
}

export function CancelImportForm({
  batchId,
  rowVersion,
}: {
  batchId: string;
  rowVersion: number;
}) {
  const [state, action] = useActionState<State, FormData>(cancelImportAction, undefined);
  return (
    <form action={action} className="border-t border-line-soft p-4 sm:p-5">
      {state ? <FormResult state={state} /> : null}
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowVersion" value={rowVersion} />
      <ConfirmSubmitButton
        size="sm"
        pendingLabel="…"
        confirm="Cancel this import? Nothing has been written, so nothing is lost."
      >
        Cancel this import
      </ConfirmSubmitButton>
    </form>
  );
}

export function AllowedHostsForm({ hosts }: { hosts: string[] }) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(setAllowedHostsAction, undefined);

  return (
    <form action={action} className="space-y-3 p-4 sm:p-5">
      <FormResult state={state} />
      <Alert tone="neutral">
        Leave this empty to switch off importing from a web address entirely. There is no
        &ldquo;allow anything&rdquo; option, because that is what makes it dangerous: the CRM sits
        inside a private network and can reach machines a browser cannot.
      </Alert>
      <Field
        label="Hosts imports may fetch from"
        htmlFor={`${formId}-hosts`}
        hint="One per line, or separated by commas. Subdomains of a listed host are allowed."
      >
        <Textarea
          id={`${formId}-hosts`}
          name="hosts"
          rows={4}
          defaultValue={hosts.join('\n')}
          className="font-mono text-xs"
          placeholder="exports.propctrl.co.za"
        />
      </Field>
      <SubmitButton pendingLabel="Saving…">Save the list</SubmitButton>
    </form>
  );
}
