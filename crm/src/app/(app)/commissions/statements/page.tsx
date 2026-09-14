import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listAgents } from '@/lib/people/queries.ts';
import { COMMISSION_STATUSES, SPLIT_ROLES } from '@/lib/commission/types.ts';
import { earningsByAgent, statementFor } from '@/lib/commission/reports.ts';
import { labelOf, statusTone } from '@/lib/domain.ts';
import { formatDate, formatMoney } from '@/lib/format.ts';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/table.tsx';

export const metadata = { title: 'Commission statements' };
export const dynamic = 'force-dynamic';

/**
 * Statements (spec 66).
 *
 * An agent sees their own. Management sees everybody's, because they hold
 * DATA_VIEW_ALL; without it row level security has already removed every
 * other agent's share before any of this runs.
 */
export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ agentId?: string; from?: string; to?: string }>;
}) {
  const query = await searchParams;
  const user = await requirePermissionOrRedirect('COMMISSION_VIEW', '/commissions/statements');

  const seesEverybody = user.permissions.has('DATA_VIEW_ALL');
  const agentId = seesEverybody ? (query.agentId ?? user.id) : user.id;

  const data = await readAsUser(user.id, async (db) => ({
    earnings: await earningsByAgent(db, { from: query.from, to: query.to }),
    statement: await statementFor(db, agentId, { from: query.from, to: query.to }),
    agents: seesEverybody ? await listAgents(db) : [],
  }));

  const { earnings, statement, agents } = data;
  const whose = agents.find((agent) => agent.id === agentId)?.name ?? 'You';

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/commissions">Commission</Link>}
        title="Statements"
        description="What each share comes to, kept apart by where the deal has got to."
      />

      <Alert tone="warn" title="A share is not a payment" className="mb-4">
        Approved means somebody approved the figure. Recorded as paid means somebody wrote down
        that a payment was made. The CRM is connected to no bank and to no payroll, so neither is
        a confirmation that money reached anybody.
      </Alert>

      <form className="mb-4 flex flex-wrap items-end gap-2" action="/commissions/statements">
        {seesEverybody ? (
          <label className="text-[0.8125rem]">
            <span className="mb-1 block font-medium text-ink-soft">Whose statement</span>
            <select
              name="agentId"
              defaultValue={agentId}
              className="tap h-9 rounded-lg border border-line bg-white px-3 text-sm"
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-[0.8125rem]">
          <span className="mb-1 block font-medium text-ink-soft">From</span>
          <input
            type="date"
            name="from"
            defaultValue={query.from ?? ''}
            className="tap h-9 rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>
        <label className="text-[0.8125rem]">
          <span className="mb-1 block font-medium text-ink-soft">To</span>
          <input
            type="date"
            name="to"
            defaultValue={query.to ?? ''}
            className="tap h-9 rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          className="tap h-9 rounded-lg border border-line px-3 text-sm font-medium"
        >
          Apply
        </button>
      </form>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={`${whose === 'You' ? 'Your' : `${whose}'s`} statement`}
            description="Every deal their share is on."
          />
          {statement.lines.length === 0 ? (
            <EmptyState title="Nothing on this statement" className="py-8" />
          ) : (
            <TableScroll>
              <Table className="min-w-[44rem]">
                <thead>
                  <tr>
                    <Th>Commission</Th>
                    <Th>Property</Th>
                    <Th>Where it stands</Th>
                    <Th align="right">Share</Th>
                    <Th align="right">Amount</Th>
                  </tr>
                </thead>
                <tbody>
                  {statement.lines.map((line) => (
                    <Tr key={line.commissionId}>
                      <Td>
                        <Link
                          href={`/commissions/${line.commissionId}`}
                          className="font-mono text-[0.8125rem] font-medium text-ink hover:text-brand"
                        >
                          {line.commissionRef}
                        </Link>
                        <div className="text-[0.6875rem] text-ink-faint">
                          {labelOf(SPLIT_ROLES, line.role)}
                        </div>
                      </Td>
                      <Td className="text-[0.8125rem]">
                        {line.propertyLabel ?? line.propertyRef}
                        {line.transactionRef ? (
                          <div className="text-[0.6875rem] text-ink-faint">
                            {line.transactionRef}
                          </div>
                        ) : null}
                      </Td>
                      <Td className="text-[0.8125rem]">
                        <Badge tone={statusTone(line.status)}>
                          {labelOf(COMMISSION_STATUSES, line.status)}
                        </Badge>
                        {line.registered ? null : <Badge tone="warn">Not registered</Badge>}
                        {line.paidOn ? (
                          <div className="text-[0.6875rem] text-ink-faint">
                            recorded paid {formatDate(line.paidOn)}
                          </div>
                        ) : null}
                      </Td>
                      <Td align="right" className="text-[0.8125rem] tabular-nums">
                        {Number(line.sharePercent)}%
                      </Td>
                      <Td align="right" className="text-[0.8125rem] font-medium tabular-nums">
                        {formatMoney(line.amount, { decimals: true })}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
          )}
          <dl className="grid gap-3 border-t border-line-soft p-4 sm:grid-cols-3 sm:p-5">
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-wide text-ink-faint">
                Being worked out
              </dt>
              <dd className="text-lg font-semibold text-ink">
                {formatMoney(statement.totals.pipeline)}
              </dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-wide text-ink-faint">
                Approved, not yet paid
              </dt>
              <dd className="text-lg font-semibold text-ink">
                {formatMoney(statement.totals.approved)}
              </dd>
            </div>
            <div>
              <dt className="text-[0.6875rem] uppercase tracking-wide text-ink-faint">
                Recorded as paid
              </dt>
              <dd className="text-lg font-semibold text-ok">
                {formatMoney(statement.totals.recordedPaid)}
              </dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader
            title="Everybody's shares"
            description={
              seesEverybody
                ? 'Including the office itself.'
                : 'Only your own, because that is all you may see.'
            }
          />
          {earnings.length === 0 ? (
            <EmptyState title="Nothing to add up" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {earnings.map((line) => (
                <li key={line.agentId ?? line.agentName} className="px-4 py-2.5 sm:px-5">
                  <p className="text-[0.8125rem] font-medium text-ink">{line.agentName}</p>
                  <p className="text-[0.6875rem] text-ink-faint">
                    {formatMoney(line.recordedPaid)} recorded paid ·{' '}
                    {formatMoney(line.approved)} approved · {formatMoney(line.pipeline)} being
                    worked out
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
