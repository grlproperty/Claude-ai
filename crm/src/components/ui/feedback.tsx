import * as React from 'react';
import { cn } from '@/lib/cn.ts';
import type { Tone } from './primitives.tsx';

/* =====================================================================
   Loading, empty and result states (spec 118, 119, 120).
   No screen is ever simply blank, and nothing ever reports success that
   did not happen.
   ===================================================================== */

const ALERT_TONES: Record<Tone, string> = {
  neutral: 'border-line bg-paper text-ink',
  brand: 'border-brand-line bg-brand-wash text-brand-dark',
  ok: 'border-ok/25 bg-ok-wash text-ok',
  warn: 'border-warn/25 bg-warn-wash text-warn',
  stop: 'border-stop/25 bg-stop-wash text-stop',
  info: 'border-info/25 bg-info-wash text-info',
};

export function Alert({
  tone = 'neutral',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'stop' ? 'alert' : 'status'}
      className={cn('rounded-lg border px-3.5 py-3 text-sm', ALERT_TONES[tone], className)}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn(title && 'mt-0.5', 'text-[0.8125rem]')}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('px-6 py-12 text-center', className)}>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-[0.8125rem] text-ink-soft">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]',
        className,
      )}
    />
  );
}

/** Skeleton rows for a table or list that is still loading. */
export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2 p-4', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-md bg-line-soft" />
      ))}
    </div>
  );
}

/**
 * The banner shown when an external service is configured but unreachable,
 * or not configured at all. The CRM states what is actually true (spec 115).
 */
export function NotConnected({ service, detail }: { service: string; detail?: string }) {
  return (
    <Alert tone="warn" title={`${service}: NOT CONNECTED`}>
      {detail ?? 'This integration has not been configured, so no data is being exchanged.'}
    </Alert>
  );
}
