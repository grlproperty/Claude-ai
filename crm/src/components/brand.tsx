import Link from 'next/link';
import { cn } from '@/lib/cn.ts';

/**
 * The GRLP mark, set typographically. Garden Route Lifestyle Property's
 * artwork is not in this repository, so the CRM uses a clean wordmark in the
 * brand red and Montserrat rather than a placeholder image.
 */
export function Wordmark({
  size = 'md',
  withTagline = false,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  withTagline?: boolean;
  className?: string;
}) {
  const monogram = size === 'lg' ? 'size-11 text-base' : size === 'sm' ? 'size-8 text-[0.7rem]' : 'size-9 text-xs';
  const name = size === 'lg' ? 'text-base' : 'text-[0.8125rem]';

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'grid shrink-0 place-items-center rounded-md bg-brand font-bold tracking-tight text-white',
          monogram,
        )}
        aria-hidden
      >
        GR
      </span>
      <span className="min-w-0 leading-tight">
        <span className={cn('block font-semibold text-ink', name)}>
          {/* The full name needs room; on a phone the initials carry it. */}
          <span className="hidden sm:inline">
            Garden Route <span className="text-brand">Lifestyle Property</span>
          </span>
          <span className="sm:hidden">
            GRL<span className="text-brand">P</span>
          </span>
        </span>
        {withTagline ? (
          <span className="block text-[0.6875rem] italic text-ink-faint">Find your way home.</span>
        ) : (
          <span className="block text-[0.625rem] font-medium uppercase tracking-[0.14em] text-ink-faint">
            CRM
          </span>
        )}
      </span>
    </span>
  );
}

export function WordmarkLink({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('rounded-md', className)} aria-label="GRLP CRM home">
      <Wordmark />
    </Link>
  );
}
