'use client';

import { useActionState, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { checkForDuplicatesAction, createPersonAction, updatePersonAction } from './actions.ts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Field,
  Input,
  Legend,
  Select,
  Textarea,
} from '@/components/ui/primitives.tsx';
import { Alert, Spinner } from '@/components/ui/feedback.tsx';
import { FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import {
  addressTypeOptions,
  businessAreaOptions,
  clientTypeOptions,
  contactTypeOptions,
  PROVINCES,
  TITLES,
} from '@/lib/domain.ts';
import type { ActionResult } from '@/lib/action-result.ts';
import type { DuplicateMatch } from '@/lib/people/duplicates.ts';
import type { PersonDetail } from '@/lib/people/types.ts';

interface ContactRow {
  key: string;
  id?: string;
  contactType: string;
  value: string;
  isPrimary: boolean;
  isActive: boolean;
}

interface AddressRow {
  key: string;
  id?: string;
  addressType: string;
  line1: string;
  line2: string;
  suburb: string;
  city: string;
  province: string;
  postalCode: string;
}

export interface PersonFormOptions {
  agents: { id: string; name: string }[];
  tags: { id: string; name: string; colour: string }[];
  offices: { id: string; name: string }[];
  teams: { id: string; name: string; officeId: string }[];
  /** Whether this user may see stored identity numbers at all. */
  canViewIdentity: boolean;
  selectedTagIds?: string[];
}

let rowCounter = 0;
const nextKey = () => `row-${(rowCounter += 1)}`;

export function PersonForm({
  mode,
  person,
  options,
}: {
  mode: 'create' | 'edit';
  person?: PersonDetail;
  options: PersonFormOptions;
}) {
  const formId = useId();

  const [contacts, setContacts] = useState<ContactRow[]>(() =>
    person && person.contacts.length > 0
      ? person.contacts.map((c) => ({
          key: nextKey(),
          id: c.id,
          contactType: c.contactType,
          value: c.value,
          isPrimary: c.isPrimary,
          isActive: c.isActive,
        }))
      : [
          { key: nextKey(), contactType: 'mobile', value: '', isPrimary: true, isActive: true },
          { key: nextKey(), contactType: 'email', value: '', isPrimary: true, isActive: true },
        ],
  );

  const [addresses, setAddresses] = useState<AddressRow[]>(() =>
    person && person.addresses.length > 0
      ? person.addresses.map((a) => ({
          key: nextKey(),
          id: a.id,
          addressType: a.addressType,
          line1: a.line1 ?? '',
          line2: a.line2 ?? '',
          suburb: a.suburb ?? '',
          city: a.city ?? '',
          province: a.province ?? '',
          postalCode: a.postalCode ?? '',
        }))
      : [
          {
            key: nextKey(),
            addressType: 'physical',
            line1: '',
            line2: '',
            suburb: '',
            city: '',
            province: 'Western Cape',
            postalCode: '',
          },
        ],
  );

  const [saveState, save] = useActionState<ActionResult | undefined, FormData>(
    mode === 'create' ? createPersonAction : updatePersonAction,
    undefined,
  );

  // The duplicate check is called directly rather than being a second form
  // action: a form can only submit to one action, and the one that matters
  // here is the one that creates the person.
  const formRef = useRef<HTMLFormElement>(null);
  const [checking, startChecking] = useTransition();
  const [duplicateState, setDuplicateState] = useState<
    ActionResult<DuplicateMatch[]> | undefined
  >(undefined);
  const [proceedAnyway, setProceedAnyway] = useState(false);

  function runDuplicateCheck() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    startChecking(async () => {
      setProceedAnyway(false);
      setDuplicateState(await checkForDuplicatesAction(data));
    });
  }

  const matches = duplicateState?.ok ? (duplicateState.data ?? []) : [];
  const checked = Boolean(duplicateState?.ok);
  const blocked = mode === 'create' && (!checked || (matches.length > 0 && !proceedAnyway));

  return (
    <form ref={formRef} action={save} className="space-y-4">
      <FormResult state={saveState} />

      {person ? (
        <>
          <input type="hidden" name="personId" value={person.id} />
          <input type="hidden" name="rowVersion" value={person.rowVersion} />
        </>
      ) : null}
      <input
        type="hidden"
        name="duplicateCheck"
        value={mode === 'create' && checked && !blocked ? 'acknowledged' : ''}
      />

      {/* ---------------- Identity ---------------- */}
      <Card>
        <CardHeader title="Who is this?" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
          <Field label="Title" htmlFor={`${formId}-title`}>
            <Select id={`${formId}-title`} name="title" defaultValue={person?.title ?? ''}>
              <option value="">—</option>
              {TITLES.map((title) => (
                <option key={title} value={title}>
                  {title}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="First name"
            htmlFor={`${formId}-firstName`}
            required
            error={fieldError(saveState, 'firstName')}
          >
            <Input
              id={`${formId}-firstName`}
              name="firstName"
              defaultValue={person?.firstName ?? ''}
              required
              autoComplete="off"
            />
          </Field>

          <Field label="Middle name" htmlFor={`${formId}-middleName`}>
            <Input id={`${formId}-middleName`} name="middleName" defaultValue={person?.middleName ?? ''} />
          </Field>

          <Field
            label="Surname"
            htmlFor={`${formId}-surname`}
            required
            error={fieldError(saveState, 'surname')}
          >
            <Input
              id={`${formId}-surname`}
              name="surname"
              defaultValue={person?.surname ?? ''}
              required
              autoComplete="off"
            />
          </Field>

          <Field
            label="Preferred name"
            htmlFor={`${formId}-preferredName`}
            hint="What they like to be called"
          >
            <Input
              id={`${formId}-preferredName`}
              name="preferredName"
              defaultValue={person?.preferredName ?? ''}
            />
          </Field>
        </div>

        <div className="border-t border-line-soft p-4 sm:p-5">
          <p className="mb-3 text-[0.8125rem] font-medium text-ink">Identity document</p>
          <Alert tone="neutral" className="mb-4">
            Identity numbers are stored separately and shown masked. Only authorised users can
            reveal one, and every reveal is recorded.
          </Alert>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="South African ID number"
              htmlFor={`${formId}-idNumber`}
              hint={
                person?.idIsRecorded && !options.canViewIdentity
                  ? 'An ID number is on file. Leave blank to keep it.'
                  : '13 digits'
              }
              error={fieldError(saveState, 'idNumber')}
            >
              <Input
                id={`${formId}-idNumber`}
                name="idNumber"
                inputMode="numeric"
                autoComplete="off"
                placeholder={person?.idIsRecorded ? person.idDisplay : ''}
              />
            </Field>

            <Field label="Passport number" htmlFor={`${formId}-passportNumber`}>
              <Input
                id={`${formId}-passportNumber`}
                name="passportNumber"
                autoComplete="off"
                placeholder={person?.passportIsRecorded ? person.passportDisplay : ''}
              />
            </Field>

            <Field label="Passport country" htmlFor={`${formId}-passportCountry`}>
              <Input
                id={`${formId}-passportCountry`}
                name="passportCountry"
                defaultValue={person?.passportCountry ?? ''}
              />
            </Field>

            <Field label="Passport expiry" htmlFor={`${formId}-passportExpiry`}>
              <Input
                id={`${formId}-passportExpiry`}
                name="passportExpiry"
                type="date"
                defaultValue={person?.passportExpiry ?? ''}
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* ---------------- Contact details ---------------- */}
      <Card>
        <CardHeader
          title="How do we reach them?"
          description="Add as many numbers and addresses as you have."
          actions={
            <Button
              type="button"
              size="sm"
              onClick={() =>
                setContacts((rows) => [
                  ...rows,
                  { key: nextKey(), contactType: 'mobile', value: '', isPrimary: false, isActive: true },
                ])
              }
            >
              Add another
            </Button>
          }
        />
        <div className="space-y-3 p-4 sm:p-5">
          {contacts.map((row, index) => (
            <div key={row.key} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
              {row.id ? (
                <input type="hidden" name={`contacts[${index}][id]`} value={row.id} />
              ) : null}
              <label className="block">
                <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                  Type
                </span>
                <Select
                  name={`contacts[${index}][contactType]`}
                  defaultValue={row.contactType}
                  aria-label="Contact type"
                >
                  {contactTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                  Detail
                </span>
                <Input
                  name={`contacts[${index}][value]`}
                  defaultValue={row.value}
                  placeholder="082 543 2681 or name@example.com"
                  aria-label="Contact detail"
                />
              </label>
              <div className="flex items-center gap-3 pb-2.5">
                <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                  <Checkbox
                    name={`contacts[${index}][isPrimary]`}
                    defaultChecked={row.isPrimary}
                  />
                  Primary
                </label>
                <input type="hidden" name={`contacts[${index}][isActive]`} value={String(row.isActive)} />
                <Button
                  type="button"
                  tone="quiet"
                  size="sm"
                  onClick={() => setContacts((rows) => rows.filter((r) => r.key !== row.key))}
                  aria-label="Remove this contact detail"
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {contacts.length === 0 ? (
            <p className="text-sm text-ink-faint">No contact details yet.</p>
          ) : null}
        </div>

        <div className="border-t border-line-soft p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[0.8125rem] font-medium text-ink">Addresses</p>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                setAddresses((rows) => [
                  ...rows,
                  {
                    key: nextKey(),
                    addressType: 'postal',
                    line1: '',
                    line2: '',
                    suburb: '',
                    city: '',
                    province: 'Western Cape',
                    postalCode: '',
                  },
                ])
              }
            >
              Add address
            </Button>
          </div>

          {addresses.map((row, index) => (
            <fieldset key={row.key} className="mb-3 rounded-lg border border-line-soft p-3">
              {row.id ? (
                <input type="hidden" name={`addresses[${index}][id]`} value={row.id} />
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                    Type
                  </span>
                  <Select name={`addresses[${index}][addressType]`} defaultValue={row.addressType}>
                    {addressTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block lg:col-span-2">
                  <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                    Street address
                  </span>
                  <Input name={`addresses[${index}][line1]`} defaultValue={row.line1} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                    Suburb
                  </span>
                  <Input name={`addresses[${index}][suburb]`} defaultValue={row.suburb} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                    Town or city
                  </span>
                  <Input name={`addresses[${index}][city]`} defaultValue={row.city} />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                    Province
                  </span>
                  <Select name={`addresses[${index}][province]`} defaultValue={row.province}>
                    <option value="">—</option>
                    {PROVINCES.map((province) => (
                      <option key={province} value={province}>
                        {province}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                    Postal code
                  </span>
                  <Input name={`addresses[${index}][postalCode]`} defaultValue={row.postalCode} />
                </label>
              </div>
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  tone="quiet"
                  size="sm"
                  onClick={() => setAddresses((rows) => rows.filter((r) => r.key !== row.key))}
                >
                  Remove address
                </Button>
              </div>
            </fieldset>
          ))}
        </div>
      </Card>

      {/* ---------------- Classification ---------------- */}
      <Card>
        <CardHeader
          title="What are they to the business?"
          description="Business area and client type are separate. A person can be several client types at once."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Business area" htmlFor={`${formId}-businessArea`} required>
            <Select
              id={`${formId}-businessArea`}
              name="businessArea"
              defaultValue={person?.businessArea ?? 'sales'}
            >
              {businessAreaOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <fieldset>
            <Legend>Client types</Legend>
            <div className="grid grid-cols-2 gap-1.5">
              {clientTypeOptions.map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm text-ink">
                  <Checkbox
                    name="clientTypes"
                    value={option.value}
                    defaultChecked={person?.clientTypes.includes(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

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
        </div>
      </Card>

      {/* ---------------- Assignment and next step ---------------- */}
      <Card>
        <CardHeader title="Who is handling them, and what happens next?" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Primary agent" htmlFor={`${formId}-primaryAgentId`}>
            <Select
              id={`${formId}-primaryAgentId`}
              name="primaryAgentId"
              defaultValue={person?.primaryAgentId ?? ''}
            >
              <option value="">
                {options.agents.length > 0 ? 'Unassigned' : 'You'}
              </option>
              {options.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Secondary agent" htmlFor={`${formId}-secondaryAgentId`}>
            <Select
              id={`${formId}-secondaryAgentId`}
              name="secondaryAgentId"
              defaultValue={person?.secondaryAgentId ?? ''}
            >
              <option value="">None</option>
              {options.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>

          {options.offices.length > 1 ? (
            <Field label="Office" htmlFor={`${formId}-officeId`}>
              <Select id={`${formId}-officeId`} name="officeId" defaultValue={person?.officeId ?? ''}>
                <option value="">—</option>
                {options.offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {options.teams.length > 0 ? (
            <Field label="Team" htmlFor={`${formId}-teamId`}>
              <Select id={`${formId}-teamId`} name="teamId" defaultValue={person?.teamId ?? ''}>
                <option value="">—</option>
                {options.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field
            label="Next follow-up"
            htmlFor={`${formId}-nextFollowUpAt`}
            hint="Leave blank if there is nothing to chase yet"
          >
            <Input
              id={`${formId}-nextFollowUpAt`}
              name="nextFollowUpAt"
              type="datetime-local"
              defaultValue={person?.nextFollowUpAt ? person.nextFollowUpAt.slice(0, 16) : ''}
            />
          </Field>

          <Field label="Notes" htmlFor={`${formId}-notes`} className="sm:col-span-2">
            <Textarea id={`${formId}-notes`} name="notes" defaultValue={person?.notes ?? ''} />
          </Field>
        </div>
      </Card>

      {/* ---------------- Duplicate check ---------------- */}
      {mode === 'create' ? (
        <Card>
          <CardHeader
            title="Check for an existing record"
            description="One person, one master record. Check before creating a new one."
          />
          <div className="space-y-3 p-4 sm:p-5">
            {duplicateState && !duplicateState.ok ? (
              <Alert tone="stop">{duplicateState.message}</Alert>
            ) : null}

            {checked && matches.length === 0 ? (
              <Alert tone="ok" title="No possible duplicates found">
                Nothing on file looks like this person. You can create the record.
              </Alert>
            ) : null}

            {matches.length > 0 ? (
              <>
                <Alert tone="warn" title={`${matches.length} possible ${matches.length === 1 ? 'match' : 'matches'}`}>
                  Check these before adding another record.
                </Alert>
                <ul className="divide-y divide-line-soft rounded-lg border border-line">
                  {matches.map((match) => (
                    <li key={match.personId} className="flex flex-wrap items-start gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">
                          {match.fullName}{' '}
                          <Badge tone={match.confidence === 'high' ? 'stop' : 'warn'}>
                            {match.confidence === 'high' ? 'Very likely the same' : 'Possibly the same'}
                          </Badge>
                        </p>
                        <p className="font-mono text-[0.6875rem] text-ink-faint">{match.clientRef}</p>
                        <p className="mt-0.5 text-[0.8125rem] text-ink-soft">
                          {match.reasons.join(' · ')}
                        </p>
                        {match.primaryAgentName ? (
                          <p className="text-[0.6875rem] text-ink-faint">
                            Agent: {match.primaryAgentName}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <Link
                          href={`/people/${match.personId}`}
                          className="tap inline-flex items-center rounded-lg border border-line bg-white px-3 text-sm font-medium hover:bg-paper"
                        >
                          Open existing
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
                <label className="flex items-start gap-2 text-sm text-ink">
                  <Checkbox
                    checked={proceedAnyway}
                    onChange={(event) => setProceedAnyway(event.target.checked)}
                  />
                  <span>
                    I have checked these and this is a different person. Create a new record.
                  </span>
                </label>
              </>
            ) : null}

            <Button type="button" onClick={runDuplicateCheck} disabled={checking} aria-busy={checking}>
              {checking ? (
                <>
                  <Spinner className="size-3.5" label="Checking" />
                  Checking…
                </>
              ) : checked ? (
                'Check again'
              ) : (
                'Check for duplicates'
              )}
            </Button>
          </div>
        </Card>
      ) : null}

      {/* ---------------- Save ---------------- */}
      <div className="sticky bottom-0 -mx-3 flex flex-wrap items-center gap-2 border-t border-line bg-white px-3 py-3 sm:mx-0 sm:rounded-lg sm:border sm:px-4">
        <SubmitButton tone="primary" size="lg" disabled={blocked} pendingLabel="Saving…">
          {mode === 'create' ? 'Create person' : 'Save changes'}
        </SubmitButton>
        <Link
          href={person ? `/people/${person.id}` : '/people'}
          className="tap inline-flex items-center rounded-lg px-4 text-sm font-medium text-ink-soft hover:bg-paper"
        >
          Cancel
        </Link>
        {blocked ? (
          <p className="text-xs text-ink-faint">
            {checked
              ? 'Confirm this is a different person to continue.'
              : 'Run the duplicate check first.'}
          </p>
        ) : null}
      </div>
    </form>
  );
}
