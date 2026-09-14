'use client';

import { useActionState, useId, useState } from 'react';
import Link from 'next/link';
import {
  createOfferAction,
  createTransactionAction,
  createValuationAction,
  recordViewingAction,
  registerTransactionAction,
  saveViewingFeedbackAction,
  setOfferStatusAction,
  updateValuationAction,
  setTransactionAgentsAction,
  updateTransactionAction,
} from './actions.ts';
import { Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { ConfirmSubmitButton, FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import {
  financeStatusOptions,
  interestLevelOptions,
  offerStatusOptions,
  transactionAgentRoleOptions,
  transactionStatusOptions,
  valuationStatusOptions,
  viewingOutcomeOptions,
} from '@/lib/domain.ts';
import { today } from '@/lib/format.ts';
import type { ActionResult } from '@/lib/action-result.ts';
import type { PipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import type { OfferSummary, TransactionSummary, ValuationSummary } from '@/lib/sales.ts';

type State = ActionResult | undefined;

// ---------------------------------------------------------------------------
// Viewings (spec 46)
// ---------------------------------------------------------------------------

export function ViewingForm({
  options,
  defaults,
  returnTo,
}: {
  options: PipelineFormOptions;
  defaults?: { propertyId?: string; personId?: string; leadId?: string; appointmentId?: string };
  returnTo?: string;
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(recordViewingAction, undefined);

  return (
    <form action={action} className="space-y-4">
      <FormResult state={state} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {defaults?.appointmentId ? (
        <input type="hidden" name="appointmentId" value={defaults.appointmentId} />
      ) : null}

      <Card>
        <CardHeader title="Which viewing?" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field
            label="Property"
            htmlFor={`${formId}-property`}
            required
            error={fieldError(state, 'propertyId')}
          >
            <Select
              id={`${formId}-property`}
              name="propertyId"
              required
              defaultValue={defaults?.propertyId ?? ''}
            >
              <option value="">Choose the property</option>
              {options.properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Who viewed it" htmlFor={`${formId}-person`}>
            <Select id={`${formId}-person`} name="personId" defaultValue={defaults?.personId ?? ''}>
              <option value="">—</option>
              {options.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Agent who showed it" htmlFor={`${formId}-agent`}>
            <Select id={`${formId}-agent`} name="agentId" defaultValue="">
              <option value="">Me</option>
              {options.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="When" htmlFor={`${formId}-when`} hint="Leave blank for now">
            <Input id={`${formId}-when`} name="viewedAt" type="datetime-local" />
          </Field>
          {options.leads.length > 0 ? (
            <Field label="Lead" htmlFor={`${formId}-lead`}>
              <Select id={`${formId}-lead`} name="leadId" defaultValue={defaults?.leadId ?? ''}>
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
            <Textarea id={`${formId}-notes`} name="notes" rows={2} />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <SubmitButton tone="primary" size="lg" pendingLabel="Recording…">
          Record the viewing
        </SubmitButton>
        <Link
          href={returnTo ?? '/sales'}
          className="tap inline-flex items-center rounded-lg px-4 text-sm font-medium text-ink-soft hover:bg-paper"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

/** What the client actually said, and what happens because of it. */
export function ViewingFeedbackForm({ viewingId }: { viewingId: string }) {
  const [state, action] = useActionState<State, FormData>(saveViewingFeedbackAction, undefined);

  return (
    <form action={action} className="space-y-3 border-t border-line-soft p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="viewingId" value={viewingId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Interest" htmlFor={`interest-${viewingId}`}>
          <Select id={`interest-${viewingId}`} name="interestLevel" defaultValue="">
            <option value="">—</option>
            {interestLevelOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Outcome" htmlFor={`outcome-${viewingId}`}>
          <Select id={`outcome-${viewingId}`} name="outcome" defaultValue="">
            <option value="">—</option>
            {viewingOutcomeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Follow-up date"
          htmlFor={`follow-${viewingId}`}
          hint="A date here creates a follow-up task"
        >
          <Input id={`follow-${viewingId}`} name="followUpDate" type="date" />
        </Field>
        <Field label="Objections" htmlFor={`objections-${viewingId}`}>
          <Input id={`objections-${viewingId}`} name="objections" placeholder="Too close to the road" />
        </Field>
        <Field label="Next action" htmlFor={`next-${viewingId}`} className="sm:col-span-2">
          <Input id={`next-${viewingId}`} name="nextAction" placeholder="Send the offer to purchase" />
        </Field>
      </div>
      <SubmitButton tone="primary" pendingLabel="Saving…">
        Save feedback
      </SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Valuations (spec 47)
// ---------------------------------------------------------------------------

export function ValuationForm({
  mode = 'create',
  valuation,
  options,
  defaults,
  returnTo,
}: {
  mode?: 'create' | 'edit';
  valuation?: ValuationSummary;
  options: PipelineFormOptions;
  defaults?: { propertyId?: string; ownerId?: string; leadId?: string };
  returnTo?: string;
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(
    mode === 'edit' ? updateValuationAction : createValuationAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <FormResult state={state} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {valuation ? (
        <>
          <input type="hidden" name="valuationId" value={valuation.id} />
          <input type="hidden" name="rowVersion" value={valuation.rowVersion} />
        </>
      ) : null}

      <Card>
        <CardHeader title="The valuation" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Property" htmlFor={`${formId}-property`}>
            <Select
              id={`${formId}-property`}
              name="propertyId"
              defaultValue={valuation?.propertyId ?? defaults?.propertyId ?? ''}
            >
              <option value="">Not on the register yet</option>
              {options.properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Owner" htmlFor={`${formId}-owner`}>
            <Select
              id={`${formId}-owner`}
              name="ownerId"
              defaultValue={valuation?.ownerId ?? defaults?.ownerId ?? ''}
            >
              <option value="">—</option>
              {options.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Agent" htmlFor={`${formId}-agent`}>
            <Select
              id={`${formId}-agent`}
              name="agentId"
              defaultValue={valuation?.agentId ?? ''}
            >
              <option value="">Me</option>
              {options.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Requested on" htmlFor={`${formId}-requested`}>
            <Input
              id={`${formId}-requested`}
              name="requestDate"
              type="date"
              defaultValue={valuation?.requestDate ?? today()}
            />
          </Field>
          <Field label="Status" htmlFor={`${formId}-status`}>
            <Select
              id={`${formId}-status`}
              name="status"
              defaultValue={valuation?.status ?? 'requested'}
            >
              {valuationStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Follow-up" htmlFor={`${formId}-follow`}>
            <Input
              id={`${formId}-follow`}
              name="followUpDate"
              type="date"
              defaultValue={valuation?.followUpDate ?? ''}
            />
          </Field>
          <Field label="Estimated value" htmlFor={`${formId}-estimate`}>
            <Input
              id={`${formId}-estimate`}
              name="estimatedValue"
              inputMode="numeric"
              defaultValue={valuation?.estimatedValue ?? ''}
            />
          </Field>
          <Field label="Recommended asking price" htmlFor={`${formId}-recommend`}>
            <Input
              id={`${formId}-recommend`}
              name="recommendedAskingPrice"
              inputMode="numeric"
              defaultValue={valuation?.recommendedAskingPrice ?? ''}
            />
          </Field>
          <Field label="Outcome" htmlFor={`${formId}-outcome`} className="sm:col-span-2">
            <Input
              id={`${formId}-outcome`}
              name="outcome"
              placeholder="Owner wants to think about it"
              defaultValue={valuation?.outcome ?? ''}
            />
          </Field>
          <Field label="Notes" htmlFor={`${formId}-notes`} className="sm:col-span-2">
            <Textarea
              id={`${formId}-notes`}
              name="notes"
              rows={2}
              defaultValue={valuation?.notes ?? ''}
            />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <SubmitButton tone="primary" size="lg" pendingLabel="Saving…">
          {mode === 'edit' ? 'Save changes' : 'Record the valuation'}
        </SubmitButton>
        <Link
          href={returnTo ?? '/sales'}
          className="tap inline-flex items-center rounded-lg px-4 text-sm font-medium text-ink-soft hover:bg-paper"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Offers (spec 48)
// ---------------------------------------------------------------------------

export function OfferForm({
  options,
  existingOffers,
  defaults,
  returnTo,
}: {
  options: PipelineFormOptions;
  existingOffers: OfferSummary[];
  defaults?: { propertyId?: string; buyerId?: string; sellerId?: string; leadId?: string };
  returnTo?: string;
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(createOfferAction, undefined);
  const [status, setStatus] = useState('submitted');

  return (
    <form action={action} className="space-y-4">
      <FormResult state={state} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <Alert tone="neutral">
        An offer is never overwritten. A counter offer is recorded as a new offer pointing back at
        the one it answers, so the whole negotiation stays readable.
      </Alert>

      <Card>
        <CardHeader title="The offer" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field
            label="Property"
            htmlFor={`${formId}-property`}
            required
            error={fieldError(state, 'propertyId')}
          >
            <Select
              id={`${formId}-property`}
              name="propertyId"
              required
              defaultValue={defaults?.propertyId ?? ''}
            >
              <option value="">Choose the property</option>
              {options.properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Amount"
            htmlFor={`${formId}-amount`}
            required
            error={fieldError(state, 'amount')}
          >
            <Input
              id={`${formId}-amount`}
              name="amount"
              inputMode="numeric"
              required
              placeholder="2750000"
            />
          </Field>
          <Field label="Buyer" htmlFor={`${formId}-buyer`}>
            <Select id={`${formId}-buyer`} name="buyerId" defaultValue={defaults?.buyerId ?? ''}>
              <option value="">—</option>
              {options.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Seller" htmlFor={`${formId}-seller`}>
            <Select id={`${formId}-seller`} name="sellerId" defaultValue={defaults?.sellerId ?? ''}>
              <option value="">—</option>
              {options.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Offer date" htmlFor={`${formId}-date`}>
            <Input id={`${formId}-date`} name="offerDate" type="date" defaultValue={today()} />
          </Field>
          <Field label="Expires" htmlFor={`${formId}-expires`}>
            <Input id={`${formId}-expires`} name="expiresAt" type="date" />
          </Field>
          <Field label="Status" htmlFor={`${formId}-status`}>
            <Select
              id={`${formId}-status`}
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {offerStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          {status === 'counter_offer' ? (
            <Field
              label="Counter to which offer?"
              htmlFor={`${formId}-counter`}
              required
              error={fieldError(state, 'counterOfferOf')}
            >
              <Select id={`${formId}-counter`} name="counterOfferOf" required defaultValue="">
                <option value="">Choose the offer</option>
                {existingOffers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.propertyRef} — {offer.amount} on {offer.offerDate}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Finance" htmlFor={`${formId}-finance`}>
            <Select id={`${formId}-finance`} name="financeStatus" defaultValue="not_applicable">
              {financeStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Deposit" htmlFor={`${formId}-deposit`}>
            <Input id={`${formId}-deposit`} name="deposit" inputMode="numeric" />
          </Field>
          <Field label="Conditions" htmlFor={`${formId}-conditions`} className="sm:col-span-2">
            <Textarea
              id={`${formId}-conditions`}
              name="conditions"
              rows={3}
              placeholder="Subject to bond approval within 30 days"
            />
          </Field>
          <Field label="Notes" htmlFor={`${formId}-notes`} className="sm:col-span-2">
            <Textarea id={`${formId}-notes`} name="notes" rows={2} />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <SubmitButton tone="primary" size="lg" pendingLabel="Saving…">
          Record the offer
        </SubmitButton>
        <Link
          href={returnTo ?? '/sales'}
          className="tap inline-flex items-center rounded-lg px-4 text-sm font-medium text-ink-soft hover:bg-paper"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function OfferStatusButtons({ offer }: { offer: OfferSummary }) {
  const [state, action] = useActionState<State, FormData>(setOfferStatusAction, undefined);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="offerId" value={offer.id} />
      <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
        <span className="mb-1 block">Move to</span>
        <Select name="status" defaultValue={offer.status} className="h-9">
          {offerStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
        <span className="mb-1 block">Date</span>
        <Input name="date" type="date" className="h-9" defaultValue={today()} />
      </label>
      <SubmitButton size="sm" pendingLabel="…">
        Update
      </SubmitButton>
      {state && !state.ok ? (
        <p className="text-[0.6875rem] text-stop">{state.message}</p>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Transactions (spec 49)
// ---------------------------------------------------------------------------

export function TransactionForm({
  mode,
  transaction,
  options,
  offers,
  defaults,
}: {
  mode: 'create' | 'edit';
  transaction?: TransactionSummary;
  options: PipelineFormOptions;
  offers: OfferSummary[];
  defaults?: { propertyId?: string; buyerId?: string; sellerId?: string; offerId?: string };
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(
    mode === 'create' ? createTransactionAction : updateTransactionAction,
    undefined,
  );
  const [status, setStatus] = useState(transaction?.status ?? 'draft');

  return (
    <form action={action} className="space-y-4">
      <FormResult state={state} />
      {transaction ? (
        <>
          <input type="hidden" name="transactionId" value={transaction.id} />
          <input type="hidden" name="rowVersion" value={transaction.rowVersion} />
          <input type="hidden" name="propertyId" value={transaction.propertyId} />
        </>
      ) : null}

      <Alert tone="warn" title="Concluded is not registered">
        A concluded sale and a registered transfer are different events, often months apart. Record
        the sale here; record the registration when the deeds office confirms it.
      </Alert>

      <Card>
        <CardHeader title="The deal" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          {mode === 'create' ? (
            <Field
              label="Property"
              htmlFor={`${formId}-property`}
              required
              error={fieldError(state, 'propertyId')}
            >
              <Select
                id={`${formId}-property`}
                name="propertyId"
                required
                defaultValue={defaults?.propertyId ?? ''}
              >
                <option value="">Choose the property</option>
                {options.properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field label="Transaction value" htmlFor={`${formId}-value`}>
            <Input
              id={`${formId}-value`}
              name="transactionValue"
              inputMode="numeric"
              defaultValue={transaction?.transactionValue ?? ''}
            />
          </Field>
          <Field label="Buyer" htmlFor={`${formId}-buyer`}>
            <Select
              id={`${formId}-buyer`}
              name="buyerId"
              defaultValue={transaction?.buyerId ?? defaults?.buyerId ?? ''}
            >
              <option value="">—</option>
              {options.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Seller" htmlFor={`${formId}-seller`}>
            <Select
              id={`${formId}-seller`}
              name="sellerId"
              defaultValue={transaction?.sellerId ?? defaults?.sellerId ?? ''}
            >
              <option value="">—</option>
              {options.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>
          {offers.length > 0 ? (
            <Field label="From which offer?" htmlFor={`${formId}-offer`}>
              <Select
                id={`${formId}-offer`}
                name="offerId"
                defaultValue={defaults?.offerId ?? ''}
              >
                <option value="">—</option>
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.amount} on {offer.offerDate} ({offer.status})
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Status" htmlFor={`${formId}-status`} required>
            <Select
              id={`${formId}-status`}
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
            >
              {transactionStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          {['cancelled', 'failed'].includes(status) ? (
            <Field
              label="Why did it not go through?"
              htmlFor={`${formId}-cancel`}
              required
              className="sm:col-span-2"
              error={fieldError(state, 'cancellationReason')}
            >
              <Input
                id={`${formId}-cancel`}
                name="cancellationReason"
                required
                defaultValue={transaction?.cancellationReason ?? ''}
              />
            </Field>
          ) : null}
        </div>

        <div className="grid gap-4 border-t border-line-soft p-4 sm:grid-cols-3 sm:p-5">
          <Field label="Sale date" htmlFor={`${formId}-sale`} hint="When the sale was agreed">
            <Input
              id={`${formId}-sale`}
              name="saleDate"
              type="date"
              defaultValue={transaction?.saleDate ?? ''}
            />
          </Field>
          <Field
            label="Expected registration"
            htmlFor={`${formId}-expected`}
            hint="What the conveyancer expects"
          >
            <Input
              id={`${formId}-expected`}
              name="expectedRegistrationDate"
              type="date"
              defaultValue={transaction?.expectedRegistrationDate ?? ''}
            />
          </Field>
          <Field
            label="Actual registration"
            htmlFor={`${formId}-actual`}
            hint="Only once the deeds office confirms it"
            error={fieldError(state, 'actualRegistrationDate')}
          >
            <Input
              id={`${formId}-actual`}
              name="actualRegistrationDate"
              type="date"
              defaultValue={transaction?.actualRegistrationDate ?? ''}
            />
          </Field>
        </div>

        <div className="grid gap-4 border-t border-line-soft p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Finance" htmlFor={`${formId}-finance`}>
            <Select
              id={`${formId}-finance`}
              name="financeStatus"
              defaultValue={transaction?.financeStatus ?? 'not_applicable'}
            >
              {financeStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Conveyancer" htmlFor={`${formId}-conveyancer`}>
            <Input
              id={`${formId}-conveyancer`}
              name="conveyancer"
              defaultValue={transaction?.conveyancer ?? ''}
            />
          </Field>
          <Field label="Legal or conveyancing status" htmlFor={`${formId}-legal`}>
            <Input
              id={`${formId}-legal`}
              name="legalStatus"
              defaultValue={transaction?.legalStatus ?? ''}
              placeholder="Transfer documents signed"
            />
          </Field>
          <Field label="Reason for a status change" htmlFor={`${formId}-reason`}>
            <Input id={`${formId}-reason`} name="statusChangeReason" />
          </Field>
          <Field label="Suspensive conditions" htmlFor={`${formId}-conditions`} className="sm:col-span-2">
            <Textarea
              id={`${formId}-conditions`}
              name="conditions"
              rows={3}
              defaultValue={transaction?.conditions ?? ''}
            />
          </Field>
          <Field label="Notes" htmlFor={`${formId}-notes`} className="sm:col-span-2">
            <Textarea
              id={`${formId}-notes`}
              name="notes"
              rows={2}
              defaultValue={transaction?.notes ?? ''}
            />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <SubmitButton tone="primary" size="lg" pendingLabel="Saving…">
          {mode === 'create' ? 'Create the transaction' : 'Save changes'}
        </SubmitButton>
        <Link
          href={transaction ? `/sales/transactions/${transaction.id}` : '/sales'}
          className="tap inline-flex items-center rounded-lg px-4 text-sm font-medium text-ink-soft hover:bg-paper"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

/** Registration as its own act, with its own button and its own date. */
export function RegisterTransactionPanel({
  transactionId,
  expectedDate,
}: {
  transactionId: string;
  expectedDate: string | null;
}) {
  const [state, action] = useActionState<State, FormData>(registerTransactionAction, undefined);

  return (
    <form action={action} className="space-y-3 p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="transactionId" value={transactionId} />
      <p className="text-[0.8125rem] text-ink-soft">
        Record this only once the deeds office has confirmed the transfer.
        {expectedDate ? ` The conveyancer expected ${expectedDate}.` : ''}
      </p>
      <Field label="Registration date" htmlFor="reg-date" required>
        <Input id="reg-date" name="registrationDate" type="date" required defaultValue={today()} />
      </Field>
      <Field label="Note" htmlFor="reg-note">
        <Input id="reg-note" name="notes" />
      </Field>
      <ConfirmSubmitButton
        tone="primary"
        confirm="Record this transaction as registered? The property becomes Sale registered."
        pendingLabel="Recording…"
      >
        Record as registered
      </ConfirmSubmitButton>
    </form>
  );
}

export function TransactionAgentsPanel({
  transactionId,
  agents,
  current,
}: {
  transactionId: string;
  agents: { id: string; name: string }[];
  current: { agentId: string; agentName: string; role: string; sharePercent: string | null }[];
}) {
  const [state, action] = useActionState<State, FormData>(setTransactionAgentsAction, undefined);
  const byAgent = new Map(current.map((entry) => [entry.agentId, entry]));

  return (
    <form action={action} className="space-y-3 p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="transactionId" value={transactionId} />
      <p className="text-[0.8125rem] text-ink-soft">
        Everyone on the deal, and how it is shared. An agent on the deal can see the property it is
        about.
      </p>
      <ul className="space-y-2">
        {agents.map((agent) => {
          const entry = byAgent.get(agent.id);
          return (
            <li key={agent.id} className="grid gap-2 sm:grid-cols-[1fr_10rem_8rem] sm:items-center">
              <span className="text-sm text-ink">{agent.name}</span>
              <Select
                name={`agentRole[${agent.id}]`}
                defaultValue={entry?.role ?? ''}
                className="h-9"
                aria-label={`Role for ${agent.name}`}
              >
                <option value="">Not on this deal</option>
                {transactionAgentRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Input
                name={`agentShare[${agent.id}]`}
                inputMode="decimal"
                placeholder="Share %"
                defaultValue={entry?.sharePercent ?? ''}
                className="h-9"
                aria-label={`Share for ${agent.name}`}
              />
            </li>
          );
        })}
      </ul>
      <SubmitButton tone="primary" pendingLabel="Saving…">
        Save the agents on this deal
      </SubmitButton>
    </form>
  );
}
