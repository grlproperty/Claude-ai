'use client';

import { useActionState } from 'react';
import {
  addRentalHistoryAction,
  addSaleHistoryAction,
  archivePhotoAction,
  archivePropertyAction,
  archivePropertyDocumentAction,
  assignPropertyAgentAction,
  linkPersonAction,
  restorePropertyAction,
  saveMarketingAction,
  saveMarketingChannelAction,
  setCoverPhotoAction,
  unlinkPersonAction,
  updatePhotoAction,
  uploadPhotosAction,
  uploadPropertyDocumentAction,
} from '../actions.ts';
import { Button, Checkbox, Field, Input, Select, Textarea } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { ConfirmSubmitButton, FormResult, SubmitButton } from '@/components/ui/form.tsx';
import {
  documentCategoryOptions,
  marketingChannelOptions,
  marketingStatusOptions,
  propertyPersonRoleOptions,
  saleOutcomeOptions,
} from '@/lib/domain.ts';
import type { ActionResult } from '@/lib/action-result.ts';
import type { PropertyMarketing } from '@/lib/properties/types.ts';

type State = ActionResult | undefined;

// ---------------------------------------------------------------------------
// People on a property (spec 32)
// ---------------------------------------------------------------------------

export function LinkPersonPanel({
  propertyId,
  people,
}: {
  propertyId: string;
  people: { id: string; label: string }[];
}) {
  const [state, action] = useActionState<State, FormData>(linkPersonAction, undefined);

  return (
    <form action={action} className="space-y-3 border-t border-line-soft p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Person" htmlFor="link-person" required className="lg:col-span-2">
          <Select id="link-person" name="personId" required defaultValue="">
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
        <Field label="Role" htmlFor="link-role" required>
          <Select id="link-role" name="role" required defaultValue="owner">
            {propertyPersonRoleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ownership %" htmlFor="link-share" hint="Shares cannot exceed 100%">
          <Input id="link-share" name="ownershipPercent" inputMode="decimal" placeholder="50" />
        </Field>
        <Field label="From" htmlFor="link-start">
          <Input id="link-start" name="startDate" type="date" />
        </Field>
        <Field label="Until" htmlFor="link-end">
          <Input id="link-end" name="endDate" type="date" />
        </Field>
        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2.5 text-sm">
            <Checkbox name="isPrimaryContact" />
            Primary contact
          </label>
        </div>
      </div>
      <SubmitButton tone="primary" pendingLabel="Linking…">
        Link this person
      </SubmitButton>
    </form>
  );
}

export function UnlinkPersonButton({
  propertyId,
  linkId,
}: {
  propertyId: string;
  linkId: string;
}) {
  const [, action] = useActionState<State, FormData>(unlinkPersonAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="linkId" value={linkId} />
      <ConfirmSubmitButton
        tone="quiet"
        size="sm"
        confirm="Remove this person from the property? Their own record is unaffected."
      >
        Remove
      </ConfirmSubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Marketing (spec 36, 37)
// ---------------------------------------------------------------------------

export function MarketingPanel({
  propertyId,
  marketing,
}: {
  propertyId: string;
  marketing: PropertyMarketing | null;
}) {
  const [state, action] = useActionState<State, FormData>(saveMarketingAction, undefined);

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="propertyId" value={propertyId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Marketing status" htmlFor="mk-status">
          <Select
            id="mk-status"
            name="marketingStatus"
            defaultValue={marketing?.marketingStatus ?? 'not_prepared'}
          >
            {marketingStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Headline" htmlFor="mk-headline">
          <Input id="mk-headline" name="headline" defaultValue={marketing?.headline ?? ''} />
        </Field>
        <Field label="Short description" htmlFor="mk-short" className="sm:col-span-2">
          <Textarea
            id="mk-short"
            name="shortDescription"
            rows={2}
            defaultValue={marketing?.shortDescription ?? ''}
          />
        </Field>
        <Field label="Full description" htmlFor="mk-full" className="sm:col-span-2">
          <Textarea
            id="mk-full"
            name="fullDescription"
            rows={6}
            defaultValue={marketing?.fullDescription ?? ''}
          />
        </Field>
        <Field label="Key selling points" htmlFor="mk-points">
          <Textarea
            id="mk-points"
            name="keySellingPoints"
            rows={3}
            defaultValue={marketing?.keySellingPoints ?? ''}
          />
        </Field>
        <Field label="Features" htmlFor="mk-features">
          <Textarea id="mk-features" name="features" rows={3} defaultValue={marketing?.features ?? ''} />
        </Field>
        <Field label="Directions" htmlFor="mk-directions">
          <Textarea
            id="mk-directions"
            name="directions"
            rows={2}
            defaultValue={marketing?.directions ?? ''}
          />
        </Field>
        <Field label="On show information" htmlFor="mk-onshow">
          <Textarea
            id="mk-onshow"
            name="onShowInfo"
            rows={2}
            defaultValue={marketing?.onShowInfo ?? ''}
          />
        </Field>
        <Field
          label="Marketing notes"
          htmlFor="mk-notes"
          hint="Internal. Not part of the advertisement."
          className="sm:col-span-2"
        >
          <Textarea
            id="mk-notes"
            name="marketingNotes"
            rows={2}
            defaultValue={marketing?.marketingNotes ?? ''}
          />
        </Field>
      </div>

      <SubmitButton tone="primary" pendingLabel="Saving…">
        Save marketing
      </SubmitButton>
    </form>
  );
}

export function MarketingChannelPanel({
  propertyId,
  channels,
}: {
  propertyId: string;
  channels: {
    id: string;
    channel: string;
    isPublished: boolean;
    publishedAt: string | null;
    removedAt: string | null;
    sourceUrl: string | null;
    notes: string | null;
  }[];
}) {
  const [state, action] = useActionState<State, FormData>(saveMarketingChannelAction, undefined);
  const byChannel = new Map(channels.map((channel) => [channel.channel, channel]));

  return (
    <div className="p-4 sm:p-5">
      <Alert tone="warn" title="These are records, not actions" className="mb-4">
        The CRM does not talk to Property24, Private Property, Facebook or Instagram. Marking a
        channel published records what somebody did by hand.
      </Alert>

      <form action={action} className="space-y-3">
        <FormResult state={state} />
        <input type="hidden" name="propertyId" value={propertyId} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Channel" htmlFor="ch-channel" required>
            <Select id="ch-channel" name="channel" required defaultValue="grlp_website">
              {marketingChannelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Published on" htmlFor="ch-published">
            <Input id="ch-published" name="publishedAt" type="date" />
          </Field>
          <Field label="Removed on" htmlFor="ch-removed">
            <Input id="ch-removed" name="removedAt" type="date" />
          </Field>
          <Field
            label="Link to the advertisement"
            htmlFor="ch-url"
            className="sm:col-span-2"
            hint="The full web address, if there is one"
          >
            <Input id="ch-url" name="sourceUrl" type="url" placeholder="https://" />
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2.5 text-sm">
              <Checkbox name="isPublished" />
              Currently advertised
            </label>
          </div>
          <Field label="Notes" htmlFor="ch-notes" className="sm:col-span-2 lg:col-span-3">
            <Input id="ch-notes" name="notes" />
          </Field>
        </div>
        <SubmitButton tone="primary" pendingLabel="Recording…">
          Record this channel
        </SubmitButton>
      </form>

      {channels.length > 0 ? (
        <ul className="mt-5 divide-y divide-line-soft border-t border-line-soft">
          {marketingChannelOptions
            .filter((option) => byChannel.has(option.value))
            .map((option) => {
              const channel = byChannel.get(option.value);
              if (!channel) return null;
              return (
                <li key={option.value} className="py-2.5 text-[0.8125rem]">
                  <span className="font-medium text-ink">{option.label}</span>{' '}
                  <span className="text-ink-faint">
                    {channel.isPublished ? 'recorded as advertised' : 'not currently advertised'}
                    {channel.publishedAt ? ` from ${channel.publishedAt}` : ''}
                    {channel.removedAt ? ` until ${channel.removedAt}` : ''}
                  </span>
                  {channel.sourceUrl ? (
                    <>
                      {' · '}
                      <a
                        href={channel.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand underline"
                      >
                        Open advertisement
                      </a>
                    </>
                  ) : null}
                  {channel.notes ? (
                    <p className="text-xs text-ink-soft">{channel.notes}</p>
                  ) : null}
                </li>
              );
            })}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photographs (spec 34)
// ---------------------------------------------------------------------------

export function PhotoUploadPanel({ propertyId }: { propertyId: string }) {
  const [state, action] = useActionState<State, FormData>(uploadPhotosAction, undefined);

  return (
    <form action={action} className="space-y-3 border-t border-line-soft p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <Field
        label="Add photographs"
        htmlFor="photo-files"
        hint="JPEG, PNG, WebP or HEIC. The first photograph becomes the cover image."
      >
        <input
          id="photo-files"
          type="file"
          name="photos"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-paper"
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="isMarketing" defaultChecked />
        May be used in marketing
      </label>
      <SubmitButton tone="primary" pendingLabel="Uploading…">
        Upload
      </SubmitButton>
    </form>
  );
}

export function PhotoActions({
  propertyId,
  photoId,
  caption,
  isCover,
  isMarketing,
}: {
  propertyId: string;
  photoId: string;
  caption: string | null;
  isCover: boolean;
  isMarketing: boolean;
}) {
  const [, setCover] = useActionState<State, FormData>(setCoverPhotoAction, undefined);
  const [updateState, update] = useActionState<State, FormData>(updatePhotoAction, undefined);
  const [, archive] = useActionState<State, FormData>(archivePhotoAction, undefined);

  return (
    <div className="space-y-2 p-2">
      <form action={update} className="space-y-2">
        <input type="hidden" name="propertyId" value={propertyId} />
        <input type="hidden" name="photoId" value={photoId} />
        <Input name="caption" defaultValue={caption ?? ''} placeholder="Caption" className="h-9 text-xs" />
        <label className="flex items-center gap-1.5 text-[0.6875rem] text-ink-soft">
          <Checkbox name="isMarketing" defaultChecked={isMarketing} />
          Marketing
        </label>
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save
        </SubmitButton>
        {updateState && !updateState.ok ? (
          <p className="text-[0.6875rem] text-stop">{updateState.message}</p>
        ) : null}
      </form>

      <div className="flex gap-1.5">
        {!isCover ? (
          <form action={setCover}>
            <input type="hidden" name="propertyId" value={propertyId} />
            <input type="hidden" name="photoId" value={photoId} />
            <SubmitButton size="sm" tone="quiet" pendingLabel="…">
              Make cover
            </SubmitButton>
          </form>
        ) : null}
        <form action={archive}>
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="photoId" value={photoId} />
          <ConfirmSubmitButton
            size="sm"
            tone="quiet"
            confirm="Archive this photograph? It is hidden rather than destroyed."
          >
            Archive
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents (spec 35)
// ---------------------------------------------------------------------------

export function DocumentUploadPanel({ propertyId }: { propertyId: string }) {
  const [state, action] = useActionState<State, FormData>(
    uploadPropertyDocumentAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-3 border-t border-line-soft p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="File" htmlFor="doc-file" required hint="PDF, image, Word or Excel">
          <input
            id="doc-file"
            type="file"
            name="file"
            required
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-paper"
          />
        </Field>
        <Field label="Category" htmlFor="doc-category" required>
          <Select id="doc-category" name="category" defaultValue="property">
            {documentCategoryOptions
              .filter((option) => !['fica', 'identity', 'commission'].includes(option.value))
              .map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Document type" htmlFor="doc-type" hint="For example: sole mandate, title deed">
          <Input id="doc-type" name="documentType" />
        </Field>
        <Field label="Expires" htmlFor="doc-expiry">
          <Input id="doc-expiry" name="expiresAt" type="date" />
        </Field>
        <Field label="Notes" htmlFor="doc-notes" className="sm:col-span-2">
          <Input id="doc-notes" name="notes" />
        </Field>
      </div>
      <SubmitButton tone="primary" pendingLabel="Uploading…">
        Upload document
      </SubmitButton>
    </form>
  );
}

export function ArchiveDocumentButton({
  propertyId,
  documentId,
}: {
  propertyId: string;
  documentId: string;
}) {
  const [, action] = useActionState<State, FormData>(archivePropertyDocumentAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="propertyId" value={propertyId} />
      <input type="hidden" name="documentId" value={documentId} />
      <ConfirmSubmitButton
        size="sm"
        tone="quiet"
        confirm="Archive this document? It is hidden rather than destroyed."
      >
        Archive
      </ConfirmSubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Past sales and rentals (spec 31)
// ---------------------------------------------------------------------------

export function SaleHistoryPanel({
  propertyId,
  people,
  agents,
}: {
  propertyId: string;
  people: { id: string; label: string }[];
  agents: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<State, FormData>(addSaleHistoryAction, undefined);

  return (
    <form action={action} className="space-y-3 border-t border-line-soft p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Sale date" htmlFor="sh-date">
          <Input id="sh-date" name="saleDate" type="date" />
        </Field>
        <Field
          label="Registration date"
          htmlFor="sh-reg"
          hint="Concluded is not the same as registered"
        >
          <Input id="sh-reg" name="registeredAt" type="date" />
        </Field>
        <Field label="Sale price" htmlFor="sh-price">
          <Input id="sh-price" name="salePrice" inputMode="numeric" />
        </Field>
        <Field label="Buyer" htmlFor="sh-buyer">
          <Select id="sh-buyer" name="buyerId" defaultValue="">
            <option value="">—</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Seller" htmlFor="sh-seller">
          <Select id="sh-seller" name="sellerId" defaultValue="">
            <option value="">—</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Agent" htmlFor="sh-agent">
          <Select id="sh-agent" name="agentId" defaultValue="">
            <option value="">—</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Outcome" htmlFor="sh-outcome">
          <Select id="sh-outcome" name="saleOutcome" defaultValue="">
            <option value="">—</option>
            {saleOutcomeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" htmlFor="sh-notes" className="sm:col-span-2">
          <Input id="sh-notes" name="notes" />
        </Field>
      </div>
      <SubmitButton tone="primary" pendingLabel="Recording…">
        Record a past sale
      </SubmitButton>
    </form>
  );
}

export function RentalHistoryPanel({
  propertyId,
  people,
  agents,
}: {
  propertyId: string;
  people: { id: string; label: string }[];
  agents: { id: string; name: string }[];
}) {
  const [state, action] = useActionState<State, FormData>(addRentalHistoryAction, undefined);

  return (
    <form action={action} className="space-y-3 border-t border-line-soft p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Lease start" htmlFor="rh-start">
          <Input id="rh-start" name="leaseStart" type="date" />
        </Field>
        <Field label="Lease end" htmlFor="rh-end">
          <Input id="rh-end" name="leaseEnd" type="date" />
        </Field>
        <Field label="Monthly rental" htmlFor="rh-rent">
          <Input id="rh-rent" name="monthlyRental" inputMode="numeric" />
        </Field>
        <Field label="Tenant" htmlFor="rh-tenant">
          <Select id="rh-tenant" name="tenantId" defaultValue="">
            <option value="">—</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Landlord" htmlFor="rh-landlord">
          <Select id="rh-landlord" name="landlordId" defaultValue="">
            <option value="">—</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Agent" htmlFor="rh-agent">
          <Select id="rh-agent" name="agentId" defaultValue="">
            <option value="">—</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" htmlFor="rh-notes" className="sm:col-span-2">
          <Input id="rh-notes" name="notes" />
        </Field>
      </div>
      <SubmitButton tone="primary" pendingLabel="Recording…">
        Record a past rental
      </SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Assignment and archiving
// ---------------------------------------------------------------------------

export function AssignPropertyAgentPanel({
  propertyId,
  agents,
  primaryAgentId,
  secondaryAgentId,
}: {
  propertyId: string;
  agents: { id: string; name: string }[];
  primaryAgentId: string | null;
  secondaryAgentId: string | null;
}) {
  const [state, action] = useActionState<State, FormData>(assignPropertyAgentAction, undefined);

  return (
    <form action={action} className="space-y-3 p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Primary agent" htmlFor="pa-primary">
          <Select id="pa-primary" name="primaryAgentId" defaultValue={primaryAgentId ?? ''}>
            <option value="">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sharing or secondary agent" htmlFor="pa-secondary">
          <Select id="pa-secondary" name="secondaryAgentId" defaultValue={secondaryAgentId ?? ''}>
            <option value="">None</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Reason" htmlFor="pa-reason" hint="Kept in the assignment history">
        <Input id="pa-reason" name="reason" />
      </Field>
      <SubmitButton tone="primary" pendingLabel="Reassigning…">
        Update assignment
      </SubmitButton>
    </form>
  );
}

export function ArchivePropertyPanel({
  propertyId,
  propertyRef,
  isArchived,
}: {
  propertyId: string;
  propertyRef: string;
  isArchived: boolean;
}) {
  const [archiveState, archive] = useActionState<State, FormData>(
    archivePropertyAction,
    undefined,
  );
  const [restoreState, restore] = useActionState<State, FormData>(
    restorePropertyAction,
    undefined,
  );

  if (isArchived) {
    return (
      <form action={restore} className="space-y-3 p-4 sm:p-5">
        <FormResult state={restoreState} />
        <input type="hidden" name="propertyId" value={propertyId} />
        <Alert tone="warn">
          This property is archived. Its history stays intact and it is hidden from the active
          list.
        </Alert>
        <SubmitButton pendingLabel="Restoring…">Restore this property</SubmitButton>
      </form>
    );
  }

  return (
    <form action={archive} className="space-y-3 p-4 sm:p-5">
      <FormResult state={archiveState} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <p className="text-[0.8125rem] text-ink-soft">
        Archiving hides this property from the active list. Nothing is deleted: the status,
        mandate, price and sale history all remain, and {propertyRef} is never given to another
        property.
      </p>
      <Field label="Reason" htmlFor="archive-property-reason">
        <Input
          id="archive-property-reason"
          name="reason"
          placeholder="For example: mandate expired and not renewed"
        />
      </Field>
      <ConfirmSubmitButton
        tone="danger"
        confirm="Archive this property? It will be hidden from the active list. Nothing is deleted."
        pendingLabel="Archiving…"
      >
        Archive this property
      </ConfirmSubmitButton>
    </form>
  );
}

export { Button };
