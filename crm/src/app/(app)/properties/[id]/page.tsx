import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import {
  getProperty,
  getPropertyHistory,
  listMarketingChannels,
} from '@/lib/properties/queries.ts';
import { findPropertyDuplicates } from '@/lib/properties/duplicates.ts';
import { listLinkablePeople } from '@/lib/properties/form-options.ts';
import { listAgents } from '@/lib/people/queries.ts';
import { listDocuments, listPropertyPhotos } from '@/lib/files.ts';
import { PROPERTY_COMPANY_ROLES, companiesForProperty } from '@/lib/companies.ts';
import { FICA_STATUSES } from '@/lib/fica.ts';
import {
  BUSINESS_AREAS,
  DOCUMENT_CATEGORIES,
  MANDATE_STATUSES,
  MANDATE_TYPES,
  MARKETING_STATUSES,
  PROPERTY_PERSON_ROLES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  RENTAL_STATUSES,
  SALES_STATUSES,
  SALE_OUTCOMES,
  labelOf,
  statusTone,
} from '@/lib/domain.ts';
import { describeAuditAction, describeField } from '@/lib/audit-labels.ts';
import { formatDate, formatDateTime, formatMoney, formatNumber, isOverdue } from '@/lib/format.ts';
import { formatZaPhone } from '@/lib/phone.ts';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  PageHeader,
} from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { DescriptionList, Table, TableScroll, Td, Th, Tr } from '@/components/ui/table.tsx';
import { QuickActions } from '@/components/quick-actions.tsx';
import { RelatedRecordCards, loadRelatedRecords } from '@/components/related-records.tsx';
import {
  ArchiveDocumentButton,
  ArchivePropertyPanel,
  AssignPropertyAgentPanel,
  DocumentUploadPanel,
  LinkPersonPanel,
  MarketingChannelPanel,
  MarketingPanel,
  PhotoActions,
  PhotoUploadPanel,
  RentalHistoryPanel,
  SaleHistoryPanel,
  UnlinkPersonButton,
} from './panels.tsx';
import { LinkCompanyToPropertyPanel } from '../../companies/forms.tsx';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('PROPERTIES_VIEW', `/properties/${id}`);
  const property = await readAsUser(user.id, (db) => getProperty(db, id));
  return {
    title: property ? `${property.addressLine || property.propertyRef}` : 'Property',
  };
}

const SAVED_MESSAGES: Record<string, string> = {
  created: 'Property created.',
  updated: 'Property updated.',
  merged: 'The records were merged.',
};

