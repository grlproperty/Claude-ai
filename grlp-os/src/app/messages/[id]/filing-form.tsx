'use client';

import { useActionState } from 'react';

import { createClientAction, fileThreadAction } from '../actions';
import { NOT_FILED_YET, type FilingState } from '../form-state';

export interface Choice { value: string; label: string }

const CATEGORIES: Choice[] = [
  { value: 'CLIENT', label: 'Client' },
  { value: 'SALES', label: 'Sales' },
  { value: 'RENTAL', label: 'Rentals' },
  { value: 'FINANCE', label: 'Finance' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'INFORMATIONAL', label: 'Information only' },
  { value: 'LOW_PRIORITY', label: 'Low priority' },
  { value: 'PERSONAL', label: 'Personal — not business' },
];

const IMPORTANCE: Choice[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH', label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

const KINDS: Choice[] = [
  { value: 'LEAD', label: 'Lead' },
  { value: 'BUYER', label: 'Buyer' },
  { value: 'SELLER', label: 'Seller' },
  { value: 'LANDLORD', label: 'Landlord' },
  { value: 'TENANT', label: 'Tenant' },
  { value: 'SUPPLIER', label: 'Supplier' },
  { value: 'OTHER', label: 'Other' },
];

/**
 * Filing a conversation.
 *
 * The rules give every conversation a category and a guess at who it is with.
 * They are rules, so they are sometimes wrong, and a record nobody can correct
 * stops being trusted quickly. Everything here is reversible, and every change
 * is written to the audit log.
 */
export function FilingForm({
  threadId,
  category,
  importance,
  ownerId,
  contactId,
  propertyId,
  archived,
  staff,
  contacts,
  properties,
}: {
  threadId: string;
  category: string | null;
  importance: string;
  ownerId: string | null;
  contactId: string | null;
  propertyId: string | null;
  archived: boolean;
  staff: Choice[];
  contacts: Choice[];
  properties: Choice[];
}) {
  const [state, formAction, pending] = useActionState<FilingState, FormData>(fileThreadAction, NOT_FILED_YET);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="threadId" value={threadId} />

      <Select name="category" label="What it is about" defaultValue={category ?? ''} options={CATEGORIES} blank="Not categorised" />
      <Select name="importance" label="How much it matters" defaultValue={importance} options={IMPORTANCE} />
      <Select name="contactId" label="Client" defaultValue={contactId ?? ''} options={contacts} blank="Nobody linked" />
      <Select name="propertyId" label="Property" defaultValue={propertyId ?? ''} options={properties} blank="No property" />
      <Select name="ownerId" label="Whose conversation it is" defaultValue={ownerId ?? ''} options={staff} blank="Nobody" />

      <label className="flex items-center gap-2 pt-1">
        <input type="checkbox" name="archived" value="true" defaultChecked={archived} className="h-4 w-4 accent-[#991C1F]" />
        <span className="text-sm">Done with — hide from the lists</span>
      </label>

      {state.problems.length ? (
        <ul className="rounded border border-maroon-200 bg-maroon-50 px-3 py-2">
          {state.problems.map((p) => (
            <li key={p} className="text-sm text-maroon">{p}</li>
          ))}
        </ul>
      ) : null}
      {state.message ? <p className="text-sm text-ink-soft">{state.message}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-maroon px-4 py-2 text-sm font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}

/**
 * Offered only when nobody on the books matches. Turning a chat into a client
 * record is what stops a WhatsApp enquiry from being lost the moment it scrolls
 * off the screen.
 */
export function CreateClientForm({ threadId, name }: { threadId: string; name: string }) {
  const [state, formAction, pending] = useActionState<FilingState, FormData>(createClientAction, NOT_FILED_YET);

  if (state.message) return <p className="text-sm text-ink-soft">{state.message}</p>;

  return (
    <form action={formAction} className="space-y-2.5">
      <input type="hidden" name="threadId" value={threadId} />
      <p className="text-sm leading-relaxed text-ink-soft">
        <strong className="font-medium text-ink">{name}</strong> is not on the books. Add them, and this conversation
        becomes their history.
      </p>
      <Select name="kind" label="As a" defaultValue="LEAD" options={KINDS} />

      {state.problems.length ? (
        <ul className="rounded border border-maroon-200 bg-maroon-50 px-3 py-2">
          {state.problems.map((p) => (
            <li key={p} className="text-sm text-maroon">{p}</li>
          ))}
        </ul>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded border border-maroon px-4 py-2 text-sm font-semibold text-maroon transition hover:bg-maroon-50 disabled:opacity-50"
      >
        {pending ? 'Adding…' : 'Add as a client'}
      </button>
    </form>
  );
}

function Select({
  name,
  label,
  defaultValue,
  options,
  blank,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: Choice[];
  blank?: string;
}) {
  return (
    <label className="block">
      <span className="text-micro uppercase tracking-[0.12em] text-ink-muted">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-1.5 w-full rounded border border-line bg-white px-3 py-2 text-sm focus:border-maroon"
      >
        {blank ? <option value="">{blank}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
