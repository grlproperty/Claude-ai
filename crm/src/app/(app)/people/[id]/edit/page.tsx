import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getPerson } from '@/lib/people/queries.ts';
import { loadPersonFormOptions } from '@/lib/people/form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { PersonForm } from '../../person-form.tsx';

export const metadata = { title: 'Edit person' };
export const dynamic = 'force-dynamic';

export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('PEOPLE_EDIT', `/people/${id}/edit`);

  const { person, options, selectedTagIds } = await readAsUser(user.id, async (db) => ({
    person: await getPerson(db, id),
    options: await loadPersonFormOptions(db, user),
    selectedTagIds: (
      await db.query<{ tag_id: string }>(
        "select tag_id from record_tags where entity_type = 'person' and entity_id = $1",
        [id],
      )
    ).map((row) => row.tag_id),
  }));

  if (!person) notFound();

  return (
    <>
      <PageHeader
        eyebrow={person.clientRef}
        title={`Edit ${person.fullName}`}
        description="Changes are recorded in the audit history."
      />
      <PersonForm mode="edit" person={person} options={{ ...options, selectedTagIds }} />
    </>
  );
}
