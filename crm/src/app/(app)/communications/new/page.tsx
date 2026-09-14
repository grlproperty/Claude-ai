import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { loadCommunicationFormOptions } from '@/lib/communication-form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { LogCommunicationForm } from '../forms.tsx';

export const metadata = { title: 'Log what was said' };
export const dynamic = 'force-dynamic';

export default async function NewCommunicationPage({
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
  const user = await requirePermissionOrRedirect('COMMUNICATION_CREATE', '/communications/new');
  const defaults = await searchParams;
  const options = await readAsUser(user.id, (db) => loadCommunicationFormOptions(db, user));

  return (
    <>
      <PageHeader
        eyebrow="Communications"
        title="Log what was said"
        description="After the call, the WhatsApp or the email you sent yourself."
      />
      <LogCommunicationForm
        options={options}
        defaults={defaults}
        returnTo={defaults.returnTo}
      />
    </>
  );
}
