import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { loadPipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { RentalApplicationForm } from '../../forms.tsx';

export const metadata = { title: 'New rental application' };
export const dynamic = 'force-dynamic';

export default async function NewRentalApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{
    propertyId?: string;
    applicantId?: string;
    landlordId?: string;
    leadId?: string;
  }>;
}) {
  const user = await requirePermissionOrRedirect('RENTALS_CREATE', '/rentals/applications/new');
  const defaults = await searchParams;
  const options = await readAsUser(user.id, (db) => loadPipelineFormOptions(db, user));

  return (
    <>
      <PageHeader
        eyebrow="Rentals"
        title="New rental application"
        description="The screening checklist is created with it, so nothing gets missed."
      />
      <RentalApplicationForm mode="create" options={options} defaults={defaults} />
    </>
  );
}
