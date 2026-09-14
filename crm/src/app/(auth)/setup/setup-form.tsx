'use client';

import { useActionState } from 'react';
import { setupAction } from '../actions.ts';
import { Field, Input } from '@/components/ui/primitives.tsx';
import { FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import type { ActionResult } from '@/lib/action-result.ts';

export function SetupForm() {
  const [state, action] = useActionState<ActionResult | undefined, FormData>(setupAction, undefined);

  return (
    <form action={action} className="space-y-4">
      <FormResult state={state} />

      <Field label="Your full name" htmlFor="fullName" required error={fieldError(state, 'fullName')}>
        <Input id="fullName" name="fullName" autoComplete="name" required />
      </Field>

      <Field label="Company email address" htmlFor="email" required error={fieldError(state, 'email')}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="name@grproperty.co.za"
        />
      </Field>

      <Field
        label="Choose a password"
        htmlFor="password"
        required
        hint="At least 12 characters. A short phrase you will remember works well."
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

      <SubmitButton tone="primary" full size="lg" pendingLabel="Creating your account…">
        Create the Management account
      </SubmitButton>
    </form>
  );
}
