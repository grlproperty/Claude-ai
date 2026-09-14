import Link from 'next/link';
import type { Db } from '@/lib/db.ts';
import type { CurrentUser } from '@/lib/session.ts';
import { listLeads } from '@/lib/leads.ts';
import { listAppointments, listTasks } from '@/lib/tasks.ts';
import { listOffers, listTransactions, listValuations, listViewings } from '@/lib/sales.ts';
import { listRentalApplications } from '@/lib/rentals.ts';
import { listCommunications, timelineFor } from '@/lib/communications.ts';
import {
  APPOINTMENT_TYPES,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  INTEREST_LEVELS,
  LEAD_STATUSES,
  LEAD_TYPES,
  OFFER_STATUSES,
  RENTAL_APPLICATION_STATUSES,
  TASK_STATUSES,
  TRANSACTION_STATUSES,
  VALUATION_STATUSES,
  labelOf,
  statusTone,
} from '@/lib/domain.ts';
import { formatDate, formatDateTime, formatMoney, isOverdue } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, CardHeader } from './ui/primitives.tsx';
import { EmptyState } from './ui/feedback.tsx';

/**
 * The pipeline as it appears on a person's or a property's profile
 * (spec 99, 100): what is in flight, what happened, and what is next.
 *
 * Each section is only loaded and only shown when the reader holds the
 * permission for it, so an agent without sales access simply does not see a
 * sales section rather than seeing an empty one.
 */

export interface RelatedRecords {
  communications: Awaited<ReturnType<typeof listCommunications>>['rows'];
  timeline: Awaited<ReturnType<typeof timelineFor>>;
  leads: Awaited<ReturnType<typeof listLeads>>['rows'];
  tasks: Awaited<ReturnType<typeof listTasks>>['rows'];
  appointments: Awaited<ReturnType<typeof listAppointments>>;
  viewings: Awaited<ReturnType<typeof listViewings>>;
  valuations: Awaited<ReturnType<typeof listValuations>>;
  offers: Awaited<ReturnType<typeof listOffers>>;
  transactions: Awaited<ReturnType<typeof listTransactions>>;
  rentalApplications: Awaited<ReturnType<typeof listRentalApplications>>;
}

export async function loadRelatedRecords(
  db: Db,
  user: CurrentUser,
  scope: { personId?: string; propertyId?: string },
): Promise<RelatedRecords> {
  const empty: RelatedRecords = {
    communications: [],
    timeline: [],
    leads: [],
    tasks: [],
    appointments: [],
    viewings: [],
    valuations: [],
    offers: [],
    transactions: [],
    rentalApplications: [],
  };

  const [
    communications,
    timeline,
    leads,
    tasks,
    appointments,
    viewings,
    valuations,
    offers,
    transactions,
    rentalApplications,
  ] = await Promise.all([
      user.permissions.has('COMMUNICATION_VIEW')
        ? listCommunications(db, { ...scope, pageSize: 10 })
        : Promise.resolve({ rows: empty.communications, total: 0, page: 1, pageSize: 0 }),
      timelineFor(db, scope, user.permissions as ReadonlySet<string>, 40),
      user.permissions.has('LEADS_VIEW')
        ? listLeads(db, { ...scope, archived: 'all', status: 'all', pageSize: 20 })
        : Promise.resolve({ rows: empty.leads, total: 0, page: 1, pageSize: 0 }),
      user.permissions.has('TASKS_VIEW')
        ? listTasks(db, { view: 'all', ...scope, pageSize: 20 })
        : Promise.resolve({ rows: empty.tasks, total: 0, page: 1, pageSize: 0 }),
      user.permissions.has('TASKS_VIEW')
        ? listAppointments(db, { ...scope, limit: 20 })
        : Promise.resolve(empty.appointments),
      user.permissions.has('SALES_VIEW')
        ? listViewings(db, { ...scope, limit: 20 })
        : Promise.resolve(empty.viewings),
      user.permissions.has('SALES_VIEW')
        ? listValuations(db, {
            ...(scope.propertyId ? { propertyId: scope.propertyId } : {}),
            ...(scope.personId ? { ownerId: scope.personId } : {}),
            status: 'all',
            limit: 20,
          })
        : Promise.resolve(empty.valuations),
      user.permissions.has('SALES_VIEW')
        ? listOffers(db, {
            ...(scope.propertyId ? { propertyId: scope.propertyId } : {}),
            ...(scope.personId ? { buyerId: scope.personId } : {}),
            limit: 20,
          })
        : Promise.resolve(empty.offers),
      user.permissions.has('SALES_VIEW')
        ? listTransactions(db, { ...scope, limit: 20 })
        : Promise.resolve(empty.transactions),
      user.permissions.has('RENTALS_VIEW')
        ? listRentalApplications(db, {
            ...(scope.propertyId ? { propertyId: scope.propertyId } : {}),
            ...(scope.personId ? { applicantId: scope.personId } : {}),
            limit: 20,
          })
        : Promise.resolve(empty.rentalApplications),
    ]);

  return {
    communications: communications.rows,
    timeline,
    leads: leads.rows,
    tasks: tasks.rows,
    appointments,
    viewings,
    valuations,
    offers,
    transactions,
    rentalApplications,
  };
}

