import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listBatches } from '@/lib/ncc.ts';
import { getNumberSetting } from '@/lib/settings.ts';
import { NCC_BATCH_STATUSES, labelOf, statusTone } from '@/lib/domain.ts';
import { formatDate, formatMoney } from '@/lib/format.ts';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { EmptyState, NotConnected } from '@/components/ui/feedback.tsx';
import { NewBatchForm } from '../forms.tsx';

export const metadata = { title: 'NCC register checks' };
export const dynamic = 'force-dynamic';

export default async function NccBatchesPage() {
  const user = await requirePermissionOrRedirect('COMPLIANCE_VIEW', '/compliance/ncc');

  const data = await readAsUser(user.id, async (db) => ({
    batches: await listBatches(db, { limit: 100 }),
    costPerNumber: await getNumberSetting(db, 'ncc.cost_per_number', 0),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="NCC register checks"
        description="What was sent away to be checked, and what came back."
      />

      <NotConnected
        service="NCC opt-out register"
        detail="There is no link to the register. A batch is prepared here, you send the file yourself, and you load the answers back in when they arrive."
      />

      {user.permissions.has('NCC_ADMIN') ? (
        <Card className="mt-4">
          <CardHeader
            title="Start a batch"
            description={`Currently ${formatMoney(String(data.costPerNumber))} per number.`}
          />
          <NewBatchForm />
        </Card>
      ) : null}

      <Card className="mt-4">
        <CardHeader title="Batches" />
        {data.batches.length === 0 ? (
          <EmptyState title="No batches yet" className="py-8" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {data.batches.map((batch) => (
              <li key={batch.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    href={`/compliance/ncc/${batch.id}`}
                    className="font-mono font-medium text-ink hover:text-brand"
                  >
                    {batch.batchRef}
                  </Link>
                  <span className="text-[0.8125rem] text-ink">{batch.name}</span>
                  <Badge tone={statusTone(batch.status)}>
                    {labelOf(NCC_BATCH_STATUSES, batch.status)}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[0.6875rem] text-ink-faint">
                  {batch.itemCount} number{batch.itemCount === 1 ? '' : 's'} ·{' '}
                  {formatMoney(String(batch.estimatedCost))} at{' '}
                  {formatMoney(batch.costPerNumber)} each · started {formatDate(batch.createdAt)}
                  {batch.createdByName ? ` by ${batch.createdByName}` : ''}
                </p>
                <p className="text-[0.6875rem] text-ink-faint">
                  {batch.checkedCount} of {batch.itemCount} answered
                  {batch.listedCount > 0 ? ` · ${batch.listedCount} on the register` : ''}
                  {batch.cancellationReason ? ` · cancelled: ${batch.cancellationReason}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
