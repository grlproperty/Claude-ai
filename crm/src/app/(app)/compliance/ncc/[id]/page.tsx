import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getBatch, listBatchItems } from '@/lib/ncc.ts';
import { NCC_BATCH_STATUSES, NCC_RESULTS, labelOf, statusTone } from '@/lib/domain.ts';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format.ts';
import { formatZaPhone } from '@/lib/phone.ts';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  PageHeader,
} from '@/components/ui/primitives.tsx';
import { Alert, EmptyState, NotConnected } from '@/components/ui/feedback.tsx';
import { DescriptionList } from '@/components/ui/table.tsx';
import {
  CancelBatchForm,
  FillBatchButton,
  LoadResultsForm,
  SubmitBatchForm,
} from '../../forms.tsx';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('COMPLIANCE_VIEW', `/compliance/ncc/${id}`);
  const batch = await readAsUser(user.id, (db) => getBatch(db, id));
  return { title: batch ? `${batch.batchRef} · NCC batch` : 'NCC batch' };
}

export default async function NccBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('COMPLIANCE_VIEW', `/compliance/ncc/${id}`);

  const data = await readAsUser(user.id, async (db) => {
    const batch = await getBatch(db, id);
    if (!batch) return null;
    return { batch, items: await listBatchItems(db, id) };
  });
  if (!data) notFound();

  const { batch, items } = data;
  const canAdmin = user.permissions.has('NCC_ADMIN');
  const answered = items.filter((item) => item.result !== 'not_checked').length;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/compliance/ncc">NCC register checks</Link>}
        title={batch.name}
        description={
          <>
            <span className="font-mono">{batch.batchRef}</span> ·{' '}
            {labelOf(NCC_BATCH_STATUSES, batch.status)}
          </>
        }
        actions={
          batch.itemCount > 0 ? (
            <ButtonLink href={`/compliance/ncc/${batch.id}/export`} tone="primary">
              Download the file to send
            </ButtonLink>
          ) : null
        }
      />

      <NotConnected
        service="NCC opt-out register"
        detail="This batch is not checked automatically. Download the file, send it to whoever performs the check, then load the answers back here."
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="This batch" />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                { label: 'Status', value: (
                  <Badge tone={statusTone(batch.status)}>
                    {labelOf(NCC_BATCH_STATUSES, batch.status)}
                  </Badge>
                ) },
                { label: 'Numbers', value: String(batch.itemCount) },
                { label: 'Answered', value: `${answered} of ${batch.itemCount}` },
                {
                  label: 'On the register',
                  value:
                    batch.listedCount > 0 ? (
                      <span className="font-medium text-stop">{batch.listedCount}</span>
                    ) : (
                      '0'
                    ),
                },
                { label: 'Cost per number', value: formatMoney(batch.costPerNumber) },
                { label: 'Cost of this batch', value: formatMoney(String(batch.estimatedCost)) },
                {
                  label: 'Sent',
                  value: batch.submittedAt
                    ? `${formatDate(batch.submittedAt)}${batch.submittedByName ? ` by ${batch.submittedByName}` : ''}`
                    : 'Not yet',
                },
                {
                  label: 'Results loaded',
                  value: batch.resultsLoadedAt ? formatDate(batch.resultsLoadedAt) : 'Not yet',
                },
                { label: 'Note', value: batch.notes, span: true },
              ]}
            />
          </div>

          {canAdmin && batch.status === 'draft' ? (
            <div className="border-t border-line-soft p-4 sm:p-5">
              <FillBatchButton batchId={batch.id} />
              <p className="mt-2 text-[0.6875rem] text-ink-faint">
                Adds every active number with no current result. Numbers already checked recently
                are left out, because the office pays for each one.
              </p>
            </div>
          ) : null}

          {canAdmin && (batch.status === 'draft' || batch.status === 'submitted') ? (
            <CancelBatchForm batchId={batch.id} rowVersion={batch.rowVersion} />
          ) : null}
        </Card>

        {/* min-w-0: a grid item will not shrink below its widest child
            otherwise, and a wide table inside would push the page sideways
            on a phone (spec 101, 139). */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {canAdmin && batch.status === 'draft' ? (
            <Card>
              <CardHeader title="Send it" />
              <SubmitBatchForm
                batchId={batch.id}
                rowVersion={batch.rowVersion}
                numbers={batch.itemCount}
              />
            </Card>
          ) : null}

          {canAdmin && (batch.status === 'submitted' || batch.status === 'results_loaded') ? (
            <Card>
              <CardHeader
                title="Load what came back"
                description={
                  batch.status === 'results_loaded'
                    ? 'Loading again updates the numbers named in the new file and leaves the rest alone.'
                    : undefined
                }
              />
              <LoadResultsForm batchId={batch.id} rowVersion={batch.rowVersion} />
            </Card>
          ) : null}

          <Card>
            <CardHeader title={`${items.length} number${items.length === 1 ? '' : 's'}`} />
            {items.length === 0 ? (
              <EmptyState
                title="Nothing in this batch yet"
                description={canAdmin ? 'Gather the numbers needing a check.' : undefined}
                className="py-8"
              />
            ) : (
              <ul className="divide-y divide-line-soft">
                {items.map((item) => (
                  <li key={item.id} className="px-4 py-2.5 sm:px-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[0.8125rem] tabular-nums text-ink">
                        {formatZaPhone(item.contactValue) || item.contactValue}
                      </span>
                      <Badge tone={statusTone(item.result)}>
                        {labelOf(NCC_RESULTS, item.result)}
                      </Badge>
                    </div>
                    <p className="text-[0.6875rem] text-ink-faint">
                      {item.personId ? (
                        <Link href={`/people/${item.personId}`} className="hover:text-brand">
                          {item.personName}
                        </Link>
                      ) : (
                        'Not linked to anyone'
                      )}
                      {item.checkedAt ? ` · answered ${formatDateTime(item.checkedAt)}` : ''}
                      {item.resultNote ? ` · ${item.resultNote}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {batch.status === 'results_loaded' && batch.checkedCount < batch.itemCount ? (
        <Alert tone="warn" title="Some numbers were not answered" className="mt-4">
          {batch.itemCount - batch.checkedCount} number
          {batch.itemCount - batch.checkedCount === 1 ? '' : 's'} in this batch came back with no
          result. They are still recorded as not checked, and the preflight treats them that way.
        </Alert>
      ) : null}
    </>
  );
}
