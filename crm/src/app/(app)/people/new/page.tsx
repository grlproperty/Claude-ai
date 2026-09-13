import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { loadPersonFormOptions } from '@/lib/people/form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { PersonForm } from '../person-form.tsx';

export const metadata = { title: 'Add a person' };
export const dynamic = 'force-dynamic';

export default async function NewPersonPage() {
  const user = await requirePermissionOrRedirect('PEOPLE_CREATE', '/people/new');
  const options = await readAsUser(user.id, (db) => loadPersonFormOptions(db, user));

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Add a person"
        description="They will be given a permanent GRLP client reference once created."
      />
      <PersonForm mode="create" options={options} />
    </>
  );
}
