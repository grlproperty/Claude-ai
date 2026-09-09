import { prisma } from './db';
import { parseWhatsAppExport, titleFromFilename, type ParsedMessage } from '../domain/whatsapp-export';
import { analyseThread, type ThreadAnalysis } from '../domain/thread-analysis';
import { route } from '../domain/routing';
import { getStaff } from './snapshot';
import type { Priority } from '../domain/types';

/**
 * Brings a WhatsApp conversation into the system: stores it, works out what it
 * is about, links it to the client and property it concerns, and raises tasks
 * for what is outstanding.
 *
 * It never sends anything. Where a conversation needs a reply, the system says
 * so and puts it in front of a person — that is the whole arrangement.
 */

export interface ImportedThread {
  threadId: string;
  title: string;
  messages: number;
  newMessages: number;
  category: string;
  waitingOnUs: boolean;
  waitingHours: number;
  commitments: number;
  openQuestions: number;
  linkedContact: string | null;
  linkedProperty: string | null;
  tasksCreated: number;
  unparsedLines: number;
}

export interface ImportOptions {
  /** The export's contents. */
  content: string;
  /** The filename WhatsApp gave it, used for the thread title. */
  filename: string;
  /** Names as they appear in the export for people on the GRLP side. */
  ourNames?: string[];
  /** Whose WhatsApp this is. */
  ownerId?: string | null;
  /** Analyse and report without writing anything. */
  dryRun?: boolean;
  now?: Date;
}

/** Everyone at GRLP, so "us" and "them" can be told apart in a chat. */
async function defaultOurNames(): Promise<string[]> {
  const staff = await prisma.user.findMany({ where: { active: true }, select: { name: true } });
  return staff.map((s) => s.name);
}

/**
 * WhatsApp shows whatever name is in the phone's contacts — "Mandy Pelser",
 * "Mandy GRLP", "Mandy 🏡" — while the staff record says "Mandy". Matching only
 * on the exact string attributed Mandy's own promises to the client, so a name
 * counts as ours when any word of a staff name appears in it.
 */
export function isOneOfUs(displayName: string, ourNames: string[]): boolean {
  const shown = displayName.toLowerCase().trim();
  if (!shown) return false;

  return ourNames.some((name) => {
    const staff = name.toLowerCase().trim();
    if (!staff) return false;
    if (shown === staff) return true;
    // Every word of the staff name appearing in the display name is a match:
    // "Mandy" matches "Mandy Pelser", and "Mandy Pelser" matches "Mandy Pelser GRLP".
    const words = staff.split(/\s+/).filter((w) => w.length > 2);
    return words.length > 0 && words.every((w) => new RegExp(`\\b${w}\\b`).test(shown));
  });
}

