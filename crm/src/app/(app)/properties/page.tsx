import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { cleanQuery, listSavedViews } from '@/lib/workspace.ts';
import { SaveViewPanel } from '../workspace.tsx';
import { getAgentFilter } from '@/lib/session.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listProperties, type PropertyFilters } from '@/lib/properties/queries.ts';
import { listAgents, listTags } from '@/lib/people/queries.ts';
import {
  BUSINESS_AREAS,
  MANDATE_STATUSES,
  MANDATE_TYPES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  RENTAL_STATUSES,
  SALES_STATUSES,
  businessAreaOptions,
  labelOf,
  mandateStatusOptions,
  propertyStatusOptions,
  propertyTypeOptions,
  rentalStatusOptions,
  salesStatusOptions,
  statusTone,
} from '@/lib/domain.ts';
import { formatMoney, formatShortDate, isOverdue, pluralise } from '@/lib/format.ts';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Input,
  PageHeader,
  Select,
} from '@/components/ui/primitives.tsx';
import { EmptyState } from '@/components/ui/feedback.tsx';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/table.tsx';
import { Icon } from '@/components/icons.tsx';

export const metadata = { title: 'Properties' };
export const dynamic = 'force-dynamic';

type Search = Record<string, string | undefined>;

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const user = await requirePermissionOrRedirect('PROPERTIES_VIEW', '/properties');
  const params = await searchParams;
  const agentFilter = await getAgentFilter(user);

  const filters: PropertyFilters = {
    query: params.q ?? '',
    area: params.area ?? '',
    propertyType: params.propertyType ?? 'all',
    businessArea: params.businessArea ?? 'all',
    propertyStatus: params.propertyStatus ?? 'all',
    salesStatus: params.salesStatus ?? 'all',
    rentalStatus: params.rentalStatus ?? 'all',
    mandateStatus: params.mandateStatus ?? 'all',
    tagId: params.tag || undefined,
    minPrice: params.minPrice || undefined,
    maxPrice: params.maxPrice || undefined,
    mandateExpiring: (params.mandate as PropertyFilters['mandateExpiring']) ?? 'all',
    archived: (params.archived as PropertyFilters['archived']) ?? 'active',
    sort: (params.sort as PropertyFilters['sort']) ?? 'recent',
    agentId: params.agent ?? agentFilter,
    page: Number(params.page ?? 1) || 1,
  };

  const { rows, total, page, pageSize } = await readAsUser(user.id, (db) =>
    listProperties(db, filters),
  );
  const [agents, tags] = await readAsUser(user.id, async (db) => [
    user.permissions.has('DATA_VIEW_ALL') ? await listAgents(db) : [],
    await listTags(db),
  ]);

  // Saved views are this page's own filters, named (spec 88).
  const views = await readAsUser(user.id, (db) => listSavedViews(db, user.id, 'property'));
  const currentQuery = cleanQuery(
    new URLSearchParams(
      Object.entries(params).filter(([, value]) => value) as [string, string][],
    ).toString(),
  );

  const canCreate = user.permissions.has('PROPERTIES_CREATE');
  const canMerge = user.permissions.has('MERGE_RECORDS');
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        eyebrow="Properties"
        title="Property register"
        description="One master record per property, for sales and for rentals alike."
        actions={
          <>
            {canMerge ? (
              <ButtonLink href="/properties/duplicates">
                <Icon.merge className="size-4" />
                Possible duplicates
              </ButtonLink>
            ) : null}
            {canCreate ? (
              <ButtonLink href="/properties/new" tone="primary">
                <Icon.plus className="size-4" />
                Add property
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <Card className="mb-4 p-3 sm:p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label="Search" className="sm:col-span-2">
            <Input
              type="search"
              name="q"
              defaultValue={filters.query}
              placeholder="Address, erf, township or GRLP reference"
            />
          </FilterField>

          <FilterField label="Area">
            <Input name="area" defaultValue={filters.area} placeholder="Suburb or town" />
          </FilterField>

          <FilterField label="Property type">
            <Select name="propertyType" defaultValue={filters.propertyType}>
              <option value="all">All</option>
              {propertyTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Business area">
            <Select name="businessArea" defaultValue={filters.businessArea}>
              <option value="all">All</option>
              {businessAreaOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Property status">
            <Select name="propertyStatus" defaultValue={filters.propertyStatus}>
              <option value="all">All</option>
              {propertyStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Sales status">
            <Select name="salesStatus" defaultValue={filters.salesStatus}>
              <option value="all">All</option>
              {salesStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Rental status">
            <Select name="rentalStatus" defaultValue={filters.rentalStatus}>
              <option value="all">All</option>
              {rentalStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Mandate status">
            <Select name="mandateStatus" defaultValue={filters.mandateStatus}>
              <option value="all">All</option>
              {mandateStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FilterField>

          <FilterField label="Mandate expiry">
            <Select name="mandate" defaultValue={filters.mandateExpiring}>
              <option value="all">Any</option>
              <option value="soon">Expiring within 60 days</option>
              <option value="expired">Already expired</option>
            </Select>
          </FilterField>

          <FilterField label="Price from">
            <Input name="minPrice" inputMode="numeric" defaultValue={params.minPrice ?? ''} />
          </FilterField>

          <FilterField label="Price to">
            <Input name="maxPrice" inputMode="numeric" defaultValue={params.maxPrice ?? ''} />
          </FilterField>

          <FilterField label="Tag">
            <Select name="tag" defaultValue={params.tag ?? ''}>
              <option value="">All</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </Select>
          </FilterField>

          {agents.length > 0 ? (
            <FilterField label="Agent">
              <Select name="agent" defaultValue={params.agent ?? ''}>
                <option value="">{agentFilter ? 'Agent view setting' : 'All agents'}</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </Select>
            </FilterField>
          ) : null}

          <FilterField label="Records">
            <Select name="archived" defaultValue={filters.archived}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </Select>
          </FilterField>

          <FilterField label="Sort by">
            <Select name="sort" defaultValue={filters.sort}>
              <option value="recent">Most recent</option>
              <option value="address">Address</option>
              <option value="price_high">Price, highest first</option>
              <option value="price_low">Price, lowest first</option>
              <option value="mandate_expiry">Mandate expiry</option>
            </Select>
          </FilterField>

          <div className="flex items-end gap-2">
            <Button type="submit" tone="primary">
              Apply
            </Button>
            <ButtonLink href="/properties" tone="quiet">
              Clear
            </ButtonLink>
          </div>
        </form>
        <SaveViewPanel
          entityType="property"
          query={currentQuery}
          path="/properties"
          views={views}
        />
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
          <p className="text-xs text-ink-soft">
            {total === 0 ? 'No properties match these filters' : pluralise(total, 'property', 'properties')}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {lastPage > 1 ? (
              <p className="text-xs text-ink-faint">
                Page {page} of {lastPage}
              </p>
            ) : null}
            {user.permissions.has('REPORTS_EXPORT') ? (
              <ButtonLink href="/api/export/properties" size="sm">
                Export CSV
              </ButtonLink>
            ) : null}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No properties match these filters"
            description={
              filters.query
                ? 'Try a shorter search, or clear the filters to see everything you have access to.'
                : 'Add your first property, or import an existing list from a spreadsheet.'
            }
            action={
              canCreate ? (
                <>
                  <ButtonLink href="/properties/new" tone="primary">
                    Add property
                  </ButtonLink>
                  <ButtonLink href="/import">Import a spreadsheet</ButtonLink>
                </>
              ) : null
            }
          />
        ) : (
          <>
            <TableScroll className="hidden md:block">
              <Table className="min-w-[54rem]">
                <thead>
                  <tr>
                    <Th>Property</Th>
                    <Th>Type</Th>
                    <Th>Property status</Th>
                    <Th>Sales</Th>
                    <Th>Rental</Th>
                    <Th>Mandate</Th>
                    <Th align="right">Price</Th>
                    <Th>Agent</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((property) => (
                    <Tr key={property.id}>
                      <Td>
                        <Link
                          href={`/properties/${property.id}`}
                          className="font-medium text-ink hover:text-brand"
                        >
                          {property.addressLine || property.propertyRef}
                        </Link>
                        <div className="font-mono text-[0.6875rem] text-ink-faint">
                          {property.propertyRef}
                          {property.erfNumber ? ` · Erf ${property.erfNumber}` : ''}
                        </div>
                        {property.ownerNames.length > 0 ? (
                          <div className="text-[0.6875rem] text-ink-faint">
                            {property.ownerNames.join(', ')}
                          </div>
                        ) : null}
                        {property.tags.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {property.tags.map((tag) => (
                              <Badge key={tag.id} tone={tag.colour as 'neutral'}>
                                {tag.name}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </Td>
                      <Td>
                        <div className="text-[0.8125rem]">
                          {labelOf(PROPERTY_TYPES, property.propertyType)}
                        </div>
                        <div className="text-[0.6875rem] text-ink-faint">
                          {[
                            property.bedrooms ? `${Number(property.bedrooms)} bed` : null,
                            property.bathrooms ? `${Number(property.bathrooms)} bath` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                        <div className="text-[0.6875rem] text-ink-faint">
                          {labelOf(BUSINESS_AREAS, property.businessArea)}
                        </div>
                      </Td>
                      <Td>
                        <Badge tone={statusTone(property.propertyStatus)}>
                          {labelOf(PROPERTY_STATUSES, property.propertyStatus)}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={statusTone(property.salesStatus)}>
                          {labelOf(SALES_STATUSES, property.salesStatus)}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={statusTone(property.rentalStatus)}>
                          {labelOf(RENTAL_STATUSES, property.rentalStatus)}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge tone={statusTone(property.mandateStatus)}>
                          {labelOf(MANDATE_STATUSES, property.mandateStatus)}
                        </Badge>
                        <div className="mt-0.5 text-[0.6875rem] text-ink-faint">
                          {property.mandateType
                            ? labelOf(MANDATE_TYPES, property.mandateType)
                            : ''}
                        </div>
                        {property.mandateExpiry ? (
                          <div
                            className={
                              isOverdue(property.mandateExpiry)
                                ? 'text-[0.6875rem] font-medium text-stop'
                                : 'text-[0.6875rem] text-ink-faint'
                            }
                          >
                            {isOverdue(property.mandateExpiry) ? 'Expired ' : 'Expires '}
                            {formatShortDate(property.mandateExpiry)}
                          </div>
                        ) : null}
                      </Td>
                      <Td align="right">
                        <div className="text-[0.8125rem]">
                          {formatMoney(property.currentAskingPrice) || '—'}
                        </div>
                        {property.monthlyRental ? (
                          <div className="text-[0.6875rem] text-ink-faint">
                            {formatMoney(property.monthlyRental)} p/m
                          </div>
                        ) : null}
                      </Td>
                      <Td className="text-[0.8125rem]">{property.primaryAgentName ?? '—'}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>

            <ul className="divide-y divide-line-soft md:hidden">
              {rows.map((property) => (
                <li key={property.id}>
                  <Link href={`/properties/${property.id}`} className="block p-4">
                    <p className="font-medium text-ink">
                      {property.addressLine || property.propertyRef}
                    </p>
                    <p className="font-mono text-[0.6875rem] text-ink-faint">
                      {property.propertyRef}
                    </p>
                    <p className="mt-1 text-[0.8125rem] text-ink-soft">
                      {labelOf(PROPERTY_TYPES, property.propertyType)}
                      {property.bedrooms ? ` · ${Number(property.bedrooms)} bed` : ''}
                      {property.bathrooms ? ` · ${Number(property.bathrooms)} bath` : ''}
                    </p>
                    <p className="text-[0.8125rem] font-medium text-ink">
                      {formatMoney(property.currentAskingPrice)}
                      {property.monthlyRental
                        ? ` · ${formatMoney(property.monthlyRental)} p/m`
                        : ''}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge tone={statusTone(property.propertyStatus)}>
                        {labelOf(PROPERTY_STATUSES, property.propertyStatus)}
                      </Badge>
                      <Badge tone={statusTone(property.mandateStatus)}>
                        {labelOf(MANDATE_STATUSES, property.mandateStatus)}
                      </Badge>
                    </div>
                  </Link>
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

function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      {children}
    </label>
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
    <Link
      href={`/properties?${next.toString()}`}
      className="text-xs font-medium text-brand hover:underline"
    >
      {children}
    </Link>
  );
}
