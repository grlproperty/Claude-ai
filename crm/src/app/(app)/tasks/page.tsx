import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { getAgentFilter } from '@/lib/session.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listTasks, listWithoutNextAction, taskCounts, type TaskView } from '@/lib/tasks.ts';
import { listAgents } from '@/lib/people/queries.ts';
import { TASK_PRIORITIES, TASK_TYPES, labelOf, statusTone } from '@/lib/domain.ts';
import { formatDate, formatDateTime, isOverdue, pluralise, relativeTime } from '@/lib/format.ts';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  PageHeader,
} from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { QuickActions } from '@/components/quick-actions.tsx';
import { Icon } from '@/components/icons.tsx';
import { CancelTaskButton, CompleteTaskButton } from './task-actions.tsx';

export const metadata = { title: 'Tasks' };
export const dynamic = 'force-dynamic';

const VIEWS: { value: TaskView; label: string }[] = [
  { value: 'due_today', label: 'Due today' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'open', label: 'Everything open' },
  { value: 'completed', label: 'Completed' },
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; agent?: string; saved?: string }>;
}) {
  const user = await requirePermissionOrRedirect('TASKS_VIEW', '/tasks');
  const params = await searchParams;
  const agentFilter = await getAgentFilter(user);
  const view = (params.view as TaskView) ?? 'due_today';
  const assignedUserId = params.agent ?? agentFilter;

  const { tasks, counts, gaps, agents } = await readAsUser(user.id, async (db) => ({
    tasks: await listTasks(db, { view, assignedUserId }),
    counts: await taskCounts(db, assignedUserId),
    gaps: await listWithoutNextAction(db, { agentId: assignedUserId, limit: 15 }),
    agents: user.permissions.has('DATA_VIEW_ALL') ? await listAgents(db) : [],
  }));

  const canEdit = user.permissions.has('TASKS_EDIT');

  return (
    <>
      <PageHeader
        eyebrow="Tasks"
        title="What needs doing"
        description="Due today, overdue, coming up — and the records with nothing planned at all."
        actions={
          user.permissions.has('TASKS_CREATE') ? (
            <ButtonLink href="/tasks/new" tone="primary">
              <Icon.plus className="size-4" />
              Add follow-up
            </ButtonLink>
          ) : null
        }
      />

      {params.saved === 'updated' ? (
        <Alert tone="ok" className="mb-4">
          Task saved.
        </Alert>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Due today', value: counts.dueToday, tone: 'warn' as const, view: 'due_today' },
          { label: 'Overdue', value: counts.overdue, tone: 'stop' as const, view: 'overdue' },
          { label: 'Upcoming', value: counts.upcoming, tone: 'neutral' as const, view: 'upcoming' },
          { label: 'Open in total', value: counts.open, tone: 'info' as const, view: 'open' },
        ].map((tile) => (
          <Link key={tile.label} href={`/tasks?view=${tile.view}`} className="block">
            <Card
              className={`p-4 transition-colors hover:border-line ${
                view === tile.view ? 'border-brand ring-1 ring-brand/20' : ''
              }`}
            >
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                {tile.label}
              </p>
              <p className="text-2xl font-semibold text-ink">{tile.value}</p>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3">
          <nav className="flex flex-wrap gap-1" aria-label="Task views">
            {VIEWS.map((option) => (
              <Link
                key={option.value}
                href={`/tasks?view=${option.value}${params.agent ? `&agent=${params.agent}` : ''}`}
                aria-current={view === option.value ? 'page' : undefined}
                className={
                  view === option.value
                    ? 'rounded-lg bg-brand-wash px-3 py-1.5 text-[0.8125rem] font-medium text-brand-dark'
                    : 'rounded-lg px-3 py-1.5 text-[0.8125rem] text-ink-soft hover:bg-paper'
                }
              >
                {option.label}
              </Link>
            ))}
          </nav>

          {agents.length > 0 ? (
            <form method="get" className="ml-auto flex items-center gap-2">
              <input type="hidden" name="view" value={view} />
              <label className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                Agent
              </label>
              <select
                name="agent"
                defaultValue={params.agent ?? ''}
                className="h-9 rounded-lg border border-line bg-white px-2 text-sm"
              >
                <option value="">{agentFilter ? 'Agent view setting' : 'Everyone'}</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="tap rounded-lg border border-line bg-white px-3 text-sm font-medium hover:bg-paper"
              >
                Show
              </button>
            </form>
          ) : null}
        </div>

        {tasks.rows.length === 0 ? (
          <EmptyState
            title={
              view === 'overdue'
                ? 'No overdue follow-ups.'
                : view === 'due_today'
                  ? 'Nothing due today.'
                  : 'No tasks in this view.'
            }
            description="That is the point of the list: an empty one means nothing has been forgotten."
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {tasks.rows.map((task) => (
              <li key={task.id} className="p-4 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{task.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.6875rem] text-ink-faint">
                      <Badge tone={statusTone(task.priority)}>
                        {labelOf(TASK_PRIORITIES, task.priority)}
                      </Badge>
                      <span>{labelOf(TASK_TYPES, task.taskType)}</span>
                      {task.dueAt ? (
                        <span className={isOverdue(task.dueAt) ? 'font-medium text-stop' : ''}>
                          due {formatDateTime(task.dueAt)} ({relativeTime(task.dueAt)})
                        </span>
                      ) : (
                        <span>no due date</span>
                      )}
                      {task.assignedUserName ? <span>· {task.assignedUserName}</span> : null}
                      {task.recurrence !== 'none' ? <span>· repeats</span> : null}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-3 text-[0.8125rem]">
                      {task.personId ? (
                        <Link href={`/people/${task.personId}`} className="text-brand hover:underline">
                          {task.personName}
                        </Link>
                      ) : null}
                      {task.propertyId ? (
                        <Link
                          href={`/properties/${task.propertyId}`}
                          className="text-brand hover:underline"
                        >
                          {task.propertyLabel}
                        </Link>
                      ) : null}
                      {task.leadId ? (
                        <Link href={`/leads/${task.leadId}`} className="text-brand hover:underline">
                          Open the lead
                        </Link>
                      ) : null}
                    </p>
                    {task.notes ? (
                      <p className="mt-1 text-[0.8125rem] text-ink-soft">{task.notes}</p>
                    ) : null}
                    {task.completedAt ? (
                      <p className="mt-1 text-[0.6875rem] text-ok">
                        Completed {formatDate(task.completedAt)}
                        {task.completedByName ? ` by ${task.completedByName}` : ''}
                      </p>
                    ) : null}
                  </div>

                  {canEdit && task.status !== 'completed' && task.status !== 'cancelled' ? (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <CompleteTaskButton taskId={task.id} repeats={task.recurrence !== 'none'} />
                      <ButtonLink href={`/tasks/${task.id}/edit`} size="sm">
                        Edit
                      </ButtonLink>
                      {user.permissions.has('TASKS_DELETE') ? (
                        <CancelTaskButton taskId={task.id} />
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {task.personMobile || task.personEmail ? (
                  <QuickActions
                    className="mt-3"
                    size="sm"
                    mobile={task.personMobile}
                    email={task.personEmail}
                    personId={task.personId ?? undefined}
                    propertyId={task.propertyId ?? undefined}
                    leadId={task.leadId ?? undefined}
                    canLog={user.permissions.has('COMMUNICATION_CREATE')}
                    canTask={false}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {tasks.total > tasks.rows.length ? (
          <p className="border-t border-line-soft px-4 py-2 text-xs text-ink-faint">
            Showing {tasks.rows.length} of {pluralise(tasks.total, 'task')}.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          title="Nothing planned"
          description="Clients and live leads with no next action and no open task. The list nobody wants and everybody needs."
        />
        {gaps.people.length === 0 && gaps.leads.length === 0 ? (
          <EmptyState
            title="Everything has a next action."
            description="Every client and live lead you can see has either a follow-up date or an open task."
          />
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <div>
              <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                Clients ({gaps.people.length})
              </p>
              <ul className="space-y-1.5">
                {gaps.people.map((person) => (
                  <li key={person.id} className="text-[0.8125rem]">
                    <Link href={`/people/${person.id}`} className="text-brand hover:underline">
                      {person.name}
                    </Link>
                    <span className="text-ink-faint">
                      {' '}
                      · last contact{' '}
                      {person.lastContactAt ? formatDate(person.lastContactAt) : 'never'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                Live leads ({gaps.leads.length})
              </p>
              <ul className="space-y-1.5">
                {gaps.leads.map((lead) => (
                  <li key={lead.id} className="text-[0.8125rem]">
                    <Link href={`/leads/${lead.id}`} className="text-brand hover:underline">
                      {lead.personName ?? 'Unlinked enquiry'}
                    </Link>
                    <span className="text-ink-faint"> · since {formatDate(lead.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
