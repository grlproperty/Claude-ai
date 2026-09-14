import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getCommunication } from '@/lib/communications.ts';
import { loadCommunicationFormOptions } from '@/lib/communication-form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { LogCommunicationForm } from '../../forms.tsx';

export const metadata = { title: 'Correct what was recorded' };
export const dynamic = 'force-dynamic';

export default async function EditCommunicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect(
    'COMMUNICATION_CREATE',
    `/communications/${id}/edit`,
  );

  const data = await readAsUser(user.id, async (db) => {
    const communication = await getCommunication(db, id);
    if (!communication) return null;
    return { communication, options: await loadCommunicationFormOptions(db, user) };
  });
  if (!data) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Communications"
        title="Correct what was recorded"
        description="The original is not deleted. What changes is written to the audit log."
      />
      <Alert tone="warn" className="mb-4">
        Correcting the date rebuilds this client&rsquo;s first and last contact from the log, so
        those dates stay in step with what is actually recorded.
      </Alert>
      <LogCommunicationForm
        mode="edit"
        communication={data.communication}
        options={data.options}
        returnTo={`/communications/${id}`}
      />
    </>
  );
}
