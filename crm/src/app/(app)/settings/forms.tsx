'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import {
  createTagAction,
  inviteUserAction,
  revokeInvitationAction,
  setOverrideAction,
  setSettingAction,
  setTagActiveAction,
  setUserRolesAction,
  setUserStatusAction,
} from './actions.ts';
import { Badge, Checkbox, Field, Input, Label, Select, Textarea } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { ConfirmSubmitButton, FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import { PERMISSIONS, ROLES, ROLE_LABELS } from '@/lib/permissions.ts';
import { TAG_COLOURS } from '@/lib/workspace.ts';
import { USER_STATUSES } from '@/lib/domain.ts';
import type { UserRow } from '@/lib/users.ts';
import type { ActionResult } from '@/lib/action-result.ts';

type State = ActionResult | undefined;
type InviteState = ActionResult<{ link: string }> | undefined;

/**
 * Inviting somebody into a private CRM (spec 7).
 *
 * There is no public registration. This produces a single-use link that
 * the person uses to set their own password, and the CRM says plainly
 * that it has not sent it anywhere.
 */
export function InviteForm() {
  const formId = useId();
  const [state, action] = useActionState<InviteState, FormData>(inviteUserAction, undefined);
  const [origin, setOrigin] = useState('');

  // The link has to be absolute for somebody to paste it into a message,
  // and only the browser knows which address the CRM is being used on.
  useEffect(() => setOrigin(window.location.origin), []);

  const link = state?.ok ? state.data?.link : undefined;

  return (
    <form action={action} className="space-y-4 p-4 sm:p-5">
      <FormResult state={state} />
      <input type="hidden" name="origin" value={origin} />

      {link ? (
        <Alert tone="warn" title="Give them this link yourself">
          <p className="mb-2">
            The CRM has no mail server and has sent nothing. Copy this and pass it on however you
            normally would. It works once, and expires in seven days.
          </p>
          <code className="block break-all rounded bg-white p-2 text-[0.75rem]">{link}</code>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Their full name"
          htmlFor={`${formId}-name`}
          required
          error={fieldError(state, 'fullName')}
        >
          <Input id={`${formId}-name`} name="fullName" required />
        </Field>

        <Field
          label="Company email address"
          htmlFor={`${formId}-email`}
          required
          hint="Only a company address can sign in."
          error={fieldError(state, 'email')}
        >
          <Input
            id={`${formId}-email`}
            name="email"
            type="email"
            required
            placeholder="name@grproperty.co.za"
          />
        </Field>

        <Field label="Role" htmlFor={`${formId}-role`} required error={fieldError(state, 'role')}>
          <Select id={`${formId}-role`} name="role" defaultValue="AGENT">
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Job title" htmlFor={`${formId}-title`}>
          <Input id={`${formId}-title`} name="jobTitle" />
        </Field>
      </div>

      <SubmitButton tone="primary" size="lg" pendingLabel="Creating the link…">
        Create an invitation link
      </SubmitButton>
    </form>
  );
}

export function RevokeInvitationButton({ id, email }: { id: string; email: string }) {
  const [, action] = useActionState<State, FormData>(revokeInvitationAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="invitationId" value={id} />
      <ConfirmSubmitButton
        size="sm"
        pendingLabel="…"
        confirm={`Cancel the invitation to ${email}? The link stops working.`}
      >
        Cancel it
      </ConfirmSubmitButton>
    </form>
  );
}

/** Somebody's roles, status and any exception to what their role allows. */
export function UserPanel({ user, isSelf }: { user: UserRow; isSelf: boolean }) {
  const formId = useId();
  const [rolesState, saveRoles] = useActionState<State, FormData>(setUserRolesAction, undefined);
  const [statusState, saveStatus] = useActionState<State, FormData>(
    setUserStatusAction,
    undefined,
  );
  const [overrideState, saveOverride] = useActionState<State, FormData>(
    setOverrideAction,
    undefined,
  );
  const [open, setOpen] = useState(false);

  const held = new Set(user.roles.map((role) => role.code));

  return (
    <div className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-medium text-ink">
            {user.fullName}
            {user.displayName && user.displayName !== user.fullName
              ? ` (${user.displayName})`
              : ''}
          </p>
          <p className="text-[0.6875rem] text-ink-faint">
            {user.email}
            {user.jobTitle ? ` · ${user.jobTitle}` : ''}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1">
            <Badge tone={user.status === 'active' ? 'ok' : user.status === 'invited' ? 'warn' : 'stop'}>
              {USER_STATUSES[user.status]}
            </Badge>
            {user.roles.map((role) => (
              <Badge key={role.code}>{role.label}</Badge>
            ))}
            {user.lockedUntil ? <Badge tone="stop">Locked</Badge> : null}
            {user.overrides.map((override) => (
              <Badge key={override.permission} tone={override.allowed ? 'info' : 'stop'}>
                {override.allowed ? '+' : '−'}
                {override.permission}
              </Badge>
            ))}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="tap inline-flex h-9 items-center rounded-lg border border-line px-3 text-sm font-medium"
        >
          {open ? 'Close' : 'Change'}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-4 border-t border-line-soft pt-4">
          <FormResult state={rolesState} />
          <FormResult state={statusState} />
          <FormResult state={overrideState} />

          <form action={saveRoles} className="space-y-2">
            <input type="hidden" name="userId" value={user.id} />
            <Label>Roles</Label>
            <div className="flex flex-wrap gap-3">
              {ROLES.map((role) => (
                <Label key={role} className="text-[0.8125rem]">
                  <Checkbox name="roles" value={role} defaultChecked={held.has(role)} />
                  {ROLE_LABELS[role]}
                </Label>
              ))}
            </div>
            <SubmitButton size="sm" pendingLabel="Saving…">
              Save roles
            </SubmitButton>
          </form>

          <form action={saveStatus} className="grid gap-2 border-t border-line-soft pt-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
            <input type="hidden" name="userId" value={user.id} />
            <Field label="Account" htmlFor={`${formId}-status`}>
              <Select id={`${formId}-status`} name="status" defaultValue={user.status}>
                {Object.entries(USER_STATUSES)
                  .filter(([value]) => value !== 'invited')
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Why?" htmlFor={`${formId}-reason`}>
              <Input id={`${formId}-reason`} name="reason" placeholder="Left the company" />
            </Field>
            <ConfirmSubmitButton
              size="sm"
              pendingLabel="Saving…"
              confirm={
                isSelf
                  ? 'You cannot suspend your own account. Continue anyway?'
                  : `Change ${user.fullName}'s account? Nothing they did is deleted, but any change away from active signs them out everywhere.`
              }
            >
              Save
            </ConfirmSubmitButton>
          </form>

          <form action={saveOverride} className="space-y-2 border-t border-line-soft pt-4">
            <input type="hidden" name="userId" value={user.id} />
            <Alert tone="neutral">
              An exception to what their role allows. Used sparingly: every one of these shows on
              their row above, because they get granted for an afternoon and forgotten for years.
            </Alert>
            <div className="grid gap-2 sm:grid-cols-[1fr_10rem_1fr_auto] sm:items-end">
              <Field label="Permission" htmlFor={`${formId}-permission`}>
                <Select id={`${formId}-permission`} name="permission" defaultValue="">
                  <option value="">Choose one</option>
                  {PERMISSIONS.map((permission) => (
                    <option key={permission} value={permission}>
                      {permission}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Decision" htmlFor={`${formId}-decision`}>
                <Select id={`${formId}-decision`} name="decision" defaultValue="grant">
                  <option value="grant">Allow it</option>
                  <option value="deny">Refuse it</option>
                  <option value="clear">Back to their role</option>
                </Select>
              </Field>
              <Field label="Why?" htmlFor={`${formId}-override-reason`}>
                <Input id={`${formId}-override-reason`} name="reason" />
              </Field>
              <SubmitButton size="sm" pendingLabel="Saving…">
                Apply
              </SubmitButton>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One business value.
 *
 * The kind is declared by the page rather than sniffed from the text, so
 * a setting that should be a number cannot quietly become the string
 * "15" and break arithmetic somewhere else.
 */
export function SettingRow({
  settingKey,
  label,
  description,
  value,
  kind,
}: {
  settingKey: string;
  label: string;
  description: string | null;
  value: unknown;
  kind: 'text' | 'number' | 'boolean' | 'json';
}) {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(setSettingAction, undefined);

  const current =
    kind === 'json'
      ? JSON.stringify(value)
      : value === null || value === undefined
        ? ''
        : String(value);

  return (
    <form action={action} className="p-4 sm:p-5">
      {state ? <FormResult state={state} /> : null}
      <input type="hidden" name="key" value={settingKey} />
      <input type="hidden" name="kind" value={kind} />

      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="min-w-0">
          <Label htmlFor={`${formId}-value`}>{label}</Label>
          {description ? (
            <p className="mb-1.5 text-[0.6875rem] text-ink-faint">{description}</p>
          ) : null}
          <p className="mb-1 font-mono text-[0.625rem] text-ink-faint">{settingKey}</p>

          {kind === 'boolean' ? (
            <Label className="text-[0.8125rem]">
              <Checkbox name="value" value="on" defaultChecked={value === true} />
              On
            </Label>
          ) : kind === 'json' ? (
            <Textarea id={`${formId}-value`} name="value" rows={2} defaultValue={current} />
          ) : (
            <Input
              id={`${formId}-value`}
              name="value"
              inputMode={kind === 'number' ? 'decimal' : 'text'}
              defaultValue={current}
            />
          )}
        </div>
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save
        </SubmitButton>
      </div>
    </form>
  );
}

export function TagForm() {
  const formId = useId();
  const [state, action] = useActionState<State, FormData>(createTagAction, undefined);

  return (
    <form action={action} className="space-y-3 p-4 sm:p-5">
      <FormResult state={state} />
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <Field label="Tag name" htmlFor={`${formId}-name`} required error={fieldError(state, 'name')}>
          <Input id={`${formId}-name`} name="name" required placeholder="Cash buyer" />
        </Field>
        <Field label="Colour" htmlFor={`${formId}-colour`}>
          <Select id={`${formId}-colour`} name="colour" defaultValue="neutral">
            {TAG_COLOURS.map((colour) => (
              <option key={colour} value={colour}>
                {colour}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton pendingLabel="Adding…">Add the tag</SubmitButton>
      </div>
    </form>
  );
}

export function TagActiveButton({
  tagId,
  name,
  isActive,
  useCount,
}: {
  tagId: string;
  name: string;
  isActive: boolean;
  useCount: number;
}) {
  const [, action] = useActionState<State, FormData>(setTagActiveAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="tagId" value={tagId} />
      <input type="hidden" name="isActive" value={isActive ? 'false' : 'on'} />
      <ConfirmSubmitButton
        size="sm"
        pendingLabel="…"
        confirm={
          isActive
            ? `Retire "${name}"? It stays on ${useCount} record(s) that already carry it and simply stops being offered.`
            : `Offer "${name}" again?`
        }
      >
        {isActive ? 'Retire' : 'Bring back'}
      </ConfirmSubmitButton>
    </form>
  );
}
