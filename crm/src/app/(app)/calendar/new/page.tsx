import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { loadPipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { AppointmentForm } from '../appointment-form.tsx';

export const metadata = { title: 'Book an appointment' };
export const dynamic = 'force-dynamic';

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{
    personId?: string;
    propertyId?: string;
    leadId?: string;
    returnTo?: string;
  }>;
}) {
  const user = await requirePermissionOrRedirect('TASKS_CREATE', '/calendar/new');
  const defaults = await searchParams;
  const options = await readAsUser(user.id, (db) => loadPipelineFormOptions(db, user));

  return (
    <>
      <PageHeader eyebrow="Calendar" title="Book an appointment" />
      <AppointmentForm
        mode="create"
        options={options}
        defaults={defaults}
        returnTo={defaults.returnTo}
      />
    </>
  );
}
