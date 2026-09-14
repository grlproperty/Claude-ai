import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getLead, listLeadLossReasons } from '@/lib/leads.ts';
import { listAppointments, listTasks } from '@/lib/tasks.ts';
import { listViewings } from '@/lib/sales.ts';
import {
  APPOINTMENT_TYPES,
  BUSINESS_AREAS,
  INTEREST_LEVELS,
  LEAD_STATUSES,
  LEAD_TYPES,
  TASK_STATUSES,
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
import { CommunicationNotice, QuickActions } from '@/components/quick-actions.tsx';
import { ArchiveLeadPanel, LeadStatusPanel } from './status-panel.tsx';

export const dynamic = 'force-dynamic';

const SAVED: Record<string, string> = {
  created: 'Lead created.',
  updated: 'Lead saved.',
};

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const user = await requirePermissionOrRedirect('LEADS_VIEW', `/leads/${id}`);

  const data = await readAsUser(user.id, async (db) => {
    const lead = await getLead(db, id);
    if (!lead) return null;
    return {
      lead,
      lossReasons: await listLeadLossReasons(db),
      tasks: user.permissions.has('TASKS_VIEW')
        ? (await listTasks(db, { leadId: id, view: 'all' })).rows
        : [],
      appointments: user.permissions.has('TASKS_VIEW')
        ? await listAppointments(db, { leadId: id })
        : [],
      viewings: user.permissions.has('SALES_VIEW')
        ? await listViewings(db, { personId: lead.personId ?? undefined })
        : [],
    };
  });
  if (!data) notFound();
  const { lead, lossReasons, tasks, appointments, viewings } = data;

  const canEdit = user.permissions.has('LEADS_EDIT');

  return (
    <>
      {saved && SAVED[saved] ? (
        <Alert tone="ok" className="mb-4">
          {SAVED[saved]}
        </Alert>
      ) : null}
      {lead.isArchived ? (
        <Alert tone="warn" title="This lead is archived" className="mb-4" />
      ) : null}

      <PageHeader
        eyebrow="Lead"
        title={lead.personName ?? 'Enquiry not yet linked to a person'}
        description={
          <>
            {labelOf(LEAD_TYPES, lead.leadType)} · {labelOf(BUSINESS_AREAS, lead.businessArea)}
            {lead.primaryAgentName ? ` · Agent: ${lead.primaryAgentName}` : ''}
          </>
        }
        actions={
          <>
            {lead.personId ? (
              <ButtonLink href={`/people/${lead.personId}`}>Open the client</ButtonLink>
            ) : null}
            {canEdit ? (
              <ButtonLink href={`/leads/${lead.id}/edit`} tone="primary">
                Edit
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line-soft px-4 py-3.5 sm:px-5">
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Status
            </p>
            <Badge tone={statusTone(lead.status)}>{labelOf(LEAD_STATUSES, lead.status)}</Badge>
          </div>
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Next follow-up
            </p>
            <p className="text-sm">
              {lead.nextFollowUpAt ? (
                <Badge tone={isOverdue(lead.nextFollowUpAt) ? 'stop' : 'ok'}>
                  {formatDateTime(lead.nextFollowUpAt)}
                </Badge>
              ) : (
                <span className="text-ink-faint">None set</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Source
            </p>
            <p className="text-sm">{lead.sourceName ?? 'Not recorded'}</p>
          </div>
          <div>
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              Created
            </p>
            <p className="text-sm">{formatDate(lead.createdAt)}</p>
          </div>
        </div>
        <div className="space-y-2 px-4 py-3.5 sm:px-5">
          <QuickActions
            mobile={lead.personMobile}
            email={lead.personEmail}
            personId={lead.personId ?? undefined}
            propertyId={lead.propertyId ?? undefined}
            leadId={lead.id}
            canLog={user.permissions.has('COMMUNICATION_CREATE')}
            canTask={user.permissions.has('TASKS_CREATE')}
          />
          <CommunicationNotice />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="The enquiry" />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                { label: 'Summary', value: lead.enquirySummary, span: true },
                {
                  label: 'Budget',
                  value:
                    lead.budgetMin || lead.budgetMax
                      ? `${formatMoney(lead.budgetMin)} – ${formatMoney(lead.budgetMax)}`
                      : null,
                },
                { label: 'Preferred areas', value: lead.preferredAreas },
                { label: 'Requirements', value: lead.requirements, span: true },
                {
                  label: 'Property',
                  value: lead.propertyId ? (
                    <Link href={`/properties/${lead.propertyId}`} className="text-brand underline">
                      {lead.propertyAddress ?? lead.propertyRef}
                    </Link>
                  ) : null,
                  span: true,
                },
                { label: 'Loss reason', value: lead.lossReasonName },
                { label: 'Notes', value: lead.notes, span: true },
              ]}
            />
          </div>
        </Card>

        {canEdit ? (
          <Card>
            <CardHeader title="Move this lead along" />
            <LeadStatusPanel leadId={lead.id} status={lead.status} lossReasons={lossReasons} />
            {user.permissions.has('LEADS_DELETE') && !lead.isArchived ? (
              <ArchiveLeadPanel leadId={lead.id} />
            ) : null}
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Status history" />
          <ul className="divide-y divide-line-soft">
            {lead.statusHistory.map((entry, index) => (
              <li key={index} className="px-4 py-2 text-[0.8125rem] sm:px-5">
                <span className="font-medium text-ink">
                  {entry.oldStatus ? `${labelOf(LEAD_STATUSES, entry.oldStatus)} → ` : ''}
                  {labelOf(LEAD_STATUSES, entry.newStatus)}
                </span>
                <div className="text-[0.6875rem] text-ink-faint">
                  {formatDateTime(entry.changedAt)}
                  {entry.changedByName ? ` · ${entry.changedByName}` : ''}
                  {entry.reason ? ` · ${entry.reason}` : ''}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Tasks"
            actions={
              user.permissions.has('TASKS_CREATE') ? (
                <ButtonLink href={`/tasks/new?leadId=${lead.id}`} size="sm">
                  Add task
                </ButtonLink>
              ) : null
            }
          />
          {tasks.length === 0 ? (
            <EmptyState title="No tasks against this lead" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {tasks.map((task) => (
                <li key={task.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <span className="font-medium text-ink">{task.title}</span>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {labelOf(TASK_STATUSES, task.status)}
                    {task.dueAt ? ` · due ${formatDate(task.dueAt)}` : ''}
                    {task.assignedUserName ? ` · ${task.assignedUserName}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Appointments"
            actions={
              user.permissions.has('TASKS_CREATE') ? (
                <ButtonLink href={`/calendar/new?leadId=${lead.id}`} size="sm">
                  Book one
                </ButtonLink>
              ) : null
            }
          />
          {appointments.length === 0 ? (
            <EmptyState title="Nothing booked" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {appointments.map((appointment) => (
                <li key={appointment.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <span className="font-medium text-ink">{appointment.title}</span>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {labelOf(APPOINTMENT_TYPES, appointment.appointmentType)} ·{' '}
                    {formatDateTime(appointment.startsAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {viewings.length > 0 ? (
          <Card className="lg:col-span-2">
            <CardHeader title="Viewings by this client" />
            <ul className="divide-y divide-line-soft">
              {viewings.map((viewing) => (
                <li key={viewing.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <Link
                    href={`/properties/${viewing.propertyId}`}
                    className="font-medium text-ink hover:text-brand"
                  >
                    {viewing.propertyLabel ?? viewing.propertyRef}
                  </Link>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {formatDate(viewing.viewedAt)}
                    {viewing.feedback?.interestLevel
                      ? ` · ${labelOf(INTEREST_LEVELS, viewing.feedback.interestLevel)}`
                      : ' · no feedback recorded'}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
