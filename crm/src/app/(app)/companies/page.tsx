import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getAgentFilter } from '@/lib/session.ts';
import { ENTITY_TYPES, listCompanies } from '@/lib/companies.ts';
import { FICA_STATUSES } from '@/lib/fica.ts';
import { labelOf, statusTone } from '@/lib/domain.ts';
import { pluralise } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';

export const metadata = { title: 'Companies and entities' };
export const dynamic = 'force-dynamic';

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entityType?: string; archived?: string; page?: string }>;
}) {
  const user = await requirePermissionOrRedirect('PEOPLE_VIEW', '/companies');
  const query = await searchParams;
  const agentFilter = await getAgentFilter(user);

  const list = await readAsUser(user.id, (db) =>
    listCompanies(db, {
      query: query.q,
      entityType: query.entityType,
      archived: (query.archived as 'active' | 'archived' | 'all') ?? 'active',
      agentId: agentFilter,
      page: Number(query.page ?? '1') || 1,
    }),
  );

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Companies, trusts and other entities"
        description="A client that is not a person. Each one has its own record and its own people."
        actions={
          user.permissions.has('PEOPLE_CREATE') ? (
            <ButtonLink href="/companies/new" tone="primary">
              Add an entity
            </ButtonLink>
          ) : null
        }
      />

      <Alert tone="neutral" className="mb-4">
        An entity is not a person: it has its own registration number, its own address, and its own
        set of people behind it. Recording it as a person with a company-sounding name would lose
        all three, and the last one is what FICA is about.
      </Alert>

      <Card>
        <CardHeader
          title={pluralise(list.total, 'entity', 'entities')}
          actions={
            <form className="flex w-full min-w-0 flex-wrap items-center gap-2" action="/companies">
              <input
                type="search"
                name="q"
                defaultValue={query.q ?? ''}
                placeholder="Name or registration number"
                aria-label="Search entities"
                className="tap h-9 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm"
              />
              <select
                name="entityType"
                defaultValue={query.entityType ?? 'all'}
                aria-label="Which kind"
                className="tap h-9 min-w-0 shrink rounded-lg border border-line bg-white px-3 text-sm"
              >
                <option value="all">Any kind</option>
                {Object.entries(ENTITY_TYPES).map(([value, label]) => (
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

        {list.rows.length === 0 ? (
          <EmptyState title="No entities recorded yet" className="py-10" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {list.rows.map((company) => (
              <li key={company.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    href={`/companies/${company.id}`}
                    className="font-medium text-ink hover:text-brand"
                  >
                    {company.registeredName}
                  </Link>
                  <span className="font-mono text-[0.6875rem] text-ink-faint">
                    {company.companyRef}
                  </span>
                  <Badge>{labelOf(ENTITY_TYPES, company.entityType)}</Badge>
                  {company.ficaStatus ? (
                    <Badge tone={statusTone(company.ficaStatus)}>
                      FICA: {labelOf(FICA_STATUSES, company.ficaStatus)}
                    </Badge>
                  ) : (
                    <Badge tone="warn">No FICA file</Badge>
                  )}
                  {company.isArchived ? <Badge>Archived</Badge> : null}
                </div>
                <p className="mt-0.5 text-[0.6875rem] text-ink-faint">
                  {company.tradingName ? `Trading as ${company.tradingName} · ` : ''}
                  {company.registrationNumber ? `${company.registrationNumber} · ` : ''}
                  {company.addressLine ?? 'no address recorded'} ·{' '}
                  {pluralise(company.peopleCount, 'person', 'people')} ·{' '}
                  {pluralise(company.propertyCount, 'property', 'properties')}
                  {company.primaryAgentName ? ` · ${company.primaryAgentName}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
