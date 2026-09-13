'use client';

import { useActionState } from 'react';
import { acceptInvitationAction } from '../../actions.ts';
import { Field, Input } from '@/components/ui/primitives.tsx';
import { FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import type { ActionResult } from '@/lib/action-result.ts';

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    acceptInvitationAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      <FormResult state={state} />
      <input type="hidden" name="token" value={token} />

      <Field
        label="Choose a password"
        htmlFor="password"
        required
        hint="At least 12 characters. Only you will ever know it."
        error={fieldError(state, 'password')}
      >
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>

      <Field
        label="Confirm password"
        htmlFor="confirmPassword"
        required
        error={fieldError(state, 'confirmPassword')}
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <SubmitButton tone="primary" full size="lg" pendingLabel="Setting up your account…">
        Set my password and sign in
      </SubmitButton>
    </form>
  );
}
