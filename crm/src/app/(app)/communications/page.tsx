import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getAgentFilter } from '@/lib/session.ts';
import {
  communicationStatistics,
  listCommunications,
} from '@/lib/communications.ts';
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  COMMUNICATION_OUTCOMES,
  communicationChannelOptions,
  labelOf,
} from '@/lib/domain.ts';
import { formatDateTime, pluralise, relativeTime } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { CommunicationNotice } from '@/components/quick-actions.tsx';

export const metadata = { title: 'Communications' };
export const dynamic = 'force-dynamic';

const SAVED_MESSAGES: Record<string, string> = {
  yes: 'Recorded.',
  'with-follow-up': 'Recorded, and the follow-up is on your task list.',
};

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    channel?: string;
    direction?: string;
    important?: string;
    page?: string;
    logged?: string;
  }>;
}) {
  const user = await requirePermissionOrRedirect('COMMUNICATION_VIEW', '/communications');
  const query = await searchParams;
  const agentFilter = await getAgentFilter(user);

  const data = await readAsUser(user.id, async (db) => ({
    list: await listCommunications(db, {
      query: query.q,
      channel: query.channel,
      direction: query.direction,
      importantOnly: query.important === 'yes',
      agentId: agentFilter,
      page: Number(query.page ?? '1') || 1,
      pageSize: 25,
    }),
    stats: await communicationStatistics(db, { agentId: agentFilter }),
  }));

  const { list, stats } = data;

  return (
    <>
      <PageHeader
        eyebrow="Communications"
        title="What was said, and when"
        description="Every conversation the office has written down."
        actions={
          user.permissions.has('COMMUNICATION_CREATE') ? (
            <>
              <ButtonLink href="/communications/new" tone="primary">
                Log what was said
              </ButtonLink>
              <ButtonLink href="/communications/templates">Wording</ButtonLink>
            </>
          ) : (
            <ButtonLink href="/communications/templates">Wording</ButtonLink>
          )
        }
      />

      {query.logged && SAVED_MESSAGES[query.logged] ? (
        <Alert tone="ok" className="mb-4">
          {SAVED_MESSAGES[query.logged]}
        </Alert>
      ) : null}

      {/*
        The single most important sentence in this section (spec 6, 143). It
        stays on the list page, not only on the form, because this is where
        somebody would otherwise assume the CRM had been sending things.
      */}
      <Alert tone="neutral" title="The CRM does not send messages" className="mb-4">
        Call, WhatsApp and Email open the app on your own device. Everything here is a record
        somebody wrote after the fact, so there is no such thing as a delivery or a read receipt
        to show you. <CommunicationNotice />
      </Alert>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Conversations logged" value={stats.total} />
        <Stat label="People spoken to" value={stats.peopleContacted} />
        <Stat
          label="Never contacted"
          value={stats.withoutAnyContact}
          tone={stats.withoutAnyContact > 0 ? 'warn' : 'ok'}
          hint="Nobody has logged a conversation with them"
        />
        <Stat
          label="Most used"
          value={
            stats.byChannel[0]
              ? labelOf(COMMUNICATION_CHANNELS, stats.byChannel[0].channel)
              : '—'
          }
          hint={stats.byChannel[0] ? pluralise(stats.byChannel[0].count, 'conversation') : undefined}
        />
      </div>

      <Card>
        <CardHeader
          title={pluralise(list.total, 'conversation')}
          actions={
            <form className="flex w-full min-w-0 flex-wrap items-center gap-2" action="/communications">
              <input
                type="search"
                name="q"
                defaultValue={query.q ?? ''}
                placeholder="Name, reference or words"
                aria-label="Search the communication log"
                className="tap h-9 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm"
              />
              <select
                name="channel"
                defaultValue={query.channel ?? 'all'}
                aria-label="Which channel"
                className="tap h-9 min-w-0 shrink rounded-lg border border-line bg-white px-3 text-sm"
              >
                <option value="all">Any channel</option>
                {communicationChannelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                name="direction"
                defaultValue={query.direction ?? 'all'}
                aria-label="Which way round"
                className="tap h-9 min-w-0 shrink rounded-lg border border-line bg-white px-3 text-sm"
              >
                <option value="all">Either way</option>
                <option value="outgoing">We contacted them</option>
                <option value="incoming">They contacted us</option>
              </select>
              <button
                type="submit"
                className="tap h-9 rounded-lg border border-line px-3 text-sm font-medium"
              >
                Apply
              </button>
            </form>
          }
        />

        {list.rows.length === 0 ? (
          <EmptyState
            title="Nothing logged yet"
            description={
              user.permissions.has('COMMUNICATION_CREATE')
                ? 'After a call or a WhatsApp, write down what happened.'
                : undefined
            }
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {list.rows.map((entry) => (
              <li key={entry.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    href={`/communications/${entry.id}`}
                    className="font-medium text-ink hover:text-brand"
                  >
                    {labelOf(COMMUNICATION_CHANNELS, entry.channel)}
                  </Link>
                  <Badge tone={entry.direction === 'incoming' ? 'info' : 'neutral'}>
                    {labelOf(COMMUNICATION_DIRECTIONS, entry.direction)}
                  </Badge>
                  {entry.outcome ? (
                    <Badge>{labelOf(COMMUNICATION_OUTCOMES, entry.outcome)}</Badge>
                  ) : null}
                  {entry.isImportant ? <Badge tone="brand">Important</Badge> : null}
                </div>

                <p className="mt-0.5 text-[0.6875rem] text-ink-faint">
                  {entry.personId ? (
                    <Link href={`/people/${entry.personId}`} className="hover:text-brand">
                      {entry.personName}
                    </Link>
                  ) : (
                    'Not linked to a client'
                  )}
                  {entry.propertyId ? (
                    <>
                      {' · '}
                      <Link href={`/properties/${entry.propertyId}`} className="hover:text-brand">
                        {entry.propertyLabel ?? entry.propertyRef}
                      </Link>
                    </>
                  ) : null}
                  {' · '}
                  {formatDateTime(entry.occurredAt)} ({relativeTime(entry.occurredAt)})
                  {entry.durationMinutes ? ` · ${entry.durationMinutes} min` : ''}
                  {entry.agentName ? ` · ${entry.agentName}` : ''}
                </p>

                {entry.subject ? (
                  <p className="mt-1 text-[0.8125rem] font-medium text-ink">{entry.subject}</p>
                ) : null}
                {entry.body ? (
                  <p className="text-[0.8125rem] text-ink-soft">
                    {entry.body.length > 240 ? `${entry.body.slice(0, 240)}…` : entry.body}
                  </p>
                ) : null}
                {entry.taskId ? (
                  <p className="mt-1 text-[0.6875rem] text-ink-faint">
                    A follow-up was made from this.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {list.total > list.pageSize ? (
          <div className="flex items-center justify-between border-t border-line-soft px-4 py-3 sm:px-5">
            <span className="text-[0.6875rem] text-ink-faint">
              Page {list.page} of {Math.ceil(list.total / list.pageSize)}
            </span>
            <div className="flex gap-2">
              {list.page > 1 ? (
                <ButtonLink
                  href={`/communications?${new URLSearchParams({ ...query, page: String(list.page - 1) } as Record<string, string>)}`}
                  size="sm"
                >
                  Previous
                </ButtonLink>
              ) : null}
              {list.page * list.pageSize < list.total ? (
                <ButtonLink
                  href={`/communications?${new URLSearchParams({ ...query, page: String(list.page + 1) } as Record<string, string>)}`}
                  size="sm"
                >
                  Next
                </ButtonLink>
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'neutral' | 'ok' | 'warn';
}) {
  return (
    <Card className="p-4 sm:p-5">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p
        className={
          tone === 'warn'
            ? 'text-2xl font-semibold text-warn'
            : tone === 'ok'
              ? 'text-2xl font-semibold text-ok'
              : 'text-2xl font-semibold text-ink'
        }
      >
        {value}
      </p>
      {hint ? <p className="text-[0.6875rem] text-ink-faint">{hint}</p> : null}
    </Card>
  );
}
