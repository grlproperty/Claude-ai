import Link from 'next/link';
import { notFound } from 'next/navigation';

import { requireUser } from '../../../server/session';
import { prisma } from '../../../server/db';
import { threadDetail } from '../../../server/threads';
import { ForbiddenError } from '../../../server/permissions';
import { Shell } from '../../../components/shell';
import { Card, Empty, Notice } from '../../../components/ui';
import { formatRelative } from '../../../lib/format';
import { settleCommitmentAction } from '../actions';
import { CreateClientForm, FilingForm } from './filing-form';

export const dynamic = 'force-dynamic';

/**
 * One conversation, as a client record.
 *
 * Reading it here rather than on a phone is the point: beside the messages sit
 * the things a person would otherwise have to hold in their head — who it is
 * with, what it concerns, what was undertaken, and whether anyone is waiting.
 *
 * There is no reply box. There is no send function behind this page to put one
 * in front of.
 */
export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  let detail;
  try {
    detail = await threadDetail(user, id);
  } catch (error) {
    if (error instanceof ForbiddenError) notFound();
    throw error;
  }
  if (!detail) notFound();

  const { thread, messages, staff, properties, suggestion, suggestedContact } = detail;
  const contacts = await prisma.contact.findMany({
    select: { id: true, firstName: true, lastName: true, kind: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 500,
  });

  const outstanding = thread.commitments.filter((c) => !c.settledAt);
  const counterparty = thread.counterpartyName ?? thread.title;

  return (
    <Shell
      user={user}
      current="/messages"
      title={thread.title}
      lede={thread.summary ?? 'Not yet summarised.'}
      action={
        <Link href="/messages" className="rounded border border-line px-3 py-2 text-sm transition hover:border-maroon hover:text-maroon">
          All conversations
        </Link>
      }
    >
      <div className="mb-5">
        <Notice tone="warn">
          <strong className="font-semibold">Reading only.</strong> Nothing here replies, and there is no send function
          anywhere in the WhatsApp code for a button to call. Where a reply is needed the system raises a task and
          names the person.
        </Notice>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <Card
            title="The conversation"
            eyebrow={`${thread.messageCount} messages`}
            count={messages.length}
          >
            {messages.length ? (
              <ol className="space-y-2.5">
                {messages.map((m) => {
                  const ours = m.direction === 'OUTBOUND';
                  return (
                    <li key={m.id} className={ours ? 'flex justify-end' : 'flex justify-start'}>
                      <div
                        className={`max-w-[85%] rounded px-3 py-2 ${
                          ours ? 'bg-maroon-50 text-ink' : 'bg-surface-sunken text-ink'
                        }`}
                      >
                        <p className="text-micro uppercase tracking-[0.12em] text-ink-muted">
                          {m.senderName ?? m.fromName ?? (ours ? 'Us' : counterparty)} ·{' '}
                          {m.receivedAt.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <Empty>
                No messages stored for this conversation. Upload the export again from the Messages page.
              </Empty>
            )}
          </Card>

          <Card
            title="What was undertaken"
            eyebrow="Promises found in this chat"
            count={outstanding.length}
            tone={outstanding.length ? 'attention' : 'neutral'}
          >
            {thread.commitments.length ? (
              <ul className="space-y-2.5">
                {thread.commitments.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 border-b border-line/70 pb-2.5 last:border-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium leading-snug ${c.settledAt ? 'text-ink-muted line-through' : ''}`}>
                        {c.what}
                      </p>
                      <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-soft">“{c.quote}”</p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {c.side === 'us' ? 'We said this' : 'They said this'} · {formatRelative(c.saidAt)}
                        {c.dueAt ? ` · due ${c.dueAt.toLocaleDateString('en-ZA')}` : ' · no date given'}
                      </p>
                    </div>
                    {c.settledAt ? (
                      <span className="shrink-0 text-xs text-ink-muted">done</span>
                    ) : (
                      <form action={settleCommitmentAction} className="shrink-0">
                        <input type="hidden" name="commitmentId" value={c.id} />
                        <input type="hidden" name="threadId" value={thread.id} />
                        <button
                          type="submit"
                          className="rounded border border-line px-2.5 py-1 text-xs transition hover:border-maroon hover:text-maroon"
                        >
                          Mark done
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nobody undertook anything in this conversation.</Empty>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Filing" eyebrow="Correct anything the rules got wrong">
            <FilingForm
              threadId={thread.id}
              category={thread.category}
              importance={thread.importance}
              ownerId={thread.ownerId}
              contactId={thread.contactId}
              propertyId={thread.propertyId}
              archived={thread.archived}
              staff={staff.map((s) => ({ value: s.id, label: `${s.name} — ${s.department.toLowerCase().replace(/_/g, ' ')}` }))}
              contacts={contacts.map((c) => ({
                value: c.id,
                label: `${c.firstName} ${c.lastName}`.trim() + ` (${c.kind.toLowerCase()})`,
              }))}
              properties={properties.map((p) => ({ value: p.id, label: `${p.reference} — ${p.addressLine}` }))}
            />
          </Card>

          {!thread.contactId && suggestedContact && suggestion ? (
            <Card title="Probably this client" eyebrow="Suggested, not applied" tone="attention">
              <p className="text-sm leading-relaxed">
                <strong className="font-medium">
                  {suggestedContact.firstName} {suggestedContact.lastName}
                </strong>
              </p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-soft">{suggestion.reason}</p>
              <p className="mt-2 text-xs text-ink-muted">
                Choose them under Client above to file it. It was not applied because the match is not certain, and a
                conversation in the wrong client’s history is worse than one in nobody’s.
              </p>
            </Card>
          ) : null}

          {!thread.contactId && !suggestedContact ? (
            <Card title="Not on the books" eyebrow="Make a client record">
              <CreateClientForm threadId={thread.id} name={counterparty} />
            </Card>
          ) : null}

          <Card title="At a glance" eyebrow="This conversation">
            <dl className="space-y-2 text-sm">
              <Fact label="With" value={counterparty} />
              <Fact label="Number" value={thread.counterpartyPhone ?? 'Not known — an export carries no numbers'} />
              <Fact
                label="Client"
                value={thread.contact ? `${thread.contact.firstName} ${thread.contact.lastName}`.trim() : 'Not linked'}
              />
              <Fact label="Property" value={thread.property ? `${thread.property.reference} — ${thread.property.addressLine}` : 'Not linked'} />
              <Fact label="Belongs to" value={thread.owner?.name ?? 'Nobody'} />
              <Fact
                label="Last message"
                value={thread.lastMessageAt ? formatRelative(thread.lastMessageAt) : 'Unknown'}
              />
              <Fact label="Waiting on us" value={thread.waitingOnUs ? 'Yes — they spoke last and asked something' : 'No'} />
            </dl>
          </Card>
        </div>
      </div>
    </Shell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 border-b border-line/70 pb-2 last:border-0 last:pb-0">
      <dt className="w-28 shrink-0 text-micro uppercase tracking-[0.12em] text-ink-muted">{label}</dt>
      <dd className="min-w-0 flex-1 leading-relaxed">{value}</dd>
    </div>
  );
}
