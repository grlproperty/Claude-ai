import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getMergeComparison } from '@/lib/people/merge.ts';
import { formatDate, pluralise } from '@/lib/format.ts';
import { Card, CardHeader, PageHeader, ButtonLink } from '@/components/ui/primitives.tsx';
import { DescriptionList } from '@/components/ui/table.tsx';
import { MergeForm } from './merge-form.tsx';

export const metadata = { title: 'Compare and merge' };
export const dynamic = 'force-dynamic';

export default async function MergePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ with?: string }>;
}) {
  const { id } = await params;
  const { with: otherId } = await searchParams;
  const user = await requirePermissionOrRedirect('MERGE_RECORDS', `/people/${id}`);

  if (!otherId) redirect(`/people/${id}`);

  const comparison = await readAsUser(user.id, (db) => getMergeComparison(db, id, otherId)).catch(
    () => null,
  );
  if (!comparison) notFound();

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Compare and merge"
        description="Check that these really are the same person before merging them."
        actions={<ButtonLink href={`/people/${id}`}>Back to profile</ButtonLink>}
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {[comparison.master, comparison.merged].map((side, index) => (
          <Card key={side.id}>
            <CardHeader
              title={
                <Link href={`/people/${side.id}`} className="hover:text-brand">
                  {side.fullName}
                </Link>
              }
              description={index === 0 ? 'This record survives' : 'This record is merged away'}
              actions={
                index === 1 ? (
                  <ButtonLink href={`/people/${side.id}/merge?with=${comparison.master.id}`} size="sm">
                    Swap direction
                  </ButtonLink>
                ) : null
              }
            />
            <div className="p-4 sm:p-5">
              <DescriptionList
                columns={2}
                items={[
                  { label: 'Reference', value: <span className="font-mono">{side.clientRef}</span> },
                  { label: 'Primary agent', value: side.agentName },
                  { label: 'Created', value: formatDate(side.createdAt) },
                  {
                    label: 'Last contact',
                    value: side.lastContactAt ? formatDate(side.lastContactAt) : null,
                  },
                  {
                    label: 'History',
                    value: [
                      pluralise(side.counts.contacts, 'contact detail'),
                      pluralise(side.counts.addresses, 'address', 'addresses'),
                      pluralise(side.counts.relationships, 'relationship'),
                    ].join(' · '),
                    span: true,
                  },
                ]}
              />
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4 sm:p-5">
        <MergeForm comparison={comparison} />
      </Card>
    </>
  );
}
