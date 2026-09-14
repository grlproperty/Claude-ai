import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { loadPipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { ValuationForm } from '../../forms.tsx';

export const metadata = { title: 'Record a valuation' };
export const dynamic = 'force-dynamic';

export default async function NewValuationPage({
  searchParams,
}: {
  searchParams: Promise<{
    propertyId?: string;
    ownerId?: string;
    leadId?: string;
    returnTo?: string;
  }>;
}) {
  const user = await requirePermissionOrRedirect('SALES_CREATE', '/sales/valuations/new');
  const defaults = await searchParams;
  const options = await readAsUser(user.id, (db) => loadPipelineFormOptions(db, user));

  return (
    <>
      <PageHeader eyebrow="Sales" title="Record a valuation" />
      <ValuationForm options={options} defaults={defaults} returnTo={defaults.returnTo} />
    </>
  );
}
