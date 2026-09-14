import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { loadPipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { ViewingForm } from '../../forms.tsx';

export const metadata = { title: 'Record a viewing' };
export const dynamic = 'force-dynamic';

export default async function NewViewingPage({
  searchParams,
}: {
  searchParams: Promise<{
    propertyId?: string;
    personId?: string;
    leadId?: string;
    appointmentId?: string;
    returnTo?: string;
  }>;
}) {
  const user = await requirePermissionOrRedirect('SALES_CREATE', '/sales/viewings/new');
  const defaults = await searchParams;
  const options = await readAsUser(user.id, (db) => loadPipelineFormOptions(db, user));

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Record a viewing"
        description="Then write up what the client said — that is the part worth having."
      />
      <ViewingForm options={options} defaults={defaults} returnTo={defaults.returnTo} />
    </>
  );
}
