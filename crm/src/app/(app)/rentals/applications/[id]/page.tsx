import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getRentalApplication, listScreening } from '@/lib/rentals.ts';
import { listDocuments } from '@/lib/files.ts';
import {
  RENTAL_APPLICATION_STATUSES,
  SCREENING_ITEM_STATUSES,
  SCREENING_STATUSES,
  labelOf,
  statusTone,
} from '@/lib/domain.ts';
import { formatDate, formatMoney } from '@/lib/format.ts';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  PageHeader,
} from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { DescriptionList } from '@/components/ui/table.tsx';
import { QuickActions } from '@/components/quick-actions.tsx';
import { ScreeningChecklist } from '../../forms.tsx';

export const dynamic = 'force-dynamic';

const SAVED: Record<string, string> = {
  created: 'Application created.',
  updated: 'Application saved.',
};

export default async function RentalApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const user = await requirePermissionOrRedirect('RENTALS_VIEW', `/rentals/applications/${id}`);

  const data = await readAsUser(user.id, async (db) => {
    const application = await getRentalApplication(db, id);
    if (!application) return null;
    return {
      application,
      screening: await listScreening(db, id),
      documents: await listDocuments(db, { rentalApplicationId: id }),
    };
  });
  if (!data) notFound();
  const { application, screening, documents } = data;

  const canEdit = user.permissions.has('RENTALS_EDIT');

  return (
    <>
      {saved && SAVED[saved] ? (
        <Alert tone="ok" className="mb-4">
          {SAVED[saved]}
        </Alert>
      ) : null}

      <PageHeader
        eyebrow={<span className="font-mono">{application.applicationRef}</span>}
        title={application.propertyLabel ?? application.propertyRef}
        description={
          <>
            {application.applicantName ?? 'Applicant not recorded'}
            {application.coApplicantName ? ` with ${application.coApplicantName}` : ''}
            {application.landlordName ? ` · Landlord: ${application.landlordName}` : ''}
          </>
        }
        actions={
          <>
            <ButtonLink href={`/properties/${application.propertyId}`}>
              Open the property
            </ButtonLink>
            {canEdit ? (
              <ButtonLink href={`/rentals/applications/${application.id}/edit`} tone="primary">
                Edit
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line-soft px-4 py-3.5 sm:px-5">
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Application
            </p>
            <Badge tone={statusTone(application.applicationStatus)}>
              {labelOf(RENTAL_APPLICATION_STATUSES, application.applicationStatus)}
            </Badge>
          </div>
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Screening
            </p>
            <Badge tone={statusTone(application.screeningStatus)}>
              {labelOf(SCREENING_STATUSES, application.screeningStatus)}
            </Badge>
          </div>
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Monthly rental
            </p>
            <p className="text-sm">{formatMoney(application.monthlyRental) || 'Not recorded'}</p>
          </div>
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Lease
            </p>
            <p className="text-sm">
              {application.leaseStart
                ? `${formatDate(application.leaseStart)}${
                    application.leaseEnd ? ` to ${formatDate(application.leaseEnd)}` : ''
                  }`
                : 'Not set'}
            </p>
          </div>
        </div>
        {application.applicantMobile || application.applicantEmail ? (
          <div className="px-4 py-3.5 sm:px-5">
            <QuickActions
              mobile={application.applicantMobile}
              email={application.applicantEmail}
              personId={application.applicantId ?? undefined}
              propertyId={application.propertyId}
              canLog={user.permissions.has('COMMUNICATION_CREATE')}
              canTask={user.permissions.has('TASKS_CREATE')}
            />
          </div>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="The application" />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                {
                  label: 'Applicant',
                  value: application.applicantId ? (
                    <Link
                      href={`/people/${application.applicantId}`}
                      className="text-brand underline"
                    >
                      {application.applicantName}
                    </Link>
                  ) : null,
                },
                { label: 'Co-applicant', value: application.coApplicantName },
                {
                  label: 'Landlord',
                  value: application.landlordId ? (
                    <Link
                      href={`/people/${application.landlordId}`}
                      className="text-brand underline"
                    >
                      {application.landlordName}
                    </Link>
                  ) : null,
                },
                { label: 'Agent', value: application.agentName },
                { label: 'Deposit', value: formatMoney(application.deposit) },
                {
                  label: 'Approved',
                  value: application.approvalDate ? formatDate(application.approvalDate) : null,
                },
                {
                  label: 'Rejected',
                  value: application.rejectionDate ? formatDate(application.rejectionDate) : null,
                },
                { label: 'Rejection reason', value: application.rejectionReason, span: true },
                { label: 'Notes', value: application.notes, span: true },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Screening"
            description="Configured by GRLP, so the checks can change without a new release."
          />
          {canEdit ? (
            <ScreeningChecklist applicationId={application.id} items={screening} />
          ) : (
            <ul className="divide-y divide-line-soft">
              {screening.map((item) => (
                <li key={item.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <span className="font-medium text-ink">{item.name}</span>
                  <span className="text-ink-faint">
                    {' '}
                    · {labelOf(SCREENING_ITEM_STATUSES, item.status)}
                  </span>
                  {item.notes ? (
                    <p className="text-[0.6875rem] text-ink-faint">{item.notes}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Documents" />
          {documents.length === 0 ? (
            <EmptyState title="No documents attached" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {documents.map((document) => (
                <li key={document.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <a
                    href={`/api/files/document/${document.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-ink hover:text-brand"
                  >
                    {document.fileName}
                  </a>
                  <span className="text-[0.6875rem] text-ink-faint">
                    {' '}
                    · {formatDate(document.uploadedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
