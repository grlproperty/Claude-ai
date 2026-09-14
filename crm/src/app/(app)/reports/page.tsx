import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import {
  activityReport,
  leadOutcomes,
  leadsBySource,
  propertyReport,
  salesReport,
} from '@/lib/reports.ts';
import { commissionSummary, earningsByAgent } from '@/lib/commission/reports.ts';
import { COMMUNICATION_CHANNELS, LEAD_STATUSES, PROPERTY_STATUSES, MANDATE_STATUSES, PROPERTY_TYPES, labelOf } from '@/lib/domain.ts';
import { formatMoney, pluralise } from '@/lib/format.ts';
import { ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/table.tsx';

export const metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

/**
 * Reports (spec 95, 141).
 *
 * Each figure names the status it counted, and concluded is never added
 * to registered: the first is a deal that may still fall over, the second
 * is a transfer that happened (spec 49).
 *
 * Row level security narrows everything to what the reader may see, so an
 * agent's report is their own book of business without a filter anywhere
 * in this file.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const user = await requirePermissionOrRedirect('REPORTS_VIEW', '/reports');

  const data = await readAsUser(user.id, async (db) => ({
    sales: await salesReport(db, from, to),
    sources: await leadsBySource(db, from, to),
    outcomes: await leadOutcomes(db, from, to),
    properties: await propertyReport(db),
    activity: await activityReport(db, from, to),
    commission: user.permissions.has('COMMISSION_VIEW')
      ? {
          summary: await commissionSummary(db),
          byAgent: await earningsByAgent(db, { from, to }),
        }
      : null,
  }));

  const { sales, sources, outcomes, properties, activity, commission } = data;
  const canExport = user.permissions.has('REPORTS_EXPORT');

  return (
    <>
      <PageHeader
        eyebrow="Reports"
        title="What the office actually did"
        description="Counted from the records. Every figure names the status behind it."
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/reports/data-quality">Data quality</ButtonLink>
            {user.permissions.has('AUDIT_LOG_VIEW') ? (
              <ButtonLink href="/reports/exports">Export log</ButtonLink>
            ) : null}
          </div>
        }
      />

      <Alert tone="neutral" title="Concluded is not registered" className="mb-4">
        A concluded sale is a deal that may still fall over; a registered sale is a transfer that
        happened. They are counted separately everywhere on this page and never added together.
      </Alert>

      <form className="mb-4 flex flex-wrap items-end gap-2" action="/reports">
        <label className="text-[0.8125rem]">
          <span className="mb-1 block font-medium text-ink-soft">From</span>
          <input
            type="date"
            name="from"
            defaultValue={from ?? ''}
            className="tap h-9 rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>
        <label className="text-[0.8125rem]">
          <span className="mb-1 block font-medium text-ink-soft">To</span>
          <input
            type="date"
            name="to"
            defaultValue={to ?? ''}
            className="tap h-9 rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          className="tap h-9 rounded-lg border border-line px-3 text-sm font-medium"
        >
          Apply
        </button>
        {from || to ? (
          <Link
            href="/reports"
            className="tap inline-flex h-9 items-center px-2 text-sm font-medium text-ink-soft hover:text-brand"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <div className="space-y-4">
        {/* ---------------- Sales ---------------- */}
        <Card>
          <CardHeader
            title="Sales"
            description="Concluded and registered counted apart, as they must be."
            actions={
              canExport ? (
                <ButtonLink
                  href={`/api/export/sales${from || to ? `?from=${from ?? ''}&to=${to ?? ''}` : ''}`}
                  size="sm"
                >
                  Export CSV
                </ButtonLink>
              ) : null
            }
          />
          <dl className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
            <Stat
              label="Concluded"
              value={formatMoney(sales.concluded.value)}
              hint={`${pluralise(sales.concluded.count, 'sale')} · not yet registered, so not turnover`}
              tone="warn"
            />
            <Stat
              label="Registered"
              value={formatMoney(sales.registered.value)}
              hint={`${pluralise(sales.registered.count, 'sale')} · transfer happened`}
              tone="ok"
            />
            <Stat
              label="Cancelled or failed"
              value={formatMoney(sales.failed.value)}
              hint={pluralise(sales.failed.count, 'deal')}
              tone="stop"
            />
          </dl>
          {sales.byAgent.length > 0 ? (
            <TableScroll>
              <Table className="min-w-[32rem]">
                <thead>
                  <tr>
                    <Th>Agent</Th>
                    <Th align="right">Concluded</Th>
                    <Th align="right">Registered</Th>
                    <Th align="right">Registered value</Th>
                  </tr>
                </thead>
                <tbody>
                  {sales.byAgent.map((row) => (
                    <Tr key={row.agentName}>
                      <Td className="text-[0.8125rem]">{row.agentName}</Td>
                      <Td align="right" className="text-[0.8125rem] tabular-nums">
                        {row.concluded}
                      </Td>
                      <Td align="right" className="text-[0.8125rem] tabular-nums">
                        {row.registered}
                      </Td>
                      <Td align="right" className="text-[0.8125rem] tabular-nums">
                        {formatMoney(row.value)}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
          ) : (
            <EmptyState title="No sales in this period" className="py-6" />
          )}
        </Card>

        {/* ---------------- Leads ---------------- */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader
              title="Where leads came from"
              description="The only honest measure of what marketing is working."
            />
            <Bars rows={sources} />
          </Card>

          <Card className="min-w-0">
            <CardHeader
              title="What happened to them"
              description={
                outcomes.conversionRate === null
                  ? 'Nothing has been decided yet, so there is no conversion rate to show.'
                  : `${outcomes.conversionRate}% of decided leads were won.`
              }
            />
            <Bars
              rows={outcomes.byStatus.map((row) => ({
                label: labelOf(LEAD_STATUSES, row.label),
                count: row.count,
              }))}
            />
            {outcomes.lossReasons.length > 0 ? (
              <div className="border-t border-line-soft">
                <p className="px-4 pt-3 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint sm:px-5">
                  Why leads were lost
                </p>
                <Bars rows={outcomes.lossReasons} />
              </div>
            ) : null}
          </Card>
        </div>

        {/* ---------------- Properties ---------------- */}
        <Card>
          <CardHeader
            title="Properties"
            description="Property status and mandate status are different facts, so they are counted separately."
            actions={
              canExport ? (
                <ButtonLink href="/api/export/properties" size="sm">
                  Export CSV
                </ButtonLink>
              ) : null
            }
          />
          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                By property status
              </p>
              <Bars
                bare
                rows={properties.byStatus.map((row) => ({
                  label: labelOf(PROPERTY_STATUSES, row.label),
                  count: row.count,
                }))}
              />
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                By mandate status
              </p>
              <Bars
                bare
                rows={properties.mandates.map((row) => ({
                  label: labelOf(MANDATE_STATUSES, row.label),
                  count: row.count,
                }))}
              />
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                By kind
              </p>
              <Bars
                bare
                rows={properties.byType.map((row) => ({
                  label: labelOf(PROPERTY_TYPES, row.label),
                  count: row.count,
                }))}
              />
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                By suburb
              </p>
              <Bars bare rows={properties.byArea.slice(0, 10)} />
            </div>
          </div>
        </Card>

        {/* ---------------- Activity ---------------- */}
        <Card>
          <CardHeader
            title="Activity"
            description="Conversations somebody wrote down, and viewings that happened. The CRM sent none of them."
          />
          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                Conversations by channel
              </p>
              <Bars
                bare
                rows={activity.communications.map((row) => ({
                  label: labelOf(COMMUNICATION_CHANNELS, row.label),
                  count: row.count,
                }))}
              />
              <p className="mt-2 text-[0.6875rem] text-ink-faint">
                {pluralise(activity.viewings, 'viewing')} recorded in this period.
              </p>
            </div>
            <div className="min-w-0">
              <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                Conversations by agent
              </p>
              <Bars
                bare
                rows={activity.byAgent.map((row) => ({
                  label: row.agentName,
                  count: row.conversations,
                }))}
              />
            </div>
          </div>
        </Card>

        {/* ---------------- Commission ---------------- */}
        {commission ? (
          <Card>
            <CardHeader
              title="Commission"
              description="Worked out, awaiting registration, due and recorded as paid. Never one total."
              actions={<ButtonLink href="/commissions/statements" size="sm">Statements</ButtonLink>}
            />
            <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
              <Stat
                label="Being worked out"
                value={formatMoney(commission.summary.pipelineExclVat)}
                hint={pluralise(commission.summary.pipelineCount, 'commission')}
              />
              <Stat
                label="Waiting on registration"
                value={formatMoney(commission.summary.awaitingRegistrationExclVat)}
                hint="Approved, but not earned yet"
                tone="warn"
              />
              <Stat
                label="Due to the office"
                value={formatMoney(commission.summary.dueExclVat)}
                hint="Registered and approved"
              />
              <Stat
                label="Recorded as paid"
                value={formatMoney(commission.summary.recordedPaidExclVat)}
                hint="By a person, not a bank feed"
                tone="ok"
              />
            </dl>
            {commission.byAgent.length > 0 ? (
              <TableScroll>
                <Table className="min-w-[34rem]">
                  <thead>
                    <tr>
                      <Th>Who</Th>
                      <Th align="right">Being worked out</Th>
                      <Th align="right">Approved</Th>
                      <Th align="right">Recorded paid</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {commission.byAgent.map((row) => (
                      <Tr key={row.agentId ?? row.agentName}>
                        <Td className="text-[0.8125rem]">{row.agentName}</Td>
                        <Td align="right" className="text-[0.8125rem] tabular-nums">
                          {formatMoney(row.pipeline)}
                        </Td>
                        <Td align="right" className="text-[0.8125rem] tabular-nums">
                          {formatMoney(row.approved)}
                        </Td>
                        <Td align="right" className="text-[0.8125rem] tabular-nums">
                          {formatMoney(row.recordedPaid)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableScroll>
            ) : null}
          </Card>
        ) : null}
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'stop';
}) {
  const colour =
    tone === 'warn'
      ? 'text-warn'
      : tone === 'ok'
        ? 'text-ok'
        : tone === 'stop'
          ? 'text-stop'
          : 'text-ink';
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </dt>
      <dd className={`text-xl font-semibold ${colour}`}>{value}</dd>
      <dd className="text-[0.6875rem] text-ink-faint">{hint}</dd>
    </div>
  );
}

/**
 * A count, as a bar.
 *
 * Drawn with a div rather than a chart library, because the whole point is
 * the number beside the label; the bar is only there to make the biggest
 * one obvious at a glance.
 */
function Bars({
  rows,
  bare = false,
}: {
  rows: { label: string; count: number }[];
  bare?: boolean;
}) {
  if (rows.length === 0) {
    return bare ? (
      <p className="text-[0.8125rem] text-ink-faint">Nothing recorded.</p>
    ) : (
      <EmptyState title="Nothing recorded" className="py-6" />
    );
  }

  const highest = Math.max(...rows.map((row) => row.count), 1);

  return (
    <ul className={bare ? 'space-y-1.5' : 'space-y-1.5 p-4 sm:p-5'}>
      {rows.map((row) => (
        <li key={row.label}>
          <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
            <span className="min-w-0 truncate text-ink">{row.label}</span>
            <span className="tabular-nums font-medium text-ink">{row.count}</span>
          </div>
          <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded bg-paper">
            <div
              className="h-full rounded bg-brand"
              style={{ width: `${Math.max(2, Math.round((row.count / highest) * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
