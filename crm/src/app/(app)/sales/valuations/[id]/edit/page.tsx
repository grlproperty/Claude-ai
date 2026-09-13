import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { loadPipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import { getValuation } from '@/lib/sales.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { ValuationForm } from '../../../forms.tsx';

export const metadata = { title: 'Edit a valuation' };
export const dynamic = 'force-dynamic';

export default async function EditValuationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const { returnTo } = await searchParams;
  const user = await requirePermissionOrRedirect('SALES_EDIT', `/sales/valuations/${id}/edit`);

  const data = await readAsUser(user.id, async (db) => {
    const valuation = await getValuation(db, id);
    if (!valuation) return null;
    return { valuation, options: await loadPipelineFormOptions(db, user) };
  });
  if (!data) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Edit the valuation"
        description="Record what the valuation came to and what the owner decided."
      />
      <ValuationForm
        mode="edit"
        valuation={data.valuation}
        options={data.options}
        returnTo={returnTo}
      />
    </>
  );
}
