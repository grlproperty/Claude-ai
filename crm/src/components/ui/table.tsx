import * as React from 'react';
import { cn } from '@/lib/cn.ts';

/* =====================================================================
   Tables that stay usable on a phone. The scroll lives inside the table's
   own box, so the page itself never scrolls sideways (spec 101, 139).
   ===================================================================== */

export function TableScroll({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('table-scroll', className)}>{children}</div>;
}

export function Table({ className, ...rest }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full min-w-[38rem] border-collapse text-sm', className)} {...rest} />;
}

export function Th({
  className,
  align,
  ...rest
}: React.ThHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      scope="col"
      className={cn(
        'whitespace-nowrap border-b border-line px-3 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
      {...rest}
    />
  );
}

export function Td({
  className,
  align,
  ...rest
}: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) {
  return (
    <td
      className={cn(
        'border-b border-line-soft px-3 py-2.5 align-middle text-ink',
        align === 'right' ? 'text-right tabular-nums' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
      {...rest}
    />
  );
}

export function Tr({ className, ...rest }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('hover:bg-paper/70', className)} {...rest} />;
}

/** Label/value pairs used across every profile page. */
export function DescriptionList({
  items,
  columns = 2,
  className,
}: {
  items: { label: string; value: React.ReactNode; span?: boolean }[];
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  const grid =
    columns === 1 ? 'sm:grid-cols-1' : columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2';
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3.5', grid, className)}>
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className={cn(item.span && 'sm:col-span-full')}>
          <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-sm text-ink break-words">
            {item.value === null || item.value === undefined || item.value === '' ? (
              <span className="text-ink-faint">Not recorded</span>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