export async function importWhatsAppExport(options: ImportOptions): Promise<ImportedThread> {
  const now = options.now ?? new Date();
  const parsed = parseWhatsAppExport(options.content);
  const configured = options.ourNames ?? (await defaultOurNames());
  // Expand the staff list with the display names actually used in this chat, so
  // the analysis matches on the exact strings it will see.
  const ourNames = [
    ...configured,
    ...parsed.participants.filter((p) => isOneOfUs(p, configured)),
  ];
  const analysis = analyseThread(parsed.messages, { ourNames, now });

  const title = titleFromFilename(options.filename);
  const externalId = `whatsapp:export:${title.toLowerCase().replace(/\s+/g, '-')}`;

  const contact = await findContact(parsed.participants, ourNames);
  const property = await findProperty(analysis);

  if (options.dryRun) {
    return {
      threadId: '(dry run)',
      title,
      messages: analysis.messageCount,
      newMessages: analysis.messageCount,
      category: analysis.category,
      waitingOnUs: analysis.waitingOnUs,
      waitingHours: analysis.waitingHours,
      commitments: analysis.commitments.length,
      openQuestions: analysis.openQuestions.length,
      linkedContact: contact ? `${contact.firstName} ${contact.lastName}`.trim() : null,
      linkedProperty: property?.reference ?? null,
      tasksCreated: 0,
      unparsedLines: parsed.unparsedLines.length,
    };
  }

  const thread = await prisma.messageThread.upsert({
    where: { externalId },
    update: {
      title,
      kind: parsed.isGroup ? 'GROUP' : 'DIRECT',
      category: analysis.category,
      importance: analysis.importance,
      messageCount: analysis.messageCount,
      firstMessageAt: parsed.firstMessageAt,
      lastMessageAt: parsed.lastMessageAt,
      waitingOnUs: analysis.waitingOnUs,
      summary: analysis.outline,
      summaryProvenance: 'INFERENCE',
      summaryUpdatedAt: now,
      contactId: contact?.id ?? null,
      propertyId: property?.id ?? null,
      ownerId: options.ownerId ?? null,
    },
    create: {
      provider: 'whatsapp',
      externalId,
      title,
      kind: parsed.isGroup ? 'GROUP' : 'DIRECT',
      counterpartyName: parsed.participants.find((p) => !ourNames.includes(p)) ?? null,
      category: analysis.category,
      importance: analysis.importance,
      messageCount: analysis.messageCount,
      firstMessageAt: parsed.firstMessageAt,
      lastMessageAt: parsed.lastMessageAt,
      waitingOnUs: analysis.waitingOnUs,
      summary: analysis.outline,
      summaryProvenance: 'INFERENCE',
      summaryUpdatedAt: now,
      contactId: contact?.id ?? null,
      propertyId: property?.id ?? null,
      ownerId: options.ownerId ?? null,
    },
  });

  const newMessages = await storeMessages(thread.id, parsed.messages, ourNames, contact?.id ?? null);
  await storeCommitments(thread.id, analysis);
  const tasksCreated = await raiseTasks(thread.id, title, analysis, options.ownerId ?? null, now);

  return {
    threadId: thread.id,
    title,
    messages: analysis.messageCount,
    newMessages,
    category: analysis.category,
    waitingOnUs: analysis.waitingOnUs,
    waitingHours: analysis.waitingHours,
    commitments: analysis.commitments.length,
    openQuestions: analysis.openQuestions.length,
    linkedContact: contact ? `${contact.firstName} ${contact.lastName}`.trim() : null,
    linkedProperty: property?.reference ?? null,
    tasksCreated,
    unparsedLines: parsed.unparsedLines.length,
  };
}

/** Messages are keyed on time and sender, so re-importing an export is safe. */
async function storeMessages(
  threadId: string,
  messages: ParsedMessage[],
  ourNames: string[],
  contactId: string | null,
): Promise<number> {
  const ours = new Set(ourNames.map((n) => n.toLowerCase()));
  let created = 0;

  for (const message of messages) {
    if (message.isSystem) continue;
    const externalId = `wa:${threadId}:${message.sentAt.getTime()}:${message.sender}`;
    const existing = await prisma.communication.findUnique({ where: { externalId } });
    if (existing) continue;

    await prisma.communication.create({
      data: {
        channel: 'WHATSAPP',
        direction: ours.has(message.sender.toLowerCase()) ? 'OUTBOUND' : 'INBOUND',
        externalId,
        threadId,
        subject: null,
        body: message.attachment ? `${message.text}\n[attachment: ${message.attachment}]`.trim() : message.text,
        senderName: message.sender,
        fromName: message.sender,
        receivedAt: message.sentAt,
        contactId,
        domain: 'BUSINESS',
      },
    });
    created += 1;
  }

  return created;
}

async function storeCommitments(threadId: string, analysis: ThreadAnalysis): Promise<void> {
  for (const c of analysis.commitments) {
    const existing = await prisma.commitment.findFirst({
      where: { threadId, quote: c.quote, saidAt: c.saidAt },
    });
    if (existing) continue;
    await prisma.commitment.create({
      data: { threadId, quote: c.quote, side: c.side, what: c.what, dueAt: c.dueAt, saidAt: c.saidAt },
    });
  }
}

/**
 * Turns what is outstanding into tasks with an owner. The routing engine decides
 * who — a maintenance conversation goes to rentals whether it arrived by email or
 * by WhatsApp.
 */
