import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listPropertyDuplicatePairs } from '@/lib/properties/duplicates.ts';
import { formatDate } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { DismissPropertyDuplicateForm } from './dismiss-form.tsx';

export const metadata = { title: 'Possible duplicate properties' };
export const dynamic = 'force-dynamic';

export default async function PropertyDuplicatesPage() {
  const user = await requirePermissionOrRedirect('MERGE_RECORDS', '/properties/duplicates');

  const { pairs, merges } = await readAsUser(user.id, async (db) => ({
    pairs: await listPropertyDuplicatePairs(db, { limit: 100 }),
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
        where m.entity_type = 'property'
        order by m.performed_at desc limit 20`,
    ),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Data quality"
        title="Possible duplicate properties"
        description="An erf number in a suburb, or an identical street address, usually means one piece of land captured twice."
        actions={<ButtonLink href="/properties">Back to properties</ButtonLink>}
      />

      {pairs.length === 0 ? (
        <Card>
          <EmptyState
            title="No possible duplicates found"
            description="No two live properties share an erf number in the same suburb or an identical street address."
          />
        </Card>
      ) : (
        <Card>
          <CardHeader title="Very likely the same property" description={`${pairs.length} to review`} />
          <ul className="divide-y divide-line-soft">
            {pairs.map((pair) => (
              <li key={`${pair.left.id}-${pair.right.id}`} className="p-4 sm:p-5">
                <div className="mb-2">
                  <Badge tone="stop">{pair.reasons.join(' · ')}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[pair.left, pair.right].map((side) => (
                    <div key={side.id} className="rounded-lg border border-line-soft p-3">
                      <Link
                        href={`/properties/${side.id}`}
                        className="font-medium text-ink hover:text-brand"
                      >
                        {side.addressLine || side.propertyRef}
                      </Link>
                      <p className="font-mono text-[0.6875rem] text-ink-faint">
                        {side.propertyRef}
                      </p>
                      <p className="text-[0.6875rem] text-ink-faint">
                        {side.agentName ?? 'Unassigned'}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ButtonLink
                    href={`/properties/${pair.left.id}/merge?with=${pair.right.id}`}
                    tone="primary"
                    size="sm"
                  >
                    Compare and merge
                  </ButtonLink>
                  <DismissPropertyDuplicateForm
                    firstId={pair.left.id}
                    secondId={pair.right.id}
                    decision="not_duplicate"
                    label="Not a duplicate"
                    confirm="Mark these two as different properties? They will stop being offered here."
                  />
                  <DismissPropertyDuplicateForm
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
      )}

      <Card className="mt-4">
        <CardHeader title="Recently merged" description="Merged records keep their reference for ever." />
        {merges.length === 0 ? (
          <EmptyState title="Nothing has been merged yet" className="py-6" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {merges.map((merge, index) => (
              <li key={index} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                <Link href={`/properties/${merge.master_id}`} className="font-mono hover:text-brand">
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
