import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import {
  IMPORT_STATUSES,
  ROW_ACTIONS,
  getImportBatch,
  importRowCounts,
  listImportRows,
} from '@/lib/import/batches.ts';
import { SOURCE_SYSTEMS, fieldByKey } from '@/lib/import/fields.ts';
import { suggestMapping } from '@/lib/import/mapping.ts';
import { labelOf, statusTone } from '@/lib/domain.ts';
import { formatDate, formatDateTime } from '@/lib/format.ts';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { DescriptionList, Table, TableScroll, Td, Th, Tr } from '@/components/ui/table.tsx';
import {
  CancelImportForm,
  CommitForm,
  MappingForm,
  PreviewButton,
  RollbackForm,
} from '../forms.tsx';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('IMPORT_VIEW', `/import/${id}`);
  const batch = await readAsUser(user.id, (db) => getImportBatch(db, id));
  return { title: batch ? `${batch.batchRef} · Import` : 'Import' };
}

const ACTION_FILTERS = [
  { value: 'all', label: 'Every row' },
  { value: 'create', label: 'New records' },
  { value: 'update', label: 'Updates' },
  { value: 'skip', label: 'Left alone' },
  { value: 'error', label: 'Cannot import' },
] as const;

export default async function ImportBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string; imported?: string; rolledback?: string }>;
}) {
  const { id } = await params;
  const { action = 'all', imported, rolledback } = await searchParams;
  const user = await requirePermissionOrRedirect('IMPORT_VIEW', `/import/${id}`);

  const data = await readAsUser(user.id, async (db) => {
    const batch = await getImportBatch(db, id);
    if (!batch) return null;
    return {
      batch,
      counts: await importRowCounts(db, id),
      rows: await listImportRows(db, id, { action, limit: 100 }),
      sample: await listImportRows(db, id, { limit: 3 }),
    };
  });
  if (!data) notFound();

  const { batch, counts, rows, sample } = data;
  const canImport = user.permissions.has('IMPORT_CREATE');

  // The saved mapping shown as suggestions, so the form can display both what
  // is chosen and how the proposal was arrived at.
  const suggestions = suggestMapping(batch.headers, batch.entityType, batch.sourceSystem).map(
    (suggestion) => {
      const saved = batch.mapping[suggestion.header];
      if (saved === undefined) return suggestion;
      return saved === suggestion.fieldKey
        ? suggestion
        : { ...suggestion, fieldKey: saved, confidence: 'exact' as const, reason: 'You chose this.' };
    },
  );

  const needsMapping = batch.status === 'draft';
  const canPreview = ['draft', 'mapped', 'previewed'].includes(batch.status);
  const canCommit = batch.status === 'previewed' && counts.create + counts.update > 0;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/import">Imports</Link>}
        title={batch.name}
        description={
          <>
            <span className="font-mono">{batch.batchRef}</span> ·{' '}
            {batch.entityType === 'person' ? 'People' : 'Properties'} ·{' '}
            {labelOf(IMPORT_STATUSES, batch.status)}
          </>
        }
      />

      {/*
        The form that reported the outcome is gone by the time the page
        re-renders, so the counts are carried on the URL and shown here.
      */}
      {imported ? (
        <Alert tone="ok" title="Imported" className="mb-4">
          {(() => {
            const [created = '0', updated = '0'] = imported.split('.');
            return `${created} record(s) created and ${updated} updated. Every row went in together, as one operation.`;
          })()}
        </Alert>
      ) : null}

      {rolledback ? (
        <Alert tone="ok" title="Rolled back" className="mb-4">
          {(() => {
            const [archived = '0', leftAlone = '0'] = rolledback.split('.');
            return (
              `${archived} record(s) this import created were archived, not deleted. ` +
              `${leftAlone} it only updated were left as they are — their earlier values are in the audit log.`
            );
          })()}
        </Alert>
      ) : null}

      {batch.status === 'committed' ? (
        <Alert tone="ok" title="This import has been run" className="mb-4">
          {batch.createdCount} created and {batch.updatedCount} updated on{' '}
          {batch.committedAt ? formatDate(batch.committedAt) : 'an earlier date'}
          {batch.committedByName ? ` by ${batch.committedByName}` : ''}.
        </Alert>
      ) : null}

      {batch.status === 'rolled_back' ? (
        <Alert tone="warn" title="This import was rolled back" className="mb-4">
          {batch.rollbackReason}
          {batch.rolledBackAt ? ` — ${formatDate(batch.rolledBackAt)}` : ''}
          {batch.rolledBackByName ? ` by ${batch.rolledBackByName}` : ''}. The records it created
          were archived; the ones it only updated were left as they were.
        </Alert>
      ) : null}

      {batch.status === 'failed' ? (
        <Alert tone="stop" title="This import failed" className="mb-4">
          {batch.failureReason} Nothing was written.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="This import" />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                {
                  label: 'Status',
                  value: (
                    <Badge tone={statusTone(batch.status)}>
                      {labelOf(IMPORT_STATUSES, batch.status)}
                    </Badge>
                  ),
                },
                { label: 'Rows in the file', value: String(batch.rowCount) },
                { label: 'Columns matched', value: String(Object.keys(batch.mapping).length) },
                { label: 'Came from', value: labelOf(SOURCE_SYSTEMS, batch.sourceSystem) },
                {
                  label: 'Source',
                  value: batch.sourceUrl ?? batch.sourceName ?? 'Pasted text',
                  span: true,
                },
                {
                  label: 'Started',
                  value: `${formatDateTime(batch.createdAt)}${batch.createdByName ? ` by ${batch.createdByName}` : ''}`,
                  span: true,
                },
                { label: 'Note', value: batch.notes, span: true },
              ]}
            />
          </div>

          {batch.status === 'previewed' || batch.status === 'committed' ? (
            <div className="grid grid-cols-2 gap-2 border-t border-line-soft p-4 sm:p-5">
              <Count label="New" value={counts.create} tone="ok" />
              <Count label="To update" value={counts.update} tone="ok" />
              <Count label="Left alone" value={counts.skip} />
              <Count label="Cannot import" value={counts.error} tone={counts.error > 0 ? 'stop' : 'neutral'} />
            </div>
          ) : null}

          {canImport && ['draft', 'mapped', 'previewed'].includes(batch.status) ? (
            <CancelImportForm batchId={batch.id} rowVersion={batch.rowVersion} />
          ) : null}

          {canImport && batch.status === 'committed' ? (
            <RollbackForm
              batchId={batch.id}
              rowVersion={batch.rowVersion}
              created={batch.createdCount}
              updated={batch.updatedCount}
            />
          ) : null}
        </Card>

        {/* min-w-0: a grid item will not shrink below its widest child
            otherwise, and a wide table inside would push the page sideways
            on a phone (spec 101, 139). */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          {canImport && (needsMapping || batch.status === 'mapped' || batch.status === 'previewed') ? (
            <Card>
              <CardHeader
                title="What is in each column?"
                description="The CRM has had a go. Please check it, especially anything marked as a guess."
              />
              <MappingForm
                batchId={batch.id}
                rowVersion={batch.rowVersion}
                entityType={batch.entityType}
                suggestions={suggestions}
                sample={sample.map((row) => row.raw)}
              />
            </Card>
          ) : null}

          {canImport && canPreview ? (
            <Card>
              <CardHeader title="Check it" />
              <PreviewButton batchId={batch.id} />
            </Card>
          ) : null}

          {canImport && canCommit ? (
            <Card>
              <CardHeader title="Import it" />
              <CommitForm
                batchId={batch.id}
                rowVersion={batch.rowVersion}
                create={counts.create}
                update={counts.update}
                error={counts.error}
              />
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="The rows"
              description={
                batch.status === 'committed'
                  ? 'What was done with each row.'
                  : 'What the file says, and what would happen to each row.'
              }
              actions={
                <form className="flex min-w-0 flex-wrap items-center gap-2" action={`/import/${batch.id}`}>
                  <select
                    name="action"
                    defaultValue={action}
                    aria-label="Which rows"
                    className="tap h-9 min-w-0 shrink rounded-lg border border-line bg-white px-3 text-sm"
                  >
                    {ACTION_FILTERS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="tap h-9 rounded-lg border border-line px-3 text-sm font-medium"
                  >
                    Show
                  </button>
                </form>
              }
            />

            {rows.length === 0 ? (
              <EmptyState title="No rows to show" className="py-8" />
            ) : (
              <>
                <TableScroll className="hidden md:block">
                  <Table className="min-w-[48rem]">
                    <thead>
                      <tr>
                        <Th>Line</Th>
                        <Th>What will happen</Th>
                        <Th>What the CRM read</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <Tr key={row.id}>
                          <Td className="tabular-nums">{row.rowNumber}</Td>
                          <Td>
                            <Badge tone={toneFor(row.action)}>
                              {labelOf(ROW_ACTIONS, row.action)}
                            </Badge>
                            {row.targetId ? (
                              <div className="mt-0.5 text-[0.6875rem]">
                                <Link
                                  href={`/${batch.entityType === 'person' ? 'people' : 'properties'}/${row.targetId}`}
                                  className="text-ink-soft hover:text-brand"
                                >
                                  {row.targetLabel ?? row.targetRef ?? 'the record'}
                                </Link>
                              </div>
                            ) : null}
                            {row.actionReason ? (
                              <div className="text-[0.6875rem] text-ink-faint">{row.actionReason}</div>
                            ) : null}
                            {row.errors.length > 0 ? (
                              <ul className="mt-0.5 text-[0.6875rem] text-stop">
                                {row.errors.map((problem, index) => (
                                  <li key={index}>{problem}</li>
                                ))}
                              </ul>
                            ) : null}
                          </Td>
                          <Td className="text-[0.8125rem]">
                            <MappedValues entityType={batch.entityType} mapped={row.mapped} raw={row.raw} />
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableScroll>

                <ul className="divide-y divide-line-soft md:hidden">
                  {rows.map((row) => (
                    <li key={row.id} className="p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-[0.6875rem] tabular-nums text-ink-faint">
                          Line {row.rowNumber}
                        </span>
                        <Badge tone={toneFor(row.action)}>{labelOf(ROW_ACTIONS, row.action)}</Badge>
                      </div>
                      <div className="mt-1 text-[0.8125rem]">
                        <MappedValues entityType={batch.entityType} mapped={row.mapped} raw={row.raw} />
                      </div>
                      {row.actionReason ? (
                        <p className="mt-1 text-[0.6875rem] text-ink-faint">{row.actionReason}</p>
                      ) : null}
                      {row.errors.length > 0 ? (
                        <ul className="mt-0.5 text-[0.6875rem] text-stop">
                          {row.errors.map((problem, index) => (
                            <li key={index}>{problem}</li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function toneFor(action: string): 'ok' | 'warn' | 'stop' | 'neutral' {
  if (action === 'create' || action === 'update') return 'ok';
  if (action === 'error') return 'stop';
  if (action === 'skip') return 'warn';
  return 'neutral';
}

function Count({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'ok' | 'stop';
}) {
  return (
    <div>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p
        className={
          tone === 'stop'
            ? 'text-lg font-semibold text-stop'
            : tone === 'ok'
              ? 'text-lg font-semibold text-ok'
              : 'text-lg font-semibold text-ink'
        }
      >
        {value}
      </p>
    </div>
  );
}

/**
 * What the CRM made of the row.
 *
 * Before the preview there is nothing mapped yet, so the file's own first few
 * values are shown instead — enough to recognise the row without printing a
 * whole spreadsheet.
 */
function MappedValues({
  entityType,
  mapped,
  raw,
}: {
  entityType: 'person' | 'property';
  mapped: Record<string, string | string[]> | null;
  raw: Record<string, string>;
}) {
  if (!mapped) {
    const entries = Object.entries(raw)
      .filter(([, value]) => value.length > 0)
      .slice(0, 4);
    return (
      <span className="text-ink-soft">
        {entries.map(([key, value]) => `${key}: ${value}`).join(' · ') || 'empty row'}
      </span>
    );
  }

  const entries = Object.entries(mapped).slice(0, 6);
  if (entries.length === 0) return <span className="text-ink-faint">nothing mapped</span>;

  return (
    <span className="text-ink">
      {entries
        .map(([key, value]) => {
          const field = fieldByKey(entityType, key);
          const shown = Array.isArray(value) ? value.join(', ') : value;
          return `${field?.label ?? key}: ${shown}`;
        })
        .join(' · ')}
    </span>
  );
}
