import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { getAgentFilter } from '@/lib/session.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listAppointments } from '@/lib/tasks.ts';
import { listAgents } from '@/lib/people/queries.ts';
import { APPOINTMENT_TYPES, appointmentTypeOptions, labelOf, statusTone } from '@/lib/domain.ts';
import { TIMEZONE, formatDate, formatDateTime } from '@/lib/format.ts';
import {
  Badge,
  ButtonLink,
  Card,
  PageHeader,
  Select,
} from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { QuickActions } from '@/components/quick-actions.tsx';
import { Icon } from '@/components/icons.tsx';
import { AppointmentStatusButton } from './status-buttons.tsx';

export const metadata = { title: 'Calendar' };
export const dynamic = 'force-dynamic';

/** The Monday of the week containing this date, in the working timezone. */
function startOfWeek(date: Date): Date {
  const local = new Date(date.toLocaleString('en-US', { timeZone: TIMEZONE }));
  const day = (local.getDay() + 6) % 7;
  local.setHours(0, 0, 0, 0);
  local.setDate(local.getDate() - day);
  return local;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; type?: string; agent?: string; saved?: string }>;
}) {
  const user = await requirePermissionOrRedirect('TASKS_VIEW', '/calendar');
  const params = await searchParams;
  const agentFilter = await getAgentFilter(user);

  const offset = Number(params.week ?? 0) || 0;
  const from = startOfWeek(new Date());
  from.setDate(from.getDate() + offset * 7);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);

  const { appointments, agents } = await readAsUser(user.id, async (db) => ({
    appointments: await listAppointments(db, {
      from: from.toISOString(),
      to: to.toISOString(),
      agentId: params.agent ?? agentFilter,
      appointmentType: params.type ?? 'all',
    }),
    agents: user.permissions.has('DATA_VIEW_ALL') ? await listAgents(db) : [],
  }));

  // One bucket per day, so an empty Wednesday still shows as an empty Wednesday.
  const days: { date: Date; items: typeof appointments }[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(from);
    date.setDate(date.getDate() + index);
    return { date, items: [] };
  });
  for (const appointment of appointments) {
    const index = Math.floor(
      (new Date(appointment.startsAt).getTime() - from.getTime()) / 86_400_000,
    );
    if (index >= 0 && index < 7) days[index]?.items.push(appointment);
  }

  const canEdit = user.permissions.has('TASKS_EDIT');
  const query = (nextOffset: number) => {
    const search = new URLSearchParams();
    search.set('week', String(nextOffset));
    if (params.type) search.set('type', params.type);
    if (params.agent) search.set('agent', params.agent);
    return `/calendar?${search.toString()}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Calendar"
        title="Appointments"
        description="Viewings, valuations, meetings and inspections."
        actions={
          user.permissions.has('TASKS_CREATE') ? (
            <ButtonLink href="/calendar/new" tone="primary">
              <Icon.plus className="size-4" />
              Book an appointment
            </ButtonLink>
          ) : null
        }
      />

      {params.saved === 'updated' ? (
        <Alert tone="ok" className="mb-4">
          Appointment saved.
        </Alert>
      ) : null}

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <ButtonLink href={query(offset - 1)} size="sm">
            Previous week
          </ButtonLink>
          <ButtonLink href={query(0)} size="sm" tone={offset === 0 ? 'primary' : 'secondary'}>
            This week
          </ButtonLink>
          <ButtonLink href={query(offset + 1)} size="sm">
            Next week
          </ButtonLink>
          <p className="text-sm font-medium text-ink">
            {formatDate(from)} to {formatDate(new Date(to.getTime() - 86_400_000))}
          </p>

          <form method="get" className="ml-auto flex flex-wrap items-end gap-2">
            <input type="hidden" name="week" value={offset} />
            <label>
              <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                Type
              </span>
              <Select name="type" defaultValue={params.type ?? 'all'} className="h-9">
                <option value="all">All</option>
                {appointmentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
            {agents.length > 0 ? (
              <label>
                <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                  Agent
                </span>
                <Select name="agent" defaultValue={params.agent ?? ''} className="h-9">
                  <option value="">{agentFilter ? 'Agent view setting' : 'Everyone'}</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}
            <button
              type="submit"
              className="tap rounded-lg border border-line bg-white px-3 text-sm font-medium hover:bg-paper"
            >
              Show
            </button>
          </form>
        </div>
      </Card>

      {appointments.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing in the diary this week"
            description="Book a viewing or a valuation, and it will appear here and on the client's profile."
            action={
              user.permissions.has('TASKS_CREATE') ? (
                <ButtonLink href="/calendar/new" tone="primary">
                  Book an appointment
                </ButtonLink>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {days
            .filter((day) => day.items.length > 0)
            .map((day) => (
              <Card key={day.date.toISOString()}>
                <p className="border-b border-line-soft px-4 py-2.5 text-[0.8125rem] font-semibold text-ink sm:px-5">
                  {new Intl.DateTimeFormat('en-ZA', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    timeZone: TIMEZONE,
                  }).format(day.date)}
                </p>
                <ul className="divide-y divide-line-soft">
                  {day.items.map((appointment) => (
                    <li key={appointment.id} className="p-4 sm:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-ink">
                            {new Intl.DateTimeFormat('en-ZA', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                              timeZone: TIMEZONE,
                            }).format(new Date(appointment.startsAt))}{' '}
                            — {appointment.title}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.6875rem] text-ink-faint">
                            <Badge tone={statusTone(appointment.status)}>
                              {labelOf(APPOINTMENT_TYPES, appointment.appointmentType)}
                            </Badge>
                            {appointment.agentName ? <span>{appointment.agentName}</span> : null}
                            {appointment.location ? <span>· {appointment.location}</span> : null}
                            {appointment.endsAt ? (
                              <span>· until {formatDateTime(appointment.endsAt).split('at ')[1]}</span>
                            ) : null}
                          </p>
                          <p className="mt-1 flex flex-wrap gap-3 text-[0.8125rem]">
                            {appointment.personId ? (
                              <Link
                                href={`/people/${appointment.personId}`}
                                className="text-brand hover:underline"
                              >
                                {appointment.personName}
                              </Link>
                            ) : null}
                            {appointment.propertyId ? (
                              <Link
                                href={`/properties/${appointment.propertyId}`}
                                className="text-brand hover:underline"
                              >
                                {appointment.propertyLabel}
                              </Link>
                            ) : null}
                          </p>
                          {appointment.notes ? (
                            <p className="mt-1 text-[0.8125rem] text-ink-soft">{appointment.notes}</p>
                          ) : null}
                        </div>

                        {canEdit ? (
                          <div className="flex shrink-0 flex-wrap gap-2">
                            {appointment.status === 'scheduled' ? (
                              <>
                                <AppointmentStatusButton
                                  appointmentId={appointment.id}
                                  status="completed"
                                  label="Happened"
                                />
                                <AppointmentStatusButton
                                  appointmentId={appointment.id}
                                  status="no_show"
                                  label="No show"
                                />
                              </>
                            ) : (
                              <Badge tone={statusTone(appointment.status)}>
                                {appointment.status === 'completed'
                                  ? 'Completed'
                                  : appointment.status === 'no_show'
                                    ? 'Did not arrive'
                                    : 'Cancelled'}
                              </Badge>
                            )}
                            {appointment.appointmentType === 'viewing' &&
                            appointment.propertyId &&
                            user.permissions.has('SALES_CREATE') ? (
                              <ButtonLink
                                href={`/sales/viewings/new?propertyId=${appointment.propertyId}&personId=${appointment.personId ?? ''}&appointmentId=${appointment.id}`}
                                size="sm"
                              >
                                Record the viewing
                              </ButtonLink>
                            ) : null}
                            <ButtonLink href={`/calendar/${appointment.id}/edit`} size="sm">
                              Edit
                            </ButtonLink>
                          </div>
                        ) : null}
                      </div>

                      {appointment.personMobile || appointment.personEmail ? (
                        <QuickActions
                          className="mt-3"
                          size="sm"
                          mobile={appointment.personMobile}
                          email={appointment.personEmail}
                          personId={appointment.personId ?? undefined}
                          propertyId={appointment.propertyId ?? undefined}
                          canLog={user.permissions.has('COMMUNICATION_CREATE')}
                          canTask={user.permissions.has('TASKS_CREATE')}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
        </div>
      )}
    </>
  );
}
