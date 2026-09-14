import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listExportLog } from '@/lib/exports.ts';
import { formatDateTime, pluralise } from '@/lib/format.ts';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';

export const metadata = { title: 'Export log' };
export const dynamic = 'force-dynamic';

/**
 * The export log (spec 15, 98, 104).
 *
 * An export is the one operation that takes data past every policy
 * protecting it, so every one is recorded: who, what, how many rows and
 * which columns. The log cannot be edited or deleted — the database
 * refuses both — so this page is the whole truth about what has left.
 */
export default async function ExportLogPage() {
  const user = await requirePermissionOrRedirect('AUDIT_LOG_VIEW', '/reports/exports');
  const entries = await readAsUser(user.id, (db) => listExportLog(db));

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/reports">Reports</Link>}
        title="What has left the CRM"
        description="Every export, permanently."
      />

      <Alert tone="neutral" title="Identity numbers are never exported" className="mb-4">
        No export this CRM can produce contains an identity number, a passport number or a
        credential — not masked, not hashed. A spreadsheet leaves the building and nothing here can
        follow it. Every export is recorded below, and this log cannot be altered or deleted.
      </Alert>

      <Card>
        <CardHeader title={pluralise(entries.length, 'export')} />
        {entries.length === 0 ? (
          <EmptyState title="Nothing has been exported" className="py-10" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {entries.map((entry) => (
              <li key={entry.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[0.8125rem] font-medium text-ink">
                    {entry.userName ?? 'A user since removed'}
                  </span>
                  <Badge>{entry.entityType}</Badge>
                  <span className="text-[0.8125rem] text-ink-soft">
                    {pluralise(entry.rowCount, 'row')}
                  </span>
                  {entry.includedIdentity ? (
                    <Badge tone="stop">Included identity data</Badge>
                  ) : (
                    <Badge tone="ok">No identity data</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-[0.6875rem] text-ink-faint">
                  {formatDateTime(entry.createdAt)}
                  {entry.ip ? ` · from ${entry.ip}` : ''}
                </p>
                {entry.columns.length > 0 ? (
                  <p className="text-[0.6875rem] text-ink-faint">
                    Columns: {entry.columns.join(', ')}
                  </p>
                ) : null}
                {entry.filters && Object.keys(entry.filters).length > 0 ? (
                  <p className="text-[0.6875rem] text-ink-faint">
                    Filters:{' '}
                    {Object.entries(entry.filters)
                      .filter(([, value]) => value !== null && value !== '')
                      .map(([key, value]) => `${key}=${String(value)}`)
                      .join(' · ')}
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
