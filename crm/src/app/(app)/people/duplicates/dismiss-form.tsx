'use client';

import { useActionState } from 'react';
import { dismissDuplicateAction } from '../actions.ts';
import { ConfirmSubmitButton } from '@/components/ui/form.tsx';
import type { ActionResult } from '@/lib/action-result.ts';

export function DismissForm({
  firstId,
  secondId,
  decision,
  label,
  confirm,
}: {
  firstId: string;
  secondId: string;
  decision: 'not_duplicate' | 'review_later';
  label: string;
  confirm: string;
}) {
  const [, action] = useActionState<ActionResult | undefined, FormData>(
    dismissDuplicateAction,
    undefined,
  );
  return (
    <form action={action}>
      <input type="hidden" name="firstId" value={firstId} />
      <input type="hidden" name="secondId" value={secondId} />
      <input type="hidden" name="decision" value={decision} />
      <ConfirmSubmitButton size="sm" confirm={confirm}>
        {label}
      </ConfirmSubmitButton>
    </form>
  );
}
