import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { loadPropertyFormOptions } from '@/lib/properties/form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { PropertyForm } from '../property-form.tsx';

export const metadata = { title: 'Add a property' };
export const dynamic = 'force-dynamic';

export default async function NewPropertyPage() {
  const user = await requirePermissionOrRedirect('PROPERTIES_CREATE', '/properties/new');
  const options = await readAsUser(user.id, (db) => loadPropertyFormOptions(db, user));

  return (
    <>
      <PageHeader
        eyebrow="Properties"
        title="Add a property"
        description="It will be given a permanent GRLP property reference once created."
      />
      <PropertyForm mode="create" options={options} />
    </>
  );
}
