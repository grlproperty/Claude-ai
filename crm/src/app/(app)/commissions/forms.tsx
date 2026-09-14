'use client';

import { useActionState, useId, useState } from 'react';
import {
  addDeductionAction,
  approveCommissionAction,
  archiveRuleAction,
  cancelCommissionAction,
  createCommissionAction,
  createRuleAction,
  invoiceCommissionAction,
  markPaidAction,
  rejectCommissionAction,
  removeDeductionAction,
  removeSplitAction,
  setSplitAction,
  submitCommissionAction,
  updateCommissionAction,
  updateRuleAction,
} from './actions.ts';
import { Checkbox, Field, Input, Label, Select, Textarea } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { ConfirmSubmitButton, FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import { businessAreaOptions } from '@/lib/domain.ts';
import { formatMoney, today } from '@/lib/format.ts';
import * as money from '@/lib/money.ts';
import { calculate } from '@/lib/commission/calculator.ts';
import { COMMISSION_BASES, SPLIT_ROLES, type CommissionBasis } from '@/lib/commission/types.ts';
import type { CommissionRule } from '@/lib/commission/rules.ts';
import type { CommissionRecord, CommissionSplit } from '@/lib/commission/records.ts';
import type { DealBasis } from '@/lib/commission/create.ts';
import type { ActionResult } from '@/lib/action-result.ts';

type State = ActionResult | undefined;

const asOptions = (map: Record<string, string>) =>
  Object.entries(map).map(([value, label]) => ({ value, label }));

/** A figure worked out in the browser, safe to show only because the server works it out again. */
function preview(input: {
  basis: CommissionBasis;
  ratePercent: string;
  fixedAmount: string;
  months: string;
  baseAmount: string;
  vatApplicable: boolean;
  vatRate: string;
  override: string;
}) {
  try {
    return calculate({
      basis: input.basis,
      ratePercent: input.ratePercent || '0',
      fixedAmount: input.fixedAmount || '0',
      months: input.months || '0',
      baseAmount: input.baseAmount || '0',
      vatApplicable: input.vatApplicable,
      vatRate: input.vatRate || '0',
      overrideExclVat: input.override || null,
    });
  } catch {
    // A half-typed amount is not an error worth shouting about; the figure
    // simply does not appear until it makes sense.
    return null;
  }
}

/**
 * Working a commission out.
 *
 * The arithmetic is shown as it is typed, and the same calculation runs
 * again on the server before anything is stored, so what the screen shows
 * and what the database keeps cannot drift apart.
 */
export function CommissionForm({
  mode = 'create',
  deal,
  transactionId,
  rentalId,
  record,
  rules,
  vatRate,
}: {
  mode?: 'create' | 'edit';
  deal?: DealBasis;
  /** Which deal this commission is for. Exactly one is set. */
  transactionId?: string;
  rentalId?: string;
  record?: CommissionRecord;
  rules: CommissionRule[];
  vatRate: string;
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(
    mode === 'edit' ? updateCommissionAction : createCommissionAction,
    undefined,
  );

  const startingRule =
    rules.find((rule) => rule.id === record?.ruleId) ??
    rules.find((rule) => rule.isDefault && rule.appliesTo === (deal?.kind ?? 'sale')) ??
    rules[0];

  const [ruleId, setRuleId] = useState(record?.ruleId ?? startingRule?.id ?? '');
  const [basis, setBasis] = useState<CommissionBasis>(
    record?.basis ?? startingRule?.basis ?? 'percent_of_value',
  );
  // Postgres hands a numeric(8,4) back as "5.0000"; nobody types that.
  const [ratePercent, setRatePercent] = useState(
    money.trimTrailingZeros(record?.ratePercent ?? startingRule?.ratePercent ?? ''),
  );
  const [fixedAmount, setFixedAmount] = useState(
    record?.fixedAmount ?? startingRule?.fixedAmount ?? '',
  );
  const [months, setMonths] = useState(
    money.trimTrailingZeros(record?.months ?? startingRule?.months ?? ''),
  );
  const [baseAmount, setBaseAmount] = useState(
    record?.baseAmount ?? deal?.baseAmount ?? '',
  );
  const [vatApplicable, setVatApplicable] = useState(
    record?.vatApplicable ?? startingRule?.vatApplicable ?? true,
  );
  const [override, setOverride] = useState(
    record?.isOverridden ? record.grossExclVat : '',
  );

  const figures = preview({
    basis,
    ratePercent,
    fixedAmount,
    months,
    baseAmount,
    vatApplicable,
    vatRate,
    override,
  });

  const overriding = Boolean(
    figures && override && money.compare(override, figures.calculatedExclVat) !== 0,
  );

  function chooseRule(id: string) {
    setRuleId(id);
    const rule = rules.find((entry) => entry.id === id);
    if (!rule) return;
    setBasis(rule.basis);
    setRatePercent(money.trimTrailingZeros(rule.ratePercent ?? ''));
    setFixedAmount(rule.fixedAmount ?? '');
    setMonths(money.trimTrailingZeros(rule.months ?? ''));
    setVatApplicable(rule.vatApplicable);
  }

  const rentBased = basis === 'months_of_rent' || basis === 'percent_of_annual_rent';

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5">
      <FormResult state={state} />

      {record ? (
        <>
          <input type="hidden" name="commissionId" value={record.id} />
          <input type="hidden" name="rowVersion" value={record.rowVersion} />
        </>
      ) : null}
      {/* A commission belongs to one deal, and which one is never editable. */}
      {(record?.transactionId ?? transactionId) ? (
        <input
          type="hidden"
          name="transactionId"
          value={record?.transactionId ?? transactionId ?? ''}
        />
      ) : null}
      {(record?.rentalId ?? rentalId) ? (
        <input type="hidden" name="rentalId" value={record?.rentalId ?? rentalId ?? ''} />
      ) : null}

      {deal && deal.kind === 'sale' && !deal.isRegistered ? (
        <Alert tone="warn" title="This transfer has not registered yet">
          Work the commission out by all means, but nothing here is earned until the property is
          registered in the buyer&rsquo;s name. The CRM will not let it be invoiced or recorded as
          paid before then.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Which of the office's rules?"
          htmlFor={`${formId}-rule`}
          hint="Choosing one fills in its terms. You can still change them here."
        >
          <Select
            id={`${formId}-rule`}
            name="ruleId"
            value={ruleId}
            onChange={(event) => chooseRule(event.target.value)}
          >
            <option value="">Not from a rule</option>
            {rules.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.name}
                {rule.isDefault ? ' (usual)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Worked out how?" htmlFor={`${formId}-basis`} required>
          <Select
            id={`${formId}-basis`}
            name="basis"
            value={basis}
            onChange={(event) => setBasis(event.target.value as CommissionBasis)}
          >
            {asOptions(COMMISSION_BASES).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        {basis === 'percent_of_value' || basis === 'percent_of_annual_rent' ? (
          <Field
            label="Rate (%)"
            htmlFor={`${formId}-rate`}
            required
            error={fieldError(state, 'ratePercent')}
          >
            <Input
              id={`${formId}-rate`}
              name="ratePercent"
              inputMode="decimal"
              value={ratePercent}
              onChange={(event) => setRatePercent(event.target.value)}
              placeholder="5"
            />
          </Field>
        ) : null}

        {basis === 'fixed_amount' ? (
          <Field
            label="Amount"
            htmlFor={`${formId}-fixed`}
            required
            error={fieldError(state, 'fixedAmount')}
          >
            <Input
              id={`${formId}-fixed`}
              name="fixedAmount"
              inputMode="decimal"
              value={fixedAmount}
              onChange={(event) => setFixedAmount(event.target.value)}
            />
          </Field>
        ) : null}

        {basis === 'months_of_rent' ? (
          <Field
            label="How many months of rent?"
            htmlFor={`${formId}-months`}
            required
            error={fieldError(state, 'months')}
          >
            <Input
              id={`${formId}-months`}
              name="months"
              inputMode="decimal"
              value={months}
              onChange={(event) => setMonths(event.target.value)}
              placeholder="1"
            />
          </Field>
        ) : null}

        <Field
          label={rentBased ? 'The monthly rent' : 'The price it sold for'}
          htmlFor={`${formId}-base`}
          required
          error={fieldError(state, 'baseAmount')}
          hint={
            deal?.baseAmount
              ? `The deal records ${formatMoney(deal.baseAmount)}.`
              : 'Taken from the deal where there is one.'
          }
        >
          <Input
            id={`${formId}-base`}
            name="baseAmount"
            inputMode="decimal"
            value={baseAmount}
            onChange={(event) => setBaseAmount(event.target.value)}
          />
        </Field>

        <div className="sm:col-span-2">
          <Label>
            <Checkbox
              name="vatApplicable"
              value="on"
              checked={vatApplicable}
              onChange={(event) => setVatApplicable(event.target.checked)}
            />
            This commission carries VAT at {vatRate}%
          </Label>
        </div>
      </div>

      {figures ? (
        <div className="rounded-lg border border-line-soft bg-paper p-4">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
            How this figure is reached
          </p>
          <ul className="mt-1.5 space-y-0.5 text-[0.8125rem] text-ink-soft">
            {figures.workings.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ul>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-wide text-ink-faint">
                Commission
              </dt>
              <dd className="font-semibold text-ink">{formatMoney(figures.grossExclVat, { decimals: true })}</dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-wide text-ink-faint">VAT</dt>
              <dd className="text-ink">{formatMoney(figures.vatAmount, { decimals: true })}</dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-wide text-ink-faint">
                Invoice total
              </dt>
              <dd className="font-semibold text-ink">
                {formatMoney(figures.grossInclVat, { decimals: true })}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <Field
        label="Claim a different figure instead"
        htmlFor={`${formId}-override`}
        hint="Leave blank to use what the rule works out. An override is kept beside the calculation, never in place of it."
      >
        <Input
          id={`${formId}-override`}
          name="overrideExclVat"
          inputMode="decimal"
          value={override}
          onChange={(event) => setOverride(event.target.value)}
        />
      </Field>

      {overriding ? (
        <Field
          label="Why the different figure?"
          htmlFor={`${formId}-override-reason`}
          required
          error={fieldError(state, 'overrideReason')}
        >
          <Input
            id={`${formId}-override-reason`}
            name="overrideReason"
            required
            defaultValue={record?.overrideReason ?? ''}
            placeholder="Reduced by agreement to close the gap on the offer"
          />
        </Field>
      ) : null}

      <Field label="Notes" htmlFor={`${formId}-notes`}>
        <Textarea id={`${formId}-notes`} name="notes" rows={3} defaultValue={record?.notes ?? ''} />
      </Field>

      <SubmitButton tone="primary" size="lg" pendingLabel="Saving…">
        {mode === 'edit' ? 'Work it out again' : 'Open the commission'}
      </SubmitButton>
    </form>
  );
}

/** Whoever shares the deal. */
export function SplitPanel({
  commissionId,
  netExclVat,
  agents,
  splits,
}: {
  commissionId: string;
  netExclVat: string;
  agents: { id: string; name: string }[];
  splits: CommissionSplit[];
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(setSplitAction, undefined);
  const [role, setRole] = useState('sharing');

  const allocated = splits.reduce((total, split) => total + Number(split.sharePercent), 0);
  const left = Math.max(0, 100 - allocated);

  return (
    <form action={action} className="space-y-3 border-t border-line-soft p-4 sm:p-5">
      {state ? <FormResult state={state} /> : null}
      <input type="hidden" name="commissionId" value={commissionId} />

      <p className="text-[0.8125rem] text-ink-soft">
        {allocated.toFixed(2)}% of {formatMoney(netExclVat, { decimals: true })} is allocated.{' '}
        {left > 0 ? `${left.toFixed(2)}% is unallocated.` : 'Nothing is left to allocate.'}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="In what capacity?" htmlFor={`${formId}-role`} required>
          <Select
            id={`${formId}-role`}
            name="role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            {asOptions(SPLIT_ROLES).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Share (%)" htmlFor={`${formId}-percent`} required>
          <Input
            id={`${formId}-percent`}
            name="sharePercent"
            inputMode="decimal"
            required
            placeholder={left.toFixed(2)}
          />
        </Field>

        {role === 'office' ? null : (
          <Field
            label="Which agent?"
            htmlFor={`${formId}-agent`}
            hint="Leave blank for somebody outside the office and name them instead."
          >
            <Select id={`${formId}-agent`} name="agentId" defaultValue="">
              <option value="">Somebody outside the office</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Or their name" htmlFor={`${formId}-party`}>
          <Input
            id={`${formId}-party`}
            name="partyName"
            placeholder="Knysna referral partner"
          />
        </Field>
      </div>

      <SubmitButton pendingLabel="Saving…">Save this share</SubmitButton>
    </form>
  );
}

export function RemoveSplitButton({
  commissionId,
  splitId,
  label,
}: {
  commissionId: string;
  splitId: string;
  label: string;
}) {
  const [, action] = useActionState<State, FormData>(removeSplitAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="commissionId" value={commissionId} />
      <input type="hidden" name="splitId" value={splitId} />
      <ConfirmSubmitButton
        size="sm"
        pendingLabel="…"
        confirm={`Remove ${label}'s share? It stays in the record of what changed.`}
      >
        Remove
      </ConfirmSubmitButton>
    </form>
  );
}

export function DeductionPanel({ commissionId }: { commissionId: string }) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(addDeductionAction, undefined);

  return (
    <form action={action} className="space-y-3 border-t border-line-soft p-4 sm:p-5">
      {state ? <FormResult state={state} /> : null}
      <input type="hidden" name="commissionId" value={commissionId} />

      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <Field label="What is being deducted?" htmlFor={`${formId}-label`} required>
          <Input
            id={`${formId}-label`}
            name="label"
            required
            placeholder="Referral fee to Knysna partner"
          />
        </Field>
        <Field label="Amount" htmlFor={`${formId}-amount`} required>
          <Input id={`${formId}-amount`} name="amount" inputMode="decimal" required />
        </Field>
      </div>

      <Field label="Note" htmlFor={`${formId}-note`}>
        <Input id={`${formId}-note`} name="note" />
      </Field>

      <SubmitButton pendingLabel="Saving…">Record the deduction</SubmitButton>
    </form>
  );
}

export function RemoveDeductionButton({
  commissionId,
  deductionId,
  label,
}: {
  commissionId: string;
  deductionId: string;
  label: string;
}) {
  const [, action] = useActionState<State, FormData>(removeDeductionAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="commissionId" value={commissionId} />
      <input type="hidden" name="deductionId" value={deductionId} />
      <ConfirmSubmitButton size="sm" pendingLabel="…" confirm={`Remove "${label}"?`}>
        Remove
      </ConfirmSubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------------
// The workflow
// ---------------------------------------------------------------------

/**
 * Where a commission goes next.
 *
 * Each button does one thing and says what it does. None of them claims
 * anything the CRM cannot know: "Record as paid" records, it does not
 * confirm, because there is no bank account to confirm against (spec 115).
 */
export function WorkflowPanel({
  record,
  canEdit,
  canApprove,
}: {
  record: CommissionRecord;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const formId = useId();
  const [submitState, submit] = useActionState<State, FormData>(
    submitCommissionAction,
    undefined,
  );
  const [approveState, approve] = useActionState<State, FormData>(
    approveCommissionAction,
    undefined,
  );
  const [rejectState, reject] = useActionState<State, FormData>(
    rejectCommissionAction,
    undefined,
  );
  const [invoiceState, invoice] = useActionState<State, FormData>(
    invoiceCommissionAction,
    undefined,
  );
  const [paidState, markPaid] = useActionState<State, FormData>(markPaidAction, undefined);
  const [cancelState, cancel] = useActionState<State, FormData>(
    cancelCommissionAction,
    undefined,
  );

  const hidden = (
    <>
      <input type="hidden" name="commissionId" value={record.id} />
      <input type="hidden" name="rowVersion" value={record.rowVersion} />
    </>
  );

  const waitingOnRegistration = Boolean(record.transactionId) && record.transactionStatus !== 'registered';

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <FormResult state={submitState} />
      <FormResult state={approveState} />
      <FormResult state={rejectState} />
      <FormResult state={invoiceState} />
      <FormResult state={paidState} />
      <FormResult state={cancelState} />

      {record.status === 'draft' || record.status === 'rejected' ? (
        canEdit ? (
          <form action={submit} className="space-y-2">
            {hidden}
            <p className="text-[0.8125rem] text-ink-soft">
              The shares must come to exactly 100% before this can go for approval.
            </p>
            <SubmitButton tone="primary" pendingLabel="Sending…">
              Send it for approval
            </SubmitButton>
          </form>
        ) : (
          <p className="text-[0.8125rem] text-ink-soft">
            Somebody with commission editing must send this for approval.
          </p>
        )
      ) : null}

      {record.status === 'submitted' ? (
        canApprove ? (
          <div className="space-y-4">
            <Alert tone="warn" title="Your name goes onto this permanently">
              Approving records that <strong>you</strong> approved this commission, on today&rsquo;s
              date. The CRM has decided nothing.
            </Alert>

            <form action={approve} className="space-y-2">
              {hidden}
              <Field label="Note on your approval" htmlFor={`${formId}-approval-note`}>
                <Input
                  id={`${formId}-approval-note`}
                  name="approvalNote"
                  placeholder="Checked against the mandate"
                />
              </Field>
              <ConfirmSubmitButton
                tone="primary"
                pendingLabel="Approving…"
                confirm="Approve this commission? Your name and the date go onto it permanently."
              >
                Approve it
              </ConfirmSubmitButton>
            </form>

            <form action={reject} className="space-y-2 border-t border-line-soft pt-4">
              {hidden}
              <Field
                label="Or send it back, saying what is wrong"
                htmlFor={`${formId}-reject`}
                required
                error={fieldError(rejectState, 'rejectionReason')}
              >
                <Input
                  id={`${formId}-reject`}
                  name="rejectionReason"
                  required
                  placeholder="The mandate says 4.5%, not 5%"
                />
              </Field>
              <SubmitButton pendingLabel="Sending back…">Send it back</SubmitButton>
            </form>
          </div>
        ) : (
          <Alert tone="neutral" title="Waiting for approval">
            This is with management. Nobody has approved it yet, and you do not hold commission
            approval.
          </Alert>
        )
      ) : null}

      {record.status === 'approved' || record.status === 'invoiced' ? (
        <div className="space-y-4">
          {waitingOnRegistration ? (
            <Alert tone="stop" title="The transfer has not registered">
              A concluded sale is not a registered sale. Until the deeds office registers it,
              nothing here can be invoiced or recorded as paid — the database refuses it, not just
              this screen.
            </Alert>
          ) : null}

          {record.status === 'approved' && canEdit && !waitingOnRegistration ? (
            <form action={invoice} className="space-y-3">
              {hidden}
              <p className="text-[0.8125rem] text-ink-soft">
                The CRM does not raise invoices. Record the number of the one that was raised.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Invoice number"
                  htmlFor={`${formId}-invoice`}
                  required
                  error={fieldError(invoiceState, 'invoiceNumber')}
                >
                  <Input id={`${formId}-invoice`} name="invoiceNumber" required />
                </Field>
                <Field label="Dated" htmlFor={`${formId}-invoice-date`}>
                  <Input
                    id={`${formId}-invoice-date`}
                    name="invoiceDate"
                    type="date"
                    defaultValue={today()}
                  />
                </Field>
              </div>
              <SubmitButton pendingLabel="Recording…">Record the invoice</SubmitButton>
            </form>
          ) : null}

          {canApprove && !waitingOnRegistration ? (
            <form action={markPaid} className="space-y-3 border-t border-line-soft pt-4">
              {hidden}
              <Alert tone="neutral" title="The CRM is connected to no bank">
                It cannot know that money moved. This records that <strong>you</strong> say it did,
                on the date you give.
              </Alert>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Paid on" htmlFor={`${formId}-paid-on`}>
                  <Input
                    id={`${formId}-paid-on`}
                    name="paidOn"
                    type="date"
                    defaultValue={today()}
                  />
                </Field>
                <Field label="Payment reference" htmlFor={`${formId}-reference`}>
                  <Input
                    id={`${formId}-reference`}
                    name="paymentReference"
                    placeholder="EFT 88231"
                  />
                </Field>
                {record.invoiceNumber ? null : (
                  <Field
                    label="Invoice number"
                    htmlFor={`${formId}-paid-invoice`}
                    required
                    error={fieldError(paidState, 'invoiceNumber')}
                  >
                    <Input id={`${formId}-paid-invoice`} name="invoiceNumber" required />
                  </Field>
                )}
              </div>
              <ConfirmSubmitButton
                tone="primary"
                pendingLabel="Recording…"
                confirm="Record this commission as paid? Your name and the date go onto it permanently."
              >
                Record it as paid by me
              </ConfirmSubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}

      {record.status === 'paid' ? (
        <Alert tone="ok" title="Recorded as paid by a person">
          {record.markedPaidByName ?? 'Somebody'} recorded this as paid
          {record.paidOn ? ` on ${record.paidOn}` : ''}
          {record.paymentReference ? `, reference ${record.paymentReference}` : ''}. The CRM checked
          no bank account.
        </Alert>
      ) : null}

      {canEdit && !['paid', 'cancelled'].includes(record.status) ? (
        <form action={cancel} className="space-y-2 border-t border-line-soft pt-4">
          {hidden}
          <Field
            label="Cancel it, saying why"
            htmlFor={`${formId}-cancel`}
            required
            error={fieldError(cancelState, 'cancellationReason')}
          >
            <Input
              id={`${formId}-cancel`}
              name="cancellationReason"
              required
              placeholder="The sale fell through on the bond"
            />
          </Field>
          <ConfirmSubmitButton
            size="sm"
            pendingLabel="Cancelling…"
            confirm="Cancel this commission? The figures are kept for the record."
          >
            Cancel the commission
          </ConfirmSubmitButton>
        </form>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------
// The office's rules
// ---------------------------------------------------------------------

export function RuleForm({
  mode = 'create',
  rule,
}: {
  mode?: 'create' | 'edit';
  rule?: CommissionRule;
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(
    mode === 'edit' ? updateRuleAction : createRuleAction,
    undefined,
  );
  const [appliesTo, setAppliesTo] = useState(rule?.appliesTo ?? 'sale');
  const [basis, setBasis] = useState<CommissionBasis>(rule?.basis ?? 'percent_of_value');

  // A sale is worked out from a price and a letting from the rent, and the
  // two are never mixed (spec 141).
  const allowed: CommissionBasis[] =
    appliesTo === 'sale'
      ? ['percent_of_value', 'fixed_amount']
      : ['months_of_rent', 'percent_of_annual_rent', 'fixed_amount'];

  function chooseAppliesTo(value: string) {
    setAppliesTo(value as 'sale' | 'rental');
    const next: CommissionBasis[] =
      value === 'sale'
        ? ['percent_of_value', 'fixed_amount']
        : ['months_of_rent', 'percent_of_annual_rent', 'fixed_amount'];
    if (!next.includes(basis)) setBasis(next[0] as CommissionBasis);
  }

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5">
      <FormResult state={state} />
      {rule ? (
        <>
          <input type="hidden" name="ruleId" value={rule.id} />
          <input type="hidden" name="rowVersion" value={rule.rowVersion} />
        </>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="What is it called?"
          htmlFor={`${formId}-name`}
          required
          error={fieldError(state, 'name')}
        >
          <Input id={`${formId}-name`} name="name" required defaultValue={rule?.name ?? ''} />
        </Field>

        <Field label="Sales or rentals?" htmlFor={`${formId}-applies`} required>
          <Select
            id={`${formId}-applies`}
            name="appliesTo"
            value={appliesTo}
            onChange={(event) => chooseAppliesTo(event.target.value)}
          >
            <option value="sale">Sales</option>
            <option value="rental">Rentals</option>
          </Select>
        </Field>

        <Field
          label="Worked out how?"
          htmlFor={`${formId}-basis`}
          required
          error={fieldError(state, 'basis')}
        >
          <Select
            id={`${formId}-basis`}
            name="basis"
            value={basis}
            onChange={(event) => setBasis(event.target.value as CommissionBasis)}
          >
            {allowed.map((value) => (
              <option key={value} value={value}>
                {COMMISSION_BASES[value]}
              </option>
            ))}
          </Select>
        </Field>

        {basis === 'percent_of_value' || basis === 'percent_of_annual_rent' ? (
          <Field
            label="Rate (%)"
            htmlFor={`${formId}-rate`}
            required
            error={fieldError(state, 'ratePercent')}
          >
            <Input
              id={`${formId}-rate`}
              name="ratePercent"
              inputMode="decimal"
              required
              defaultValue={money.trimTrailingZeros(rule?.ratePercent ?? '')}
            />
          </Field>
        ) : null}

        {basis === 'fixed_amount' ? (
          <Field
            label="Amount"
            htmlFor={`${formId}-fixed`}
            required
            error={fieldError(state, 'fixedAmount')}
          >
            <Input
              id={`${formId}-fixed`}
              name="fixedAmount"
              inputMode="decimal"
              required
              defaultValue={rule?.fixedAmount ?? ''}
            />
          </Field>
        ) : null}

        {basis === 'months_of_rent' ? (
          <Field
            label="How many months of rent?"
            htmlFor={`${formId}-months`}
            required
            error={fieldError(state, 'months')}
          >
            <Input
              id={`${formId}-months`}
              name="months"
              inputMode="decimal"
              required
              defaultValue={money.trimTrailingZeros(rule?.months ?? '')}
            />
          </Field>
        ) : null}

        <Field
          label="Part of the business"
          htmlFor={`${formId}-area`}
          hint="Leave blank for a rule that applies everywhere."
        >
          <Select
            id={`${formId}-area`}
            name="businessArea"
            defaultValue={rule?.businessArea ?? ''}
          >
            <option value="">Everywhere</option>
            {businessAreaOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Least it may come to"
          htmlFor={`${formId}-minimum`}
          hint="A smaller figure is raised to this."
        >
          <Input
            id={`${formId}-minimum`}
            name="minimumAmount"
            inputMode="decimal"
            defaultValue={rule?.minimumAmount ?? ''}
          />
        </Field>

        <Field label="In force from" htmlFor={`${formId}-from`}>
          <Input
            id={`${formId}-from`}
            name="effectiveFrom"
            type="date"
            defaultValue={rule?.effectiveFrom ?? ''}
          />
        </Field>

        <Field label="Until" htmlFor={`${formId}-to`}>
          <Input
            id={`${formId}-to`}
            name="effectiveTo"
            type="date"
            defaultValue={rule?.effectiveTo ?? ''}
          />
        </Field>

        <Field label="Notes" htmlFor={`${formId}-notes`} className="sm:col-span-2">
          <Textarea
            id={`${formId}-notes`}
            name="notes"
            rows={2}
            defaultValue={rule?.notes ?? ''}
          />
        </Field>
      </div>

      <Label>
        <Checkbox name="vatApplicable" value="on" defaultChecked={rule?.vatApplicable ?? true} />
        Commission under this rule carries VAT
      </Label>

      <Label>
        <Checkbox name="isDefault" value="on" defaultChecked={rule?.isDefault ?? false} />
        Use this as the usual rule for that part of the business
      </Label>

      <SubmitButton tone="primary" size="lg" pendingLabel="Saving…">
        {mode === 'edit' ? 'Save the rule' : 'Add the rule'}
      </SubmitButton>
    </form>
  );
}

export function ArchiveRulePanel({ ruleId, name }: { ruleId: string; name: string }) {
  const [state, action] = useActionState<State, FormData>(archiveRuleAction, undefined);

  return (
    <form action={action} className="border-t border-line-soft p-3">
      {state ? <FormResult state={state} /> : null}
      <input type="hidden" name="ruleId" value={ruleId} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="archiveReason"
          required
          placeholder="Why is it being retired?"
          aria-label={`Why ${name} is being retired`}
          className="h-9 max-w-md flex-1 text-xs"
        />
        <ConfirmSubmitButton
          size="sm"
          pendingLabel="…"
          confirm={`Retire "${name}"? Commissions already worked out from it keep their own figures.`}
        >
          Retire
        </ConfirmSubmitButton>
      </div>
    </form>
  );
}
