'use client';

import { useActionState, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  composeFromTemplateAction,
  createTemplateAction,
  logCommunicationAction,
  updateCommunicationAction,
  updateTemplateAction,
} from './actions.ts';
import {
  Badge,
  Card,
  CardHeader,
  Checkbox,
  Field,
  Input,
  Label,
  Select,
  Textarea,
} from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import {
  communicationChannelOptions,
  communicationDirectionOptions,
  communicationOutcomeOptions,
  templateCategoryOptions,
  templateChannelOptions,
} from '@/lib/domain.ts';
import { toDateTimeInput } from '@/lib/format.ts';
import { MERGE_FIELDS } from '@/lib/templates.ts';
import type { ActionResult } from '@/lib/action-result.ts';
import type { CommunicationSummary } from '@/lib/communications.ts';
import type { Template } from '@/lib/templates.ts';

type State = ActionResult | undefined;

const DURATION_CHANNELS = ['call', 'meeting', 'in_person'];

export interface LogFormOptions {
  people: { id: string; label: string }[];
  properties: { id: string; label: string }[];
  agents: { id: string; name: string }[];
  templates: Template[];
}

/**
 * Recording a conversation.
 *
 * The notice at the top is not decoration. Somebody arriving here from the
 * Log contact button has just made a call or sent a WhatsApp themselves, and
 * this form must make plain that it is writing down what happened rather than
 * doing anything (spec 6, 143).
 */
