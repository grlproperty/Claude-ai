import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { cleanQuery, listSavedViews } from '@/lib/workspace.ts';
import { SaveViewPanel } from '../workspace.tsx';
import { getAgentFilter } from '@/lib/session.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listPeople, listAgents, listTags, type PeopleFilters } from '@/lib/people/queries.ts';
import { businessAreaOptions, clientTypeOptions, clientTypeSummary } from '@/lib/domain.ts';
import { formatZaPhone } from '@/lib/phone.ts';
import { formatShortDate, isOverdue, pluralise, relativeTime } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, PageHeader, Select, Input, Button } from '@/components/ui/primitives.tsx';
import { EmptyState } from '@/components/ui/feedback.tsx';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/table.tsx';
import { QuickActions } from '@/components/quick-actions.tsx';
import { Icon } from '@/components/icons.tsx';

export const metadata = { title: 'People' };
export const dynamic = 'force-dynamic';

type Search = Record<string, string | undefined>;

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requirePermissionOrRedirect('PEOPLE_VIEW', '/people');
  const params = await searchParams;
  const agentFilter = await getAgentFilter(user);

  const filters: PeopleFilters = {
    query: params.q ?? '',
    businessArea: (params.businessArea as PeopleFilters['businessArea']) ?? 'all',
    clientType: (params.clientType as PeopleFilters['clientType']) ?? 'all',
    area: params.area ?? '',
    tagId: params.tag || undefined,
    archived: (params.archived as PeopleFilters['archived']) ?? 'active',
    followUp: (params.followUp as PeopleFilters['followUp']) ?? 'all',
    sort: (params.sort as PeopleFilters['sort']) ?? 'recent',
    agentId: params.agent ?? agentFilter,
    page: Number(params.page ?? 1) || 1,
  };

  const { rows, total, page, pageSize } = await readAsUser(user.id, (db) => listPeople(db, filters));
  const [agents, tags] = await readAsUser(user.id, async (db) => [
    user.permissions.has('DATA_VIEW_ALL') ? await listAgents(db) : [],
    await listTags(db),
  ]);

  // Saved views are this page's own filters, named (spec 88).
  const views = await readAsUser(user.id, (db) => listSavedViews(db, user.id, 'person'));
  const currentQuery = cleanQuery(
    new URLSearchParams(
      Object.entries(params).filter(([, value]) => value) as [string, string][],
    ).toString(),
  );

  const canCreate = user.permissions.has('PEOPLE_CREATE');
  const canMerge = user.permissions.has('MERGE_RECORDS');
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Clients and contacts"
        description="One master record per person, whatever they are to the business."
        actions={
          <>
            {canMerge ? (
              <ButtonLink href="/people/duplicates">
                <Icon.merge className="size-4" />
                Possible duplicates
              </ButtonLink>
            ) : null}
            {canCreate ? (
              <ButtonLink href="/people/new" tone="primary">
                <Icon.plus className="size-4" />
                Add person
              </ButtonLink>
            ) : null}
          </>
        }
      />

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
              placeholder="Name, mobile, email or GRLP reference"
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
              Client type
            </span>
            <Select name="clientType" defaultValue={filters.clientType}>
              <option value="all">All</option>
              {clientTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>

          <label>
            <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Area
            </span>
            <Input name="area" defaultValue={filters.area} placeholder="Suburb or town" />
          </label>

          <label>
            <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Tag
            </span>
            <Select name="tag" defaultValue={params.tag ?? ''}>
              <option value="">All</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
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
                <option value="">
                  {agentFilter ? 'Agent view setting' : 'All agents'}
                </option>
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

          <label>
            <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Records
            </span>
            <Select name="archived" defaultValue={filters.archived}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </Select>
          </label>

          <div className="flex items-end gap-2">
            <Button type="submit" tone="primary">
              Apply
            </Button>
            <ButtonLink href="/people" tone="quiet">
              Clear
            </ButtonLink>
          </div>
        </form>
        <SaveViewPanel entityType="person" query={currentQuery} path="/people" views={views} />
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
          <p className="text-xs text-ink-soft">
            {total === 0 ? 'No people match these filters' : pluralise(total, 'person', 'people')}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {lastPage > 1 ? (
              <p className="text-xs text-ink-faint">
                Page {page} of {lastPage}
              </p>
            ) : null}
            {user.permissions.has('REPORTS_EXPORT') ? (
              // No identity number is in any export, and every export is
              // recorded permanently (spec 15, 98).
              <ButtonLink href="/api/export/people" size="sm">
                Export CSV
              </ButtonLink>
            ) : null}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No people match these filters"
            description={
              filters.query
                ? 'Try a shorter search, or clear the filters to see everyone you have access to.'
                : 'Add your first client, or import an existing list from a spreadsheet.'
            }
            action={
              canCreate ? (
                <>
                  <ButtonLink href="/people/new" tone="primary">
                    Add person
                  </ButtonLink>
                  <ButtonLink href="/import">Import a spreadsheet</ButtonLink>
                </>
              ) : null
            }
          />
        ) : (
          <>
            {/* Table on a laptop, cards on a phone. */}
            <TableScroll className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>Client</Th>
                    <Th>Type</Th>
                    <Th>Contact</Th>
                    <Th>Agent</Th>
                    <Th>Last contact</Th>
                    <Th>Next follow-up</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((person) => (
                    <Tr key={person.id}>
                      <Td>
                        <Link href={`/people/${person.id}`} className="font-medium text-ink hover:text-brand">
                          {person.fullName}
                        </Link>
                        <div className="font-mono text-[0.6875rem] text-ink-faint">
                          {person.clientRef}
                        </div>
                        {person.tags.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {person.tags.map((tag) => (
                              <Badge key={tag.id} tone={tag.colour as 'neutral'}>
                                {tag.name}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </Td>
                      <Td>
                        <div className="text-[0.8125rem]">{clientTypeSummary(person.clientTypes)}</div>
                        <div className="text-[0.6875rem] text-ink-faint">
                          {businessAreaOptions.find((o) => o.value === person.businessArea)?.label}
                        </div>
                      </Td>
                      <Td>
                        <div className="text-[0.8125rem] tabular-nums">
                          {formatZaPhone(person.primaryMobile) || '—'}
                        </div>
                        <div className="truncate text-[0.6875rem] text-ink-faint">
                          {person.primaryEmail ?? ''}
                        </div>
                      </Td>
                      <Td className="text-[0.8125rem]">{person.primaryAgentName ?? '—'}</Td>
                      <Td className="text-[0.8125rem]">
                        {person.lastContactAt ? (
                          <>
                            {formatShortDate(person.lastContactAt)}
                            <div className="text-[0.6875rem] text-ink-faint">
                              {relativeTime(person.lastContactAt)}
                            </div>
                          </>
                        ) : (
                          <span className="text-ink-faint">Never</span>
                        )}
                      </Td>
                      <Td className="text-[0.8125rem]">
                        {person.nextFollowUpAt ? (
                          <Badge tone={isOverdue(person.nextFollowUpAt) ? 'stop' : 'neutral'}>
                            {formatShortDate(person.nextFollowUpAt)}
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
              {rows.map((person) => (
                <li key={person.id} className="p-4">
                  <Link href={`/people/${person.id}`} className="block">
                    <p className="font-medium text-ink">{person.fullName}</p>
                    <p className="font-mono text-[0.6875rem] text-ink-faint">{person.clientRef}</p>
                    <p className="mt-1 text-[0.8125rem] text-ink-soft">
                      {clientTypeSummary(person.clientTypes)}
                    </p>
                    <p className="text-[0.8125rem] tabular-nums text-ink-soft">
                      {formatZaPhone(person.primaryMobile)}
                    </p>
                    {person.nextFollowUpAt ? (
                      <p className="mt-1">
                        <Badge tone={isOverdue(person.nextFollowUpAt) ? 'stop' : 'neutral'}>
                          Follow up {formatShortDate(person.nextFollowUpAt)}
                        </Badge>
                      </p>
                    ) : null}
                  </Link>
                  <QuickActions
                    className="mt-3"
                    size="sm"
                    mobile={person.primaryMobile}
                    email={person.primaryEmail}
                    personId={person.id}
                    canLog={user.permissions.has('COMMUNICATION_CREATE')}
                    canTask={user.permissions.has('TASKS_CREATE')}
                  />
                </li>
              ))}
            </ul>
          </>
        )}

        {lastPage > 1 ? (
          <nav
            className="flex items-center justify-between gap-2 border-t border-line-soft px-4 py-3"
            aria-label="Pagination"
          >
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
      </Card>
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
  if (disabled) {
    return <span className="text-xs text-ink-faint">{children}</span>;
  }
  const next = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  next.set('page', String(page));
  return (
    <Link href={`/people?${next.toString()}`} className="text-xs font-medium text-brand hover:underline">
      {children}
    </Link>
  );
}
