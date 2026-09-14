'use client';

import { useActionState } from 'react';
import { markAllReadAction, markReadAction } from './actions.ts';
import { SubmitButton } from '@/components/ui/form.tsx';
import type { ActionResult } from '@/lib/action-result.ts';

type State = ActionResult | undefined;

export function MarkReadButton({ id }: { id: string }) {
  const [, action] = useActionState<State, FormData>(markReadAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton size="sm" pendingLabel="…">
        Mark as read
      </SubmitButton>
    </form>
  );
}

export function MarkAllReadButton() {
  const [, action] = useActionState<State, FormData>(markAllReadAction, undefined);
  return (
    <form action={action}>
      <SubmitButton size="sm" pendingLabel="…">
        Mark all as read
      </SubmitButton>
    </form>
  );
}
