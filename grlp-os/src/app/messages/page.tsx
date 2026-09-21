import Link from 'next/link';

import { requireUser } from '../../server/session';
import { prisma } from '../../server/db';
import { threadScopeWhere } from '../../server/threads';
import { whatsappConfig } from '../../integrations/whatsapp';
import { Shell } from '../../components/shell';
import { Card, Empty, Notice } from '../../components/ui';
import { formatRelative } from '../../lib/format';
import { UploadForm } from './upload-form';

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<string, string> = {
  URGENT: 'Urgent',
  CLIENT: 'Client',
  SALES: 'Sales',
  RENTAL: 'Rentals',
  STAFF: 'Staff',
  FINANCE: 'Finance',
  MARKETING: 'Marketing',
  PERSONAL: 'Personal',
  INFORMATIONAL: 'Information only',
  LOW_PRIORITY: 'Low priority',
};

/**
 * WhatsApp, organised.
 *
 * The one thing this page cannot do is reply. That is enforced in the code
 * rather than by leaving a button off: nothing in the WhatsApp modules can
 * send. What it does instead is make a few hundred conversations legible — who
 * is waiting, what was promised, which client each one belongs to, and where
 * anything was said about an erf or an amount.
 */
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const user = await requireUser();
  const { q, category } = await searchParams;
  const query = q?.trim() ?? '';
  const filter = category && CATEGORY_LABELS[category] ? category : null;

  const visible = threadScopeWhere(user);
  const live = { ...visible, archived: false } as Record<string, unknown>;

  const [waiting, commitments, recent, matches, counts, total, filtered] = await Promise.all([
    prisma.messageThread.findMany({
      where: { ...live, waitingOnUs: true },
      orderBy: [{ importance: 'desc' }, { lastMessageAt: 'asc' }],
      include: { contact: true, property: true, owner: true },
      take: 20,
    }),
    prisma.commitment.findMany({
      where: { side: 'us', settledAt: null, thread: visible },
      orderBy: [{ dueAt: 'asc' }, { saidAt: 'desc' }],
      include: { thread: true },
      take: 20,
    }),
    prisma.messageThread.findMany({
      where: live,
      orderBy: { lastMessageAt: 'desc' },
      include: { contact: true, property: true },
      take: 12,
    }),
    query
      ? prisma.communication.findMany({
          where: { channel: 'WHATSAPP', body: { contains: query, mode: 'insensitive' }, thread: visible },
          orderBy: { receivedAt: 'desc' },
          include: { thread: true },
          take: 25,
        })
      : Promise.resolve([]),
    prisma.messageThread.groupBy({ by: ['category'], where: live, _count: { _all: true } }),
    prisma.messageThread.count({ where: visible }),
    filter
      ? prisma.messageThread.findMany({
          where: { ...live, category: filter as never },
          orderBy: { lastMessageAt: 'desc' },
          include: { contact: true },
          take: 40,
        })
      : Promise.resolve([]),
  ]);

  const liveConnected = whatsappConfig() != null;
  const byCategory = counts
    .map((c) => ({ key: c.category ?? 'UNCATEGORISED', count: c._count._all }))
    .sort((a, b) => b.count - a.count);

  return (
    <Shell
      user={user}
      current="/messages"
      title="Messages"
      lede={
        total === 0
          ? 'No conversations yet. Export a chat on your phone and drop the file below.'
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
      <div className="mb-5">
        <Notice tone="warn">
          <strong className="font-semibold">This never replies.</strong> It reads, sorts, summarises and raises tasks —
          replying stays with a person. There is no send function anywhere in the WhatsApp code, and a test checks that
          it stays that way.
          {!liveConnected ? (
            <>
              {' '}Conversations come in from chat exports; a live feed would need a WhatsApp Business number, which is
              separate from a personal account.
            </>
          ) : (
            <> The live feed is connected, so messages on the business number arrive here as they happen.</>
          )}
        </Notice>
      </div>

      {query ? (
        <div className="mb-5">
          <Card title={`Messages matching “${query}”`} eyebrow="Search" count={matches.length}>
            {matches.length ? (
              <ul>
                {matches.map((m) => (
                  <li key={m.id} className="border-b border-line/70 py-2.5 last:border-0 last:pb-0">
                    <p className="text-sm font-medium leading-snug">{m.senderName ?? m.fromName ?? 'Unknown'}</p>
                    <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-soft">{m.body?.slice(0, 220)}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {m.threadId ? (
                        <Link href={`/messages/${m.threadId}`} className="text-maroon hover:underline">
                          {m.thread?.title ?? 'Open conversation'}
                        </Link>
                      ) : (
                        (m.thread?.title ?? 'Unknown chat')
                      )}{' '}
                      · {m.receivedAt.toLocaleDateString('en-ZA')}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing found. Search matches the words in messages — a name, an erf number, an amount.</Empty>
            )}
          </Card>
        </div>
      ) : null}

      {filter ? (
        <div className="mb-5">
          <Card title={CATEGORY_LABELS[filter]!} eyebrow="Filed as" count={filtered.length}>
            {filtered.length ? (
              <ul>
                {filtered.map((t) => (
                  <ThreadRow key={t.id} thread={t} />
                ))}
              </ul>
            ) : (
              <Empty>Nothing filed here.</Empty>
            )}
          </Card>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <UploadForm />

        <Card title="By what it is about" eyebrow="Categories" count={byCategory.length}>
          {byCategory.length ? (
            <ul className="flex flex-wrap gap-2">
              {byCategory.map((c) => (
                <li key={c.key}>
                  <Link
                    href={c.key === 'UNCATEGORISED' ? '/messages' : `/messages?category=${c.key}`}
                    className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-sm transition ${
                      filter === c.key ? 'border-maroon bg-maroon-50 text-maroon' : 'border-line hover:border-maroon hover:text-maroon'
                    }`}
                  >
                    {CATEGORY_LABELS[c.key] ?? 'Not categorised'}
                    <span className="tabular-nums text-ink-muted">{c.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing to categorise yet.</Empty>
          )}
        </Card>

        <Card title="Waiting on a reply" eyebrow="They spoke last" count={waiting.length} tone="urgent">
          {waiting.length ? (
            <ul>
              {waiting.map((t) => (
                <ThreadRow key={t.id} thread={t} showOwner />
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
                <li key={c.id} className="border-b border-line/70 py-2.5 last:border-0 last:pb-0">
                  <p className="text-sm font-medium leading-snug">{c.what}</p>
                  <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-soft">“{c.quote}”</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    said {formatRelative(c.saidAt)} in{' '}
                    <Link href={`/messages/${c.threadId}`} className="text-maroon hover:underline">
                      {c.thread.title}
                    </Link>{' '}
                    · {c.dueAt ? `due ${c.dueAt.toLocaleDateString('en-ZA')}` : 'no date given'}
                  </p>
                </li>
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
                <ThreadRow key={t.id} thread={t} />
              ))}
            </ul>
          ) : (
            <Empty>
              Nothing yet. On the phone: open a chat, tap the name, Export Chat, Without Media — then drop the file in
              the box beside this one.
            </Empty>
          )}
        </Card>
      </div>
    </Shell>
  );
}

interface RowThread {
  id: string;
  title: string;
  summary: string | null;
  messageCount: number;
  lastMessageAt: Date | null;
  category: string | null;
  importance: string;
  kind: string;
  contact: { firstName: string; lastName: string } | null;
  property?: { reference: string } | null;
  owner?: { name: string } | null;
}

function ThreadRow({ thread, showOwner }: { thread: RowThread; showOwner?: boolean }) {
  const tone = thread.importance === 'URGENT' ? 'bg-maroon' : thread.importance === 'HIGH' ? 'bg-signal-attention' : 'bg-signal-calm';
  const meta = [
    `${thread.messageCount} messages`,
    thread.lastMessageAt ? formatRelative(thread.lastMessageAt) : null,
    thread.category ? CATEGORY_LABELS[thread.category] : 'not categorised',
    thread.contact ? `${thread.contact.firstName} ${thread.contact.lastName}`.trim() : null,
    thread.property?.reference,
    showOwner ? thread.owner?.name : null,
    thread.kind === 'GROUP' ? 'group' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="flex gap-3 border-b border-line/70 py-2.5 last:border-0 last:pb-0">
      <span className={`mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <Link href={`/messages/${thread.id}`} className="text-sm font-medium leading-snug hover:text-maroon hover:underline">
          {thread.title}
        </Link>
        {thread.summary ? (
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-soft">{thread.summary}</p>
        ) : null}
        <p className="mt-1 text-xs text-ink-muted">{meta}</p>
      </div>
    </li>
  );
}
