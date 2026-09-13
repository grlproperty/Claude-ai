import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getTask } from '@/lib/tasks.ts';
import { loadPipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { TaskForm } from '../../task-form.tsx';

export const metadata = { title: 'Edit task' };
export const dynamic = 'force-dynamic';

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('TASKS_EDIT', `/tasks/${id}/edit`);
  const { task, options } = await readAsUser(user.id, async (db) => ({
    task: await getTask(db, id),
    options: await loadPipelineFormOptions(db, user),
  }));
  if (!task) notFound();

  return (
    <>
      <PageHeader eyebrow="Tasks" title="Edit task" />
      <TaskForm mode="edit" task={task} options={options} />
    </>
  );
}
