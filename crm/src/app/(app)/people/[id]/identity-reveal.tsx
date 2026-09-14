'use client';

import { useActionState } from 'react';
import { revealIdentityAction } from '../actions.ts';
import { Button } from '@/components/ui/primitives.tsx';
import { Spinner } from '@/components/ui/feedback.tsx';
import type { ActionResult } from '@/lib/action-result.ts';

/**
 * Reveals a stored identity number to a user who holds PERSON_ID_VIEW.
 *
 * The number is never rendered into the page until it is asked for, and
 * asking for it writes "ID viewed" to the sensitive access log — the log
 * records that it was looked at, never what it said (spec 15, 103).
 */
export function IdentityReveal({
  personId,
  maskedId,
  maskedPassport,
  hasId,
  hasPassport,
}: {
  personId: string;
  maskedId: string;
  maskedPassport: string;
  hasId: boolean;
  hasPassport: boolean;
}) {
  const [state, reveal, pending] = useActionState<
    ActionResult<{ idNumber: string | null; passportNumber: string | null }> | undefined,
    FormData
  >(revealIdentityAction, undefined);

  const revealed = state?.ok ? state.data : undefined;

  return (
    <form action={reveal} className="space-y-2">
      <input type="hidden" name="personId" value={personId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
            South African ID
          </p>
          <p className="font-mono text-sm text-ink">
            {revealed?.idNumber ?? (hasId ? maskedId : 'Not recorded')}
          </p>
        </div>
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
            Passport
          </p>
          <p className="font-mono text-sm text-ink">
            {revealed?.passportNumber ?? (hasPassport ? maskedPassport : 'Not recorded')}
          </p>
        </div>
      </div>

      {state && !state.ok ? <p className="text-xs font-medium text-stop">{state.message}</p> : null}

      {hasId || hasPassport ? (
        revealed ? (
          <p className="text-xs text-ink-faint">
            This view has been recorded in the sensitive access log.
          </p>
        ) : (
          <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
            {pending ? (
              <>
                <Spinner className="size-3.5" /> Revealing…
              </>
            ) : (
              'Reveal and record'
            )}
          </Button>
        )
      ) : null}
    </form>
  );
}
