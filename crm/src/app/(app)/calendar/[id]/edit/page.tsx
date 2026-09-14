import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getAppointment } from '@/lib/tasks.ts';
import { loadPipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { AppointmentForm } from '../../appointment-form.tsx';

export const metadata = { title: 'Edit appointment' };
export const dynamic = 'force-dynamic';

export default async function EditAppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('TASKS_EDIT', `/calendar/${id}/edit`);
  const { appointment, options } = await readAsUser(user.id, async (db) => ({
    appointment: await getAppointment(db, id),
    options: await loadPipelineFormOptions(db, user),
  }));
  if (!appointment) notFound();

  return (
    <>
      <PageHeader eyebrow="Calendar" title="Edit appointment" />
      <AppointmentForm mode="edit" appointment={appointment} options={options} />
    </>
  );
}
