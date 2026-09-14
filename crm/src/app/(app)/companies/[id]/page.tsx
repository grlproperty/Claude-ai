import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { COMPANY_ROLES, ENTITY_TYPES, PROPERTY_COMPANY_ROLES, getCompany } from '@/lib/companies.ts';
import { FICA_STATUSES, ficaFor } from '@/lib/fica.ts';
import { listDocuments } from '@/lib/files.ts';
import { BUSINESS_AREAS, labelOf, statusTone } from '@/lib/domain.ts';
import { formatDate } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { DescriptionList } from '@/components/ui/table.tsx';
import { ArchiveCompanyPanel, LinkPersonPanel, UnlinkPersonButton } from '../forms.tsx';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('PEOPLE_VIEW', `/companies/${id}`);
  const company = await readAsUser(user.id, (db) => getCompany(db, id));
  return { title: company ? `${company.registeredName} · ${company.companyRef}` : 'Entity' };
}

const SAVED_MESSAGES: Record<string, string> = {
  created: 'Entity created.',
  updated: 'Saved.',
};

export default async function CompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const user = await requirePermissionOrRedirect('PEOPLE_VIEW', `/companies/${id}`);

  const data = await readAsUser(user.id, async (db) => {
    const company = await getCompany(db, id);
    if (!company) return null;
    return {
      company,
      fica: user.permissions.has('FICA_VIEW') ? await ficaFor(db, { companyId: id }) : null,
      documents: await listDocuments(db, { companyId: id }),
      linkable: user.permissions.has('PEOPLE_EDIT')
        ? await db.query<{ id: string; label: string }>(
            `select id, first_name || ' ' || surname || ' (' || client_ref || ')' as label
               from people
              where merged_into_id is null and not is_archived
              order by surname, first_name limit 300`,
          )
        : [],
    };
  });
  if (!data) notFound();

  const { company, fica, documents, linkable } = data;
  const canEdit = user.permissions.has('PEOPLE_EDIT');

  const controllers = company.people.filter((entry) =>
    ['director', 'member', 'trustee', 'partner'].includes(entry.role),
  );
  const activeControllers = controllers.filter((entry) => !entry.resignedOn);

  return (
    <>
      {saved && SAVED_MESSAGES[saved] ? (
        <Alert tone="ok" className="mb-4">
          {SAVED_MESSAGES[saved]}
        </Alert>
      ) : null}

      {company.isArchived ? (
        <Alert tone="warn" title="This entity is archived" className="mb-4">
          {company.archiveReason ?? 'No reason was recorded.'}
        </Alert>
      ) : null}

      <PageHeader
        eyebrow={<span className="font-mono">{company.companyRef}</span>}
        title={company.registeredName}
        description={
          <>
            {labelOf(ENTITY_TYPES, company.entityType)} ·{' '}
            {labelOf(BUSINESS_AREAS, company.businessArea)}
            {company.tradingName ? ` · trading as ${company.tradingName}` : ''}
            {company.primaryAgentName ? ` · ${company.primaryAgentName}` : ''}
          </>
        }
        actions={
          canEdit ? (
            <ButtonLink href={`/companies/${company.id}/edit`} tone="primary">
              Edit
            </ButtonLink>
          ) : null
        }
      />

      {activeControllers.length === 0 ? (
        <Alert tone="warn" title="Nobody is recorded as controlling this entity" className="mb-4">
          FICA is largely about establishing who is really behind an entity. Until at least one
          director, member or trustee is recorded, that question is unanswered.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="The entity" />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                { label: 'Registered name', value: company.registeredName },
                { label: 'Trading as', value: company.tradingName },
                { label: 'Kind', value: labelOf(ENTITY_TYPES, company.entityType) },
                { label: 'Registration number', value: company.registrationNumber },
                { label: 'VAT number', value: company.vatNumber },
                { label: 'Tax number', value: company.taxNumber },
                {
                  label: 'Registered address',
                  value:
                    [
                      company.addressLine1,
                      company.addressLine2,
                      company.suburb,
                      company.city,
                      company.province,
                      company.postalCode,
                    ]
                      .filter(Boolean)
                      .join(', ') || null,
                  span: true,
                },
                { label: 'Primary agent', value: company.primaryAgentName },
                { label: 'Sharing agent', value: company.secondaryAgentName },
                { label: 'Notes', value: company.notes, span: true },
                {
                  label: 'Created',
                  value: `${formatDate(company.createdAt)}${company.createdByName ? ` by ${company.createdByName}` : ''}`,
                  span: true,
                },
              ]}
            />
          </div>
          {user.permissions.has('PEOPLE_DELETE') ? (
            <div className="border-t border-line-soft">
              <ArchiveCompanyPanel companyId={company.id} isArchived={company.isArchived} />
            </div>
          ) : null}
        </Card>

        {user.permissions.has('FICA_VIEW') ? (
          <Card>
            <CardHeader
              title="FICA"
              description="Recorded by a person. The CRM verifies nothing."
              actions={
                fica ? (
                  <ButtonLink href={`/fica/${fica.id}`} size="sm">
                    Open the file
                  </ButtonLink>
                ) : user.permissions.has('FICA_CREATE') ? (
                  <ButtonLink href={`/fica/new?companyId=${company.id}`} size="sm" tone="primary">
                    Open a file
                  </ButtonLink>
                ) : null
              }
            />
            <div className="p-4 sm:p-5">
              {fica ? (
                <DescriptionList
                  items={[
                    {
                      label: 'Status',
                      value: (
                        <Badge tone={statusTone(fica.status)}>
                          {labelOf(FICA_STATUSES, fica.status)}
                        </Badge>
                      ),
                    },
                    {
                      label: 'Verified by',
                      value: fica.verifiedByName
                        ? `${fica.verifiedByName} on ${formatDate(fica.verifiedAt)}`
                        : 'Not yet',
                    },
                    {
                      label: 'Needs redoing by',
                      value: fica.expiresOn ? formatDate(fica.expiresOn) : null,
                    },
                    { label: 'Risk', value: fica.riskRating },
                  ]}
                />
              ) : (
                <p className="text-[0.8125rem] text-ink-soft">
                  No FICA file has been opened for this entity.
                </p>
              )}
              {fica?.isExpired ? (
                <p className="mt-2">
                  <Badge tone="stop">Needs refreshing</Badge>
                </p>
              ) : null}
            </div>
          </Card>
        ) : null}

        <Card className="lg:col-span-2">
          <CardHeader
            title="Who is behind it"
            description="Directors, trustees, members and anyone holding enough to control it."
          />
          {company.people.length === 0 ? (
            <EmptyState title="Nobody recorded yet" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {company.people.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/people/${entry.personId}`}
                      className="text-sm font-medium text-ink hover:text-brand"
                    >
                      {entry.personName}
                    </Link>{' '}
                    <span className="font-mono text-[0.6875rem] text-ink-faint">
                      {entry.personRef}
                    </span>
                    {entry.isPrimaryContact ? <Badge tone="brand">We deal with them</Badge> : null}
                    {entry.resignedOn ? <Badge>Resigned</Badge> : null}
                    <p className="text-[0.6875rem] text-ink-faint">
                      {labelOf(COMPANY_ROLES, entry.role)}
                      {entry.shareholdingPercent ? ` · ${entry.shareholdingPercent}%` : ''}
                      {entry.appointedOn ? ` · from ${formatDate(entry.appointedOn)}` : ''}
                      {entry.resignedOn ? ` until ${formatDate(entry.resignedOn)}` : ''}
                    </p>
                  </div>
                  {canEdit ? (
                    <UnlinkPersonButton
                      companyId={company.id}
                      linkId={entry.id}
                      label={entry.personName}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canEdit && linkable.length > 0 ? (
            <LinkPersonPanel companyId={company.id} people={linkable} />
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Properties" />
          {company.properties.length === 0 ? (
            <EmptyState title="No properties linked" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {company.properties.map((entry) => (
                <li key={entry.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <Link
                    href={`/properties/${entry.propertyId}`}
                    className="font-medium text-ink hover:text-brand"
                  >
                    {entry.propertyLabel ?? entry.propertyRef}
                  </Link>
                  <p className="text-[0.6875rem] text-ink-faint">
                    {labelOf(PROPERTY_COMPANY_ROLES, entry.role)}
                    {entry.ownershipPercent ? ` · ${entry.ownershipPercent}%` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Documents" description="Kept in private storage, never public." />
          {documents.length === 0 ? (
            <EmptyState title="No documents" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {documents.map((document) => (
                <li key={document.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <span className="font-medium text-ink">{document.fileName}</span>
                  <p className="text-[0.6875rem] text-ink-faint">
                    {document.category} · {formatDate(document.uploadedAt)}
                    {document.uploadedByName ? ` · ${document.uploadedByName}` : ''}
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
