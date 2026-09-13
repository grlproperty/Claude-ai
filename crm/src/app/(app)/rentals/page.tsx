import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { getAgentFilter } from '@/lib/session.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listRentalApplications } from '@/lib/rentals.ts';
import { listProperties } from '@/lib/properties/queries.ts';
import {
  RENTAL_APPLICATION_STATUSES,
  RENTAL_STATUSES,
  SCREENING_STATUSES,
  labelOf,
  rentalApplicationStatusOptions,
  statusTone,
} from '@/lib/domain.ts';
import { formatDate, formatMoney, isOverdue, pluralise } from '@/lib/format.ts';
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
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/table.tsx';
import { Icon } from '@/components/icons.tsx';

export const metadata = { title: 'Rentals' };
export const dynamic = 'force-dynamic';

export default async function RentalsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const user = await requirePermissionOrRedirect('RENTALS_VIEW', '/rentals');
  const params = await searchParams;
  const agentFilter = await getAgentFilter(user);

  const data = await readAsUser(user.id, async (db) => ({
    applications: await listRentalApplications(db, {
      agentId: agentFilter,
      status: params.status ?? 'all',
      query: params.q,
      limit: 100,
    }),
    expiring: await listRentalApplications(db, {
      agentId: agentFilter,
      expiringLease: true,
      limit: 25,
    }),
    available: await listProperties(db, {
      businessArea: 'rentals',
      rentalStatus: 'available',
      agentId: agentFilter,
      pageSize: 10,
    }),
  }));

  const canCreate = user.permissions.has('RENTALS_CREATE');

  return (
    <>
      <PageHeader
        eyebrow="Rentals"
        title="Rental pipeline"
        description="Available properties, applications, screening and leases."
        actions={
          canCreate ? (
            <ButtonLink href="/rentals/applications/new" tone="primary">
              <Icon.plus className="size-4" />
              New application
            </ButtonLink>
          ) : null
        }
      />

      {data.expiring.length > 0 ? (
        <Alert tone="warn" title="Leases ending soon" className="mb-4">
          {pluralise(data.expiring.length, 'lease')} ending within sixty days. Renewal conversations
          start now, not on the last day.
          <ul className="mt-1 space-y-0.5">
            {data.expiring.map((application) => (
              <li key={application.id}>
                <Link href={`/rentals/applications/${application.id}`} className="underline">
                  {application.propertyLabel ?? application.propertyRef}
                </Link>{' '}
                — {application.applicantName ?? 'tenant not recorded'}, ends{' '}
                {application.leaseEnd ? formatDate(application.leaseEnd) : 'date not recorded'}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <Card className="mb-4 p-3 sm:p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-3">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Search
            </span>
            <Input
              type="search"
              name="q"
              defaultValue={params.q ?? ''}
              placeholder="Applicant, property or application reference"
            />
          </label>
          <label>
            <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Status
            </span>
            <Select name="status" defaultValue={params.status ?? 'all'}>
              <option value="all">All</option>
              {rentalApplicationStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex items-end gap-2">
            <Button type="submit" tone="primary">
              Apply
            </Button>
            <ButtonLink href="/rentals" tone="quiet">
              Clear
            </ButtonLink>
          </div>
        </form>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title="Applications"
          description="Every application, where it is in screening, and what the lease says."
        />
        {data.applications.length === 0 ? (
          <EmptyState
            title="No rental applications yet"
            description="When somebody applies for a rental, record it here so the screening has a home."
            action={
              canCreate ? (
                <ButtonLink href="/rentals/applications/new" tone="primary">
                  New application
                </ButtonLink>
              ) : null
            }
          />
        ) : (
          <TableScroll>
            <Table className="min-w-[54rem]">
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Property</Th>
                  <Th>Applicant</Th>
                  <Th align="right">Rental</Th>
                  <Th>Application</Th>
                  <Th>Screening</Th>
                  <Th>Lease</Th>
                </tr>
              </thead>
              <tbody>
                {data.applications.map((application) => (
                  <Tr key={application.id}>
                    <Td>
                      <Link
                        href={`/rentals/applications/${application.id}`}
                        className="font-mono text-[0.8125rem] font-medium text-ink hover:text-brand"
                      >
                        {application.applicationRef}
                      </Link>
                    </Td>
                    <Td className="text-[0.8125rem]">
                      <Link
                        href={`/properties/${application.propertyId}`}
                        className="hover:text-brand"
                      >
                        {application.propertyLabel ?? application.propertyRef}
                      </Link>
                    </Td>
                    <Td className="text-[0.8125rem]">
                      {application.applicantName ?? '—'}
                      {application.coApplicantName ? (
                        <div className="text-[0.6875rem] text-ink-faint">
                          with {application.coApplicantName}
                        </div>
                      ) : null}
                    </Td>
                    <Td align="right" className="text-[0.8125rem]">
                      {formatMoney(application.monthlyRental)}
                      {application.deposit ? (
                        <div className="text-[0.6875rem] text-ink-faint">
                          deposit {formatMoney(application.deposit)}
                        </div>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={statusTone(application.applicationStatus)}>
                        {labelOf(RENTAL_APPLICATION_STATUSES, application.applicationStatus)}
                      </Badge>
                      {application.rejectionReason ? (
                        <div className="mt-0.5 text-[0.6875rem] text-ink-faint">
                          {application.rejectionReason}
                        </div>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge tone={statusTone(application.screeningStatus)}>
                        {labelOf(SCREENING_STATUSES, application.screeningStatus)}
                      </Badge>
                    </Td>
                    <Td className="text-[0.8125rem]">
                      {application.leaseStart ? (
                        <>
                          {formatDate(application.leaseStart)}
                          {application.leaseEnd ? (
                            <div
                              className={
                                isOverdue(application.leaseEnd)
                                  ? 'text-[0.6875rem] font-medium text-stop'
                                  : 'text-[0.6875rem] text-ink-faint'
                              }
                            >
                              to {formatDate(application.leaseEnd)}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Available to let"
          description="Properties whose rental status is Available."
          actions={
            <ButtonLink href="/properties?businessArea=rentals&rentalStatus=available" size="sm">
              See all
            </ButtonLink>
          }
        />
        {data.available.rows.length === 0 ? (
          <EmptyState title="Nothing available to let" className="py-6" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {data.available.rows.map((property) => (
              <li key={property.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/properties/${property.id}`}
                    className="text-[0.8125rem] font-medium text-ink hover:text-brand"
                  >
                    {property.addressLine || property.propertyRef}
                  </Link>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {property.monthlyRental ? `${formatMoney(property.monthlyRental)} per month` : ''}
                    {property.primaryAgentName ? ` · ${property.primaryAgentName}` : ''}
                    {' · '}
                    {labelOf(RENTAL_STATUSES, property.rentalStatus)}
                  </div>
                </div>
                {canCreate ? (
                  <ButtonLink
                    href={`/rentals/applications/new?propertyId=${property.id}`}
                    size="sm"
                  >
                    Take an application
                  </ButtonLink>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
