import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requireUserOrRedirect } from '@/lib/guard.ts';
import { globalSearch } from '@/lib/search.ts';
import { pluralise } from '@/lib/format.ts';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';

export const metadata = { title: 'Search' };
export const dynamic = 'force-dynamic';

/**
 * Global search (spec 17, 84, 97).
 *
 * One box for names, numbers, addresses and any GRLP reference. It will
 * not search by identity number, and says so rather than silently finding
 * nothing: an ID number in a query string ends up in a browser history, a
 * server log and a referrer header, which spec 15 forbids.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const user = await requireUserOrRedirect();
  const query = (q ?? '').trim();

  const result =
    query.length >= 2
      ? await readAsUser(user.id, (db) => globalSearch(db, query))
      : { hits: [], refusedIdNumber: false };

  const grouped = new Map<string, typeof result.hits>();
  for (const hit of result.hits) {
    const bucket = grouped.get(hit.kindLabel) ?? [];
    bucket.push(hit);
    grouped.set(hit.kindLabel, bucket);
  }

  return (
    <>
      <PageHeader
        eyebrow="Search"
        title={query ? `Results for “${query}”` : 'Search the CRM'}
        description="Names, mobile numbers however they are typed, email addresses, addresses, erf numbers and any GRLP reference."
      />

      <form className="mb-4 flex flex-wrap items-center gap-2" action="/search" role="search">
        <input
          type="search"
          name="q"
          defaultValue={query}
          autoFocus
          placeholder="Name, number, address or reference"
          aria-label="Search the CRM"
          className="tap h-10 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm"
        />
        <button
          type="submit"
          className="tap h-10 rounded-lg bg-brand px-4 text-sm font-medium text-white"
        >
          Search
        </button>
      </form>

      {result.refusedIdNumber ? (
        <Alert tone="warn" title="Identity numbers are not searchable" className="mb-4">
          That looks like an identity number. Searching puts whatever you type into the address
          bar, the browser&rsquo;s history and the server log, so the CRM refuses to do it. Open
          the person&rsquo;s profile instead: anybody authorised can reveal the number there, and
          that access is recorded.
        </Alert>
      ) : null}

      {query.length > 0 && query.length < 2 ? (
        <Alert tone="neutral" className="mb-4">
          Type at least two characters.
        </Alert>
      ) : null}

      {query.length >= 2 && result.hits.length === 0 && !result.refusedIdNumber ? (
        <Card>
          <EmptyState
            title="Nothing matched"
            description="Try part of a surname, the last digits of a mobile number, a street name or a GRLP reference. You only ever see records you are allowed to see, so something may exist that is not yours."
            className="py-10"
          />
        </Card>
      ) : null}

      {result.hits.length > 0 ? (
        <div className="space-y-4">
          {[...grouped.entries()].map(([kind, hits]) => (
            <Card key={kind}>
              <CardHeader title={`${kind} — ${pluralise(hits.length, 'match', 'matches')}`} />
              <ul className="divide-y divide-line-soft">
                {hits.map((hit) => (
                  <li key={`${hit.entityType}-${hit.entityId}`} className="px-4 py-2.5 sm:px-5">
                    <Link href={hit.href} className="block hover:text-brand">
                      <span className="text-[0.8125rem] font-medium text-ink">{hit.title}</span>{' '}
                      {hit.reference ? (
                        <Badge>
                          <span className="font-mono">{hit.reference}</span>
                        </Badge>
                      ) : null}
                      {hit.subtitle ? (
                        <p className="text-[0.6875rem] text-ink-faint">{hit.subtitle}</p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : null}
    </>
  );
}