export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const user = await requirePermissionOrRedirect('PROPERTIES_VIEW', `/properties/${id}`);

  const data = await readAsUser(user.id, async (db) => {
    const property = await getProperty(db, id);
    if (!property) return null;

    return {
      property,
      // What is in flight for this property (spec 100).
      related: await loadRelatedRecords(db, user, { propertyId: property.id }),
      history: await getPropertyHistory(db, id),
      photos: await listPropertyPhotos(db, id),
      documents: await listDocuments(db, { propertyId: id }),
      channels: await listMarketingChannels(db, id),
      sales: user.permissions.has('SALES_VIEW')
        ? await db.query<{
            sale_date: Date | null;
            registered_at: Date | null;
            sale_price: string | null;
            buyer_name: string | null;
            seller_name: string | null;
            agent_name: string | null;
            sale_outcome: string | null;
            notes: string | null;
          }>(
            `select h.sale_date, h.registered_at, h.sale_price, h.sale_outcome, h.notes,
                    b.first_name || ' ' || b.surname as buyer_name,
                    s.first_name || ' ' || s.surname as seller_name,
                    coalesce(a.display_name, a.full_name) as agent_name
               from property_sale_history h
               left join people b on b.id = h.buyer_id
               left join people s on s.id = h.seller_id
               left join users a on a.id = h.agent_id
              where h.property_id = $1 order by h.sale_date desc nulls last`,
            [id],
          )
        : [],
      rentals: user.permissions.has('RENTALS_VIEW')
        ? await db.query<{
            id: string;
            commission_id: string | null;
            lease_start: Date | null;
            lease_end: Date | null;
            monthly_rental: string | null;
            tenant_name: string | null;
            landlord_name: string | null;
            agent_name: string | null;
            notes: string | null;
          }>(
            `select h.id, h.lease_start, h.lease_end, h.monthly_rental, h.notes,
                    (select c.id from commissions c where c.rental_id = h.id) as commission_id,
                    t.first_name || ' ' || t.surname as tenant_name,
                    l.first_name || ' ' || l.surname as landlord_name,
                    coalesce(a.display_name, a.full_name) as agent_name
               from property_rental_history h
               left join people t on t.id = h.tenant_id
               left join people l on l.id = h.landlord_id
               left join users a on a.id = h.agent_id
              where h.property_id = $1 order by h.lease_start desc nulls last`,
            [id],
          )
        : [],
      duplicates: user.permissions.has('MERGE_RECORDS')
        ? await findPropertyDuplicates(
            db,
            {
              erfNumber: property.erfNumber,
              portionNumber: property.portionNumber,
              streetAddress: property.streetAddress,
              propertyName: property.propertyName,
              suburb: property.suburb,
              city: property.city,
            },
            { excludeId: property.id, limit: 5 },
          )
        : [],
      people: user.permissions.has('PROPERTIES_EDIT') ? await listLinkablePeople(db) : [],
      // An entity can own a property just as a person can (spec 42).
      companies: user.permissions.has('PEOPLE_VIEW') ? await companiesForProperty(db, id) : [],
      linkableCompanies:
        user.permissions.has('PROPERTIES_EDIT') && user.permissions.has('PEOPLE_VIEW')
          ? await db.query<{ id: string; label: string }>(
              `select id, registered_name || ' (' || company_ref || ')' as label
                 from companies
                where not is_archived
                order by registered_name limit 300`,
            )
          : [],
      agents: user.permissions.has('DATA_VIEW_ALL') ? await listAgents(db) : [],
      audit: user.permissions.has('AUDIT_LOG_VIEW')
        ? await db.query<{
            occurred_at: Date;
            action: string;
            actor_email: string | null;
            changes: Record<string, unknown> | null;
          }>(
            `select occurred_at, action, actor_email, changes
               from audit_logs where entity_type = 'property' and entity_id = $1
              order by occurred_at desc limit 25`,
            [id],
          )
        : [],
    };
  });

  if (!data) notFound();
  const {
    property,
    related,
    history,
    photos,
    documents,
    channels,
    sales,
    rentals,
    duplicates,
    people,
    companies,
    linkableCompanies,
    agents,
    audit,
  } = data;

  const canEdit = user.permissions.has('PROPERTIES_EDIT');
  const canMarket = canEdit || user.permissions.has('MARKETING_ADMIN');
  const primaryContact = property.people.find((link) => link.isPrimaryContact) ?? property.people[0];

  return (
    <>
      {saved && SAVED_MESSAGES[saved] ? (
        <Alert tone="ok" className="mb-4">
          {SAVED_MESSAGES[saved]}
        </Alert>
      ) : null}

      {property.mergedIntoId ? (
        <Alert tone="warn" title="This record was merged" className="mb-4">
          {property.propertyRef} was merged into{' '}
          <Link href={`/properties/${property.mergedIntoId}`} className="underline">
            {property.mergedIntoRef}
          </Link>
          . It is kept for its history and its reference will never be reused.
        </Alert>
      ) : null}

      {property.isArchived && !property.mergedIntoId ? (
        <Alert tone="warn" title="This property is archived" className="mb-4">
          {property.archiveReason ?? 'No reason was recorded.'}
        </Alert>
      ) : null}

      <PageHeader
        eyebrow={<span className="font-mono">{property.propertyRef}</span>}
        title={property.addressLine || property.propertyRef}
        description={
          <>
            {labelOf(PROPERTY_TYPES, property.propertyType)} ·{' '}
            {labelOf(BUSINESS_AREAS, property.businessArea)}
            {property.primaryAgentName ? ` · Agent: ${property.primaryAgentName}` : ''}
            {property.secondaryAgentName ? ` · Sharing: ${property.secondaryAgentName}` : ''}
          </>
        }
        actions={
          canEdit ? (
            <ButtonLink href={`/properties/${property.id}/edit`} tone="primary">
              Edit
            </ButtonLink>
          ) : null
        }
      />

      {/* The six statuses, side by side, each labelled (spec 141) */}
      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-6 sm:p-5">
          <StatusFact
            label="Property"
            value={labelOf(PROPERTY_STATUSES, property.propertyStatus)}
            tone={statusTone(property.propertyStatus)}
          />
          <StatusFact
            label="Sales"
            value={labelOf(SALES_STATUSES, property.salesStatus)}
            tone={statusTone(property.salesStatus)}
          />
          <StatusFact
            label="Rental"
            value={labelOf(RENTAL_STATUSES, property.rentalStatus)}
            tone={statusTone(property.rentalStatus)}
          />
          <StatusFact
            label="Mandate"
            value={labelOf(MANDATE_STATUSES, property.mandateStatus)}
            tone={statusTone(property.mandateStatus)}
            hint={property.mandateType ? labelOf(MANDATE_TYPES, property.mandateType) : undefined}
          />
          <StatusFact
            label="Sale outcome"
            value={labelOf(SALE_OUTCOMES, property.saleOutcome)}
            tone={statusTone(property.saleOutcome)}
          />
          <StatusFact
            label="Mandate expiry"
            value={property.mandateExpiry ? formatDate(property.mandateExpiry) : 'None'}
            tone={
              property.mandateExpiry && isOverdue(property.mandateExpiry) ? 'stop' : 'neutral'
            }
          />
        </div>

        {primaryContact ? (
          <div className="border-t border-line-soft px-4 py-3.5 sm:px-5">
            <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Primary contact — {primaryContact.personName} (
              {labelOf(PROPERTY_PERSON_ROLES, primaryContact.role)})
            </p>
            <QuickActions
              mobile={primaryContact.personMobile}
              email={primaryContact.personEmail}
              personId={primaryContact.personId}
              propertyId={property.id}
              canLog={user.permissions.has('COMMUNICATION_CREATE')}
              canTask={user.permissions.has('TASKS_CREATE')}
            />
          </div>
        ) : null}
      </Card>

      {duplicates.length > 0 ? (
        <Alert tone="warn" title="This may be the same property as another record" className="mb-4">
          <ul className="mt-1 space-y-1">
            {duplicates.map((match) => (
              <li key={match.propertyId}>
                <Link
                  href={`/properties/${property.id}/merge?with=${match.propertyId}`}
                  className="underline"
                >
                  {match.addressLine} ({match.propertyRef})
                </Link>{' '}
                — {match.reasons.join(', ')}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------------- Photographs ---------------- */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Photographs"
            description="The cover image is what appears in lists. Marketing photographs may be used publicly."
          />
          {photos.length === 0 ? (
            <EmptyState
              title="No photographs yet"
              description="Add photographs so the property is recognisable in a list and ready for marketing."
              className="py-8"
            />
          ) : (
            <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 sm:p-5">
              {photos.map((photo) => (
                <li key={photo.id} className="overflow-hidden rounded-lg border border-line-soft">
                  <a
                    href={`/api/files/photo/${photo.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    {/* A plain img on purpose: the source is the authorised
                        file route, which the image optimiser cannot read. */}
                    <img
                      src={`/api/files/photo/${photo.id}`}
                      alt={photo.caption ?? `Photograph of ${property.addressLine}`}
                      className="aspect-[4/3] w-full object-cover"
                      loading="lazy"
                    />
                  </a>
                  <div className="flex flex-wrap gap-1 px-2 pt-2">
                    {photo.isCover ? <Badge tone="brand">Cover</Badge> : null}
                    {!photo.isMarketing ? <Badge>Private</Badge> : null}
                  </div>
                  {canEdit ? (
                    <PhotoActions
                      propertyId={property.id}
                      photoId={photo.id}
                      caption={photo.caption}
                      isCover={photo.isCover}
                      isMarketing={photo.isMarketing}
                    />
                  ) : photo.caption ? (
                    <p className="px-2 py-2 text-xs text-ink-soft">{photo.caption}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canEdit ? <PhotoUploadPanel propertyId={property.id} /> : null}
        </Card>

        {/* ---------------- What is it ---------------- */}
        <Card>
          <CardHeader title="The property" />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                { label: 'Erf number', value: property.erfNumber },
                { label: 'Portion', value: property.portionNumber },
                { label: 'Township', value: property.township },
                { label: 'Property name', value: property.propertyName },
                { label: 'Street address', value: property.streetAddress, span: true },
                { label: 'Suburb', value: property.suburb },
                { label: 'Town or city', value: property.city },
                { label: 'Province', value: property.province },
                { label: 'Postal code', value: property.postalCode },
                { label: 'Type', value: labelOf(PROPERTY_TYPES, property.propertyType) },
                {
                  label: 'Bedrooms',
                  value: property.bedrooms ? formatNumber(Number(property.bedrooms)) : null,
                },
                {
                  label: 'Bathrooms',
                  value: property.bathrooms ? formatNumber(Number(property.bathrooms)) : null,
                },
                { label: 'Garages', value: property.garages },
                { label: 'Other parking', value: property.parking },
                {
                  label: 'Land size',
                  value: property.landSizeSqm
                    ? `${formatNumber(Number(property.landSizeSqm))} m²`
                    : null,
                },
                {
                  label: 'Building size',
                  value: property.buildingSizeSqm
                    ? `${formatNumber(Number(property.buildingSizeSqm))} m²`
                    : null,
                },
                { label: 'Internal notes', value: property.notes, span: true },
              ]}
            />
          </div>
        </Card>

        {/* ---------------- Money ---------------- */}
        <Card>
          <CardHeader title="Price" description="Every change is kept in the price history." />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                { label: 'Original asking price', value: formatMoney(property.originalAskingPrice) },
                { label: 'Current asking price', value: formatMoney(property.currentAskingPrice) },
                { label: 'Estimated value', value: formatMoney(property.estimatedValue) },
                {
                  label: 'Monthly rental',
                  value: property.monthlyRental
                    ? `${formatMoney(property.monthlyRental)} per month`
                    : null,
                },
                {
                  label: 'Mandate',
                  value: property.mandateStart
                    ? `${formatDate(property.mandateStart)} to ${
                        property.mandateExpiry ? formatDate(property.mandateExpiry) : 'no expiry'
                      }`
                    : null,
                  span: true,
                },
              ]}
            />
          </div>
          {history.prices.length > 0 ? (
            <ul className="divide-y divide-line-soft border-t border-line-soft">
              {history.prices.map((entry, index) => (
                <li key={index} className="px-4 py-2 text-[0.8125rem] sm:px-5">
                  <span className="font-medium text-ink">
                    {entry.oldPrice ? formatMoney(entry.oldPrice) : 'Not set'} →{' '}
                    {entry.newPrice ? formatMoney(entry.newPrice) : 'Not set'}
                  </span>
                  <span className="text-ink-faint">
                    {' '}
                    · {entry.priceKind} · {formatDate(entry.changedAt)}
                    {entry.changedByName ? ` · ${entry.changedByName}` : ''}
                    {entry.reason ? ` · ${entry.reason}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        {/* ---------------- People ---------------- */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Who is involved?"
            description="Owners, co-owners, landlords, tenants and interested parties."
          />
          {property.people.length === 0 ? (
            <EmptyState title="Nobody linked to this property yet" className="py-6" />
          ) : (
            <TableScroll>
              <Table className="min-w-[42rem]">
                <thead>
                  <tr>
                    <Th>Person</Th>
                    <Th>Role</Th>
                    <Th align="right">Share</Th>
                    <Th>Contact</Th>
                    <Th>Period</Th>
                    {canEdit ? <Th /> : null}
                  </tr>
                </thead>
                <tbody>
                  {property.people.map((link) => (
                    <Tr key={link.id}>
                      <Td>
                        <Link
                          href={`/people/${link.personId}`}
                          className="font-medium text-ink hover:text-brand"
                        >
                          {link.personName}
                        </Link>
                        <div className="font-mono text-[0.6875rem] text-ink-faint">
                          {link.personRef}
                        </div>
                        {link.isPrimaryContact ? <Badge tone="brand">Primary contact</Badge> : null}
                      </Td>
                      <Td className="text-[0.8125rem]">
                        {labelOf(PROPERTY_PERSON_ROLES, link.role)}
                      </Td>
                      <Td align="right" className="text-[0.8125rem]">
                        {link.ownershipPercent ? `${Number(link.ownershipPercent)}%` : '—'}
                      </Td>
                      <Td className="text-[0.8125rem] tabular-nums">
                        {formatZaPhone(link.personMobile) || link.personEmail || '—'}
                      </Td>
                      <Td className="text-[0.6875rem] text-ink-faint">
                        {link.startDate ? formatDate(link.startDate) : '—'}
                        {link.endDate ? ` to ${formatDate(link.endDate)}` : ''}
                      </Td>
                      {canEdit ? (
                        <Td>
                          <UnlinkPersonButton propertyId={property.id} linkId={link.id} />
                        </Td>
                      ) : null}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>
          )}
          {canEdit && people.length > 0 ? (
            <LinkPersonPanel propertyId={property.id} people={people} />
          ) : null}
        </Card>

        {/* ---------------- Entities ---------------- */}
        {user.permissions.has('PEOPLE_VIEW') ? (
          <Card>
            <CardHeader
              title="Companies and trusts"
              description="Where the owner is an entity rather than a person."
            />
            {companies.length === 0 ? (
              <EmptyState
                title="No entity is linked to this property"
                description="If a company, trust or close corporation holds it, link that entity so its FICA file and the people behind it are one click away."
                className="py-6"
              />
            ) : (
              <ul className="divide-y divide-line-soft">
                {companies.map((entry) => (
                  <li key={entry.linkId} className="px-4 py-2.5 sm:px-5">
                    <Link
                      href={`/companies/${entry.companyId}`}
                      className="text-sm font-medium text-ink hover:text-brand"
                    >
                      {entry.registeredName}
                    </Link>{' '}
                    <span className="font-mono text-[0.6875rem] text-ink-faint">
                      {entry.companyRef}
                    </span>
                    <p className="text-[0.6875rem] text-ink-faint">
                      {labelOf(PROPERTY_COMPANY_ROLES, entry.role)}
                      {entry.ownershipPercent ? ` \u00b7 ${Number(entry.ownershipPercent)}%` : ''}
                    </p>
                    {user.permissions.has('FICA_VIEW') ? (
                      <p className="mt-1">
                        {entry.ficaStatus ? (
                          <Badge tone={statusTone(entry.ficaStatus)}>
                            FICA: {labelOf(FICA_STATUSES, entry.ficaStatus)}
                          </Badge>
                        ) : (
                          <Badge tone="warn">No FICA file opened</Badge>
                        )}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && linkableCompanies.length > 0 ? (
              <LinkCompanyToPropertyPanel
                propertyId={property.id}
                companies={linkableCompanies}
              />
            ) : null}
          </Card>
        ) : null}

        {/* ---------------- Marketing ---------------- */}
        <Card>
          <CardHeader
            title="Marketing"
            description="Kept apart from internal notes."
            actions={
              property.marketing ? (
                <Badge tone={statusTone(property.marketing.marketingStatus)}>
                  {labelOf(MARKETING_STATUSES, property.marketing.marketingStatus)}
                </Badge>
              ) : (
                <Badge>Not prepared</Badge>
              )
            }
          />
          {canMarket ? (
            <MarketingPanel propertyId={property.id} marketing={property.marketing} />
          ) : (
            <div className="p-4 sm:p-5">
              <DescriptionList
                columns={1}
                items={[
                  { label: 'Headline', value: property.marketing?.headline },
                  { label: 'Short description', value: property.marketing?.shortDescription },
                  { label: 'Full description', value: property.marketing?.fullDescription },
                  { label: 'On show', value: property.marketing?.onShowInfo },
                ]}
              />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Where it is advertised" description="Recorded by hand, channel by channel." />
          {canMarket ? (
            <MarketingChannelPanel propertyId={property.id} channels={channels} />
          ) : (
            <div className="p-4 sm:p-5">
              {channels.length === 0 ? (
                <p className="text-sm text-ink-faint">Nothing recorded.</p>
              ) : (
                <ul className="space-y-1 text-[0.8125rem]">
                  {channels.map((channel) => (
                    <li key={channel.id}>
                      {channel.channel} —{' '}
                      {channel.isPublished ? 'recorded as advertised' : 'not advertised'}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        {/* ---------------- Status and mandate history ---------------- */}
        <Card>
          <CardHeader
            title="Status history"
            description="Which status changed, from what, to what, by whom."
          />
          {history.statuses.length === 0 ? (
            <EmptyState title="No status changes recorded" className="py-6" />
          ) : (
            <ul className="max-h-80 divide-y divide-line-soft overflow-y-auto">
              {history.statuses.map((entry, index) => (
                <li key={index} className="px-4 py-2 text-[0.8125rem] sm:px-5">
                  <span className="font-medium text-ink">{describeStatusKind(entry.statusKind)}</span>{' '}
                  <span className="text-ink">
                    {entry.oldValue ? humanStatus(entry.statusKind, entry.oldValue) : 'not set'} →{' '}
                    {entry.newValue ? humanStatus(entry.statusKind, entry.newValue) : 'not set'}
                  </span>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {formatDateTime(entry.changedAt)}
                    {entry.changedByName ? ` · ${entry.changedByName}` : ''}
                    {entry.reason ? ` · ${entry.reason}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Mandate history" />
          {history.mandates.length === 0 ? (
            <EmptyState title="No mandate recorded" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {history.mandates.map((entry, index) => (
                <li key={index} className="px-4 py-2 text-[0.8125rem] sm:px-5">
                  <span className="font-medium text-ink">
                    {entry.mandateType ? labelOf(MANDATE_TYPES, entry.mandateType) : 'No type'} ·{' '}
                    {entry.mandateStatus ? labelOf(MANDATE_STATUSES, entry.mandateStatus) : ''}
                  </span>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {entry.mandateStart ? formatDate(entry.mandateStart) : 'no start'}
                    {entry.mandateExpiry ? ` to ${formatDate(entry.mandateExpiry)}` : ''} ·{' '}
                    {formatDateTime(entry.recordedAt)}
                    {entry.recordedByName ? ` · ${entry.recordedByName}` : ''}
                    {entry.reason ? ` · ${entry.reason}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---------------- Past sales and rentals ---------------- */}
        {user.permissions.has('SALES_VIEW') ? (
          <Card>
            <CardHeader
              title="Past sales"
              description="Concluded and registered are separate dates."
            />
            {sales.length === 0 ? (
              <EmptyState title="No past sales recorded" className="py-6" />
            ) : (
              <ul className="divide-y divide-line-soft">
                {sales.map((sale, index) => (
                  <li key={index} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                    <span className="font-medium text-ink">
                      {formatMoney(sale.sale_price) || 'Price not recorded'}
                    </span>
                    <span className="text-ink-faint">
                      {' '}
                      · sold {sale.sale_date ? formatDate(sale.sale_date) : 'date not recorded'}
                      {sale.registered_at
                        ? ` · registered ${formatDate(sale.registered_at)}`
                        : ' · not yet registered'}
                    </span>
                    <div className="text-[0.6875rem] text-ink-faint">
                      {[
                        sale.seller_name ? `Seller ${sale.seller_name}` : null,
                        sale.buyer_name ? `Buyer ${sale.buyer_name}` : null,
                        sale.agent_name ? `Agent ${sale.agent_name}` : null,
                        sale.sale_outcome ? labelOf(SALE_OUTCOMES, sale.sale_outcome) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {user.permissions.has('SALES_EDIT') ? (
              <SaleHistoryPanel propertyId={property.id} people={people} agents={agents} />
            ) : null}
          </Card>
        ) : null}

        {user.permissions.has('RENTALS_VIEW') ? (
          <Card>
            <CardHeader title="Past rentals" />
            {rentals.length === 0 ? (
              <EmptyState title="No past rentals recorded" className="py-6" />
            ) : (
              <ul className="divide-y divide-line-soft">
                {rentals.map((rental) => (
                  <li key={rental.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                    <span className="font-medium text-ink">
                      {formatMoney(rental.monthly_rental) || 'Rent not recorded'} per month
                    </span>
                    <span className="text-ink-faint">
                      {' '}
                      · {rental.lease_start ? formatDate(rental.lease_start) : 'start not recorded'}
                      {rental.lease_end ? ` to ${formatDate(rental.lease_end)}` : ''}
                    </span>
                    <div className="text-[0.6875rem] text-ink-faint">
                      {[
                        rental.landlord_name ? `Landlord ${rental.landlord_name}` : null,
                        rental.tenant_name ? `Tenant ${rental.tenant_name}` : null,
                        rental.agent_name ? `Agent ${rental.agent_name}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    {/* Letting commission, which is earned on the lease
                        rather than on any registration (spec 62). */}
                    {user.permissions.has('COMMISSION_VIEW') ? (
                      rental.commission_id ? (
                        <Link
                          href={`/commissions/${rental.commission_id}`}
                          className="text-[0.6875rem] font-medium text-brand hover:underline"
                        >
                          The commission on this lease
                        </Link>
                      ) : user.permissions.has('COMMISSION_CREATE') ? (
                        <Link
                          href={`/commissions/new?rentalId=${rental.id}`}
                          className="text-[0.6875rem] font-medium text-brand hover:underline"
                        >
                          Work out the commission
                        </Link>
                      ) : null
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {user.permissions.has('RENTALS_EDIT') ? (
              <RentalHistoryPanel propertyId={property.id} people={people} agents={agents} />
            ) : null}
          </Card>
        ) : null}

        {/* ---------------- Documents ---------------- */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Documents"
            description="Mandates, deeds, offers and agreements. Stored privately and only ever served to authorised users."
          />
          {documents.length === 0 ? (
            <EmptyState title="No documents attached" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {documents.map((document) => (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/files/document/${document.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-ink hover:text-brand"
                    >
                      {document.fileName}
                    </a>
                    <p className="text-[0.6875rem] text-ink-faint">
                      {labelOf(DOCUMENT_CATEGORIES, document.category)}
                      {document.documentType ? ` · ${document.documentType}` : ''} ·{' '}
                      {Math.max(1, Math.round(document.byteSize / 1024))} KB ·{' '}
                      {formatDate(document.uploadedAt)}
                      {document.uploadedByName ? ` · ${document.uploadedByName}` : ''}
                      {document.expiresAt ? ` · expires ${formatDate(document.expiresAt)}` : ''}
                    </p>
                  </div>
                  {canEdit ? (
                    <ArchiveDocumentButton propertyId={property.id} documentId={document.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canEdit ? <DocumentUploadPanel propertyId={property.id} /> : null}
        </Card>

        {/* ---------------- Assignment ---------------- */}
        {canEdit && agents.length > 0 ? (
          <Card>
            <CardHeader title="Agent assignment" description="Previous assignments are kept." />
            <AssignPropertyAgentPanel
              propertyId={property.id}
              agents={agents}
              primaryAgentId={property.primaryAgentId}
              secondaryAgentId={property.secondaryAgentId}
            />
            {history.assignments.length > 0 ? (
              <ul className="divide-y divide-line-soft border-t border-line-soft">
                {history.assignments.map((entry, index) => (
                  <li key={index} className="px-4 py-2 text-[0.8125rem] sm:px-5">
                    <span className="font-medium">{entry.agentName ?? 'Unassigned'}</span>{' '}
                    <span className="text-ink-faint">
                      ({entry.assignment}) from {formatDate(entry.assignedAt)}
                      {entry.unassignedAt ? ` until ${formatDate(entry.unassignedAt)}` : ' — current'}
                      {entry.reason ? ` · ${entry.reason}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        ) : null}

        {/* ---------------- Record ---------------- */}
        <RelatedRecordCards records={related} user={user} scope={{ propertyId: property.id }} />

        <Card>
          <CardHeader title="Record" />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                {
                  label: 'Property reference',
                  value: <span className="font-mono">{property.propertyRef}</span>,
                },
                { label: 'Office', value: property.officeName },
                { label: 'Team', value: property.teamName },
                {
                  label: 'Created',
                  value: `${formatDate(property.createdAt)}${
                    property.createdByName ? ` by ${property.createdByName}` : ''
                  }`,
                },
                {
                  label: 'Last updated',
                  value: `${formatDate(property.updatedAt)}${
                    property.updatedByName ? ` by ${property.updatedByName}` : ''
                  }`,
                },
              ]}
            />
          </div>
          {user.permissions.has('PROPERTIES_DELETE') && !property.mergedIntoId ? (
            <div className="border-t border-line-soft">
              <ArchivePropertyPanel
                propertyId={property.id}
                propertyRef={property.propertyRef}
                isArchived={property.isArchived}
              />
            </div>
          ) : null}
        </Card>

        {user.permissions.has('AUDIT_LOG_VIEW') ? (
          <Card className="lg:col-span-2">
            <CardHeader
              title="Audit history"
              description="What changed, who changed it and when."
            />
            {audit.length === 0 ? (
              <EmptyState title="Nothing recorded yet" className="py-6" />
            ) : (
              <ul className="divide-y divide-line-soft">
                {audit.map((entry, index) => (
                  <li key={index} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                    <span className="font-medium text-ink">
                      {describeAuditAction(entry.action)}
                    </span>
                    <span className="text-ink-faint">
                      {' '}
                      · {formatDateTime(entry.occurred_at)}
                      {entry.actor_email ? ` · ${entry.actor_email}` : ''}
                    </span>
                    {entry.changes ? (
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {Object.keys(entry.changes).map(describeField).join(', ')}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}

function StatusFact({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'brand' | 'ok' | 'warn' | 'stop' | 'info';
  hint?: string;
}) {
  return (
    <div>
      <p className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <Badge tone={tone}>{value}</Badge>
      {hint ? <p className="mt-1 text-[0.6875rem] text-ink-faint">{hint}</p> : null}
    </div>
  );
}

const STATUS_KIND_LABELS: Record<string, string> = {
  property: 'Property status',
  sales: 'Sales status',
  rental: 'Rental status',
  mandate: 'Mandate status',
  sale_outcome: 'Sale outcome',
  business_area: 'Business area',
};

function describeStatusKind(kind: string): string {
  return STATUS_KIND_LABELS[kind] ?? kind;
}

const STATUS_KIND_MAPS: Record<string, Record<string, string>> = {
  property: PROPERTY_STATUSES,
  sales: SALES_STATUSES,
  rental: RENTAL_STATUSES,
  mandate: MANDATE_STATUSES,
  sale_outcome: SALE_OUTCOMES,
  business_area: BUSINESS_AREAS,
};

function humanStatus(kind: string, value: string): string {
  const map = STATUS_KIND_MAPS[kind];
  return map ? labelOf(map, value) : value;
}
