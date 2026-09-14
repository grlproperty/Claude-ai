import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { COMMISSION_STATUSES } from '@/lib/commission/types.ts';
import { listCommissions } from '@/lib/commission/records.ts';
import { commissionSummary } from '@/lib/commission/reports.ts';
import { statusTone, labelOf } from '@/lib/domain.ts';
import { formatDate, formatMoney, pluralise } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';

export const metadata = { title: 'Commission' };
export const dynamic = 'force-dynamic';

export default async function CommissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; view?: string }>;
}) {
  const user = await requirePermissionOrRedirect('COMMISSION_VIEW', '/commissions');
  const query = await searchParams;
  const unregisteredOnly = query.view === 'unregistered';

  const data = await readAsUser(user.id, async (db) => ({
    commissions: await listCommissions(db, {
      status: query.status && query.status !== 'all' ? query.status : undefined,
      search: query.q || undefined,
      unregisteredOnly,
    }),
    summary: await commissionSummary(db),
  }));

  const { commissions, summary } = data;

  return (
    <>
      <PageHeader
        eyebrow="Commission"
        title="What is owed, and what has been paid"
        description="Worked out, approved and recorded as paid are three different things."
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/commissions/statements">Statements</ButtonLink>
            {user.permissions.has('SETTINGS_ADMIN') ? (
              <ButtonLink href="/commissions/rules">The office terms</ButtonLink>
            ) : null}
          </div>
        }
      />

      {/*
        The honesty statement for this section (spec 115). Commission is the
        one place where a CRM is most tempted to present a figure as money in
        the bank, which is exactly what this refuses to do.
      */}
      <Alert tone="warn" title="No figure here is money in the bank" className="mb-4">
        The CRM is connected to no bank account and to no accounting system. A commission recorded
        as paid is a person&rsquo;s record of a payment, with their name on it — never a
        confirmation. And nothing is earned until the transfer registers: a concluded sale is not a
        registered sale.
      </Alert>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Being worked out"
          value={summary.pipelineExclVat}
          count={summary.pipelineCount}
          hint="Nothing approved. Not income."
        />
        <Stat
          label="Waiting on the deeds office"
          value={summary.awaitingRegistrationExclVat}
          count={summary.awaitingRegistrationCount}
          hint="Approved, but the transfer has not registered."
          tone={summary.awaitingRegistrationCount > 0 ? 'warn' : 'neutral'}
          href="/commissions?view=unregistered"
        />
        <Stat
          label="Due to the office"
          value={summary.dueExclVat}
          count={summary.dueCount}
          hint="Registered and approved, not yet recorded as paid."
        />
        <Stat
          label="Recorded as paid"
          value={summary.recordedPaidExclVat}
          count={summary.recordedPaidCount}
          hint="By a person, not by a bank feed."
          tone="ok"
        />
      </div>

      {summary.waitingForApproval > 0 ? (
        <Alert tone="neutral" className="mb-4">
          {pluralise(summary.waitingForApproval, 'commission')} waiting for somebody to approve.{' '}
          <Link href="/commissions?status=submitted" className="font-medium underline">
            Show them
          </Link>
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title={
            unregisteredOnly
              ? `${pluralise(commissions.length, 'commission')} waiting on registration`
              : pluralise(commissions.length, 'commission')
          }
          actions={
            <form className="flex w-full min-w-0 flex-wrap items-center gap-2" action="/commissions">
              <input
                type="search"
                name="q"
                defaultValue={query.q ?? ''}
                placeholder="Reference, property or transaction"
                aria-label="Search commission"
                className="tap h-9 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm"
              />
              <select
                name="status"
                defaultValue={query.status ?? 'all'}
                aria-label="Which status"
                className="tap h-9 min-w-0 shrink rounded-lg border border-line bg-white px-3 text-sm"
              >
                <option value="all">Any status</option>
                {Object.entries(COMMISSION_STATUSES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="tap h-9 rounded-lg border border-line px-3 text-sm font-medium"
              >
                Apply
              </button>
            </form>
          }
        />

        {commissions.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description="A commission is opened from the transaction or the lease it belongs to."
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {commissions.map((commission) => {
              const waiting =
                Boolean(commission.transactionId) && commission.transactionStatus !== 'registered';
              return (
                <li key={commission.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <Link
                      href={`/commissions/${commission.id}`}
                      className="font-mono font-medium text-ink hover:text-brand"
                    >
                      {commission.commissionRef}
                    </Link>
                    <span className="text-[0.8125rem] text-ink">
                      {commission.propertyLabel ?? commission.propertyRef}
                    </span>
                    <Badge tone={statusTone(commission.status)}>
                      {labelOf(COMMISSION_STATUSES, commission.status)}
                    </Badge>
                    {waiting ? <Badge tone="warn">Not registered</Badge> : null}
                    {commission.isOverridden ? <Badge>Overridden</Badge> : null}
                    {commission.rentalId ? <Badge>Letting</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-[0.6875rem] text-ink-faint">
                    {formatMoney(commission.grossExclVat)} commission
                    {commission.vatApplicable
                      ? ` · ${formatMoney(commission.grossInclVat)} with VAT`
                      : ' · no VAT'}
                    {commission.transactionRef ? ` · ${commission.transactionRef}` : ''}
                    {' · opened '}
                    {formatDate(commission.createdAt)}
                    {commission.createdByName ? ` by ${commission.createdByName}` : ''}
                    {commission.paidOn
                      ? ` · recorded as paid on ${formatDate(commission.paidOn)}`
                      : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

function Stat({
  label,
  value,
  count,
  hint,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: string;
  count: number;
  hint: string;
  tone?: 'neutral' | 'ok' | 'warn';
  href?: string;
}) {
  const body = (
    <>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p
        className={
          tone === 'warn'
            ? 'text-xl font-semibold text-warn'
            : tone === 'ok'
              ? 'text-xl font-semibold text-ok'
              : 'text-xl font-semibold text-ink'
        }
      >
        {formatMoney(value)}
      </p>
      <p className="text-[0.6875rem] text-ink-faint">
        {pluralise(count, 'commission')} · {hint}
      </p>
    </>
  );

  return (
    <Card className="p-4 sm:p-5">
      {href ? (
        <Link href={href} className="block hover:opacity-80">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}
