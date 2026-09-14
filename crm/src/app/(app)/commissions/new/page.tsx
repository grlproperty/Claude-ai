import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getNumberSetting } from '@/lib/settings.ts';
import { listRules } from '@/lib/commission/rules.ts';
import { commissionFor } from '@/lib/commission/records.ts';
import { dealBasis } from '@/lib/commission/create.ts';
import { formatMoney } from '@/lib/format.ts';
import { ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { CommissionForm } from '../forms.tsx';

export const metadata = { title: 'Work out a commission' };
export const dynamic = 'force-dynamic';

/**
 * Opening a commission.
 *
 * It is always opened from a deal, because a commission with no deal
 * behind it is a figure nobody can check.
 */
export default async function NewCommissionPage({
  searchParams,
}: {
  searchParams: Promise<{ transactionId?: string; rentalId?: string }>;
}) {
  const { transactionId, rentalId } = await searchParams;
  const user = await requirePermissionOrRedirect('COMMISSION_CREATE', '/commissions/new');

  if (!transactionId && !rentalId) {
    return (
      <>
        <PageHeader
          eyebrow="Commission"
          title="Work out a commission"
          description="Opened from the deal it belongs to."
        />
        <Card>
          <EmptyState
            title="Start from the deal"
            description="Open the transaction or the lease, then work the commission out from there. That way the price, the agents and the registration status all come from the record rather than being typed again."
            className="py-10"
          />
          <div className="flex flex-wrap gap-2 border-t border-line-soft p-4 sm:p-5">
            <ButtonLink href="/sales">Sales</ButtonLink>
            <ButtonLink href="/rentals">Rentals</ButtonLink>
          </div>
        </Card>
      </>
    );
  }

  const data = await readAsUser(user.id, async (db) => {
    const deal = await dealBasis(db, { transactionId, rentalId });
    if (!deal) return null;
    return {
      deal,
      existing: await commissionFor(db, { transactionId, rentalId }),
      rules: await listRules(db, { appliesTo: deal.kind }),
      vatRate: await getNumberSetting(db, 'commission.vat_rate', 15),
    };
  });
  if (!data) notFound();

  const { deal, existing, rules, vatRate } = data;

  if (existing) {
    return (
      <>
        <PageHeader eyebrow="Commission" title="This deal already has a commission" />
        <Alert tone="neutral" title={existing.commissionRef}>
          One commission per deal, so that every total means one thing.
        </Alert>
        <div className="mt-4">
          <ButtonLink href={`/commissions/${existing.id}`} tone="primary">
            Open {existing.commissionRef}
          </ButtonLink>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Commission"
        title={`Commission on ${deal.propertyLabel ?? deal.propertyRef}`}
        description={
          deal.kind === 'sale'
            ? `A sale of ${formatMoney(deal.baseAmount)}. ${deal.isRegistered ? 'Registered.' : 'Not yet registered.'}`
            : `A lease at ${formatMoney(deal.baseAmount)} a month.`
        }
      />
      <Card>
        <CardHeader
          title="Work it out"
          description="The arithmetic is shown as you type, and worked out again on the server before anything is saved."
        />
        <CommissionForm
          deal={deal}
          transactionId={transactionId}
          rentalId={rentalId}
          rules={rules}
          vatRate={String(vatRate)}
        />
      </Card>
    </>
  );
}
