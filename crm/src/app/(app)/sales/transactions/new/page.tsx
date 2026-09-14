import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { loadPipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import { listOffers } from '@/lib/sales.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { TransactionForm } from '../../forms.tsx';

export const metadata = { title: 'Create a transaction' };
export const dynamic = 'force-dynamic';

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{
    propertyId?: string;
    buyerId?: string;
    sellerId?: string;
    offerId?: string;
  }>;
}) {
  const user = await requirePermissionOrRedirect('SALES_CREATE', '/sales/transactions/new');
  const defaults = await searchParams;
  const { options, offers } = await readAsUser(user.id, async (db) => ({
    options: await loadPipelineFormOptions(db, user),
    offers: await listOffers(db, { propertyId: defaults.propertyId, status: 'accepted', limit: 50 }),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Create a transaction"
        description="The deal itself: concluded and registered are separate stages."
      />
      <TransactionForm mode="create" options={options} offers={offers} defaults={defaults} />
    </>
  );
}
