'use client';

import { useActionState } from 'react';
import { setAppointmentStatusAction } from '../tasks/actions.ts';
import { SubmitButton } from '@/components/ui/form.tsx';
import type { ActionResult } from '@/lib/action-result.ts';
import type { AppointmentStatus } from '@/lib/domain.ts';

export function AppointmentStatusButton({
  appointmentId,
  status,
  label,
}: {
  appointmentId: string;
  status: AppointmentStatus;
  label: string;
}) {
  const [, action] = useActionState<ActionResult | undefined, FormData>(
    setAppointmentStatusAction,
    undefined,
  );
  return (
    <form action={action}>
      <input type="hidden" name="appointmentId" value={appointmentId} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton size="sm" tone={status === 'completed' ? 'primary' : 'quiet'} pendingLabel="…">
        {label}
      </SubmitButton>
    </form>
  );
}
