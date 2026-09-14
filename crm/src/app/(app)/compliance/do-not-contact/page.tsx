import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listDoNotContact } from '@/lib/compliance.ts';
import { DNC_CHANNELS, DNC_SOURCES, labelOf } from '@/lib/domain.ts';
import { formatDate } from '@/lib/format.ts';
import { formatZaPhone } from '@/lib/phone.ts';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { DoNotContactForm, ReleaseDoNotContactForm } from '../forms.tsx';

export const metadata = { title: 'Do not contact' };
export const dynamic = 'force-dynamic';

const STATES = [
  { value: 'active', label: 'In force' },
  { value: 'released', label: 'Released' },
  { value: 'all', label: 'Everything' },
] as const;

export default async function DoNotContactPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; q?: string }>;
}) {
  const user = await requirePermissionOrRedirect('COMPLIANCE_VIEW', '/compliance/do-not-contact');
  const { state = 'active', q } = await searchParams;
  const chosen = STATES.some((option) => option.value === state) ? state : 'active';

  const entries = await readAsUser(user.id, (db) =>
    listDoNotContact(db, { state: chosen as 'active' | 'released' | 'all', query: q }),
  );

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Do not contact"
        description="Everyone who has asked us to stop, and everyone the register told us to stop."
      />

      <Alert tone="neutral" className="mb-4">
        Nothing on this page is ever deleted. Releasing an entry needs a reason and keeps the
        original request, so the period it covered can always be explained.
      </Alert>

      <Card className="mb-4">
        <CardHeader title="Stop contacting someone" />
        <DoNotContactForm />
      </Card>

      <Card>
        <CardHeader
          title={`${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`}
          actions={
            <form
              className="flex w-full min-w-0 flex-wrap items-center gap-2"
              action="/compliance/do-not-contact"
            >
              <input
                type="search"
                name="q"
                defaultValue={q ?? ''}
                placeholder="Name or number"
                aria-label="Search do-not-contact"
                className="tap h-9 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm"
              />
              <select
                name="state"
                defaultValue={chosen}
                aria-label="Which entries"
                className="tap h-9 min-w-0 shrink rounded-lg border border-line bg-white px-3 text-sm"
              >
                {STATES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
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

        {entries.length === 0 ? (
          <EmptyState
            title={chosen === 'active' ? 'Nobody has asked us to stop' : 'Nothing to show'}
            className="py-8"
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {entries.map((entry) => {
              // formatZaPhone returns an empty string for anything that is not
              // a phone number, so an email address falls through to its own value.
              const label =
                entry.personName ||
                formatZaPhone(entry.contactValue) ||
                entry.contactValue ||
                'this entry';
              return (
                <li key={entry.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    {entry.personId ? (
                      <Link
                        href={`/people/${entry.personId}`}
                        className="font-medium text-ink hover:text-brand"
                      >
                        {entry.personName}
                      </Link>
                    ) : (
                      <span className="font-medium text-ink">{label}</span>
                    )}
                    {entry.personRef ? (
                      <span className="font-mono text-[0.6875rem] text-ink-faint">
                        {entry.personRef}
                      </span>
                    ) : null}
                    <Badge tone={entry.releasedAt ? 'neutral' : 'stop'}>
                      {entry.releasedAt ? 'Released' : labelOf(DNC_CHANNELS, entry.channel)}
                    </Badge>
                  </div>

                  <p className="mt-0.5 text-[0.8125rem] text-ink-soft">
                    {labelOf(DNC_SOURCES, entry.source)} · {formatDate(entry.addedAt)}
                    {entry.addedByName ? ` · recorded by ${entry.addedByName}` : ''}
                  </p>
                  {entry.reason ? (
                    <p className="text-[0.8125rem] text-ink">&ldquo;{entry.reason}&rdquo;</p>
                  ) : null}

                  {entry.releasedAt ? (
                    <p className="mt-1 rounded-lg bg-paper px-3 py-2 text-[0.6875rem] text-ink-soft">
                      Released {formatDate(entry.releasedAt)}
                      {entry.releasedByName ? ` by ${entry.releasedByName}` : ''}
                      {entry.releaseReason ? ` — ${entry.releaseReason}` : ''}
                    </p>
                  ) : user.permissions.has('COMPLIANCE_EDIT') ? (
                    <ReleaseDoNotContactForm
                      entryId={entry.id}
                      rowVersion={entry.rowVersion}
                      label={label}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
