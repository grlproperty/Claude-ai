import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getTransaction, listOffers } from '@/lib/sales.ts';
import { loadPipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { TransactionForm } from '../../../forms.tsx';

export const metadata = { title: 'Edit transaction' };
export const dynamic = 'force-dynamic';

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('SALES_EDIT', `/sales/transactions/${id}/edit`);
  const { transaction, options } = await readAsUser(user.id, async (db) => {
    const found = await getTransaction(db, id);
    return {
      transaction: found,
      options: await loadPipelineFormOptions(db, user),
      offers: found ? await listOffers(db, { propertyId: found.propertyId, limit: 50 }) : [],
    };
  });
  if (!transaction) notFound();

  const offers = await readAsUser(user.id, (db) =>
    listOffers(db, { propertyId: transaction.propertyId, limit: 50 }),
  );

  return (
    <>
      <PageHeader eyebrow={transaction.transactionRef} title="Edit transaction" />
      <TransactionForm
        mode="edit"
        transaction={transaction}
        options={options}
        offers={offers}
      />
    </>
  );
}
