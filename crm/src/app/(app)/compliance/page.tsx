import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { complianceSummary, listDoNotContact } from '@/lib/compliance.ts';
import { listBatches } from '@/lib/ncc.ts';
import { getNumberSetting } from '@/lib/settings.ts';
import { NCC_BATCH_STATUSES, labelOf, statusTone } from '@/lib/domain.ts';
import { formatDate, formatMoney } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState, NotConnected } from '@/components/ui/feedback.tsx';

export const metadata = { title: 'Compliance' };
export const dynamic = 'force-dynamic';

export default async function CompliancePage() {
  const user = await requirePermissionOrRedirect('COMPLIANCE_VIEW', '/compliance');

  const data = await readAsUser(user.id, async (db) => ({
    summary: await complianceSummary(db),
    recentDnc: await listDoNotContact(db, { state: 'active', limit: 8 }),
    batches: await listBatches(db, { limit: 5 }),
    costPerNumber: await getNumberSetting(db, 'ncc.cost_per_number', 0),
    validDays: await getNumberSetting(db, 'ncc.result_valid_days', 180),
  }));

  const { summary } = data;
  const estimatedCleanupCost = summary.numbersNeverChecked * data.costPerNumber;

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Who may we contact, and how do we know?"
        description="Permissions, the evidence behind them, and everyone who has asked us to stop."
        actions={
          <>
            <ButtonLink href="/compliance/preflight" tone="primary">
              Check before sending
            </ButtonLink>
            <ButtonLink href="/compliance/do-not-contact">Do not contact</ButtonLink>
          </>
        }
      />

      {/*
        The honest statement of what this CRM can and cannot do (spec 115).
        It is at the top of the compliance section because that is where
        somebody would otherwise assume a check had happened automatically.
      */}
      <NotConnected
        service="NCC opt-out register"
        detail="The CRM cannot check a number against the register. It prepares a batch for you to send, and records the answers when they come back. Nothing is checked automatically."
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Asked us to stop"
          value={summary.activeDnc}
          hint={`${summary.releasedDnc} released, all still on record`}
          href="/compliance/do-not-contact"
          tone={summary.activeDnc > 0 ? 'stop' : 'neutral'}
        />
        <Stat
          label="Permissions granted"
          value={summary.permissionsGranted}
          hint={`${summary.permissionsWithdrawn} withdrawn`}
          tone="ok"
        />
        <Stat
          label="People with nothing recorded"
          value={summary.peopleWithNoPermission}
          hint="Direct marketing to these would be a guess"
          tone={summary.peopleWithNoPermission > 0 ? 'warn' : 'ok'}
        />
        <Stat
          label="Numbers never checked"
          value={summary.numbersNeverChecked}
          hint={`About ${formatMoney(String(estimatedCleanupCost))} to check them all`}
          href="/compliance/ncc"
          tone={summary.numbersNeverChecked > 0 ? 'warn' : 'ok'}
        />
        <Stat
          label="A check stays current for"
          value={`${data.validDays} days`}
          hint="Changed in compliance settings"
          href={user.permissions.has('SETTINGS_ADMIN') ? '/compliance/settings' : undefined}
        />
        <Stat
          label="Cost per number"
          value={formatMoney(String(data.costPerNumber))}
          hint="What the office is charged"
          href={user.permissions.has('SETTINGS_ADMIN') ? '/compliance/settings' : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Asked us to stop"
            description="Nothing here is ever deleted. Releasing one needs a reason."
            actions={
              <ButtonLink href="/compliance/do-not-contact" size="sm">
                See all
              </ButtonLink>
            }
          />
          {data.recentDnc.length === 0 ? (
            <EmptyState title="Nobody has asked us to stop" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {data.recentDnc.map((entry) => (
                <li key={entry.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  {entry.personId ? (
                    <Link
                      href={`/people/${entry.personId}`}
                      className="font-medium text-ink hover:text-brand"
                    >
                      {entry.personName}
                    </Link>
                  ) : (
                    <span className="font-medium text-ink">{entry.contactValue}</span>
                  )}{' '}
                  <Badge tone="stop">{entry.channel === 'all' ? 'Every channel' : entry.channel}</Badge>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {formatDate(entry.addedAt)}
                    {entry.reason ? ` · ${entry.reason}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Register checks"
            description="A batch is a record of what was sent away and what came back."
            actions={
              user.permissions.has('NCC_ADMIN') ? (
                <ButtonLink href="/compliance/ncc" size="sm">
                  Batches
                </ButtonLink>
              ) : null
            }
          />
          {data.batches.length === 0 ? (
            <EmptyState
              title="No batches yet"
              description={
                user.permissions.has('NCC_ADMIN')
                  ? 'Start one when numbers need checking.'
                  : undefined
              }
              className="py-6"
            />
          ) : (
            <ul className="divide-y divide-line-soft">
              {data.batches.map((batch) => (
                <li key={batch.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <Link
                    href={`/compliance/ncc/${batch.id}`}
                    className="font-mono font-medium text-ink hover:text-brand"
                  >
                    {batch.batchRef}
                  </Link>{' '}
                  <Badge tone={statusTone(batch.status)}>
                    {labelOf(NCC_BATCH_STATUSES, batch.status)}
                  </Badge>
                  <div className="text-[0.6875rem] text-ink-faint">
                    {batch.name} · {batch.itemCount} number
                    {batch.itemCount === 1 ? '' : 's'} ·{' '}
                    {formatMoney(String(batch.estimatedCost))}
                    {batch.listedCount > 0 ? ` · ${batch.listedCount} listed` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Alert tone="neutral" className="mt-4">
        A person&rsquo;s own permissions, the evidence for them and their history are on their
        profile, under Compliance.
      </Alert>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  href,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'stop';
}) {
  const body = (
    <>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p
        className={
          tone === 'stop'
            ? 'text-2xl font-semibold text-stop'
            : tone === 'warn'
              ? 'text-2xl font-semibold text-warn'
              : 'text-2xl font-semibold text-ink'
        }
      >
        {value}
      </p>
      {hint ? <p className="text-[0.6875rem] text-ink-faint">{hint}</p> : null}
    </>
  );

  return (
    <Card className="p-4 sm:p-5">
      {href ? (
        <Link href={href} className="block hover:opacity-80">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}
