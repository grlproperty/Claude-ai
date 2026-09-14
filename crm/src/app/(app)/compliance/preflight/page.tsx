import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { preflightMany } from '@/lib/compliance.ts';
import {
  PERMISSION_CHANNELS,
  PERMISSION_PURPOSES,
  PREFLIGHT_STATUSES,
  labelOf,
  permissionChannelOptions,
  permissionPurposeOptions,
  preflightTone,
  type PermissionChannel,
  type PermissionPurpose,
  type PreflightStatus,
} from '@/lib/domain.ts';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';

export const metadata = { title: 'Check before sending' };
export const dynamic = 'force-dynamic';

/**
 * The direct-marketing preflight (spec 57).
 *
 * Answers one question before anything goes out: of these people, who may we
 * actually contact this way, and for the rest, why not. Nothing is sent from
 * here — the CRM does not send. It tells you who is clear.
 */
export default async function PreflightPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; purpose?: string; tag?: string }>;
}) {
  const user = await requirePermissionOrRedirect('COMPLIANCE_VIEW', '/compliance/preflight');
  const query = await searchParams;

  const channel = (
    Object.keys(PERMISSION_CHANNELS).includes(query.channel ?? '') ? query.channel : 'email'
  ) as PermissionChannel;
  const purpose = (
    Object.keys(PERMISSION_PURPOSES).includes(query.purpose ?? '')
      ? query.purpose
      : 'direct_marketing'
  ) as PermissionPurpose;

  const data = await readAsUser(user.id, async (db) => {
    const people = await db.query<{ id: string }>(
      `select p.id from people p
        where p.merged_into_id is null and not p.is_archived
        order by p.surname, p.first_name
        limit 500`,
    );
    return preflightMany(
      db,
      people.map((row) => row.id),
      channel,
      purpose,
    );
  });

  const counts: Record<PreflightStatus, number> = { green: 0, amber: 0, red: 0 };
  for (const row of data) counts[row.verdict.status] += 1;

  const order: PreflightStatus[] = ['red', 'amber', 'green'];
  const sorted = [...data].sort(
    (a, b) => order.indexOf(a.verdict.status) - order.indexOf(b.verdict.status),
  );

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Check before sending"
        description="Who may be contacted this way, and for everyone else, exactly why not."
      />

      <Alert tone="neutral" className="mb-4">
        Nothing is sent from here. The CRM has no connection to email or WhatsApp and cannot send
        a message. This tells you who is clear so that whoever does send, sends to the right list.
      </Alert>

      <Card className="mb-4">
        <CardHeader title="What are you about to send?" />
        <form
          action="/compliance/preflight"
          className="flex flex-wrap items-end gap-3 p-4 sm:p-5"
        >
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              How
            </span>
            <select
              name="channel"
              defaultValue={channel}
              className="tap h-11 rounded-lg border border-line bg-white px-3 text-sm"
            >
              {permissionChannelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
              What for
            </span>
            <select
              name="purpose"
              defaultValue={purpose}
              className="tap h-11 rounded-lg border border-line bg-white px-3 text-sm"
            >
              {permissionPurposeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="tap inline-flex h-11 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white"
          >
            Check
          </button>
        </form>
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Verdict
          status="green"
          count={counts.green}
          hint="Permission recorded, evidenced and current"
        />
        <Verdict status="amber" count={counts.amber} hint="Something is missing or has gone stale" />
        <Verdict status="red" count={counts.red} hint="Do not send to these, on any list" />
      </div>

      <Card>
        <CardHeader
          title={`${data.length} ${data.length === 1 ? 'person' : 'people'}`}
          description={`For ${labelOf(PERMISSION_PURPOSES, purpose).toLowerCase()} by ${labelOf(PERMISSION_CHANNELS, channel).toLowerCase()}. Worst first.`}
        />
        {sorted.length === 0 ? (
          <EmptyState title="Nobody to check yet" className="py-8" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {sorted.map((row) => (
              <li key={row.personId} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Badge tone={preflightTone(row.verdict.status)}>
                    {PREFLIGHT_STATUSES[row.verdict.status]}
                  </Badge>
                  <Link
                    href={`/people/${row.personId}/compliance`}
                    className="font-medium text-ink hover:text-brand"
                  >
                    {row.name}
                  </Link>
                  <span className="font-mono text-[0.6875rem] text-ink-faint">{row.clientRef}</span>
                </div>
                <ul className="mt-0.5 text-[0.8125rem] text-ink-soft">
                  {row.verdict.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Verdict({
  status,
  count,
  hint,
}: {
  status: PreflightStatus;
  count: number;
  hint: string;
}) {
  const tone = preflightTone(status);
  return (
    <Card className="p-4 sm:p-5">
      <Badge tone={tone}>{PREFLIGHT_STATUSES[status]}</Badge>
      <p
        className={
          tone === 'stop'
            ? 'mt-1 text-2xl font-semibold text-stop'
            : tone === 'warn'
              ? 'mt-1 text-2xl font-semibold text-warn'
              : 'mt-1 text-2xl font-semibold text-ok'
        }
      >
        {count}
      </p>
      <p className="text-[0.6875rem] text-ink-faint">{hint}</p>
    </Card>
  );
}
