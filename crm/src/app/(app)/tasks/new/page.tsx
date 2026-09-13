import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { loadPipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { TaskForm } from '../task-form.tsx';

export const metadata = { title: 'Add a follow-up' };
export const dynamic = 'force-dynamic';

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{
    personId?: string;
    propertyId?: string;
    leadId?: string;
    transactionId?: string;
    returnTo?: string;
  }>;
}) {
  const user = await requirePermissionOrRedirect('TASKS_CREATE', '/tasks/new');
  const defaults = await searchParams;
  const options = await readAsUser(user.id, (db) => loadPipelineFormOptions(db, user));

  return (
    <>
      <PageHeader
        eyebrow="Tasks"
        title="Add a follow-up"
        description="Decide what happens next, and when."
      />
      <TaskForm
        mode="create"
        options={options}
        defaults={defaults}
        returnTo={defaults.returnTo}
      />
    </>
  );
}
