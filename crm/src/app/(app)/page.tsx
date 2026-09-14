import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requireUserOrRedirect } from '@/lib/guard.ts';
import { dashboard } from '@/lib/reports.ts';
import { commissionSummary } from '@/lib/commission/reports.ts';
import { listFavourites, listRecentlyViewed } from '@/lib/workspace.ts';
import { formatMoney, pluralise } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

/**
 * The dashboard (spec 94).
 *
 * What needs this person today, then what is in flight, then what is
 * quietly going wrong. Every figure names the status it counted, and none
 * of them are added together across statuses: a sale concluded and a sale
 * registered are different facts (spec 49, 141).
 *
 * An agent sees their own records only, without a single agent filter in
 * this file: row level security has already narrowed the query.
 */
export default async function DashboardPage() {
  const user = await requireUserOrRedirect();

  const data = await readAsUser(user.id, async (db) => ({
    board: await dashboard(db, user.id),
    commission: user.permissions.has('COMMISSION_VIEW') ? await commissionSummary(db) : null,
    favourites: await listFavourites(db, user.id),
    recent: await listRecentlyViewed(db, user.id, 6),
  }));

  const { board, commission, favourites, recent } = data;
  const seesEverybody = user.permissions.has('DATA_VIEW_ALL');

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title={`Good day, ${user.displayName}`}
        description={
          seesEverybody
            ? "The whole office. Every figure names the status it counted."
            : 'Your own records. Every figure names the status it counted.'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {user.permissions.has('PEOPLE_CREATE') ? (
              <ButtonLink href="/people/new">Add a person</ButtonLink>
            ) : null}
            {user.permissions.has('PROPERTIES_CREATE') ? (
              <ButtonLink href="/properties/new">Add a property</ButtonLink>
            ) : null}
            {user.permissions.has('TASKS_CREATE') ? (
              <ButtonLink href="/tasks/new" tone="primary">
                New task
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      {board.today.unreadNotifications > 0 ? (
        <Alert tone="neutral" className="mb-4">
          {pluralise(board.today.unreadNotifications, 'notification')} you have not read.{' '}
          <Link href="/notifications" className="font-medium underline">
            Open them
          </Link>
        </Alert>
      ) : null}

      {/* ---------------- Today ---------------- */}
      <h2 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
        Today
      </h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Tasks due today"
          value={board.today.tasksDue}
          href="/tasks?view=today"
          tone={board.today.tasksDue > 0 ? 'brand' : 'neutral'}
        />
        <Figure
          label="Tasks overdue"
          value={board.today.tasksOverdue}
          href="/tasks?view=overdue"
          tone={board.today.tasksOverdue > 0 ? 'stop' : 'neutral'}
        />
        <Figure
          label="Appointments today"
          value={board.today.appointmentsToday}
          href="/calendar"
        />
        <Figure label="New leads" value={board.today.newLeads} href="/leads?status=new" />
      </div>

      {/* ---------------- What needs looking at ---------------- */}
      {board.attention.length > 0 ? (
        <Card className="mb-6">
          <CardHeader
            title="Worth looking at"
            description="Counted from the records themselves, not guessed."
          />
          <ul className="divide-y divide-line-soft">
            {board.attention.map((item) => (
              <li key={item.label} className="px-4 py-2.5 sm:px-5">
                <Link
                  href={item.href}
                  className="flex flex-wrap items-center gap-2 text-[0.8125rem] hover:text-brand"
                >
                  <Badge tone={item.tone}>{item.count}</Badge>
                  <span className="font-medium text-ink">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* ---------------- In flight ---------------- */}
      <h2 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
        In flight
      </h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="On market"
          value={board.pipeline.propertiesOnMarket}
          href="/properties?propertyStatus=on_market"
          hint="Property status, not sales status"
        />
        <Figure
          label="Offers outstanding"
          value={board.pipeline.offersOutstanding}
          href="/sales"
          hint="Submitted, under review or countered"
        />
        <Figure
          label="Concluded, not registered"
          value={board.pipeline.awaitingRegistration}
          href="/sales?status=sale_concluded"
          hint="A concluded sale is not a registered sale"
          tone={board.pipeline.awaitingRegistration > 0 ? 'warn' : 'neutral'}
        />
        <Figure
          label="Registered this month"
          value={board.pipeline.registeredThisMonth}
          href="/sales?status=registered"
          hint="With a registration date against each"
          tone="ok"
        />
        <Figure
          label="Mandates expiring soon"
          value={board.pipeline.mandatesExpiringSoon}
          href="/properties?mandateStatus=mandate_active"
          tone={board.pipeline.mandatesExpiringSoon > 0 ? 'warn' : 'neutral'}
        />
        <Figure
          label="Leases running"
          value={board.pipeline.activeLeases}
          href="/rentals"
        />
        <Figure
          label="Applications pending"
          value={board.pipeline.applicationsPending}
          href="/rentals"
        />
        <Figure
          label="Sales concluded"
          value={board.pipeline.salesConcluded}
          href="/sales?status=sale_concluded"
        />
      </div>

      {/* ---------------- Commission ---------------- */}
      {commission ? (
        <Card className="mb-6">
          <CardHeader
            title="Commission"
            description="Four figures, kept deliberately apart. None of them is money in the bank."
            actions={<ButtonLink href="/commissions" size="sm">Open commission</ButtonLink>}
          />
          <dl className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
            <Money
              label="Being worked out"
              value={commission.pipelineExclVat}
              hint={pluralise(commission.pipelineCount, 'commission')}
            />
            <Money
              label="Waiting on the deeds office"
              value={commission.awaitingRegistrationExclVat}
              hint={`${pluralise(commission.awaitingRegistrationCount, 'commission')} · not earned yet`}
              tone="warn"
            />
            <Money
              label="Due to the office"
              value={commission.dueExclVat}
              hint={`${pluralise(commission.dueCount, 'commission')} · registered and approved`}
            />
            <Money
              label="Recorded as paid"
              value={commission.recordedPaidExclVat}
              hint={`${pluralise(commission.recordedPaidCount, 'commission')} · by a person, not a bank feed`}
              tone="ok"
            />
          </dl>
        </Card>
      ) : null}

      {/* ---------------- Your own corner ---------------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Favourites" description="Only you can see these." />
          {favourites.length === 0 ? (
            <EmptyState
              title="Nothing starred yet"
              description="Star a person or a property from its profile and it appears here."
              className="py-6"
            />
          ) : (
            <ul className="divide-y divide-line-soft">
              {favourites.slice(0, 8).map((favourite) => (
                <li key={`${favourite.entityType}-${favourite.entityId}`} className="px-4 py-2.5 sm:px-5">
                  <Link
                    href={favourite.href}
                    className="text-[0.8125rem] font-medium text-ink hover:text-brand"
                  >
                    {favourite.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recently opened" description="Also only yours." />
          {recent.length === 0 ? (
            <EmptyState title="Nothing opened yet" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {recent.map((entry) => (
                <li key={`${entry.entityType}-${entry.entityId}`} className="px-4 py-2.5 sm:px-5">
                  <Link
                    href={entry.href}
                    className="text-[0.8125rem] font-medium text-ink hover:text-brand"
                  >
                    {entry.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Figure({
  label,
  value,
  href,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  href: string;
  hint?: string;
  tone?: 'neutral' | 'brand' | 'ok' | 'warn' | 'stop';
}) {
  const colour =
    tone === 'stop'
      ? 'text-stop'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'ok'
          ? 'text-ok'
          : tone === 'brand'
            ? 'text-brand'
            : 'text-ink';

  return (
    <Card className="p-4 sm:p-5">
      <Link href={href} className="block hover:opacity-80">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
          {label}
        </p>
        <p className={`text-2xl font-semibold ${colour}`}>{value}</p>
        {hint ? <p className="text-[0.6875rem] text-ink-faint">{hint}</p> : null}
      </Link>
    </Card>
  );
}

function Money({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint: string;
  tone?: 'neutral' | 'ok' | 'warn';
}) {
  const colour = tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-ink';
  return (
    <div>
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </dt>
      <dd className={`text-xl font-semibold ${colour}`}>{formatMoney(value)}</dd>
      <dd className="text-[0.6875rem] text-ink-faint">{hint}</dd>
    </div>
  );
}
