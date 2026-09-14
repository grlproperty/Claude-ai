'use client';

import { useActionState, useId, useState } from 'react';
import { setFicaCheckAction, startFicaAction, updateFicaAction } from './actions.ts';
import { Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { ConfirmSubmitButton, FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import {
  FICA_CHECK_STATUSES,
  FICA_STATUSES,
  RISK_RATINGS,
  type FicaCheckRow,
  type FicaRecord,
} from '@/lib/fica.ts';
import { today } from '@/lib/format.ts';
import type { ActionResult } from '@/lib/action-result.ts';

type State = ActionResult | undefined;

const asOptions = (map: Record<string, string>) =>
  Object.entries(map).map(([value, label]) => ({ value, label }));

export function StartFicaForm({
  people,
  companies,
  defaults,
}: {
  people: { id: string; label: string }[];
  companies: { id: string; label: string }[];
  defaults?: { personId?: string; companyId?: string };
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(startFicaAction, undefined);
  const [subject, setSubject] = useState<'person' | 'company'>(
    defaults?.companyId ? 'company' : 'person',
  );

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5">
      <FormResult state={state} />

      <Alert tone="neutral" title="The CRM cannot verify anybody">
        There is no connection to Home Affairs, to CIPC, to a deeds office or to any sanctions
        list. This file records what the office collected, who looked at it, and what they
        concluded. Every verification carries your name.
      </Alert>

      <Field label="Is this file about a person or an entity?" htmlFor={`${formId}-subject`} required>
        <Select
          id={`${formId}-subject`}
          value={subject}
          onChange={(event) => setSubject(event.target.value as typeof subject)}
        >
          <option value="person">A person</option>
          <option value="company">A company, trust or other entity</option>
        </Select>
      </Field>

      {subject === 'person' ? (
        <Field
          label="Which person?"
          htmlFor={`${formId}-person`}
          required
          error={fieldError(state, 'personId')}
        >
          <Select
            id={`${formId}-person`}
            name="personId"
            required
            defaultValue={defaults?.personId ?? ''}
          >
            <option value="">Choose the person</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field
          label="Which entity?"
          htmlFor={`${formId}-company`}
          required
          error={fieldError(state, 'personId')}
        >
          <Select
            id={`${formId}-company`}
            name="companyId"
            required
            defaultValue={defaults?.companyId ?? ''}
          >
            <option value="">Choose the entity</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field label="Where does it stand?" htmlFor={`${formId}-status`}>
        <Select id={`${formId}-status`} name="status" defaultValue="documents_requested">
          {asOptions(FICA_STATUSES)
            .filter((option) => !['verified', 'rejected', 'expired'].includes(option.value))
            .map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
        </Select>
      </Field>

      <SubmitButton tone="primary" size="lg" pendingLabel="Opening…">
        Open the file
      </SubmitButton>
    </form>
  );
}

/**
 * The file itself.
 *
 * Verifying is behind a confirmation that says in plain words what the person
 * is asserting, because their name goes onto the record permanently.
 */
export function FicaForm({ record }: { record: FicaRecord }) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(updateFicaAction, undefined);
  const [status, setStatus] = useState(record.status);

  const verifying = status === 'verified' && record.status !== 'verified';

  return (
    <form action={action} className="space-y-4">
      <FormResult state={state} />
      <input type="hidden" name="ficaRecordId" value={record.id} />
      <input type="hidden" name="rowVersion" value={record.rowVersion} />
      {record.personId ? <input type="hidden" name="personId" value={record.personId} /> : null}
      {record.companyId ? <input type="hidden" name="companyId" value={record.companyId} /> : null}

      <Card>
        <CardHeader title="Where it stands" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field
            label="Status"
            htmlFor={`${formId}-status`}
            required
            error={fieldError(state, 'status')}
          >
            <Select
              id={`${formId}-status`}
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              {asOptions(FICA_STATUSES).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Risk, as you assess it"
            htmlFor={`${formId}-risk`}
            hint="Your judgement. Nothing computes this."
          >
            <Select id={`${formId}-risk`} name="riskRating" defaultValue={record.riskRating ?? ''}>
              <option value="">Not assessed</option>
              {asOptions(RISK_RATINGS).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Why that rating?" htmlFor={`${formId}-risk-note`} className="sm:col-span-2">
            <Input id={`${formId}-risk-note`} name="riskNote" defaultValue={record.riskNote ?? ''} />
          </Field>

          {status === 'rejected' ? (
            <Field
              label="Why was it rejected?"
              htmlFor={`${formId}-rejection`}
              required
              className="sm:col-span-2"
              error={fieldError(state, 'rejectionReason')}
            >
              <Input
                id={`${formId}-rejection`}
                name="rejectionReason"
                required
                defaultValue={record.rejectionReason ?? ''}
              />
            </Field>
          ) : null}

          <Field
            label="Needs redoing by"
            htmlFor={`${formId}-expires`}
            hint="A verified file goes stale. Left blank, the office default is used."
          >
            <Input
              id={`${formId}-expires`}
              name="expiresOn"
              type="date"
              defaultValue={record.expiresOn ?? ''}
              min={today()}
            />
          </Field>

          <Field label="Why the change?" htmlFor={`${formId}-reason`}>
            <Input id={`${formId}-reason`} name="statusChangeReason" />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="What the client told us"
          description="Asked and answered by them. The CRM checks no list, because it is connected to none."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field
            label="Politically exposed person?"
            htmlFor={`${formId}-pep`}
            hint="As declared by the client."
          >
            <Select
              id={`${formId}-pep`}
              name="pepDeclared"
              defaultValue={
                record.pepDeclared === null ? '' : record.pepDeclared ? 'yes' : 'no'
              }
            >
              <option value="">Not asked yet</option>
              <option value="no">They said no</option>
              <option value="yes">They said yes</option>
            </Select>
          </Field>

          <Field label="Note on that" htmlFor={`${formId}-pep-note`}>
            <Input id={`${formId}-pep-note`} name="pepNote" defaultValue={record.pepNote ?? ''} />
          </Field>

          <Field
            label="Sanctions screening note"
            htmlFor={`${formId}-sanctions`}
            className="sm:col-span-2"
            hint="If somebody screened elsewhere, say where and when. The CRM did not."
          >
            <Input
              id={`${formId}-sanctions`}
              name="sanctionsNote"
              defaultValue={record.sanctionsNote ?? ''}
            />
          </Field>

          <Field label="Source of funds" htmlFor={`${formId}-funds`} className="sm:col-span-2">
            <Input
              id={`${formId}-funds`}
              name="sourceOfFunds"
              defaultValue={record.sourceOfFunds ?? ''}
              placeholder="Sale of previous home, bond from ABSA, savings"
            />
          </Field>

          <Field
            label="What is the relationship for?"
            htmlFor={`${formId}-purpose`}
            className="sm:col-span-2"
          >
            <Input
              id={`${formId}-purpose`}
              name="purposeOfRelationship"
              defaultValue={record.purposeOfRelationship ?? ''}
              placeholder="Buying a home to live in"
            />
          </Field>

          <Field label="Notes" htmlFor={`${formId}-notes`} className="sm:col-span-2">
            <Textarea id={`${formId}-notes`} name="notes" rows={3} defaultValue={record.notes ?? ''} />
          </Field>
        </div>
      </Card>

      {verifying ? (
        <Card>
          <CardHeader title="What you are about to assert" />
          <div className="space-y-3 p-4 sm:p-5">
            <Alert tone="warn">
              Recording this as verified puts <strong>your name and today&rsquo;s date</strong> on
              the file permanently. You are saying that you looked at the documents listed below
              against their originals and are satisfied. The CRM has not checked anything.
            </Alert>
            <Field label="Note on what you saw" htmlFor={`${formId}-verification`}>
              <Input
                id={`${formId}-verification`}
                name="verificationNote"
                placeholder="Originals produced at the George office"
              />
            </Field>
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {verifying ? (
          <ConfirmSubmitButton
            tone="primary"
            size="lg"
            pendingLabel="Recording…"
            confirm="Record this file as verified by you? Your name and the date go onto it permanently."
          >
            Record it as verified by me
          </ConfirmSubmitButton>
        ) : (
          <SubmitButton tone="primary" size="lg" pendingLabel="Saving…">
            Save the file
          </SubmitButton>
        )}
      </div>
    </form>
  );
}

/**
 * The checklist.
 *
 * Anything beyond "asked for" records who looked, so an item cannot be marked
 * as seen anonymously — the database refuses that too.
 */
export function FicaChecklist({
  recordId,
  checks,
}: {
  recordId: string;
  checks: FicaCheckRow[];
}) {
  const [state, action] = useActionState<State, FormData>(setFicaCheckAction, undefined);

  return (
    <div className="p-4 sm:p-5">
      <Alert tone="neutral" className="mb-4">
        What GRLP asks for, which the office sets and can change. Marking something as seen
        against the original records your name and the time.
      </Alert>
      {state ? <FormResult state={state} /> : null}

      <ul className="space-y-3">
        {checks.map((check) => (
          <li key={check.id} className="rounded-lg border border-line-soft p-3">
            <form action={action} className="grid gap-2 sm:grid-cols-[1fr_13rem_auto] sm:items-end">
              <input type="hidden" name="ficaRecordId" value={recordId} />
              <input type="hidden" name="itemId" value={check.itemId} />

              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {check.name}
                  {check.isRequired ? <span className="ml-1 text-brand">*</span> : null}
                </p>
                {check.description ? (
                  <p className="text-[0.6875rem] text-ink-faint">{check.description}</p>
                ) : null}
                <Input
                  name="note"
                  defaultValue={check.note ?? ''}
                  placeholder="Note"
                  className="mt-1.5 h-9 text-xs"
                  aria-label={`Note for ${check.name}`}
                />
              </div>

              <Select
                name="status"
                defaultValue={check.status}
                className="h-9"
                aria-label={`Status for ${check.name}`}
              >
                {asOptions(FICA_CHECK_STATUSES).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>

              <SubmitButton size="sm" pendingLabel="…">
                Save
              </SubmitButton>
            </form>

            {check.checkedByName ? (
              <p className="mt-1 text-[0.6875rem] text-ink-faint">
                Seen by {check.checkedByName}
                {check.checkedAt ? ` on ${new Date(check.checkedAt).toLocaleString('en-ZA')}` : ''}
              </p>
            ) : (
              <p className="mt-1 text-[0.6875rem] text-ink-faint">Nobody has looked at this yet.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
