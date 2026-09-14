import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { getAgentFilter } from '@/lib/session.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { leadStatistics, listLeadSources, listLeads, type LeadFilters } from '@/lib/leads.ts';
import { listAgents } from '@/lib/people/queries.ts';
import {
  BUSINESS_AREAS,
  LEAD_STATUSES,
  LEAD_TYPES,
  businessAreaOptions,
  labelOf,
  leadStatusOptions,
  leadTypeOptions,
  statusTone,
} from '@/lib/domain.ts';
import { formatMoney, formatShortDate, isOverdue, pluralise, relativeTime } from '@/lib/format.ts';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Input,
  PageHeader,
  Select,
} from '@/components/ui/primitives.tsx';
import { EmptyState } from '@/components/ui/feedback.tsx';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/table.tsx';
import { QuickActions } from '@/components/quick-actions.tsx';
import { Icon } from '@/components/icons.tsx';

export const metadata = { title: 'Leads' };
export const dynamic = 'force-dynamic';

type Search = Record<string, string | undefined>;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermissionOrRedirect('LEADS_VIEW', '/leads');
  const params = await searchParams;
  const agentFilter = await getAgentFilter(user);

  const filters: LeadFilters = {
    query: params.q ?? '',
    businessArea: params.businessArea ?? 'all',
    leadType: params.leadType ?? 'all',
    status: params.status ?? 'all',
    openOnly: params.status === undefined || params.status === 'open',
    sourceId: params.source || undefined,
    tagId: params.tag || undefined,
    followUp: (params.followUp as LeadFilters['followUp']) ?? 'all',
    archived: (params.archived as LeadFilters['archived']) ?? 'active',
    sort: (params.sort as LeadFilters['sort']) ?? 'recent',
    agentId: params.agent ?? agentFilter,
    page: Number(params.page ?? 1) || 1,
  };
  if (filters.status === 'open' || filters.status === 'all') filters.status = 'all';

  const { rows, total, page, pageSize } = await readAsUser(user.id, (db) => listLeads(db, filters));
  const { agents, sources, stats } = await readAsUser(user.id, async (db) => ({
    agents: user.permissions.has('DATA_VIEW_ALL') ? await listAgents(db) : [],
    sources: await listLeadSources(db),
    stats: await leadStatistics(db, { agentId: filters.agentId ?? null }),
  }));

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        eyebrow="Leads"
        title="Enquiries"
        description="Every enquiry, who is on it, and what happens next."
        actions={
          user.permissions.has('LEADS_CREATE') ? (
            <ButtonLink href="/leads/new" tone="primary">
              <Icon.plus className="size-4" />
              Add lead
            </ButtonLink>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
            Live leads
          </p>
          <p className="text-2xl font-semibold text-ink">
            {stats.total - stats.won - stats.lost}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
            Won
          </p>
          <p className="text-2xl font-semibold text-ok">{stats.won}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
            Lost
          </p>
          <p className="text-2xl font-semibold text-stop">{stats.lost}</p>
          {stats.byLossReason[0] ? (
            <p className="text-[0.6875rem] text-ink-faint">
              Most common: {stats.byLossReason[0].reason}
            </p>
          ) : null}
        </Card>
      </div>

      <Card className="mb-4 p-3 sm:p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Search
            </span>
            <Input
              type="search"
              name="q"
              defaultValue={filters.query}
              placeholder="Name, property or what they asked for"
            />
          </label>
          <label>
            <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Business area
            </span>
            <Select name="businessArea" defaultValue={filters.businessArea}>
              <option value="all">All</option>
              {businessAreaOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Lead type
            </span>
            <Select name="leadType" defaultValue={filters.leadType}>
              <option value="all">All</option>
              {leadTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Status
            </span>
            <Select name="status" defaultValue={params.status ?? 'open'}>
              <option value="open">Still live</option>
              <option value="all">All</option>
              {leadStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Source
            </span>
            <Select name="source" defaultValue={params.source ?? ''}>
              <option value="">All</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </Select>
          </label>
          {agents.length > 0 ? (
            <label>
              <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                Agent
              </span>
              <Select name="agent" defaultValue={params.agent ?? ''}>
                <option value="">{agentFilter ? 'Agent view setting' : 'All agents'}</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </Select>
            </label>
          ) : null}
          <label>
            <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Follow-up
            </span>
            <Select name="followUp" defaultValue={filters.followUp}>
              <option value="all">Any</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="none">No next action</option>
            </Select>
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" tone="primary">
              Apply
            </Button>
            <ButtonLink href="/leads" tone="quiet">
              Clear
            </ButtonLink>
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
          <p className="text-xs text-ink-soft">
            {total === 0 ? 'No leads match these filters' : pluralise(total, 'lead')}
          </p>
          {lastPage > 1 ? (
            <p className="text-xs text-ink-faint">
              Page {page} of {lastPage}
            </p>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No leads match these filters"
            description="When an enquiry comes in, record it here so it does not live in somebody's inbox."
            action={
              user.permissions.has('LEADS_CREATE') ? (
                <ButtonLink href="/leads/new" tone="primary">
                  Add lead
                </ButtonLink>
              ) : null
            }
          />
        ) : (
          <>
            <TableScroll className="hidden md:block">
              <Table className="min-w-[52rem]">
                <thead>
                  <tr>
                    <Th>Person</Th>
                    <Th>Type</Th>
                    <Th>Status</Th>
                    <Th>Source</Th>
                    <Th align="right">Budget</Th>
                    <Th>Agent</Th>
                    <Th>Next follow-up</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((lead) => (
                    <Tr key={lead.id}>
                      <Td>
                        <Link href={`/leads/${lead.id}`} className="font-medium text-ink hover:text-brand">
                          {lead.personName ?? 'Not linked to a person yet'}
                        </Link>
                        {lead.personRef ? (
                          <div className="font-mono text-[0.6875rem] text-ink-faint">
                            {lead.personRef}
                          </div>
                        ) : null}
                        {lead.propertyAddress ? (
                          <div className="text-[0.6875rem] text-ink-faint">
                            {lead.propertyAddress}
                          </div>
                        ) : null}
                      </Td>
                      <Td>
                        <div className="text-[0.8125rem]">{labelOf(LEAD_TYPES, lead.leadType)}</div>
                        <div className="text-[0.6875rem] text-ink-faint">
                          {labelOf(BUSINESS_AREAS, lead.businessArea)}
                        </div>
                      </Td>
                      <Td>
                        <Badge tone={statusTone(lead.status)}>
                          {labelOf(LEAD_STATUSES, lead.status)}
                        </Badge>
                        {lead.lossReasonName ? (
                          <div className="mt-0.5 text-[0.6875rem] text-ink-faint">
                            {lead.lossReasonName}
                          </div>
                        ) : null}
                      </Td>
                      <Td className="text-[0.8125rem]">{lead.sourceName ?? '—'}</Td>
                      <Td align="right" className="text-[0.8125rem]">
                        {lead.budgetMin || lead.budgetMax
                          ? `${formatMoney(lead.budgetMin)} – ${formatMoney(lead.budgetMax)}`
                          : '—'}
                      </Td>
                      <Td className="text-[0.8125rem]">{lead.primaryAgentName ?? '—'}</Td>
                      <Td className="text-[0.8125rem]">
                        {lead.nextFollowUpAt ? (
                          <Badge tone={isOverdue(lead.nextFollowUpAt) ? 'stop' : 'neutral'}>
                            {formatShortDate(lead.nextFollowUpAt)}
                          </Badge>
                        ) : (
                          <span className="text-ink-faint">None set</span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>

            <ul className="divide-y divide-line-soft md:hidden">
              {rows.map((lead) => (
                <li key={lead.id} className="p-4">
                  <Link href={`/leads/${lead.id}`} className="block">
                    <p className="font-medium text-ink">
                      {lead.personName ?? 'Not linked to a person yet'}
                    </p>
                    <p className="text-[0.8125rem] text-ink-soft">
                      {labelOf(LEAD_TYPES, lead.leadType)} ·{' '}
                      {labelOf(BUSINESS_AREAS, lead.businessArea)}
                    </p>
                    <p className="mt-1">
                      <Badge tone={statusTone(lead.status)}>
                        {labelOf(LEAD_STATUSES, lead.status)}
                      </Badge>
                    </p>
                    {lead.nextFollowUpAt ? (
                      <p className="mt-1 text-[0.6875rem] text-ink-faint">
                        Follow up {formatShortDate(lead.nextFollowUpAt)} (
                        {relativeTime(lead.nextFollowUpAt)})
                      </p>
                    ) : null}
                  </Link>
                  <QuickActions
                    className="mt-3"
                    size="sm"
                    mobile={lead.personMobile}
                    email={lead.personEmail}
                    personId={lead.personId ?? undefined}
                    leadId={lead.id}
                    canLog={user.permissions.has('COMMUNICATION_CREATE')}
                    canTask={user.permissions.has('TASKS_CREATE')}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {stats.bySource.length > 0 ? (
        <Card className="mt-4">
          <CardHeader title="Where leads come from" description="With how many of each were won." />
          <TableScroll>
            <Table className="min-w-[24rem]">
              <thead>
                <tr>
                  <Th>Source</Th>
                  <Th align="right">Leads</Th>
                  <Th align="right">Won</Th>
                  <Th align="right">Conversion</Th>
                </tr>
              </thead>
              <tbody>
                {stats.bySource.map((row) => (
                  <Tr key={row.source}>
                    <Td>{row.source}</Td>
                    <Td align="right">{row.count}</Td>
                    <Td align="right">{row.won}</Td>
                    <Td align="right">
                      {row.count > 0 ? `${Math.round((row.won / row.count) * 100)}%` : '—'}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        </Card>
      ) : null}

      {lastPage > 1 ? (
        <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
          <PageLink params={params} page={page - 1} disabled={page <= 1}>
            Previous
          </PageLink>
          <span className="text-xs text-ink-faint">
            Page {page} of {lastPage}
          </span>
          <PageLink params={params} page={page + 1} disabled={page >= lastPage}>
            Next
          </PageLink>
        </nav>
      ) : null}
    </>
  );
}

function PageLink({
  params,
  page,
  disabled,
  children,
}: {
  params: Search;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="text-xs text-ink-faint">{children}</span>;
  const next = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  next.set('page', String(page));
  return (
    <Link href={`/leads?${next.toString()}`} className="text-xs font-medium text-brand hover:underline">
      {children}
    </Link>
  );
}
