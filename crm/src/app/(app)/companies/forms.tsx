'use client';

import { useActionState, useId } from 'react';
import Link from 'next/link';
import {
  archiveCompanyAction,
  createCompanyAction,
  linkCompanyToPropertyAction,
  linkPersonAction,
  unlinkPersonAction,
  updateCompanyAction,
} from './actions.ts';
import { Checkbox, Field, Input, Label, Select, Textarea } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { ConfirmSubmitButton, FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import { businessAreaOptions } from '@/lib/domain.ts';
import { PROVINCES } from '@/lib/domain.ts';
import {
  COMPANY_ROLES,
  ENTITY_TYPES,
  PROPERTY_COMPANY_ROLES,
  type CompanyDetail,
} from '@/lib/companies.ts';
import type { ActionResult } from '@/lib/action-result.ts';

type State = ActionResult | undefined;

const asOptions = (map: Record<string, string>) =>
  Object.entries(map).map(([value, label]) => ({ value, label }));

export function CompanyForm({
  mode = 'create',
  company,
  agents,
}: {
  mode?: 'create' | 'edit';
  company?: CompanyDetail;
  agents: { id: string; name: string }[];
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(
    mode === 'edit' ? updateCompanyAction : createCompanyAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5">
      <FormResult state={state} />
      {company ? (
        <>
          <input type="hidden" name="companyId" value={company.id} />
          <input type="hidden" name="rowVersion" value={company.rowVersion} />
        </>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Registered name"
          htmlFor={`${formId}-name`}
          required
          error={fieldError(state, 'registeredName')}
        >
          <Input
            id={`${formId}-name`}
            name="registeredName"
            required
            defaultValue={company?.registeredName ?? ''}
          />
        </Field>

        <Field label="Trading as" htmlFor={`${formId}-trading`}>
          <Input
            id={`${formId}-trading`}
            name="tradingName"
            defaultValue={company?.tradingName ?? ''}
          />
        </Field>

        <Field label="What kind of entity?" htmlFor={`${formId}-type`} required>
          <Select
            id={`${formId}-type`}
            name="entityType"
            defaultValue={company?.entityType ?? 'pty_ltd'}
          >
            {asOptions(ENTITY_TYPES).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Registration number" htmlFor={`${formId}-reg`}>
          <Input
            id={`${formId}-reg`}
            name="registrationNumber"
            defaultValue={company?.registrationNumber ?? ''}
            placeholder="2019/123456/07"
          />
        </Field>

        <Field label="VAT number" htmlFor={`${formId}-vat`}>
          <Input id={`${formId}-vat`} name="vatNumber" defaultValue={company?.vatNumber ?? ''} />
        </Field>

        <Field label="Tax number" htmlFor={`${formId}-tax`}>
          <Input id={`${formId}-tax`} name="taxNumber" defaultValue={company?.taxNumber ?? ''} />
        </Field>

        <Field label="Business area" htmlFor={`${formId}-area`} hint="Not the same as client type.">
          <Select
            id={`${formId}-area`}
            name="businessArea"
            defaultValue={company?.businessArea ?? 'sales'}
          >
            {businessAreaOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        {agents.length > 0 ? (
          <Field label="Primary agent" htmlFor={`${formId}-agent`}>
            <Select
              id={`${formId}-agent`}
              name="primaryAgentId"
              defaultValue={company?.primaryAgentId ?? ''}
            >
              <option value="">Me</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Registered address" htmlFor={`${formId}-line1`} className="sm:col-span-2">
          <Input
            id={`${formId}-line1`}
            name="addressLine1"
            defaultValue={company?.addressLine1 ?? ''}
          />
        </Field>
        <Field label="Address line 2" htmlFor={`${formId}-line2`}>
          <Input
            id={`${formId}-line2`}
            name="addressLine2"
            defaultValue={company?.addressLine2 ?? ''}
          />
        </Field>
        <Field label="Suburb" htmlFor={`${formId}-suburb`}>
          <Input id={`${formId}-suburb`} name="suburb" defaultValue={company?.suburb ?? ''} />
        </Field>
        <Field label="City or town" htmlFor={`${formId}-city`}>
          <Input id={`${formId}-city`} name="city" defaultValue={company?.city ?? ''} />
        </Field>
        <Field label="Province" htmlFor={`${formId}-province`}>
          <Select id={`${formId}-province`} name="province" defaultValue={company?.province ?? ''}>
            <option value="">—</option>
            {PROVINCES.map((province) => (
              <option key={province} value={province}>
                {province}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Postal code" htmlFor={`${formId}-postal`}>
          <Input
            id={`${formId}-postal`}
            name="postalCode"
            defaultValue={company?.postalCode ?? ''}
          />
        </Field>

        <Field label="Notes" htmlFor={`${formId}-notes`} className="sm:col-span-2">
          <Textarea id={`${formId}-notes`} name="notes" rows={3} defaultValue={company?.notes ?? ''} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton tone="primary" size="lg" pendingLabel="Saving…">
          {mode === 'edit' ? 'Save changes' : 'Create the entity'}
        </SubmitButton>
        <Link
          href={company ? `/companies/${company.id}` : '/companies'}
          className="tap inline-flex items-center rounded-lg px-4 text-sm font-medium text-ink-soft hover:bg-paper"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function LinkPersonPanel({
  companyId,
  people,
}: {
  companyId: string;
  people: { id: string; label: string }[];
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(linkPersonAction, undefined);

  return (
    <form action={action} className="space-y-3 border-t border-line-soft p-4 sm:p-5">
      {state ? <FormResult state={state} /> : null}
      <input type="hidden" name="companyId" value={companyId} />

      <Alert tone="neutral">
        Who is behind the entity is the part FICA is about. Directors, trustees, members and
        anyone holding enough to control it all belong here.
      </Alert>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Which person?" htmlFor={`${formId}-person`} required>
          <Select id={`${formId}-person`} name="personId" required defaultValue="">
            <option value="">Choose the person</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="In what capacity?" htmlFor={`${formId}-role`} required>
          <Select id={`${formId}-role`} name="role" defaultValue="director">
            {asOptions(COMPANY_ROLES).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Shareholding %" htmlFor={`${formId}-share`}>
          <Input id={`${formId}-share`} name="shareholdingPercent" inputMode="decimal" />
        </Field>

        <Field label="Appointed on" htmlFor={`${formId}-appointed`}>
          <Input id={`${formId}-appointed`} name="appointedOn" type="date" />
        </Field>

        <Label className="sm:col-span-2">
          <Checkbox name="isPrimaryContact" value="on" />
          This is the person we deal with
        </Label>
      </div>

      <SubmitButton pendingLabel="Linking…">Link this person</SubmitButton>
    </form>
  );
}

export function UnlinkPersonButton({
  companyId,
  linkId,
  label,
}: {
  companyId: string;
  linkId: string;
  label: string;
}) {
  const [state, action] = useActionState<State, FormData>(unlinkPersonAction, undefined);
  return (
    <form action={action}>
      {state && !state.ok ? <FormResult state={state} /> : null}
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="linkId" value={linkId} />
      <ConfirmSubmitButton
        size="sm"
        pendingLabel="…"
        confirm={`Remove ${label} from this entity? Neither record is deleted.`}
      >
        Remove
      </ConfirmSubmitButton>
    </form>
  );
}

export function ArchiveCompanyPanel({
  companyId,
  isArchived,
}: {
  companyId: string;
  isArchived: boolean;
}) {
  const [state, action] = useActionState<State, FormData>(archiveCompanyAction, undefined);
  if (isArchived) return null;

  return (
    <form action={action} className="space-y-2 p-4 sm:p-5">
      {state ? <FormResult state={state} /> : null}
      <input type="hidden" name="companyId" value={companyId} />
      <p className="text-[0.8125rem] text-ink-soft">
        Archiving hides the entity from active lists. Nothing is deleted: its people, properties,
        documents and FICA file all stay.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          name="archiveReason"
          required
          placeholder="Why is it being archived?"
          aria-label="Why is this entity being archived?"
          className="h-9 max-w-md flex-1 text-xs"
        />
        <ConfirmSubmitButton size="sm" pendingLabel="…" confirm="Archive this entity?">
          Archive
        </ConfirmSubmitButton>
      </div>
    </form>
  );
}

export function LinkCompanyToPropertyPanel({
  propertyId,
  companies,
}: {
  propertyId: string;
  companies: { id: string; label: string }[];
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(linkCompanyToPropertyAction, undefined);

  return (
    <form action={action} className="space-y-3 border-t border-line-soft p-4 sm:p-5">
      {state ? <FormResult state={state} /> : null}
      <input type="hidden" name="propertyId" value={propertyId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Which entity?" htmlFor={`${formId}-company`} required>
          <Select id={`${formId}-company`} name="companyId" required defaultValue="">
            <option value="">Choose the entity</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="In what capacity?" htmlFor={`${formId}-role`} required>
          <Select id={`${formId}-role`} name="role" defaultValue="owner">
            {asOptions(PROPERTY_COMPANY_ROLES).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Ownership %" htmlFor={`${formId}-percent`}>
          <Input id={`${formId}-percent`} name="ownershipPercent" inputMode="decimal" />
        </Field>
      </div>

      <SubmitButton pendingLabel="Linking…">Link this entity</SubmitButton>
    </form>
  );
}