async function raiseTasks(
  threadId: string,
  title: string,
  analysis: ThreadAnalysis,
  ownerId: string | null,
  now: Date,
): Promise<number> {
  if (!analysis.waitingOnUs && !analysis.commitments.some((c) => c.side === 'us')) return 0;

  const staff = await getStaff();
  const workKey =
    analysis.category === 'RENTAL' ? 'rental.maintenance_routine'
    : analysis.category === 'FINANCE' ? 'rental.arrears_follow_up'
    : analysis.category === 'SALES' ? 'buyer.follow_up'
    : 'email.routine_reply';

  const decision = route({
    workKey,
    staff,
    context: {
      relationshipOwnerId: ownerId,
      urgency: analysis.importance,
      // Replying is a person's job here: the system cannot send on WhatsApp.
      missingInputs: ['human reply'],
    },
  });

  let created = 0;

  if (analysis.waitingOnUs) {
    const key = `whatsapp:${threadId}:reply`;
    const existing = await prisma.task.findFirst({ where: { source: key, status: { not: 'DONE' } } });
    if (!existing) {
      const question = analysis.openQuestions[0];
      await prisma.task.create({
        data: {
          title: `Reply on WhatsApp: ${title}`,
          detail: question
            ? `${question.askedBy} asked ${question.waitingHours} hours ago: "${question.quote}"`
            : `${title} is waiting for a reply.`,
          status: 'PENDING',
          priority: analysis.importance as Priority,
          ownerType: 'USER',
          // Where the routing engine put the AI in the owner slot, the person who
          // would have approved its output is the one who must actually reply.
          ownerId: decision.ownerId ?? decision.approverId ?? ownerId,
          department: decision.department,
          createdByAi: true,
          source: key,
          nextAction: 'Read the conversation and reply. The system does not send on WhatsApp.',
          escalationLevel: decision.escalationLevel,
          requiredApproval: 'REVIEW',
          estimatedMinutes: 5,
          routingRationale: decision.rationale,
          dueAt: analysis.deadlines[0] ?? null,
        },
      });
      created += 1;
    }
  }

  // A promise belongs to whoever made it. If Mandy said she would send the
  // assessment, it is hers — handing it to whichever agent has the most room
  // would lose the fact that the client is expecting it from her.
  const staffByName = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } });

  for (const commitment of analysis.commitments.filter((c) => c.side === 'us')) {
    const key = `whatsapp:${threadId}:commitment:${commitment.saidAt.getTime()}`;
    const existing = await prisma.task.findFirst({ where: { source: key } });
    if (existing) continue;

    const speaker = staffByName.find((u) => isOneOfUs(commitment.speaker, [u.name]));

    await prisma.task.create({
      data: {
        title: `Undertaken on WhatsApp: ${commitment.what.slice(0, 90)}`,
        detail: `Said in "${title}" on ${commitment.saidAt.toLocaleDateString('en-ZA')}: "${commitment.quote}"`,
        status: 'PENDING',
        priority: commitment.dueAt ? 'HIGH' : 'NORMAL',
        ownerType: 'USER',
        ownerId: speaker?.id ?? decision.ownerId ?? decision.approverId ?? ownerId,
        department: decision.department,
        createdByAi: true,
        source: key,
        nextAction: commitment.what,
        requiredApproval: 'REVIEW',
        estimatedMinutes: 15,
        routingRationale: speaker
          ? `${commitment.speaker} gave this undertaking, so it stays with them.`
          : 'Found as an undertaking in a WhatsApp conversation.',
        dueAt: commitment.dueAt,
      },
    });
    created += 1;
  }

  void now;
  return created;
}

/** Links the chat to a client where the name matches a record. */
async function findContact(participants: string[], ourNames: string[]) {
  const others = participants.filter((p) => !ourNames.includes(p));
  for (const name of others) {
    const parts = name.trim().split(/\s+/);
    const last = parts.at(-1);
    if (!last || last.length < 3) continue;

    const contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { lastName: { equals: last, mode: 'insensitive' } },
          { firstName: { equals: parts[0], mode: 'insensitive' } },
        ],
      },
    });
    if (contact) return contact;
  }
  return null;
}

/** Links the chat to a property where an erf or address in it matches a record. */
async function findProperty(analysis: ThreadAnalysis) {
  for (const erf of analysis.mentions.erven) {
    const number = erf.replace(/erf\s*/i, '').trim();
    const property = await prisma.property.findFirst({
      where: { OR: [{ reference: { contains: number } }, { addressLine: { contains: number } }] },
    });
    if (property) return property;
  }
  for (const address of analysis.mentions.properties) {
    const property = await prisma.property.findFirst({
      where: { addressLine: { contains: address.split(/\s+/).slice(0, 2).join(' '), mode: 'insensitive' } },
    });
    if (property) return property;
  }
  return null;
}
