import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getTransaction, getTransactionHistory, listOffers } from '@/lib/sales.ts';
import { listAgents } from '@/lib/people/queries.ts';
import { listDocuments } from '@/lib/files.ts';
import { COMMISSION_STATUSES } from '@/lib/commission/types.ts';
import { commissionFor } from '@/lib/commission/records.ts';
import {
  FINANCE_STATUSES,
  OFFER_STATUSES,
  TRANSACTION_AGENT_ROLES,
  TRANSACTION_STATUSES,
  labelOf,
  statusTone,
} from '@/lib/domain.ts';
import { formatDate, formatDateTime, formatMoney, isOverdue } from '@/lib/format.ts';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  PageHeader,
} from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { DescriptionList } from '@/components/ui/table.tsx';
import { OfferStatusButtons, RegisterTransactionPanel, TransactionAgentsPanel } from '../../forms.tsx';

export const dynamic = 'force-dynamic';

const SAVED: Record<string, string> = {
  created: 'Transaction created.',
  updated: 'Transaction saved.',
};

export default async function TransactionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const user = await requirePermissionOrRedirect('SALES_VIEW', `/sales/transactions/${id}`);

  const data = await readAsUser(user.id, async (db) => {
    const transaction = await getTransaction(db, id);
    if (!transaction) return null;
    return {
      transaction,
      history: await getTransactionHistory(db, id),
      offers: await listOffers(db, { propertyId: transaction.propertyId, limit: 50 }),
      documents: await listDocuments(db, { transactionId: id }),
      agents: user.permissions.has('DATA_VIEW_ALL') ? await listAgents(db) : [],
      commission: user.permissions.has('COMMISSION_VIEW')
        ? await commissionFor(db, { transactionId: id })
        : null,
    };
  });
  if (!data) notFound();
  const { transaction, history, offers, documents, agents, commission } = data;

  const canEdit = user.permissions.has('SALES_EDIT');

  return (
    <>
      {saved && SAVED[saved] ? (
        <Alert tone="ok" className="mb-4">
          {SAVED[saved]}
        </Alert>
      ) : null}

      <PageHeader
        eyebrow={<span className="font-mono">{transaction.transactionRef}</span>}
        title={transaction.propertyLabel ?? transaction.propertyRef}
        description={
          <>
            {transaction.buyerName ? `Buyer: ${transaction.buyerName}` : 'Buyer not recorded'}
            {transaction.sellerName ? ` · Seller: ${transaction.sellerName}` : ''}
          </>
        }
        actions={
          <>
            <ButtonLink href={`/properties/${transaction.propertyId}`}>Open the property</ButtonLink>
            {canEdit ? (
              <ButtonLink href={`/sales/transactions/${transaction.id}/edit`} tone="primary">
                Edit
              </ButtonLink>
            ) : null}
          </>
        }
      />

      {transaction.awaitingRegistration ? (
        <Alert tone="warn" title="Concluded, but not yet registered" className="mb-4">
          The sale is done. The transfer has not been registered at the deeds office, so this is
          not a registered transaction.
          {transaction.expectedRegistrationDate
            ? ` The conveyancer expected ${formatDate(transaction.expectedRegistrationDate)}${
                isOverdue(transaction.expectedRegistrationDate) ? ', which has passed' : ''
              }.`
            : ''}
        </Alert>
      ) : null}

      {transaction.status === 'registered' ? (
        <Alert tone="ok" title="Registered" className="mb-4">
          Transfer registered on {formatDate(transaction.actualRegistrationDate)}.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="The deal" />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                {
                  label: 'Status',
                  value: (
                    <Badge tone={statusTone(transaction.status)}>
                      {labelOf(TRANSACTION_STATUSES, transaction.status)}
                    </Badge>
                  ),
                },
                { label: 'Transaction value', value: formatMoney(transaction.transactionValue) },
                { label: 'Sale date', value: transaction.saleDate ? formatDate(transaction.saleDate) : null },
                {
                  label: 'Expected registration',
                  value: transaction.expectedRegistrationDate
                    ? formatDate(transaction.expectedRegistrationDate)
                    : null,
                },
                {
                  label: 'Actual registration',
                  value: transaction.actualRegistrationDate
                    ? formatDate(transaction.actualRegistrationDate)
                    : null,
                },
                { label: 'Finance', value: labelOf(FINANCE_STATUSES, transaction.financeStatus) },
                { label: 'Conveyancer', value: transaction.conveyancer },
                { label: 'Legal status', value: transaction.legalStatus },
                { label: 'Suspensive conditions', value: transaction.conditions, span: true },
                { label: 'Cancellation reason', value: transaction.cancellationReason, span: true },
                { label: 'Notes', value: transaction.notes, span: true },
              ]}
            />
          </div>
        </Card>

        {canEdit && transaction.status !== 'registered' &&
        !['cancelled', 'failed'].includes(transaction.status) ? (
          <Card>
            <CardHeader
              title="Registration"
              description="A separate act from concluding the sale, with its own date."
            />
            <RegisterTransactionPanel
              transactionId={transaction.id}
              expectedDate={
                transaction.expectedRegistrationDate
                  ? formatDate(transaction.expectedRegistrationDate)
                  : null
              }
            />
          </Card>
        ) : null}

        {/* ---------------- Commission ---------------- */}
        {user.permissions.has('COMMISSION_VIEW') ? (
          <Card>
            <CardHeader
              title="Commission"
              description="Only earned once the transfer registers."
              actions={
                commission ? (
                  <ButtonLink href={`/commissions/${commission.id}`} size="sm">
                    Open it
                  </ButtonLink>
                ) : user.permissions.has('COMMISSION_CREATE') ? (
                  <ButtonLink
                    href={`/commissions/new?transactionId=${transaction.id}`}
                    size="sm"
                    tone="primary"
                  >
                    Work it out
                  </ButtonLink>
                ) : null
              }
            />
            <div className="p-4 sm:p-5">
              {commission ? (
                <DescriptionList
                  items={[
                    {
                      label: 'Where it stands',
                      value: (
                        <Badge tone={statusTone(commission.status)}>
                          {labelOf(COMMISSION_STATUSES, commission.status)}
                        </Badge>
                      ),
                    },
                    {
                      label: 'Commission',
                      value: formatMoney(commission.grossExclVat, { decimals: true }),
                    },
                    {
                      label: commission.vatApplicable ? 'With VAT' : 'VAT',
                      value: commission.vatApplicable
                        ? formatMoney(commission.grossInclVat, { decimals: true })
                        : 'Does not apply',
                    },
                    {
                      label: 'Approved by',
                      value: commission.approvedByName
                        ? `${commission.approvedByName} on ${formatDate(commission.approvedAt)}`
                        : 'Nobody yet',
                    },
                    {
                      label: 'Recorded as paid',
                      value: commission.paidOn
                        ? `${formatDate(commission.paidOn)} by ${commission.markedPaidByName ?? 'somebody'}`
                        : 'Not yet',
                      span: true,
                    },
                  ]}
                />
              ) : (
                <p className="text-[0.8125rem] text-ink-soft">
                  No commission has been worked out on this transaction yet.
                </p>
              )}

              {commission && transaction.status !== 'registered' ? (
                <p className="mt-3 text-[0.8125rem] text-warn">
                  The transfer has not registered, so this commission cannot be invoiced or
                  recorded as paid yet.
                </p>
              ) : null}
            </div>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Agents on this deal" description="And how it is shared." />
          {transaction.agents.length === 0 ? (
            <EmptyState title="No agents recorded" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {transaction.agents.map((agent) => (
                <li key={agent.agentId} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <span className="font-medium text-ink">{agent.agentName}</span>
                  <span className="text-ink-faint">
                    {' '}
                    · {labelOf(TRANSACTION_AGENT_ROLES, agent.role)}
                    {agent.sharePercent ? ` · ${Number(agent.sharePercent)}%` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canEdit && agents.length > 0 ? (
            <div className="border-t border-line-soft">
              <TransactionAgentsPanel
                transactionId={transaction.id}
                agents={agents}
                current={transaction.agents}
              />
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Status history" />
          {history.length === 0 ? (
            <EmptyState title="Nothing recorded yet" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {history.map((entry, index) => (
                <li key={index} className="px-4 py-2 text-[0.8125rem] sm:px-5">
                  <span className="font-medium text-ink">
                    {entry.oldStatus
                      ? `${labelOf(TRANSACTION_STATUSES, entry.oldStatus)} → `
                      : ''}
                    {labelOf(TRANSACTION_STATUSES, entry.newStatus)}
                  </span>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {formatDateTime(entry.changedAt)}
                    {entry.changedByName ? ` · ${entry.changedByName}` : ''}
                    {entry.reason ? ` · ${entry.reason}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Offers on this property"
            description="Every offer and counter offer keeps its own record."
            actions={
              user.permissions.has('SALES_CREATE') ? (
                <ButtonLink
                  href={`/sales/offers/new?propertyId=${transaction.propertyId}&returnTo=/sales/transactions/${transaction.id}`}
                  size="sm"
                >
                  Record an offer
                </ButtonLink>
              ) : null
            }
          />
          {offers.length === 0 ? (
            <EmptyState title="No offers recorded" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {offers.map((offer) => (
                <li key={offer.id} className="p-4 sm:px-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{formatMoney(offer.amount)}</span>
                    <Badge tone={statusTone(offer.status)}>
                      {labelOf(OFFER_STATUSES, offer.status)}
                    </Badge>
                  </div>
                  <p className="text-[0.6875rem] text-ink-faint">
                    {offer.buyerName ?? 'buyer not recorded'} · {formatDate(offer.offerDate)}
                    {offer.counterOfferOf ? ' · counter offer' : ''}
                    {offer.acceptanceDate ? ` · accepted ${formatDate(offer.acceptanceDate)}` : ''}
                    {offer.rejectionDate ? ` · rejected ${formatDate(offer.rejectionDate)}` : ''}
                    {offer.deposit ? ` · deposit ${formatMoney(offer.deposit)}` : ''}
                  </p>
                  {offer.conditions ? (
                    <p className="mt-0.5 text-[0.8125rem] text-ink-soft">{offer.conditions}</p>
                  ) : null}
                  {canEdit ? (
                    <div className="mt-2">
                      <OfferStatusButtons offer={offer} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {documents.length > 0 ? (
          <Card className="lg:col-span-2">
            <CardHeader title="Documents" />
            <ul className="divide-y divide-line-soft">
              {documents.map((document) => (
                <li key={document.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <a
                    href={`/api/files/document/${document.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-ink hover:text-brand"
                  >
                    {document.fileName}
                  </a>
                  <span className="text-[0.6875rem] text-ink-faint">
                    {' '}
                    · {formatDate(document.uploadedAt)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <p className="mt-4 text-xs text-ink-faint">
        <Link href="/sales" className="underline">
          Back to the sales pipeline
        </Link>
      </p>
    </>
  );
}
