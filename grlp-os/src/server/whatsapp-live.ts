import { prisma } from './db';
import { analyseThread } from '../domain/thread-analysis';
import type { ParsedMessage } from '../domain/whatsapp-export';
import { matchContact } from '../domain/contact-match';
import type { InboundMessage } from '../integrations/whatsapp';

/**
 * The live feed, for a WhatsApp Business number.
 *
 * Messages arrive one at a time here rather than as a file, but they end up in
 * exactly the same place and are read by exactly the same rules — a burst
 * geyser is a rental matter whether it was exported last week or arrived a
 * moment ago. The conversation is re-read after each message so that "who is
 * waiting" is true now rather than true at import.
 *
 * It still cannot reply. The Business API can send; this system holds no code
 * that does, which is the guarantee GRLP asked for.
 */

export interface LiveIngestResult {
  received: number;
  stored: number;
  threadsTouched: number;
}

export async function ingestLiveMessages(messages: InboundMessage[], now = new Date()): Promise<LiveIngestResult> {
  if (!messages.length) return { received: 0, stored: 0, threadsTouched: 0 };

  const staff = await prisma.user.findMany({ where: { active: true }, select: { name: true } });
  const ourNames = staff.map((s) => s.name);

  const byThread = new Map<string, InboundMessage[]>();
  for (const message of messages) {
    const list = byThread.get(message.threadKey);
    if (list) list.push(message);
    else byThread.set(message.threadKey, [message]);
  }

  let stored = 0;
  for (const [threadKey, batch] of byThread) {
    stored += await ingestThread(threadKey, batch, ourNames, now);
  }

  return { received: messages.length, stored, threadsTouched: byThread.size };
}

async function ingestThread(
  threadKey: string,
  batch: InboundMessage[],
  ourNames: string[],
  now: Date,
): Promise<number> {
  const first = batch[0]!;
  const counterpartyName = batch.find((m) => !m.isFromUs)?.fromName ?? null;
  const phone = batch.find((m) => !m.isFromUs)?.from ?? first.from;

  const thread = await prisma.messageThread.upsert({
    where: { externalId: threadKey },
    update: { counterpartyName: counterpartyName ?? undefined, counterpartyPhone: phone },
    create: {
      provider: 'whatsapp',
      externalId: threadKey,
      title: counterpartyName ?? `WhatsApp ${phone}`,
      kind: 'DIRECT',
      counterpartyName,
      counterpartyPhone: phone,
    },
  });

  let stored = 0;
  for (const message of batch) {
    // The provider's own message id is the key, so a redelivered webhook — Meta
    // retries until it gets a 200 — cannot double a conversation.
    const existing = await prisma.communication.findUnique({ where: { externalId: message.externalId } });
    if (existing) continue;

    await prisma.communication.create({
      data: {
        channel: 'WHATSAPP',
        direction: message.isFromUs ? 'OUTBOUND' : 'INBOUND',
        externalId: message.externalId,
        threadId: thread.id,
        body: message.mediaType ? `${message.text}\n[${message.mediaType}]`.trim() : message.text,
        senderName: message.fromName,
        senderPhone: message.from,
        fromName: message.fromName,
        receivedAt: message.sentAt,
        contactId: thread.contactId,
        domain: 'BUSINESS',
      },
    });
    stored += 1;
  }

  if (stored) await reanalyse(thread.id, ourNames, now);
  return stored;
}

/**
 * Reads the whole conversation again, not just what has just arrived: whether
 * anyone is waiting depends on what was said after the question, which is a
 * property of the conversation rather than of a message.
 */
async function reanalyse(threadId: string, ourNames: string[], now: Date): Promise<void> {
  const rows = await prisma.communication.findMany({
    where: { threadId },
    orderBy: { receivedAt: 'asc' },
    take: 1000,
  });
  if (!rows.length) return;

  const messages: ParsedMessage[] = rows.map((row) => ({
    sender: row.senderName ?? row.fromName ?? (row.direction === 'OUTBOUND' ? 'Us' : 'Them'),
    text: row.body ?? '',
    sentAt: row.receivedAt,
    isSystem: false,
    attachment: null,
  }));

  // A message sent from the business number is ours whatever name is attached.
  const outboundNames = rows.filter((r) => r.direction === 'OUTBOUND').map((r) => r.senderName ?? 'Us');
  const analysis = analyseThread(messages, { ourNames: [...ourNames, ...outboundNames], now });

  const thread = await prisma.messageThread.findUniqueOrThrow({ where: { id: threadId } });
  let contactId = thread.contactId;

  if (!contactId) {
    const candidates = await prisma.contact.findMany({
      select: { id: true, firstName: true, lastName: true, phone: true },
    });
    const match = matchContact({
      displayName: thread.counterpartyName,
      phone: thread.counterpartyPhone,
      candidates,
    });
    if (match?.certain) contactId = match.contactId;
  }

  await prisma.messageThread.update({
    where: { id: threadId },
    data: {
      category: analysis.category,
      importance: analysis.importance,
      messageCount: analysis.messageCount,
      firstMessageAt: rows[0]!.receivedAt,
      lastMessageAt: rows.at(-1)!.receivedAt,
      waitingOnUs: analysis.waitingOnUs,
      summary: analysis.outline,
      summaryProvenance: 'INFERENCE',
      summaryUpdatedAt: now,
      contactId,
    },
  });

  for (const c of analysis.commitments) {
    const existing = await prisma.commitment.findFirst({ where: { threadId, quote: c.quote, saidAt: c.saidAt } });
    if (existing) continue;
    await prisma.commitment.create({
      data: { threadId, quote: c.quote, side: c.side, what: c.what, dueAt: c.dueAt, saidAt: c.saidAt },
    });
  }
}
