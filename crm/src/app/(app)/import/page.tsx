import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { IMPORT_STATUSES, listImportBatches } from '@/lib/import/batches.ts';
import { SOURCE_SYSTEMS } from '@/lib/import/fields.ts';
import { allowedImportHosts } from '@/lib/import/url.ts';
import { labelOf, statusTone } from '@/lib/domain.ts';
import { formatDate } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { StartImportForm } from './forms.tsx';

export const metadata = { title: 'Import data' };
export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  const user = await requirePermissionOrRedirect('IMPORT_VIEW', '/import');

  const data = await readAsUser(user.id, async (db) => ({
    batches: await listImportBatches(db, { limit: 50 }),
    allowedHosts: await allowedImportHosts(db),
  }));

  const canImport = user.permissions.has('IMPORT_CREATE');

  return (
    <>
      <PageHeader
        eyebrow="Import"
        title="Bring existing data in"
        description="A PropCtrl export, a spreadsheet, or rows pasted from one."
        actions={
          user.permissions.has('SETTINGS_ADMIN') ? (
            <ButtonLink href="/import/settings">Import settings</ButtonLink>
          ) : null
        }
      />

      <Alert tone="neutral" className="mb-4">
        Every import is checked before anything is written, goes in as one all-or-nothing
        operation, and can be rolled back afterwards. The file&rsquo;s own rows are kept, so a
        mis-matched column can be fixed without going back to the original file.
      </Alert>

      {canImport ? (
        <Card className="mb-4">
          <CardHeader title="Start an import" />
          <StartImportForm urlImportsEnabled={data.allowedHosts.length > 0} />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Imports" description="Kept for good, so provenance survives." />
        {data.batches.length === 0 ? (
          <EmptyState title="Nothing has been imported yet" className="py-8" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {data.batches.map((batch) => (
              <li key={batch.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    href={`/import/${batch.id}`}
                    className="font-mono font-medium text-ink hover:text-brand"
                  >
                    {batch.batchRef}
                  </Link>
                  <span className="text-[0.8125rem] text-ink">{batch.name}</span>
                  <Badge tone={statusTone(batch.status)}>
                    {labelOf(IMPORT_STATUSES, batch.status)}
                  </Badge>
                  <Badge>{batch.entityType === 'person' ? 'People' : 'Properties'}</Badge>
                </div>
                <p className="mt-0.5 text-[0.6875rem] text-ink-faint">
                  {batch.rowCount} row{batch.rowCount === 1 ? '' : 's'} ·{' '}
                  {labelOf(SOURCE_SYSTEMS, batch.sourceSystem)} ·{' '}
                  {batch.sourceName ?? batch.sourceUrl ?? 'pasted'} · started{' '}
                  {formatDate(batch.createdAt)}
                  {batch.createdByName ? ` by ${batch.createdByName}` : ''}
                </p>
                {batch.status === 'committed' || batch.status === 'rolled_back' ? (
                  <p className="text-[0.6875rem] text-ink-faint">
                    {batch.createdCount} created, {batch.updatedCount} updated,{' '}
                    {batch.skippedCount} left alone, {batch.failedCount} could not be imported
                    {batch.rollbackReason ? ` · rolled back: ${batch.rollbackReason}` : ''}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
