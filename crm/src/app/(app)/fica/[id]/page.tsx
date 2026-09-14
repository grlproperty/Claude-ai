import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import {
  FICA_CHECK_STATUSES,
  FICA_STATUSES,
  RISK_RATINGS,
  ficaHistory,
  getFicaRecord,
  listFicaChecks,
} from '@/lib/fica.ts';
import { labelOf, statusTone } from '@/lib/domain.ts';
import { formatDate, formatDateTime } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { DescriptionList } from '@/components/ui/table.tsx';
import { FicaChecklist, FicaForm } from '../forms.tsx';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('FICA_VIEW', `/fica/${id}`);
  const record = await readAsUser(user.id, (db) => getFicaRecord(db, id));
  return { title: record ? `${record.ficaRef} · FICA` : 'FICA' };
}

export default async function FicaRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const user = await requirePermissionOrRedirect('FICA_VIEW', `/fica/${id}`);

  const data = await readAsUser(user.id, async (db) => {
    const record = await getFicaRecord(db, id);
    if (!record) return null;
    return {
      record,
      checks: await listFicaChecks(db, id),
      history: await ficaHistory(db, id),
    };
  });
  if (!data) notFound();

  const { record, checks, history } = data;
  const canEdit = user.permissions.has('FICA_EDIT');

  const outstanding = checks.filter(
    (check) => check.isRequired && !['seen_against_original', 'not_applicable'].includes(check.status),
  );

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/fica">FICA</Link>}
        title={record.personName ?? record.companyName ?? record.ficaRef}
        description={
          <>
            <span className="font-mono">{record.ficaRef}</span> ·{' '}
            {labelOf(FICA_STATUSES, record.status)}
            {record.companyId ? ' · an entity' : ''}
          </>
        }
        actions={
          record.personId ? (
            <ButtonLink href={`/people/${record.personId}`}>The client</ButtonLink>
          ) : record.companyId ? (
            <ButtonLink href={`/companies/${record.companyId}`}>The entity</ButtonLink>
          ) : null
        }
      />

      {saved === 'yes' ? (
        <Alert tone="ok" className="mb-4">
          Saved.
        </Alert>
      ) : null}

      {record.status === 'verified' ? (
        <Alert tone="ok" title="Verified by a person, not by software" className="mb-4">
          {record.verifiedByName ?? 'Somebody'} recorded this as verified on{' '}
          {formatDate(record.verifiedAt)}
          {record.verificationNote ? ` — ${record.verificationNote}` : ''}.
          {record.expiresOn ? ` It needs redoing by ${formatDate(record.expiresOn)}.` : ''}
        </Alert>
      ) : null}

      {record.isExpired ? (
        <Alert tone="stop" title="This file needs refreshing" className="mb-4">
          It was verified{record.verifiedAt ? ` on ${formatDate(record.verifiedAt)}` : ''} but is
          now past{record.expiresOn ? ` ${formatDate(record.expiresOn)}` : ' its date'}. Nobody has
          looked at it since, so it should not be relied on.
        </Alert>
      ) : null}

      {record.status === 'rejected' ? (
        <Alert tone="stop" title="Rejected" className="mb-4">
          {record.rejectionReason}
          {record.rejectedByName ? ` — ${record.rejectedByName}` : ''}
          {record.rejectedAt ? ` on ${formatDate(record.rejectedAt)}` : ''}
        </Alert>
      ) : null}

      {record.pepDeclared ? (
        <Alert tone="warn" title="Declared as a politically exposed person" className="mb-4">
          {record.pepNote ?? 'The client answered yes when asked.'} This is what they told us; the
          CRM checked no list.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="The file" />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                {
                  label: 'Status',
                  value: (
                    <Badge tone={statusTone(record.status)}>
                      {labelOf(FICA_STATUSES, record.status)}
                    </Badge>
                  ),
                },
                {
                  label: 'Risk',
                  value: record.riskRating ? labelOf(RISK_RATINGS, record.riskRating) : 'Not assessed',
                },
                { label: 'Why that rating', value: record.riskNote, span: true },
                {
                  label: 'Politically exposed',
                  value:
                    record.pepDeclared === null
                      ? 'Not asked yet'
                      : record.pepDeclared
                        ? 'They said yes'
                        : 'They said no',
                },
                { label: 'Source of funds', value: record.sourceOfFunds, span: true },
                { label: 'What the relationship is for', value: record.purposeOfRelationship, span: true },
                {
                  label: 'Verified by',
                  value: record.verifiedByName
                    ? `${record.verifiedByName} on ${formatDate(record.verifiedAt)}`
                    : 'Not yet',
                  span: true,
                },
                { label: 'Needs redoing by', value: record.expiresOn ? formatDate(record.expiresOn) : null },
                {
                  label: 'Opened',
                  value: `${formatDate(record.createdAt)}${record.createdByName ? ` by ${record.createdByName}` : ''}`,
                  span: true,
                },
                { label: 'Notes', value: record.notes, span: true },
              ]}
            />
          </div>
        </Card>

        {/* min-w-0: a grid item will not shrink below its widest child
            otherwise, and a wide table inside would push the page sideways
            on a phone (spec 101, 139). */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {outstanding.length > 0 ? (
            <Alert tone="warn" title={`${outstanding.length} required item(s) outstanding`}>
              {outstanding.map((check) => check.name).join(', ')}. The file cannot be recorded as
              verified until each is seen against the original, or marked as not applicable.
            </Alert>
          ) : (
            <Alert tone="ok">
              Everything required has been seen. The file can be recorded as verified by whoever
              did the checking.
            </Alert>
          )}

          <Card>
            <CardHeader
              title="What we asked for"
              description="Configured by GRLP. Nothing here asserts a legal requirement."
            />
            {canEdit ? (
              <FicaChecklist recordId={record.id} checks={checks} />
            ) : (
              <ul className="divide-y divide-line-soft">
                {checks.map((check) => (
                  <li key={check.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                    <span className="font-medium text-ink">{check.name}</span>{' '}
                    <Badge tone={statusTone(check.status)}>
                      {labelOf(FICA_CHECK_STATUSES, check.status)}
                    </Badge>
                    <p className="text-[0.6875rem] text-ink-faint">
                      {check.checkedByName
                        ? `Seen by ${check.checkedByName}`
                        : 'Nobody has looked at this yet'}
                      {check.note ? ` · ${check.note}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canEdit ? (
            <Card>
              <CardHeader title="Record what you concluded" />
              <div className="p-4 sm:p-5">
                <FicaForm record={record} />
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="What has changed"
              description="Kept forever, and nobody can alter it."
            />
            {history.length === 0 ? (
              <EmptyState title="Nothing yet" className="py-6" />
            ) : (
              <ul className="divide-y divide-line-soft">
                {history.map((entry, index) => (
                  <li key={index} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                    <span className="font-medium text-ink">
                      {entry.oldStatus
                        ? `${labelOf(FICA_STATUSES, entry.oldStatus)} → ${labelOf(FICA_STATUSES, entry.newStatus)}`
                        : labelOf(FICA_STATUSES, entry.newStatus)}
                    </span>
                    <p className="text-[0.6875rem] text-ink-faint">
                      {formatDateTime(entry.changedAt)}
                      {entry.changedByName ? ` · ${entry.changedByName}` : ''}
                      {entry.reason ? ` · ${entry.reason}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
