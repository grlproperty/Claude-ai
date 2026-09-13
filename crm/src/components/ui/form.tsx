'use client';

import * as React from 'react';
import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from './primitives.tsx';
import { Alert, Spinner } from './feedback.tsx';
import type { ActionResult } from '@/lib/action-result.ts';

/* =====================================================================
   Form plumbing shared by every screen.

   Every submit button shows its own pending state, so nobody is ever left
   wondering whether the CRM is working (spec 118), and destructive actions
   always ask first (spec 121).
   ===================================================================== */

export function SubmitButton({
  children,
  pendingLabel,
  ...rest
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || rest.disabled} aria-busy={pending} {...rest}>
      {pending ? (
        <>
          <Spinner className="size-3.5" label="Saving" />
          {pendingLabel ?? 'Working…'}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/**
 * A submit button that asks for confirmation first. Used for archiving,
 * merging, bulk changes, permission withdrawal and commission approval.
 */
export function ConfirmSubmitButton({
  confirm,
  children,
  pendingLabel,
  ...rest
}: ButtonProps & { confirm: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || rest.disabled}
      aria-busy={pending}
      onClick={(event) => {
        if (!window.confirm(confirm)) event.preventDefault();
      }}
      {...rest}
    >
      {pending ? (
        <>
          <Spinner className="size-3.5" label="Working" />
          {pendingLabel ?? 'Working…'}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/** Renders whatever the last submission returned, success or failure. */
export function FormResult({ state }: { state: ActionResult<unknown> | undefined }) {
  if (!state) return null;
  if (state.ok) {
    return state.message ? (
      <Alert tone="ok" className="mb-4">
        {state.message}
      </Alert>
    ) : null;
  }
  return (
    <Alert tone="stop" title="That could not be saved" className="mb-4">
      {state.message}
    </Alert>
  );
}

export function fieldError(
  state: ActionResult<unknown> | undefined,
  field: string,
): string[] | undefined {
  if (!state || state.ok) return undefined;
  return state.fieldErrors?.[field];
}

/** Submits the enclosing form whenever a filter control changes. */
export function AutoSubmit({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      onChange={() => {
        ref.current?.closest('form')?.requestSubmit();
      }}
    >
      {children}
    </div>
  );
}