export function LogCommunicationForm({
  mode = 'create',
  communication,
  options,
  defaults,
  returnTo,
}: {
  mode?: 'create' | 'edit';
  communication?: CommunicationSummary;
  options: LogFormOptions;
  defaults?: { personId?: string; propertyId?: string; leadId?: string; transactionId?: string };
  returnTo?: string;
}) {
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState<State, FormData>(
    mode === 'edit' ? updateCommunicationAction : logCommunicationAction,
    undefined,
  );

  const [channel, setChannel] = useState(communication?.channel ?? 'call');
  const [wantsFollowUp, setWantsFollowUp] = useState(false);

  // Composing from a template is a plain server call rather than a second
  // form action: two useActionState actions in one form do not both post.
  const [composing, startComposing] = useTransition();
  const [composed, setComposed] = useState<{
    subject: string | null;
    body: string;
    unfilled: string[];
    message: string;
  } | null>(null);

  const compose = (templateId: string) => {
    if (!templateId || !formRef.current) return;
    const data = new FormData(formRef.current);
    data.set('templateId', templateId);
    startComposing(async () => {
      const result = await composeFromTemplateAction(undefined, data);
      // message is optional on a success result, so it is defaulted here
      // rather than asserted.
      const message = result.message ?? 'Wording ready.';
      if (result.ok && result.data) {
        setComposed({ ...result.data, message });
      } else {
        setComposed({ subject: null, body: '', unfilled: [], message });
      }
    });
  };

  const usableTemplates = options.templates.filter(
    (template) => template.channel === 'any' || template.channel === channel,
  );

  return (
    <form action={action} ref={formRef} className="space-y-4">
      <FormResult state={state} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {communication ? (
        <>
          <input type="hidden" name="communicationId" value={communication.id} />
          <input type="hidden" name="rowVersion" value={communication.rowVersion} />
        </>
      ) : null}

      <Alert tone="neutral" title="This writes down what happened">
        The CRM does not send messages. You made the call or sent the message yourself, from your
        own phone or your own email. This is the record of it.
      </Alert>

      <Card>
        <CardHeader title="Who and what" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field
            label="Which client?"
            htmlFor={`${formId}-person`}
            error={fieldError(state, 'personId')}
          >
            <Select
              id={`${formId}-person`}
              name="personId"
              defaultValue={communication?.personId ?? defaults?.personId ?? ''}
            >
              <option value="">—</option>
              {options.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="About which property?" htmlFor={`${formId}-property`}>
            <Select
              id={`${formId}-property`}
              name="propertyId"
              defaultValue={communication?.propertyId ?? defaults?.propertyId ?? ''}
            >
              <option value="">—</option>
              {options.properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.label}
                </option>
              ))}
            </Select>
          </Field>

          {defaults?.leadId ? (
            <input type="hidden" name="leadId" value={defaults.leadId} />
          ) : communication?.leadId ? (
            <input type="hidden" name="leadId" value={communication.leadId} />
          ) : null}
          {defaults?.transactionId ? (
            <input type="hidden" name="transactionId" value={defaults.transactionId} />
          ) : communication?.transactionId ? (
            <input type="hidden" name="transactionId" value={communication.transactionId} />
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader title="What happened" />
        <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Which way round?" htmlFor={`${formId}-direction`} required>
            <Select
              id={`${formId}-direction`}
              name="direction"
              defaultValue={communication?.direction ?? 'outgoing'}
            >
              {communicationDirectionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="How?" htmlFor={`${formId}-channel`} required>
            <Select
              id={`${formId}-channel`}
              name="channel"
              value={channel}
              onChange={(event) => setChannel(event.target.value as typeof channel)}
            >
              {communicationChannelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="When?" htmlFor={`${formId}-when`} hint="Backdate it if you are catching up.">
            <Input
              id={`${formId}-when`}
              name="occurredAt"
              type="datetime-local"
              defaultValue={
                toDateTimeInput(communication?.occurredAt ?? new Date())
              }
            />
          </Field>

          <Field
            label="What came of it?"
            htmlFor={`${formId}-outcome`}
            hint="What you observed. Nothing here reports delivery, because nothing tells us."
          >
            <Select
              id={`${formId}-outcome`}
              name="outcome"
              defaultValue={communication?.outcome ?? ''}
            >
              <option value="">—</option>
              {communicationOutcomeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          {DURATION_CHANNELS.includes(channel) ? (
            <Field
              label="How long, in minutes?"
              htmlFor={`${formId}-duration`}
              error={fieldError(state, 'durationMinutes')}
            >
              <Input
                id={`${formId}-duration`}
                name="durationMinutes"
                inputMode="numeric"
                defaultValue={communication?.durationMinutes ?? ''}
              />
            </Field>
          ) : null}

          <Field label="Whose conversation was it?" htmlFor={`${formId}-agent`}>
            <Select
              id={`${formId}-agent`}
              name="agentId"
              defaultValue={communication?.agentId ?? ''}
            >
              <option value="">Mine</option>
              {options.agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Subject" htmlFor={`${formId}-subject`} className="sm:col-span-2">
            <Input
              id={`${formId}-subject`}
              name="subject"
              defaultValue={communication?.subject ?? ''}
            />
          </Field>

          <Field
            label="What was said?"
            htmlFor={`${formId}-body`}
            className="sm:col-span-2"
            error={fieldError(state, 'body')}
            hint="The part that matters in six months' time."
          >
            <Textarea
              id={`${formId}-body`}
              name="body"
              rows={6}
              defaultValue={communication?.body ?? ''}
            />
          </Field>

          <Label className="sm:col-span-2">
            <Checkbox
              name="isImportant"
              defaultChecked={communication?.isImportant ?? false}
              value="on"
            />
            Mark this as important
          </Label>
        </div>
      </Card>

      {mode === 'create' && usableTemplates.length > 0 ? (
        <Card>
          <CardHeader
            title="Wording to copy"
            description="Fills a template in from this client's record. You then send it yourself."
          />
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-end gap-2">
              <Select
                aria-label="Which wording?"
                defaultValue=""
                className="max-w-sm"
                onChange={(event) => compose(event.target.value)}
                disabled={composing}
              >
                <option value="">Choose a template…</option>
                {usableTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </Select>
              {composing ? <span className="text-xs text-ink-faint">Filling it in…</span> : null}
            </div>

            {composed ? (
              <>
                <Alert tone={composed.unfilled.length > 0 ? 'warn' : 'neutral'}>
                  {composed.message}
                </Alert>
                {composed.subject ? (
                  <Field label="Subject to use" htmlFor={`${formId}-composed-subject`}>
                    <Input
                      id={`${formId}-composed-subject`}
                      readOnly
                      value={composed.subject}
                      className="font-mono text-xs"
                    />
                  </Field>
                ) : null}
                {composed.body ? (
                  <Field
                    label="Wording to copy"
                    htmlFor={`${formId}-composed-body`}
                    hint="Select it, copy it, and send it from WhatsApp or your own email."
                  >
                    <Textarea
                      id={`${formId}-composed-body`}
                      readOnly
                      rows={8}
                      value={composed.body}
                      className="font-mono text-xs"
                    />
                  </Field>
                ) : null}
              </>
            ) : null}
          </div>
        </Card>
      ) : null}

      {mode === 'create' ? (
        <Card>
          <CardHeader title="What happens next?" />
          <div className="space-y-4 p-4 sm:p-5">
            <Label>
              <Checkbox
                checked={wantsFollowUp}
                onChange={(event) => setWantsFollowUp(event.target.checked)}
              />
              Make a follow-up for this
            </Label>

            {wantsFollowUp ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="What needs doing?"
                  htmlFor={`${formId}-follow-title`}
                  required
                  error={fieldError(state, 'followUpTitle')}
                >
                  <Input
                    id={`${formId}-follow-title`}
                    name="followUpTitle"
                    placeholder="Ring back about the Saturday viewing"
                  />
                </Field>
                <Field label="When?" htmlFor={`${formId}-follow-when`} required>
                  <Input id={`${formId}-follow-when`} name="followUpAt" type="datetime-local" />
                </Field>
              </div>
            ) : (
              <p className="text-[0.6875rem] text-ink-faint">
                A follow-up becomes a real task on somebody&rsquo;s list, not a date in a note.
              </p>
            )}
          </div>
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <SubmitButton tone="primary" size="lg" pendingLabel="Saving…">
          {mode === 'edit' ? 'Save the correction' : 'Record it'}
        </SubmitButton>
        <Link
          href={returnTo ?? '/communications'}
          className="tap inline-flex items-center rounded-lg px-4 text-sm font-medium text-ink-soft hover:bg-paper"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function TemplateForm({
  mode = 'create',
  template,
}: {
  mode?: 'create' | 'edit';
  template?: Template;
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(
    mode === 'edit' ? updateTemplateAction : createTemplateAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5">
      <FormResult state={state} />
      {template ? (
        <>
          <input type="hidden" name="templateId" value={template.id} />
          <input type="hidden" name="rowVersion" value={template.rowVersion} />
        </>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          htmlFor={`${formId}-name`}
          required
          error={fieldError(state, 'name')}
        >
          <Input id={`${formId}-name`} name="name" required defaultValue={template?.name ?? ''} />
        </Field>

        <Field label="What is it for?" htmlFor={`${formId}-category`}>
          <Select
            id={`${formId}-category`}
            name="category"
            defaultValue={template?.category ?? 'general'}
          >
            {templateCategoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Which channel does the wording suit?" htmlFor={`${formId}-channel`}>
          <Select id={`${formId}-channel`} name="channel" defaultValue={template?.channel ?? 'any'}>
            {templateChannelOptions
              .filter((option) =>
                ['any', 'call', 'whatsapp', 'sms', 'email', 'in_person'].includes(option.value),
              )
              .map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </Select>
        </Field>

        <Label>
          <Checkbox name="isActive" value="on" defaultChecked={template?.isActive ?? true} />
          In use
        </Label>

        <Field
          label="Subject"
          htmlFor={`${formId}-subject`}
          className="sm:col-span-2"
          hint="For email. Leave blank for WhatsApp or a call script."
        >
          <Input id={`${formId}-subject`} name="subject" defaultValue={template?.subject ?? ''} />
        </Field>

        <Field
          label="The wording"
          htmlFor={`${formId}-body`}
          required
          className="sm:col-span-2"
          error={fieldError(state, 'body')}
        >
          <Textarea
            id={`${formId}-body`}
            name="body"
            rows={10}
            required
            defaultValue={template?.body ?? ''}
          />
        </Field>
      </div>

      <details className="rounded-lg border border-line-soft p-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          What you can put in curly braces
        </summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {MERGE_FIELDS.map((field) => (
            <li key={field.key} className="text-[0.8125rem]">
              <code className="rounded bg-paper px-1 font-mono text-xs">{`{{${field.key}}}`}</code>{' '}
              <span className="text-ink-soft">{field.label}</span>{' '}
              <span className="text-ink-faint">e.g. {field.example}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[0.6875rem] text-ink-faint">
          Anything the record cannot fill in stays visible as{' '}
          <code className="font-mono">{'{{like_this}}'}</code>, so you can see what is missing
          before you send it.
        </p>
      </details>

      <SubmitButton tone="primary" pendingLabel="Saving…">
        {mode === 'edit' ? 'Save the template' : 'Add the template'}
      </SubmitButton>
    </form>
  );
}

export function TemplatePreview({ template }: { template: Template }) {
  return (
    <div className="p-4 sm:p-5">
      {template.subject ? (
        <p className="text-[0.8125rem] font-medium text-ink">{template.subject}</p>
      ) : null}
      <pre className="mt-1 whitespace-pre-wrap font-sans text-[0.8125rem] text-ink-soft">
        {template.body}
      </pre>
      <p className="mt-2 text-[0.6875rem] text-ink-faint">
        Used {template.timesUsed} time{template.timesUsed === 1 ? '' : 's'}
        {template.isActive ? '' : ' · not in use'}
      </p>
      {!template.isActive ? <Badge>Switched off</Badge> : null}
    </div>
  );
}