export function RelatedRecordCards({
  records,
  user,
  scope,
}: {
  records: RelatedRecords;
  user: CurrentUser;
  scope: { personId?: string; propertyId?: string };
}) {
  const query = new URLSearchParams();
  if (scope.personId) query.set('personId', scope.personId);
  if (scope.propertyId) query.set('propertyId', scope.propertyId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const returnTo = scope.personId ? `/people/${scope.personId}` : `/properties/${scope.propertyId}`;

  // Built rather than concatenated: with no scope the suffix is empty, and
  // gluing "&returnTo=" onto that would produce a broken URL.
  const logContactParams = new URLSearchParams(query);
  logContactParams.set('returnTo', returnTo);
  const logContactHref = `/communications/new?${logContactParams.toString()}`;

  return (
    <>
      {user.permissions.has('COMMUNICATION_VIEW') ? (
        <Card>
          <CardHeader
            title="Conversations"
            description="What was said. The CRM records it; it does not send anything."
            actions={
              user.permissions.has('COMMUNICATION_CREATE') ? (
                <ButtonLink href={logContactHref} size="sm">
                  Log what was said
                </ButtonLink>
              ) : null
            }
          />
          {records.communications.length === 0 ? (
            <EmptyState title="Nothing logged yet" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {records.communications.map((entry) => (
                <li key={entry.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <Link
                    href={`/communications/${entry.id}`}
                    className="font-medium text-ink hover:text-brand"
                  >
                    {labelOf(COMMUNICATION_CHANNELS, entry.channel)}
                  </Link>{' '}
                  <Badge tone={entry.direction === 'incoming' ? 'info' : 'neutral'}>
                    {labelOf(COMMUNICATION_DIRECTIONS, entry.direction)}
                  </Badge>
                  {entry.isImportant ? <Badge tone="brand">Important</Badge> : null}
                  <div className="text-[0.6875rem] text-ink-faint">
                    {formatDateTime(entry.occurredAt)}
                    {entry.agentName ? ` · ${entry.agentName}` : ''}
                    {entry.durationMinutes ? ` · ${entry.durationMinutes} min` : ''}
                  </div>
                  {entry.subject || entry.body ? (
                    <p className="text-[0.8125rem] text-ink-soft">
                      {(entry.subject ?? entry.body ?? '').slice(0, 140)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {records.timeline.length > 0 ? (
        <Card>
          <CardHeader
            title="What has happened"
            description="Assembled from the records themselves, so it cannot drift out of step."
          />
          <ol className="divide-y divide-line-soft">
            {records.timeline.slice(0, 20).map((entry, index) => (
              <li key={index} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                <div className="flex flex-wrap items-baseline gap-2">
                  {entry.href ? (
                    <Link href={entry.href} className="font-medium text-ink hover:text-brand">
                      {entry.title}
                    </Link>
                  ) : (
                    <span className="font-medium text-ink">{entry.title}</span>
                  )}
                  <span className="text-[0.6875rem] text-ink-faint">
                    {formatDateTime(entry.at)}
                    {entry.byName ? ` · ${entry.byName}` : ''}
                  </span>
                </div>
                {entry.detail ? (
                  <p className="text-[0.8125rem] text-ink-soft">{entry.detail}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      {user.permissions.has('LEADS_VIEW') ? (
        <Card>
          <CardHeader
            title="Leads"
            description="What they are enquiring about."
            actions={
              user.permissions.has('LEADS_CREATE') ? (
                <ButtonLink href={`/leads/new${suffix}`} size="sm">
                  Add lead
                </ButtonLink>
              ) : null
            }
          />
          {records.leads.length === 0 ? (
            <EmptyState title="No leads recorded" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {records.leads.map((lead) => (
                <li key={lead.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <Link href={`/leads/${lead.id}`} className="font-medium text-ink hover:text-brand">
                    {labelOf(LEAD_TYPES, lead.leadType)}
                  </Link>{' '}
                  <Badge tone={statusTone(lead.status)}>
                    {labelOf(LEAD_STATUSES, lead.status)}
                  </Badge>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {lead.sourceName ? `${lead.sourceName} · ` : ''}
                    {formatDate(lead.createdAt)}
                    {lead.primaryAgentName ? ` · ${lead.primaryAgentName}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {user.permissions.has('TASKS_VIEW') ? (
        <Card>
          <CardHeader
            title="Tasks and follow-ups"
            actions={
              user.permissions.has('TASKS_CREATE') ? (
                <ButtonLink href={`/tasks/new${suffix}`} size="sm">
                  Add follow-up
                </ButtonLink>
              ) : null
            }
          />
          {records.tasks.length === 0 ? (
            <EmptyState title="Nothing planned" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {records.tasks.map((task) => (
                <li key={task.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <span className="font-medium text-ink">{task.title}</span>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {labelOf(TASK_STATUSES, task.status)}
                    {task.dueAt ? (
                      <span className={isOverdue(task.dueAt) && task.status !== 'completed' ? 'font-medium text-stop' : ''}>
                        {' '}
                        · due {formatDate(task.dueAt)}
                      </span>
                    ) : null}
                    {task.assignedUserName ? ` · ${task.assignedUserName}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {user.permissions.has('TASKS_VIEW') ? (
        <Card>
          <CardHeader
            title="Appointments"
            actions={
              user.permissions.has('TASKS_CREATE') ? (
                <ButtonLink href={`/calendar/new${suffix}`} size="sm">
                  Book one
                </ButtonLink>
              ) : null
            }
          />
          {records.appointments.length === 0 ? (
            <EmptyState title="Nothing booked" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {records.appointments.map((appointment) => (
                <li key={appointment.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <span className="font-medium text-ink">{appointment.title}</span>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {labelOf(APPOINTMENT_TYPES, appointment.appointmentType)} ·{' '}
                    {formatDateTime(appointment.startsAt)}
                    {appointment.agentName ? ` · ${appointment.agentName}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {user.permissions.has('SALES_VIEW') ? (
        <Card>
          <CardHeader
            title="Viewings"
            actions={
              user.permissions.has('SALES_CREATE') ? (
                <ButtonLink href={`/sales/viewings/new${suffix}`} size="sm">
                  Record one
                </ButtonLink>
              ) : null
            }
          />
          {records.viewings.length === 0 ? (
            <EmptyState title="No viewings recorded" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {records.viewings.map((viewing) => (
                <li key={viewing.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <Link
                    href={`/properties/${viewing.propertyId}`}
                    className="font-medium text-ink hover:text-brand"
                  >
                    {viewing.propertyLabel ?? viewing.propertyRef}
                  </Link>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {formatDate(viewing.viewedAt)}
                    {viewing.personName ? ` · ${viewing.personName}` : ''}
                    {viewing.feedback?.interestLevel
                      ? ` · ${labelOf(INTEREST_LEVELS, viewing.feedback.interestLevel)}`
                      : ' · no feedback yet'}
                  </div>
                  {viewing.feedback?.objections ? (
                    <p className="text-[0.8125rem] text-ink-soft">{viewing.feedback.objections}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {user.permissions.has('SALES_VIEW') ? (
        <Card>
          <CardHeader
            title="Valuations"
            actions={
              user.permissions.has('SALES_CREATE') ? (
                <ButtonLink href={`/sales/valuations/new${suffix}`} size="sm">
                  Request one
                </ButtonLink>
              ) : null
            }
          />
          {records.valuations.length === 0 ? (
            <EmptyState title="No valuations recorded" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {records.valuations.map((valuation) => (
                <li key={valuation.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  {user.permissions.has('SALES_EDIT') ? (
                    <Link
                      href={`/sales/valuations/${valuation.id}/edit?returnTo=${encodeURIComponent(returnTo)}`}
                      className="font-medium text-ink hover:text-brand"
                    >
                      {valuation.estimatedValue
                        ? formatMoney(valuation.estimatedValue)
                        : 'Not yet valued'}
                    </Link>
                  ) : (
                    <span className="font-medium text-ink">
                      {valuation.estimatedValue
                        ? formatMoney(valuation.estimatedValue)
                        : 'Not yet valued'}
                    </span>
                  )}{' '}
                  <Badge tone={statusTone(valuation.status)}>
                    {labelOf(VALUATION_STATUSES, valuation.status)}
                  </Badge>
                  <div className="text-[0.6875rem] text-ink-faint">
                    Requested {formatDate(valuation.requestDate)}
                    {valuation.agentName ? ` · ${valuation.agentName}` : ''}
                    {valuation.recommendedAskingPrice
                      ? ` · asking ${formatMoney(valuation.recommendedAskingPrice)}`
                      : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {user.permissions.has('SALES_VIEW') ? (
        <Card>
          <CardHeader
            title="Offers"
            actions={
              user.permissions.has('SALES_CREATE') ? (
                <ButtonLink href={`/sales/offers/new${suffix}`} size="sm">
                  Record one
                </ButtonLink>
              ) : null
            }
          />
          {records.offers.length === 0 ? (
            <EmptyState title="No offers recorded" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {records.offers.map((offer) => (
                <li key={offer.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <span className="font-medium text-ink">{formatMoney(offer.amount)}</span>{' '}
                  <Badge tone={statusTone(offer.status)}>
                    {labelOf(OFFER_STATUSES, offer.status)}
                  </Badge>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {formatDate(offer.offerDate)}
                    {offer.buyerName ? ` · ${offer.buyerName}` : ''}
                    {offer.counterOfferOf ? ' · counter offer' : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {user.permissions.has('SALES_VIEW') ? (
        <Card>
          <CardHeader
            title="Transactions"
            description="Concluded and registered are separate stages."
            actions={
              user.permissions.has('SALES_CREATE') && scope.propertyId ? (
                <ButtonLink href={`/sales/transactions/new${suffix}`} size="sm">
                  Create one
                </ButtonLink>
              ) : null
            }
          />
          {records.transactions.length === 0 ? (
            <EmptyState title="No transactions recorded" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {records.transactions.map((transaction) => (
                <li key={transaction.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <Link
                    href={`/sales/transactions/${transaction.id}`}
                    className="font-mono font-medium text-ink hover:text-brand"
                  >
                    {transaction.transactionRef}
                  </Link>{' '}
                  <Badge tone={statusTone(transaction.status)}>
                    {labelOf(TRANSACTION_STATUSES, transaction.status)}
                  </Badge>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {formatMoney(transaction.transactionValue)}
                    {transaction.saleDate ? ` · sold ${formatDate(transaction.saleDate)}` : ''}
                    {transaction.actualRegistrationDate
                      ? ` · registered ${formatDate(transaction.actualRegistrationDate)}`
                      : transaction.awaitingRegistration
                        ? ' · awaiting registration'
                        : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {user.permissions.has('RENTALS_VIEW') ? (
        <Card>
          <CardHeader
            title="Rental applications"
            actions={
              user.permissions.has('RENTALS_CREATE') ? (
                <ButtonLink href={`/rentals/applications/new${suffix}`} size="sm">
                  New application
                </ButtonLink>
              ) : null
            }
          />
          {records.rentalApplications.length === 0 ? (
            <EmptyState title="No rental applications" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {records.rentalApplications.map((application) => (
                <li key={application.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <Link
                    href={`/rentals/applications/${application.id}`}
                    className="font-mono font-medium text-ink hover:text-brand"
                  >
                    {application.applicationRef}
                  </Link>{' '}
                  <Badge tone={statusTone(application.applicationStatus)}>
                    {labelOf(RENTAL_APPLICATION_STATUSES, application.applicationStatus)}
                  </Badge>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {formatMoney(application.monthlyRental)}
                    {application.applicantName ? ` · ${application.applicantName}` : ''}
                    {application.leaseStart
                      ? ` · lease from ${formatDate(application.leaseStart)}`
                      : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </>
  );
}
