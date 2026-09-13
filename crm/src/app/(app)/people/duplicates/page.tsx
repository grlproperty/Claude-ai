import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listPersonDuplicatePairs } from '@/lib/people/duplicates.ts';
import { formatDate } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { DismissForm } from './dismiss-form.tsx';

export const metadata = { title: 'Possible duplicates' };
export const dynamic = 'force-dynamic';

/**
 * Data quality: possible duplicates and recent merges (spec 21).
 */
export default async function DuplicatesPage() {
  const user = await requirePermissionOrRedirect('MERGE_RECORDS', '/people/duplicates');

  const { pairs, merges } = await readAsUser(user.id, async (db) => ({
    pairs: await listPersonDuplicatePairs(db, { limit: 100 }),
    merges: await db.query<{
      master_reference: string;
      merged_reference: string;
      master_id: string;
      performed_at: Date;
      performed_by_name: string | null;
      reason: string | null;
    }>(
      `select m.master_reference, m.merged_reference, m.master_id, m.performed_at, m.reason,
              coalesce(u.display_name, u.full_name) as performed_by_name
         from merge_records m
         left join users u on u.id = m.performed_by
        where m.entity_type = 'person'
        order by m.performed_at desc limit 20`,
    ),
  }));

  const high = pairs.filter((pair) => pair.confidence === 'high');
  const possible = pairs.filter((pair) => pair.confidence === 'possible');

  return (
    <>
      <PageHeader
        eyebrow="Data quality"
        title="Possible duplicate people"
        description="One person, one master record. Nothing here is merged until you say so."
        actions={<ButtonLink href="/people">Back to people</ButtonLink>}
      />

      {pairs.length === 0 ? (
        <Card>
          <EmptyState
            title="No possible duplicates found"
            description="Nothing on file shares an identity number, a telephone number, an email address or an identical name."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {[
            { title: 'Very likely the same person', rows: high, tone: 'stop' as const },
            { title: 'Possibly the same person', rows: possible, tone: 'warn' as const },
          ]
            .filter((group) => group.rows.length > 0)
            .map((group) => (
              <Card key={group.title}>
                <CardHeader
                  title={group.title}
                  description={`${group.rows.length} to review`}
                />
                <ul className="divide-y divide-line-soft">
                  {group.rows.map((pair) => (
                    <li key={`${pair.left.id}-${pair.right.id}`} className="p-4 sm:p-5">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge tone={group.tone}>{pair.reasons.join(' · ')}</Badge>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {[pair.left, pair.right].map((side) => (
                          <div key={side.id} className="rounded-lg border border-line-soft p-3">
                            <Link
                              href={`/people/${side.id}`}
                              className="font-medium text-ink hover:text-brand"
                            >
                              {side.fullName}
                            </Link>
                            <p className="font-mono text-[0.6875rem] text-ink-faint">
                              {side.clientRef}
                            </p>
                            <p className="text-[0.6875rem] text-ink-faint">
                              {side.agentName ?? 'Unassigned'}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ButtonLink
                          href={`/people/${pair.left.id}/merge?with=${pair.right.id}`}
                          tone="primary"
                          size="sm"
                        >
                          Compare and merge
                        </ButtonLink>
                        <DismissForm
                          firstId={pair.left.id}
                          secondId={pair.right.id}
                          decision="not_duplicate"
                          label="Not a duplicate"
                          confirm="Mark these two as different people? They will stop being offered here."
                        />
                        <DismissForm
                          firstId={pair.left.id}
                          secondId={pair.right.id}
                          decision="review_later"
                          label="Review later"
                          confirm="Keep this pair for later review?"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
        </div>
      )}

      <Card className="mt-4">
        <CardHeader title="Recently merged" description="Merged records keep their reference for ever." />
        {merges.length === 0 ? (
          <EmptyState title="Nothing has been merged yet" className="py-6" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {merges.map((merge, index) => (
              <li key={index} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                <Link href={`/people/${merge.master_id}`} className="font-mono hover:text-brand">
                  {merge.merged_reference} → {merge.master_reference}
                </Link>
                <span className="text-ink-faint">
                  {' '}
                  · {formatDate(merge.performed_at)}
                  {merge.performed_by_name ? ` · ${merge.performed_by_name}` : ''}
                  {merge.reason ? ` · ${merge.reason}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Alert tone="neutral" className="mt-4">
        A pair marked as not a duplicate stops appearing here. Marking a pair for review later
        keeps it in the list.
      </Alert>
    </>
  );
}
