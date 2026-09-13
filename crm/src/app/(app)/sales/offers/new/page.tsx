import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { loadPipelineFormOptions } from '@/lib/pipeline-form-options.ts';
import { listOffers } from '@/lib/sales.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { OfferForm } from '../../forms.tsx';

export const metadata = { title: 'Record an offer' };
export const dynamic = 'force-dynamic';

export default async function NewOfferPage({
  searchParams,
}: {
  searchParams: Promise<{
    propertyId?: string;
    buyerId?: string;
    sellerId?: string;
    leadId?: string;
    returnTo?: string;
  }>;
}) {
  const user = await requirePermissionOrRedirect('SALES_CREATE', '/sales/offers/new');
  const defaults = await searchParams;
  const { options, existingOffers } = await readAsUser(user.id, async (db) => ({
    options: await loadPipelineFormOptions(db, user),
    existingOffers: await listOffers(db, { propertyId: defaults.propertyId, limit: 50 }),
  }));

  return (
    <>
      <PageHeader eyebrow="Sales" title="Record an offer" />
      <OfferForm
        options={options}
        existingOffers={existingOffers}
        defaults={defaults}
        returnTo={defaults.returnTo}
      />
    </>
  );
}
