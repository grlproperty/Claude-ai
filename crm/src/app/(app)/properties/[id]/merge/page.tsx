import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getPropertyMergeComparison } from '@/lib/properties/merge.ts';
import { formatDate, pluralise } from '@/lib/format.ts';
import { ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { DescriptionList } from '@/components/ui/table.tsx';
import { PropertyMergeForm } from './merge-form.tsx';

export const metadata = { title: 'Compare and merge properties' };
export const dynamic = 'force-dynamic';

export default async function PropertyMergePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ with?: string }>;
}) {
  const { id } = await params;
  const { with: otherId } = await searchParams;
  const user = await requirePermissionOrRedirect('MERGE_RECORDS', `/properties/${id}`);
  if (!otherId) redirect(`/properties/${id}`);

  const comparison = await readAsUser(user.id, (db) =>
    getPropertyMergeComparison(db, id, otherId),
  ).catch(() => null);
  if (!comparison) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Properties"
        title="Compare and merge"
        description="Check that these really are the same property before merging them."
        actions={<ButtonLink href={`/properties/${id}`}>Back to property</ButtonLink>}
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {[comparison.master, comparison.merged].map((side, index) => (
          <Card key={side.id}>
            <CardHeader
              title={
                <Link href={`/properties/${side.id}`} className="hover:text-brand">
                  {side.addressLine || side.propertyRef}
                </Link>
              }
              description={index === 0 ? 'This record survives' : 'This record is merged away'}
              actions={
                index === 1 ? (
                  <ButtonLink
                    href={`/properties/${side.id}/merge?with=${comparison.master.id}`}
                    size="sm"
                  >
                    Swap direction
                  </ButtonLink>
                ) : null
              }
            />
            <div className="p-4 sm:p-5">
              <DescriptionList
                columns={2}
                items={[
                  {
                    label: 'Reference',
                    value: <span className="font-mono">{side.propertyRef}</span>,
                  },
                  { label: 'Primary agent', value: side.agentName },
                  { label: 'Created', value: formatDate(side.createdAt) },
                  {
                    label: 'History',
                    value: [
                      pluralise(side.counts.people, 'linked person', 'linked people'),
                      pluralise(side.counts.photos, 'photograph'),
                      pluralise(side.counts.documents, 'document'),
                      pluralise(side.counts.history, 'status change'),
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
        <PropertyMergeForm comparison={comparison} />
      </Card>
    </>
  );
}
