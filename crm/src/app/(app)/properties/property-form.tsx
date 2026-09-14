'use client';

import { useActionState, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  checkPropertyDuplicatesAction,
  createPropertyAction,
  updatePropertyAction,
} from './actions.ts';
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
  businessAreaOptions,
  mandateStatusOptions,
  mandateTypeOptions,
  propertyStatusOptions,
  propertyTypeOptions,
  PROVINCES,
  rentalStatusOptions,
  saleOutcomeOptions,
  salesStatusOptions,
} from '@/lib/domain.ts';
import type { ActionResult } from '@/lib/action-result.ts';
import type { PropertyDuplicateMatch } from '@/lib/properties/duplicates.ts';
import type { PropertyFormOptions } from '@/lib/properties/form-options.ts';
import type { PropertyDetail } from '@/lib/properties/types.ts';

/**
 * The property form.
 *
 * The six status concepts are edited in one place but shown as six separate
 * fields, each with its own label, so nobody has to guess which "status"
 * they are changing (spec 141).
 */
export function PropertyForm({
  mode,
  property,
  options,
}: {
  mode: 'create' | 'edit';
  property?: PropertyDetail;
  options: PropertyFormOptions;
}) {
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const [saveState, save] = useActionState<ActionResult | undefined, FormData>(
    mode === 'create' ? createPropertyAction : updatePropertyAction,
    undefined,
  );

  const [checking, startChecking] = useTransition();
  const [duplicateState, setDuplicateState] = useState<
    ActionResult<PropertyDuplicateMatch[]> | undefined
  >(undefined);
  const [proceedAnyway, setProceedAnyway] = useState(false);

  function runDuplicateCheck() {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    startChecking(async () => {
      setProceedAnyway(false);
      setDuplicateState(await checkPropertyDuplicatesAction(data));
    });
  }

  const matches = duplicateState?.ok ? (duplicateState.data ?? []) : [];
  const checked = Boolean(duplicateState?.ok);
  const blocked = mode === 'create' && (!checked || (matches.length > 0 && !proceedAnyway));

  return (
    <form ref={formRef} action={save} className="space-y-4">
      <FormResult state={saveState} />

      {property ? (
        <>
          <input type="hidden" name="propertyId" value={property.id} />
          <input type="hidden" name="rowVersion" value={property.rowVersion} />
        </>
      ) : null}
      <input
        type="hidden"
        name="duplicateCheck"
        value={mode === 'create' && checked && !blocked ? 'acknowledged' : ''}
      />

      {/* ---------------- Identification ---------------- */}
      <Card>
        <CardHeader
          title="Which property is this?"
          description="An erf number with a portion identifies one piece of land; the street address is what clients recognise."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
          <Field label="Erf number" htmlFor={`${formId}-erf`} error={fieldError(saveState, 'erfNumber')}>
            <Input id={`${formId}-erf`} name="erfNumber" defaultValue={property?.erfNumber ?? ''} />
          </Field>
          <Field label="Portion" htmlFor={`${formId}-portion`}>
            <Input
              id={`${formId}-portion`}
              name="portionNumber"
              defaultValue={property?.portionNumber ?? ''}
            />
          </Field>
          <Field label="Township" htmlFor={`${formId}-township`}>
            <Input id={`${formId}-township`} name="township" defaultValue={property?.township ?? ''} />
          </Field>
          <Field label="Property name" htmlFor={`${formId}-name`} hint="A complex, farm or estate name">
            <Input
              id={`${formId}-name`}
              name="propertyName"
              defaultValue={property?.propertyName ?? ''}
            />
          </Field>
          <Field
            label="Street address"
            htmlFor={`${formId}-street`}
            className="lg:col-span-2"
            error={fieldError(saveState, 'streetAddress')}
          >
            <Input
              id={`${formId}-street`}
              name="streetAddress"
              defaultValue={property?.streetAddress ?? ''}
              placeholder="18 Main Road"
            />
          </Field>
          <Field label="Suburb" htmlFor={`${formId}-suburb`}>
            <Input
              id={`${formId}-suburb`}
              name="suburb"
              defaultValue={property?.suburb ?? ''}
              placeholder="Wilderness"
            />
          </Field>
          <Field label="Town or city" htmlFor={`${formId}-city`}>
            <Input id={`${formId}-city`} name="city" defaultValue={property?.city ?? ''} placeholder="George" />
          </Field>
          <Field label="Province" htmlFor={`${formId}-province`}>
            <Select
              id={`${formId}-province`}
              name="province"
              defaultValue={property?.province ?? 'Western Cape'}
            >
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
              defaultValue={property?.postalCode ?? ''}
            />
          </Field>
        </div>
      </Card>

      {/* ---------------- The property itself ---------------- */}
      <Card>
        <CardHeader title="What is it?" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          <Field label="Property type" htmlFor={`${formId}-type`} required>
            <Select
              id={`${formId}-type`}
              name="propertyType"
              defaultValue={property?.propertyType ?? 'house'}
            >
              {propertyTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Bedrooms" htmlFor={`${formId}-beds`} error={fieldError(saveState, 'bedrooms')}>
            <Input
              id={`${formId}-beds`}
              name="bedrooms"
              inputMode="decimal"
              defaultValue={property?.bedrooms ?? ''}
            />
          </Field>
          <Field label="Bathrooms" htmlFor={`${formId}-baths`} error={fieldError(saveState, 'bathrooms')}>
            <Input
              id={`${formId}-baths`}
              name="bathrooms"
              inputMode="decimal"
              defaultValue={property?.bathrooms ?? ''}
            />
          </Field>
          <Field label="Garages" htmlFor={`${formId}-garages`}>
            <Input
              id={`${formId}-garages`}
              name="garages"
              inputMode="numeric"
              defaultValue={property?.garages ?? ''}
            />
          </Field>
          <Field label="Other parking" htmlFor={`${formId}-parking`}>
            <Input
              id={`${formId}-parking`}
              name="parking"
              inputMode="numeric"
              defaultValue={property?.parking ?? ''}
            />
          </Field>
          <Field label="Land size" htmlFor={`${formId}-land`} hint="Square metres">
            <Input
              id={`${formId}-land`}
              name="landSizeSqm"
              inputMode="decimal"
              defaultValue={property?.landSizeSqm ?? ''}
            />
          </Field>
          <Field label="Building size" htmlFor={`${formId}-building`} hint="Square metres">
            <Input
              id={`${formId}-building`}
              name="buildingSizeSqm"
              inputMode="decimal"
              defaultValue={property?.buildingSizeSqm ?? ''}
            />
          </Field>
        </div>
      </Card>

      {/* ---------------- Money ---------------- */}
      <Card>
        <CardHeader
          title="What is it worth?"
          description="Every change to an asking price is kept in the price history."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          <Field
            label="Original asking price"
            htmlFor={`${formId}-original`}
            error={fieldError(saveState, 'originalAskingPrice')}
          >
            <Input
              id={`${formId}-original`}
              name="originalAskingPrice"
              inputMode="numeric"
              defaultValue={property?.originalAskingPrice ?? ''}
              placeholder="2950000"
            />
          </Field>
          <Field
            label="Current asking price"
            htmlFor={`${formId}-current`}
            error={fieldError(saveState, 'currentAskingPrice')}
          >
            <Input
              id={`${formId}-current`}
              name="currentAskingPrice"
              inputMode="numeric"
              defaultValue={property?.currentAskingPrice ?? ''}
            />
          </Field>
          <Field label="Estimated value" htmlFor={`${formId}-estimate`}>
            <Input
              id={`${formId}-estimate`}
              name="estimatedValue"
              inputMode="numeric"
              defaultValue={property?.estimatedValue ?? ''}
            />
          </Field>
          <Field label="Monthly rental" htmlFor={`${formId}-rental`}>
            <Input
              id={`${formId}-rental`}
              name="monthlyRental"
              inputMode="numeric"
              defaultValue={property?.monthlyRental ?? ''}
            />
          </Field>
        </div>
      </Card>

      {/* ---------------- The six statuses ---------------- */}
      <Card>
        <CardHeader
          title="Where does it stand?"
          description="These are six separate facts. A property can be off market, with an expired sole mandate, that was sold by a third party."
        />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
          <Field label="Business area" htmlFor={`${formId}-area`} required>
            <Select
              id={`${formId}-area`}
              name="businessArea"
              defaultValue={property?.businessArea ?? 'sales'}
            >
              {businessAreaOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Property status" htmlFor={`${formId}-pstatus`} hint="The property itself">
            <Select
              id={`${formId}-pstatus`}
              name="propertyStatus"
              defaultValue={property?.propertyStatus ?? 'active'}
            >
              {propertyStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sales status" htmlFor={`${formId}-sstatus`} hint="The sales pipeline">
            <Select
              id={`${formId}-sstatus`}
              name="salesStatus"
              defaultValue={property?.salesStatus ?? 'prospect'}
            >
              {salesStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Rental status" htmlFor={`${formId}-rstatus`} hint="The rental pipeline">
            <Select
              id={`${formId}-rstatus`}
              name="rentalStatus"
              defaultValue={property?.rentalStatus ?? 'rental_prospect'}
            >
              {rentalStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sale outcome" htmlFor={`${formId}-outcome`} hint="Who sold it, if anybody did">
            <Select
              id={`${formId}-outcome`}
              name="saleOutcome"
              defaultValue={property?.saleOutcome ?? 'not_applicable'}
            >
              {saleOutcomeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Reason for the change"
            htmlFor={`${formId}-reason`}
            hint="Kept in the status history"
            className="lg:col-span-3"
          >
            <Input
              id={`${formId}-reason`}
              name="statusChangeReason"
              placeholder="For example: seller withdrew the mandate"
            />
          </Field>
        </div>

        <div className="grid gap-4 border-t border-line-soft p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          <Field label="Mandate status" htmlFor={`${formId}-mstatus`} required>
            <Select
              id={`${formId}-mstatus`}
              name="mandateStatus"
              defaultValue={property?.mandateStatus ?? 'no_mandate'}
            >
              {mandateStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mandate type" htmlFor={`${formId}-mtype`}>
            <Select
              id={`${formId}-mtype`}
              name="mandateType"
              defaultValue={property?.mandateType ?? ''}
            >
              <option value="">—</option>
              {mandateTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Mandate start"
            htmlFor={`${formId}-mstart`}
            error={fieldError(saveState, 'mandateStart')}
          >
            <Input
              id={`${formId}-mstart`}
              name="mandateStart"
              type="date"
              defaultValue={property?.mandateStart ?? ''}
            />
          </Field>
          <Field
            label="Mandate expiry"
            htmlFor={`${formId}-mexpiry`}
            error={fieldError(saveState, 'mandateExpiry')}
          >
            <Input
              id={`${formId}-mexpiry`}
              name="mandateExpiry"
              type="date"
              defaultValue={property?.mandateExpiry ?? ''}
            />
          </Field>
        </div>
      </Card>

      {/* ---------------- Assignment ---------------- */}
      <Card>
        <CardHeader title="Who is handling it?" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Primary agent" htmlFor={`${formId}-agent`}>
            <Select
              id={`${formId}-agent`}
              name="primaryAgentId"
              defaultValue={property?.primaryAgentId ?? ''}
            >
              <option value="">{options.agents.length > 1 ? 'Unassigned' : 'You'}</option>
              {options.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sharing or secondary agent" htmlFor={`${formId}-agent2`}>
            <Select
              id={`${formId}-agent2`}
              name="secondaryAgentId"
              defaultValue={property?.secondaryAgentId ?? ''}
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
            <Field label="Office" htmlFor={`${formId}-office`}>
              <Select id={`${formId}-office`} name="officeId" defaultValue={property?.officeId ?? ''}>
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
            <Field label="Team" htmlFor={`${formId}-team`}>
              <Select id={`${formId}-team`} name="teamId" defaultValue={property?.teamId ?? ''}>
                <option value="">—</option>
                {options.teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

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

          <Field
            label="Internal notes"
            htmlFor={`${formId}-notes`}
            hint="Kept apart from the marketing copy"
            className="sm:col-span-2"
          >
            <Textarea id={`${formId}-notes`} name="notes" defaultValue={property?.notes ?? ''} />
          </Field>
        </div>
      </Card>

      {/* ---------------- Duplicate check ---------------- */}
      {mode === 'create' ? (
        <Card>
          <CardHeader
            title="Check for an existing record"
            description="One property, one master record. Check before creating a new one."
          />
          <div className="space-y-3 p-4 sm:p-5">
            {duplicateState && !duplicateState.ok ? (
              <Alert tone="stop">{duplicateState.message}</Alert>
            ) : null}

            {checked && matches.length === 0 ? (
              <Alert tone="ok" title="No possible duplicates found">
                Nothing on file looks like this property. You can create the record.
              </Alert>
            ) : null}

            {matches.length > 0 ? (
              <>
                <Alert
                  tone="warn"
                  title={`${matches.length} possible ${matches.length === 1 ? 'match' : 'matches'}`}
                >
                  Check these before adding another record.
                </Alert>
                <ul className="divide-y divide-line-soft rounded-lg border border-line">
                  {matches.map((match) => (
                    <li key={match.propertyId} className="flex flex-wrap items-start gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">
                          {match.addressLine}{' '}
                          <Badge tone={match.confidence === 'high' ? 'stop' : 'warn'}>
                            {match.confidence === 'high'
                              ? 'Very likely the same'
                              : 'Possibly the same'}
                          </Badge>
                        </p>
                        <p className="font-mono text-[0.6875rem] text-ink-faint">
                          {match.propertyRef}
                        </p>
                        <p className="mt-0.5 text-[0.8125rem] text-ink-soft">
                          {match.reasons.join(' · ')}
                        </p>
                        {match.ownerNames.length > 0 ? (
                          <p className="text-[0.6875rem] text-ink-faint">
                            Owner: {match.ownerNames.join(', ')}
                          </p>
                        ) : null}
                      </div>
                      <Link
                        href={`/properties/${match.propertyId}`}
                        className="tap inline-flex items-center rounded-lg border border-line bg-white px-3 text-sm font-medium hover:bg-paper"
                      >
                        Open existing
                      </Link>
                    </li>
                  ))}
                </ul>
                <label className="flex items-start gap-2 text-sm text-ink">
                  <Checkbox
                    checked={proceedAnyway}
                    onChange={(event) => setProceedAnyway(event.target.checked)}
                  />
                  <span>
                    I have checked these and this is a different property. Create a new record.
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

      <div className="sticky bottom-0 -mx-3 flex flex-wrap items-center gap-2 border-t border-line bg-white px-3 py-3 sm:mx-0 sm:rounded-lg sm:border sm:px-4">
        <SubmitButton tone="primary" size="lg" disabled={blocked} pendingLabel="Saving…">
          {mode === 'create' ? 'Create property' : 'Save changes'}
        </SubmitButton>
        <Link
          href={property ? `/properties/${property.id}` : '/properties'}
          className="tap inline-flex items-center rounded-lg px-4 text-sm font-medium text-ink-soft hover:bg-paper"
        >
          Cancel
        </Link>
        {blocked ? (
          <p className="text-xs text-ink-faint">
            {checked
              ? 'Confirm this is a different property to continue.'
              : 'Run the duplicate check first.'}
          </p>
        ) : null}
      </div>
    </form>
  );
}
