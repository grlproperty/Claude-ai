import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { getAgentFilter } from '@/lib/session.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listOffers, listTransactions, listValuations, listViewings } from '@/lib/sales.ts';
import { listProperties } from '@/lib/properties/queries.ts';
import {
  FINANCE_STATUSES,
  INTEREST_LEVELS,
  OFFER_STATUSES,
  TRANSACTION_STATUSES,
  VALUATION_STATUSES,
  labelOf,
  statusTone,
} from '@/lib/domain.ts';
import { formatDate, formatMoney, isOverdue, pluralise } from '@/lib/format.ts';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  PageHeader,
} from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/table.tsx';
import { Icon } from '@/components/icons.tsx';
import { ViewingFeedbackForm } from './forms.tsx';

export const metadata = { title: 'Sales' };
export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  const user = await requirePermissionOrRedirect('SALES_VIEW', '/sales');
  const agentFilter = await getAgentFilter(user);

  const data = await readAsUser(user.id, async (db) => ({
    onMarket: await listProperties(db, {
      salesStatus: 'on_market',
      agentId: agentFilter,
      pageSize: 10,
    }),
    awaitingFeedback: await listViewings(db, {
      agentId: agentFilter,
      withoutFeedback: true,
      limit: 10,
    }),
    recentViewings: await listViewings(db, { agentId: agentFilter, limit: 10 }),
    offers: await listOffers(db, { agentId: agentFilter, limit: 20 }),
    open: await listTransactions(db, { agentId: agentFilter, openOnly: true, limit: 20 }),
    awaitingRegistration: await listTransactions(db, {
      agentId: agentFilter,
      awaitingRegistration: true,
      limit: 20,
    }),
    valuations: await listValuations(db, { agentId: agentFilter, limit: 15 }),
  }));

  const canCreate = user.permissions.has('SALES_CREATE');
  const canEdit = user.permissions.has('SALES_EDIT');

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="Sales pipeline"
        description="Listings on the market, viewings, offers, deals in progress and what is waiting on the deeds office."
        actions={
          canCreate ? (
            <>
              <ButtonLink href="/sales/viewings/new">
                <Icon.plus className="size-4" />
                Viewing
              </ButtonLink>
              <ButtonLink href="/sales/valuations/new">
                <Icon.plus className="size-4" />
                Valuation
              </ButtonLink>
              <ButtonLink href="/sales/offers/new">
                <Icon.plus className="size-4" />
                Offer
              </ButtonLink>
              <ButtonLink href="/sales/transactions/new" tone="primary">
                <Icon.plus className="size-4" />
                Transaction
              </ButtonLink>
            </>
          ) : null
        }
      />

      {data.awaitingRegistration.length > 0 ? (
        <Alert tone="warn" title="Concluded, but not yet registered" className="mb-4">
          {pluralise(data.awaitingRegistration.length, 'deal')} where the sale is done and the
          deeds office has not confirmed the transfer. A concluded sale is not a registered one.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Deals in progress"
            description="Every open transaction, with its own status and its two registration dates."
          />
          {data.open.length === 0 ? (
            <EmptyState title="No transactions in progress" className="py-6" />
          ) : (
            <>
            <TableScroll className="hidden md:block">
              <Table className="min-w-[56rem]">
                <thead>
                  <tr>
                    <Th>Reference</Th>
                    <Th>Property</Th>
                    <Th>Buyer and seller</Th>
                    <Th align="right">Value</Th>
                    <Th>Status</Th>
                    <Th>Sale date</Th>
                    <Th>Registration</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.open.map((transaction) => (
                    <Tr key={transaction.id}>
                      <Td>
                        <Link
                          href={`/sales/transactions/${transaction.id}`}
                          className="font-mono text-[0.8125rem] font-medium text-ink hover:text-brand"
                        >
                          {transaction.transactionRef}
                        </Link>
                      </Td>
                      <Td className="text-[0.8125rem]">
                        <Link
                          href={`/properties/${transaction.propertyId}`}
                          className="hover:text-brand"
                        >
                          {transaction.propertyLabel ?? transaction.propertyRef}
                        </Link>
                      </Td>
                      <Td className="text-[0.8125rem]">
                        {transaction.buyerName ?? '—'}
                        <div className="text-[0.6875rem] text-ink-faint">
                          from {transaction.sellerName ?? 'not recorded'}
                        </div>
                      </Td>
                      <Td align="right" className="text-[0.8125rem]">
                        {formatMoney(transaction.transactionValue)}
                      </Td>
                      <Td>
                        <Badge tone={statusTone(transaction.status)}>
                          {labelOf(TRANSACTION_STATUSES, transaction.status)}
                        </Badge>
                        <div className="mt-0.5 text-[0.6875rem] text-ink-faint">
                          {labelOf(FINANCE_STATUSES, transaction.financeStatus)}
                        </div>
                      </Td>
                      <Td className="text-[0.8125rem]">
                        {transaction.saleDate ? formatDate(transaction.saleDate) : '—'}
                      </Td>
                      <Td className="text-[0.8125rem]">
                        {transaction.actualRegistrationDate ? (
                          <Badge tone="ok">
                            Registered {formatDate(transaction.actualRegistrationDate)}
                          </Badge>
                        ) : transaction.expectedRegistrationDate ? (
                          <Badge
                            tone={isOverdue(transaction.expectedRegistrationDate) ? 'stop' : 'warn'}
                          >
                            Expected {formatDate(transaction.expectedRegistrationDate)}
                          </Badge>
                        ) : (
                          <span className="text-ink-faint">Not registered</span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableScroll>

            {/* On a phone the same deals read as cards. The two registration
                dates stay distinct here too (spec 49). */}
            <ul className="divide-y divide-line-soft md:hidden">
              {data.open.map((transaction) => (
                <li key={transaction.id} className="p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/sales/transactions/${transaction.id}`}
                      className="font-mono text-[0.8125rem] font-medium text-ink hover:text-brand"
                    >
                      {transaction.transactionRef}
                    </Link>
                    <Badge tone={statusTone(transaction.status)}>
                      {labelOf(TRANSACTION_STATUSES, transaction.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[0.8125rem] text-ink">
                    {transaction.propertyLabel ?? transaction.propertyRef}
                  </p>
                  <p className="text-[0.6875rem] text-ink-faint">
                    {transaction.buyerName ?? '—'} from {transaction.sellerName ?? 'not recorded'} ·{' '}
                    {formatMoney(transaction.transactionValue)}
                  </p>
                  <p className="mt-1.5 text-[0.6875rem] text-ink-faint">
                    Sold {transaction.saleDate ? formatDate(transaction.saleDate) : 'not yet'}
                  </p>
                  <p className="mt-1">
                    {transaction.actualRegistrationDate ? (
                      <Badge tone="ok">
                        Registered {formatDate(transaction.actualRegistrationDate)}
                      </Badge>
                    ) : transaction.expectedRegistrationDate ? (
                      <Badge
                        tone={isOverdue(transaction.expectedRegistrationDate) ? 'stop' : 'warn'}
                      >
                        Expected {formatDate(transaction.expectedRegistrationDate)}
                      </Badge>
                    ) : (
                      <span className="text-[0.6875rem] text-ink-faint">Not registered</span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="Offers" description="Counter offers appear as their own record." />
          {data.offers.length === 0 ? (
            <EmptyState title="No offers recorded" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {data.offers.map((offer) => (
                <li key={offer.id} className="px-4 py-2.5 sm:px-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{formatMoney(offer.amount)}</span>
                    <Badge tone={statusTone(offer.status)}>
                      {labelOf(OFFER_STATUSES, offer.status)}
                    </Badge>
                  </div>
                  <p className="text-[0.6875rem] text-ink-faint">
                    <Link href={`/properties/${offer.propertyId}`} className="hover:text-brand">
                      {offer.propertyLabel ?? offer.propertyRef}
                    </Link>
                    {' · '}
                    {offer.buyerName ?? 'buyer not recorded'} · {formatDate(offer.offerDate)}
                    {offer.counterOfferOf ? ' · counter offer' : ''}
                    {offer.transactionRef ? ` · ${offer.transactionRef}` : ''}
                  </p>
                  {offer.conditions ? (
                    <p className="mt-0.5 text-[0.8125rem] text-ink-soft">{offer.conditions}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Valuations" />
          {data.valuations.length === 0 ? (
            <EmptyState title="No valuations recorded" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {data.valuations.map((valuation) => (
                <li key={valuation.id} className="px-4 py-2.5 sm:px-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    {user.permissions.has('SALES_EDIT') ? (
                      <Link
                        href={`/sales/valuations/${valuation.id}/edit?returnTo=/sales`}
                        className="text-[0.8125rem] font-medium text-ink hover:text-brand"
                      >
                        {valuation.propertyLabel ?? valuation.propertyRef ?? 'Not on the register'}
                      </Link>
                    ) : (
                      <span className="text-[0.8125rem] font-medium text-ink">
                        {valuation.propertyLabel ?? valuation.propertyRef ?? 'Not on the register'}
                      </span>
                    )}
                    <Badge tone={statusTone(valuation.status)}>
                      {labelOf(VALUATION_STATUSES, valuation.status)}
                    </Badge>
                  </div>
                  <p className="text-[0.6875rem] text-ink-faint">
                    {valuation.ownerName ?? 'owner not recorded'} ·{' '}
                    {formatDate(valuation.requestDate)}
                    {valuation.recommendedAskingPrice
                      ? ` · recommended ${formatMoney(valuation.recommendedAskingPrice)}`
                      : ''}
                  </p>
                  {valuation.outcome ? (
                    <p className="mt-0.5 text-[0.8125rem] text-ink-soft">{valuation.outcome}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Viewings waiting for feedback"
            description="What the client said is the most useful thing a viewing produces."
          />
          {data.awaitingFeedback.length === 0 ? (
            <EmptyState
              title="Every viewing has feedback"
              description="Nothing is waiting to be written up."
              className="py-6"
            />
          ) : (
            <ul className="divide-y divide-line-soft">
              {data.awaitingFeedback.map((viewing) => (
                <li key={viewing.id}>
                  <div className="px-4 pt-3 sm:px-5">
                    <p className="text-sm font-medium text-ink">
                      <Link href={`/properties/${viewing.propertyId}`} className="hover:text-brand">
                        {viewing.propertyLabel ?? viewing.propertyRef}
                      </Link>
                    </p>
                    <p className="text-[0.6875rem] text-ink-faint">
                      {viewing.personName ?? 'Viewer not recorded'} ·{' '}
                      {formatDate(viewing.viewedAt)}
                      {viewing.agentName ? ` · ${viewing.agentName}` : ''}
                    </p>
                  </div>
                  {canEdit ? <ViewingFeedbackForm viewingId={viewing.id} /> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent viewings" />
          {data.recentViewings.length === 0 ? (
            <EmptyState title="No viewings recorded" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {data.recentViewings.map((viewing) => (
                <li key={viewing.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <Link href={`/properties/${viewing.propertyId}`} className="hover:text-brand">
                    {viewing.propertyLabel ?? viewing.propertyRef}
                  </Link>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {viewing.personName ?? 'Viewer not recorded'} ·{' '}
                    {formatDate(viewing.viewedAt)}
                    {viewing.feedback?.interestLevel
                      ? ` · ${labelOf(INTEREST_LEVELS, viewing.feedback.interestLevel)}`
                      : ' · no feedback yet'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="On the market"
            description="Properties whose sales status is On market."
            actions={<ButtonLink href="/properties?salesStatus=on_market" size="sm">See all</ButtonLink>}
          />
          {data.onMarket.rows.length === 0 ? (
            <EmptyState title="Nothing on the market" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {data.onMarket.rows.map((property) => (
                <li key={property.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <Link href={`/properties/${property.id}`} className="font-medium hover:text-brand">
                    {property.addressLine || property.propertyRef}
                  </Link>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {formatMoney(property.currentAskingPrice)}
                    {property.primaryAgentName ? ` · ${property.primaryAgentName}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
