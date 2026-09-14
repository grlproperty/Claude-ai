import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { FICA_STATUSES, RISK_RATINGS, ficaSummary, listFicaRecords } from '@/lib/fica.ts';
import { getNumberSetting } from '@/lib/settings.ts';
import { labelOf, statusTone } from '@/lib/domain.ts';
import { formatDate, pluralise } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';

export const metadata = { title: 'FICA' };
export const dynamic = 'force-dynamic';

export default async function FicaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requirePermissionOrRedirect('FICA_VIEW', '/fica');
  const query = await searchParams;

  const data = await readAsUser(user.id, async (db) => ({
    records: await listFicaRecords(db, { status: query.status, query: query.q }),
    summary: await ficaSummary(db),
    warnDays: await getNumberSetting(db, 'fica.warn_days_before_expiry', 60),
  }));

  return (
    <>
      <PageHeader
        eyebrow="FICA"
        title="Who we have established, and how"
        description="What the office collected, who looked at it, and what they concluded."
        actions={
          user.permissions.has('FICA_CREATE') ? (
            <ButtonLink href="/fica/new" tone="primary">
              Open a file
            </ButtonLink>
          ) : null
        }
      />

      {/*
        The honesty statement for this whole section (spec 115). It sits at
        the top because this is exactly where somebody would otherwise assume
        an automatic check had happened.
      */}
      <Alert tone="warn" title="The CRM cannot verify anybody" className="mb-4">
        There is no connection to Home Affairs, to CIPC, to a deeds office, to a credit bureau or
        to any sanctions or politically-exposed-person list. Every file here says which person
        looked at the documents and when. Nothing on this page was checked by software.
      </Alert>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Verified by us" value={data.summary.verified} tone="ok" />
        <Stat label="Still outstanding" value={data.summary.outstanding} tone="warn" />
        <Stat
          label={`Expiring within ${data.warnDays} days`}
          value={data.summary.expiringSoon}
          tone={data.summary.expiringSoon > 0 ? 'warn' : 'neutral'}
        />
        <Stat label="Needs refreshing" value={data.summary.expired} tone={data.summary.expired > 0 ? 'stop' : 'neutral'} />
        <Stat
          label="Clients with no file"
          value={data.summary.peopleWithNoFile}
          hint="Nobody has started one"
        />
      </div>

      <Card>
        <CardHeader
          title={pluralise(data.records.length, 'file')}
          actions={
            <form className="flex w-full min-w-0 flex-wrap items-center gap-2" action="/fica">
              <input
                type="search"
                name="q"
                defaultValue={query.q ?? ''}
                placeholder="Name, reference or entity"
                aria-label="Search FICA files"
                className="tap h-9 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm"
              />
              <select
                name="status"
                defaultValue={query.status ?? 'all'}
                aria-label="Which status"
                className="tap h-9 min-w-0 shrink rounded-lg border border-line bg-white px-3 text-sm"
              >
                <option value="all">Any status</option>
                {Object.entries(FICA_STATUSES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
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

        {data.records.length === 0 ? (
          <EmptyState title="No FICA files yet" className="py-10" />
        ) : (
          <ul className="divide-y divide-line-soft">
            {data.records.map((record) => (
              <li key={record.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    href={`/fica/${record.id}`}
                    className="font-mono font-medium text-ink hover:text-brand"
                  >
                    {record.ficaRef}
                  </Link>
                  <span className="text-[0.8125rem] text-ink">
                    {record.personName ?? record.companyName}
                  </span>
                  <Badge tone={statusTone(record.status)}>
                    {labelOf(FICA_STATUSES, record.status)}
                  </Badge>
                  {record.isExpired ? <Badge tone="stop">Needs refreshing</Badge> : null}
                  {record.riskRating ? (
                    <Badge tone={record.riskRating === 'high' ? 'stop' : 'neutral'}>
                      {labelOf(RISK_RATINGS, record.riskRating)} risk
                    </Badge>
                  ) : null}
                  {record.companyId ? <Badge>Entity</Badge> : null}
                </div>
                <p className="mt-0.5 text-[0.6875rem] text-ink-faint">
                  {record.personRef ?? record.companyRef} · opened {formatDate(record.createdAt)}
                  {record.createdByName ? ` by ${record.createdByName}` : ''}
                  {record.verifiedByName
                    ? ` · verified by ${record.verifiedByName} on ${formatDate(record.verifiedAt)}`
                    : ''}
                  {record.expiresOn ? ` · needs redoing by ${formatDate(record.expiresOn)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
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
  value: number;
  hint?: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'stop';
}) {
  return (
    <Card className="p-4 sm:p-5">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p
        className={
          tone === 'stop'
            ? 'text-2xl font-semibold text-stop'
            : tone === 'warn'
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
