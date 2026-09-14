import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getProperty } from '@/lib/properties/queries.ts';
import { loadPropertyFormOptions } from '@/lib/properties/form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { PropertyForm } from '../../property-form.tsx';

export const metadata = { title: 'Edit property' };
export const dynamic = 'force-dynamic';

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('PROPERTIES_EDIT', `/properties/${id}/edit`);

  const { property, options, selectedTagIds } = await readAsUser(user.id, async (db) => ({
    property: await getProperty(db, id),
    options: await loadPropertyFormOptions(db, user),
    selectedTagIds: (
      await db.query<{ tag_id: string }>(
        "select tag_id from record_tags where entity_type = 'property' and entity_id = $1",
        [id],
      )
    ).map((row) => row.tag_id),
  }));

  if (!property) notFound();

  return (
    <>
      <PageHeader
        eyebrow={property.propertyRef}
        title={`Edit ${property.addressLine}`}
        description="Status, price and mandate changes are all kept in the history."
      />
      <PropertyForm mode="edit" property={property} options={{ ...options, selectedTagIds }} />
    </>
  );
}
