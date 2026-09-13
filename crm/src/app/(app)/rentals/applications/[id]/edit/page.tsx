import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getRentalApplication } from '@/lib/rentals.ts';
import { loadPipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { RentalApplicationForm } from '../../../forms.tsx';

export const metadata = { title: 'Edit rental application' };
export const dynamic = 'force-dynamic';

export default async function EditRentalApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect(
    'RENTALS_EDIT',
    `/rentals/applications/${id}/edit`,
  );
  const { application, options } = await readAsUser(user.id, async (db) => ({
    application: await getRentalApplication(db, id),
    options: await loadPipelineFormOptions(db, user),
  }));
  if (!application) notFound();

  return (
    <>
      <PageHeader eyebrow={application.applicationRef} title="Edit rental application" />
      <RentalApplicationForm mode="edit" application={application} options={options} />
    </>
  );
}
