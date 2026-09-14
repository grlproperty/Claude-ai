'use client';

import { useActionState } from 'react';
import { cancelTaskAction, completeTaskAction } from './actions.ts';
import { ConfirmSubmitButton, SubmitButton } from '@/components/ui/form.tsx';
import type { ActionResult } from '@/lib/action-result.ts';

/** Ticking a task off, straight from the list. */
export function CompleteTaskButton({ taskId, repeats }: { taskId: string; repeats: boolean }) {
  const [, action] = useActionState<ActionResult | undefined, FormData>(
    completeTaskAction,
    undefined,
  );
  return (
    <form action={action}>
      <input type="hidden" name="taskId" value={taskId} />
      <SubmitButton size="sm" tone="primary" pendingLabel="…">
        {repeats ? 'Done, set the next' : 'Done'}
      </SubmitButton>
    </form>
  );
}

export function CancelTaskButton({ taskId }: { taskId: string }) {
  const [, action] = useActionState<ActionResult | undefined, FormData>(
    cancelTaskAction,
    undefined,
  );
  return (
    <form action={action}>
      <input type="hidden" name="taskId" value={taskId} />
      <ConfirmSubmitButton
        size="sm"
        tone="quiet"
        confirm="Cancel this task? It stays in the history as cancelled."
      >
        Cancel
      </ConfirmSubmitButton>
    </form>
  );
}
