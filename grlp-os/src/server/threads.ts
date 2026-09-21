import { prisma } from './db';
import { ForbiddenError, canSeeThread, scopeFor, type Principal } from './permissions';
import { matchContact, nameForNewContact, type ContactMatch } from '../domain/contact-match';
import type { CommunicationCategory } from '../domain/triage';
import type { Priority } from '../domain/types';

/**
 * The client side of WhatsApp.
 *
 * Importing a chat makes it readable. This is what makes it a record: the
 * conversation attached to the client it is about, the property it concerns,
 * the person at GRLP whose it is, and a category that can be corrected when the
 * rules get it wrong.
 *
 * Filing is a person's judgement, so all of it is reversible and all of it is
 * written to the audit log. Nothing here sends a message either.
 */

export interface ThreadFiling {
  category?: CommunicationCategory | null;
  importance?: Priority;
  ownerId?: string | null;
  contactId?: string | null;
  propertyId?: string | null;
  archived?: boolean;
}

/** What the screen needs to show one conversation and let someone file it. */
export async function threadDetail(actor: Principal, threadId: string) {
  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    include: {
      contact: true,
      property: true,
      owner: true,
      commitments: { orderBy: [{ settledAt: 'asc' }, { dueAt: 'asc' }, { saidAt: 'desc' }] },
    },
  });
  if (!thread) return null;
  if (!canSeeThread(actor, thread)) throw new ForbiddenError('view:thread');

  const [messages, staff, properties, suggestion] = await Promise.all([
    prisma.communication.findMany({
      where: { threadId },
      orderBy: { receivedAt: 'asc' },
      take: 500,
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, department: true }, orderBy: { name: 'asc' } }),
    prisma.property.findMany({ select: { id: true, reference: true, addressLine: true }, orderBy: { reference: 'asc' }, take: 200 }),
    thread.contactId ? Promise.resolve(null) : suggestContact(thread.counterpartyName, thread.counterpartyPhone),
  ]);

  const suggestedContact = suggestion
    ? await prisma.contact.findUnique({ where: { id: suggestion.contactId } })
    : null;

  return { thread, messages, staff, properties, suggestion, suggestedContact };
}

/**
 * Who this conversation is probably with. Only offered — the import already
 * took the matches it was sure of, so anything left here is for a person to
 * agree with or ignore.
 */
export async function suggestContact(
  displayName: string | null,
  phone: string | null,
): Promise<ContactMatch | null> {
  if (!displayName && !phone) return null;
  const candidates = await prisma.contact.findMany({
    select: { id: true, firstName: true, lastName: true, phone: true },
  });
  if (!candidates.length) return null;
  return matchContact({ displayName, phone, candidates });
}

export async function fileThread(actor: Principal, threadId: string, changes: ThreadFiling): Promise<void> {
  const before = await prisma.messageThread.findUnique({ where: { id: threadId } });
  if (!before) throw new ForbiddenError('view:thread');
  if (!canSeeThread(actor, before)) throw new ForbiddenError('view:thread');

  // Only what was actually asked for is written: a form that posts every field
  // would quietly clear the ones it did not show.
  const data: Record<string, unknown> = {};
  for (const key of ['category', 'importance', 'ownerId', 'contactId', 'propertyId', 'archived'] as const) {
    if (changes[key] !== undefined) data[key] = changes[key];
  }
  if (!Object.keys(data).length) return;

  // Re-categorising a conversation as personal takes it out of everyone else's
  // view, so it cannot be done by someone who would then lose sight of it.
  if (data.category === 'PERSONAL' && !canSeeThread(actor, { ownerId: before.ownerId, category: 'PERSONAL' })) {
    throw new ForbiddenError('file:personal_thread');
  }

  await prisma.$transaction(async (tx) => {
    await tx.messageThread.update({ where: { id: threadId }, data });
    await tx.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: actor.id,
        action: 'whatsapp.filed',
        entity: 'MessageThread',
        entityId: threadId,
        before: {
          category: before.category,
          importance: before.importance,
          ownerId: before.ownerId,
          contactId: before.contactId,
          propertyId: before.propertyId,
          archived: before.archived,
        },
        after: data as never,
        rationale: `${actor.name} filed "${before.title}".`,
      },
    });
  });
}

export class CannotCreateContactError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CannotCreateContactError';
  }
}

/**
 * Makes a client record out of a conversation with someone who is not on the
 * books yet. This is the step that turns WhatsApp into a source of clients
 * rather than a place they get lost.
 */
export async function createContactForThread(
  actor: Principal,
  threadId: string,
  kind: 'LEAD' | 'BUYER' | 'SELLER' | 'LANDLORD' | 'TENANT' | 'SUPPLIER' | 'OTHER',
): Promise<string> {
  const thread = await prisma.messageThread.findUnique({ where: { id: threadId } });
  if (!thread) throw new CannotCreateContactError('That conversation no longer exists.');
  if (!canSeeThread(actor, thread)) throw new ForbiddenError('view:thread');
  if (thread.contactId) throw new CannotCreateContactError('This conversation is already linked to a client.');

  const source = thread.counterpartyName ?? thread.title;
  const name = nameForNewContact(source);
  if (!name) {
    throw new CannotCreateContactError(
      'There is no name in this conversation to make a client from. Link it to an existing client instead.',
    );
  }

  const contactId = await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.create({
      data: {
        kind,
        firstName: name.firstName,
        lastName: name.lastName,
        phone: thread.counterpartyPhone,
        notes: `Created from the WhatsApp conversation "${thread.title}".`,
        domain: 'BUSINESS',
      },
    });

    await tx.messageThread.update({ where: { id: threadId }, data: { contactId: contact.id } });
    // The messages belong to the client too, or the record would show a client
    // with no history and a conversation with no client.
    await tx.communication.updateMany({ where: { threadId }, data: { contactId: contact.id } });

    await tx.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: actor.id,
        action: 'whatsapp.contact_created',
        entity: 'Contact',
        entityId: contact.id,
        after: { threadId, kind, name: `${name.firstName} ${name.lastName}`.trim() },
        rationale: `${actor.name} created a client record from "${thread.title}".`,
      },
    });

    return contact.id;
  });

  return contactId;
}

/** Marks something we undertook as done. It was never chased on WhatsApp. */
export async function settleCommitment(actor: Principal, commitmentId: string, now = new Date()): Promise<void> {
  const commitment = await prisma.commitment.findUnique({
    where: { id: commitmentId },
    include: { thread: true },
  });
  if (!commitment) return;
  if (!canSeeThread(actor, commitment.thread)) throw new ForbiddenError('view:thread');

  await prisma.commitment.update({ where: { id: commitmentId }, data: { settledAt: now } });
  await prisma.auditLog.create({
    data: {
      actorType: 'USER',
      actorId: actor.id,
      action: 'whatsapp.commitment_settled',
      entity: 'Commitment',
      entityId: commitmentId,
      after: { settledAt: now.toISOString() },
      rationale: `${actor.name} marked "${commitment.what}" as done.`,
    },
  });
}

/** The conversations this person is allowed to see, newest first. */
export function threadScopeWhere(actor: Principal) {
  const scope = scopeFor(actor);
  if (scope.allBusiness) return {};
  return {
    AND: [
      { OR: [{ ownerId: actor.id }, { ownerId: null }] },
      { OR: [{ category: { not: 'PERSONAL' as CommunicationCategory } }, { ownerId: actor.id }] },
    ],
  };
}
