import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { loadLeadFormOptions } from '@/lib/leads-form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { LeadForm } from '../lead-form.tsx';

export const metadata = { title: 'Add a lead' };
export const dynamic = 'force-dynamic';

export default async function NewLeadPage({
  searchParams,
}: {
  searchParams: Promise<{ personId?: string; propertyId?: string }>;
}) {
  const user = await requirePermissionOrRedirect('LEADS_CREATE', '/leads/new');
  const defaults = await searchParams;
  const options = await readAsUser(user.id, (db) => loadLeadFormOptions(db, user));

  return (
    <>
      <PageHeader
        eyebrow="Leads"
        title="Add a lead"
        description="An enquiry, and what needs to happen about it."
      />
      <LeadForm mode="create" options={options} defaults={defaults} />
    </>
  );
}
