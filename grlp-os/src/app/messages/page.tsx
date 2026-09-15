import { requireUser } from '../../server/session';
import { prisma } from '../../server/db';
import { whatsappConfig } from '../../integrations/whatsapp';
import { Shell } from '../../components/shell';
import { Card, Empty, Notice, Row } from '../../components/ui';
import { formatRelative } from '../../lib/format';

export const dynamic = 'force-dynamic';

/**
 * WhatsApp, organised.
 *
 * The one thing this page cannot do is reply. That is deliberate and it is
 * enforced in the code, not by leaving a button off: nothing in the WhatsApp
 * modules can send. What it does instead is make a few hundred conversations
 * legible — who is waiting, what was promised, what is buried in them.
 */
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const query = q?.trim() ?? '';

  const [waiting, commitments, recent, matches, liveConnected] = await Promise.all([
    prisma.messageThread.findMany({
      where: { waitingOnUs: true, archived: false },
      orderBy: [{ importance: 'desc' }, { lastMessageAt: 'asc' }],
      include: { contact: true, property: true, owner: true },
      take: 20,
    }),
    prisma.commitment.findMany({
      where: { side: 'us', settledAt: null },
      orderBy: [{ dueAt: 'asc' }, { saidAt: 'desc' }],
      include: { thread: true },
      take: 20,
    }),
    prisma.messageThread.findMany({
      where: { archived: false },
      orderBy: { lastMessageAt: 'desc' },
      include: { contact: true, property: true },
      take: 12,
    }),
    query
      ? prisma.communication.findMany({
          where: { channel: 'WHATSAPP', body: { contains: query, mode: 'insensitive' } },
          orderBy: { receivedAt: 'desc' },
          include: { thread: true },
          take: 25,
        })
      : Promise.resolve([]),
    Promise.resolve(whatsappConfig() != null),
  ]);

  const total = await prisma.messageThread.count();

  return (
    <Shell
      user={user}
      current="/messages"
      title="Messages"
      lede={
        total === 0
          ? 'No conversations imported yet. Export a chat from WhatsApp and run npm run import:whatsapp.'
          : `${total} conversation${total === 1 ? '' : 's'}. ${waiting.length} waiting on a reply, ${commitments.length} undertaking${commitments.length === 1 ? '' : 's'} outstanding.`
      }
      action={
        <form className="flex gap-2" action="/messages">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Find a person, property or amount"
            aria-label="Search messages"
            className="w-64 rounded border border-line bg-surface px-3 py-2 text-sm focus:border-maroon"
          />
          <button type="submit" className="rounded bg-maroon px-4 py-2 text-sm font-semibold text-white transition hover:bg-maroon-700">
            Search
          </button>
        </form>
      }
    >
      <div className="mb-6">
        <Notice tone="warn">
          <strong className="font-semibold">This never replies.</strong> It reads, sorts, summarises and raises tasks —
          replying stays with a person. There is no send function anywhere in the WhatsApp code, and a test checks that
          it stays that way.
          {!liveConnected ? (
            <>
              {' '}Conversations come in from chat exports; a live feed would need a WhatsApp Business number, which is
              separate from a personal account.
            </>
          ) : null}
        </Notice>
      </div>

      {query ? (
        <div className="mb-5">
          <Card title={`Messages matching “${query}”`} eyebrow="Search" count={matches.length}>
            {matches.length ? (
              <ul>
                {matches.map((m) => (
                  <Row
                    key={m.id}
                    title={m.senderName ?? m.fromName ?? 'Unknown'}
                    detail={m.body?.slice(0, 220) ?? ''}
                    meta={`${m.thread?.title ?? 'Unknown chat'} · ${m.receivedAt.toLocaleDateString('en-ZA')}`}
                  />
                ))}
              </ul>
            ) : (
              <Empty>Nothing found. Search matches the words in messages — a name, an erf number, an amount.</Empty>
            )}
          </Card>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Waiting on a reply" eyebrow="They spoke last" count={waiting.length} tone="urgent">
          {waiting.length ? (
            <ul>
              {waiting.map((t) => (
                <Row
                  key={t.id}
                  title={t.title}
                  detail={t.summary ?? ''}
                  meta={[
                    t.lastMessageAt ? formatRelative(t.lastMessageAt) : null,
                    t.category?.toLowerCase(),
                    t.contact ? `${t.contact.firstName} ${t.contact.lastName}`.trim() : null,
                    t.property?.reference,
                    t.owner?.name,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  tone={t.importance === 'URGENT' ? 'urgent' : t.importance === 'HIGH' ? 'attention' : 'calm'}
                />
              ))}
            </ul>
          ) : (
            <Empty>Nobody is waiting on a reply.</Empty>
          )}
        </Card>

        <Card title="What we said we would do" eyebrow="Undertakings" count={commitments.length} tone="attention">
          {commitments.length ? (
            <ul>
              {commitments.map((c) => (
                <Row
                  key={c.id}
                  title={c.what}
                  detail={`“${c.quote}”`}
                  meta={[
                    c.thread.title,
                    c.dueAt ? `due ${c.dueAt.toLocaleDateString('en-ZA')}` : 'no date given',
                    `said ${formatRelative(c.saidAt)}`,
                  ].join(' · ')}
                  tone={c.dueAt && c.dueAt < new Date() ? 'urgent' : 'attention'}
                />
              ))}
            </ul>
          ) : (
            <Empty>Nothing outstanding that anyone promised in a chat.</Empty>
          )}
        </Card>

        <Card title="Recent conversations" eyebrow="All chats" count={recent.length}>
          {recent.length ? (
            <ul>
              {recent.map((t) => (
                <Row
                  key={t.id}
                  title={t.title}
                  detail={t.summary ?? ''}
                  meta={[
                    `${t.messageCount} messages`,
                    t.lastMessageAt ? formatRelative(t.lastMessageAt) : null,
                    t.category?.toLowerCase(),
                    t.kind === 'GROUP' ? 'group' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </ul>
          ) : (
            <Empty>
              Nothing imported. On the phone: open a chat, tap the name, Export Chat, Without Media. Save the .txt file
              and run <span className="font-mono text-xs">npm run import:whatsapp &lt;folder&gt;</span>.
            </Empty>
          )}
        </Card>

        <Card title="How conversations are read" eyebrow="What it looks for">
          <ul className="space-y-2.5 text-[0.8125rem] leading-relaxed text-ink-soft">
            <li>
              <strong className="font-medium text-ink">Who is waiting.</strong> A question from the other side that
              nobody answered afterwards.
            </li>
            <li>
              <strong className="font-medium text-ink">What was promised.</strong> “I’ll send…”, “we will…”, with the
              date if one was given — and it stays with whoever said it.
            </li>
            <li>
              <strong className="font-medium text-ink">What it is about.</strong> The same rules the inbox uses, so a
              burst geyser is a rental matter whichever way it arrives.
            </li>
            <li>
              <strong className="font-medium text-ink">What to search on later.</strong> Erf numbers, street addresses
              and rand amounts, pulled out as you go.
            </li>
          </ul>
        </Card>
      </div>
    </Shell>
  );
}
