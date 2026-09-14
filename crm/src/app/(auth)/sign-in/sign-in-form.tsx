'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signInAction } from '../actions.ts';
import { Field, Input } from '@/components/ui/primitives.tsx';
import { FormResult, SubmitButton, fieldError } from '@/components/ui/form.tsx';
import type { ActionResult } from '@/lib/action-result.ts';

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    signInAction,
    undefined,
  );

  return (
    <form action={action} className="space-y-4">
      {state && !state.ok ? <FormResult state={state} /> : null}
      <input type="hidden" name="next" value={next} />

      <Field label="Company email address" htmlFor="email" required error={fieldError(state, 'email')}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          placeholder="name@grproperty.co.za"
        />
      </Field>

      <Field label="Password" htmlFor="password" required error={fieldError(state, 'password')}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>

      <SubmitButton tone="primary" full size="lg" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>

      <p className="pt-1 text-center text-xs text-ink-faint">
        No account? Access is by invitation from management only.{' '}
        <Link href="/sign-in" className="underline">
          Ask your manager to invite you.
        </Link>
      </p>
    </form>
  );
}
