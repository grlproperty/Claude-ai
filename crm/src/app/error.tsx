'use client';

import { useEffect } from 'react';
import { Card, Button } from '@/components/ui/primitives.tsx';

/**
 * Staff see plain language; the technical detail stays in the server log
 * (spec 117). The digest is shown only so that a report can be traced.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <Card className="p-6">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Nothing was saved. Please try again. If it keeps happening, let management know and
          quote the reference below.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-ink-faint">Reference: {error.digest}</p>
        ) : null}
        <Button tone="primary" className="mt-4" onClick={reset}>
          Try again
        </Button>
      </Card>
    </div>
  );
}
