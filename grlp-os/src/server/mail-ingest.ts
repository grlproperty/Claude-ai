import { prisma } from './db';
import { getStaff } from './snapshot';
import { triage } from '../domain/triage';
import { route } from '../domain/routing';
import { mailboxConfig, mailTransport, type IncomingMessage, type MailTransport } from '../integrations/mailbox';
import type { CommunicationCategory, TriageDecision } from '../domain/triage';
import type { Department } from '../domain/types';

/**
 * Inbox ingestion (§20, §21).
 *
 * Reads real mail, triages it, works out who owns it, and records the result.
 * Three rules keep it safe to run repeatedly and safe to run unattended:
 *
 *   1. Idempotent. A message is stored under its Message-ID, so re-running the
 *      ingest never duplicates a conversation or re-raises a task.
 *   2. It never auto-replies. Triage decides what *should* happen; sending is a
 *      separate, approved step. Nothing leaves the mailbox from here.
 *   3. Mail addressed to the CEO is triaged like anything else — her inbox is not
 *      her task list, and a maintenance report reaching her address still goes to
 *      rentals.
 */

export interface IngestResult {
  fetched: number;
  stored: number;
  skippedDuplicates: number;
  byDecision: Record<TriageDecision, number>;
  routedTo: Record<string, number>;
  needsCeo: number;
  /** Set when the mailbox is not configured; nothing was read. */
  unavailable?: string;
}

const EMPTY_DECISIONS: Record<TriageDecision, number> = {
  AI_HANDLE: 0,
  AUTO_REPLY: 0,
  DRAFT_FOR_REVIEW: 0,
  DELEGATE: 0,
  ESCALATE: 0,
  ARCHIVE: 0,
};

/** Maps a triage department to the work the routing engine understands. */
const DEPARTMENT_WORK: Record<Exclude<Department, 'OPERATIONS'> | 'OPERATIONS', string> = {
  SALES: 'lead.first_response',
  RENTALS: 'rental.maintenance_routine',
  ACCOUNTS: 'rental.arrears_follow_up',
  MARKETING: 'marketing.social_post',
  EXECUTIVE: 'email.draft_for_ceo',
  OPERATIONS: 'email.routine_reply',
};

export interface IngestOptions {
  /** How far back to read. Defaults to the last message stored, else 7 days. */
  since?: Date;
  limit?: number;
  /** Substituted in tests. Defaults to the configured IMAP transport. */
  transport?: MailTransport;
  now?: Date;
}

export async function ingestMail(options: IngestOptions = {}): Promise<IngestResult> {
  const now = options.now ?? new Date();

  let transport: MailTransport;
  if (options.transport) {
    transport = options.transport;
  } else if (!mailboxConfig()) {
    return {
      fetched: 0,
      stored: 0,
      skippedDuplicates: 0,
      byDecision: { ...EMPTY_DECISIONS },
      routedTo: {},
      needsCeo: 0,
      unavailable:
        'The mailbox is not connected. Set MAIL_IMAP_HOST, MAIL_SMTP_HOST, MAIL_USER and MAIL_PASSWORD. Nothing was read.',
    };
  } else {
    transport = mailTransport();
  }

  const since = options.since ?? (await defaultSince(now));
  const messages = await transport.fetchSince(since, options.limit ?? 100);

  const staff = await getStaff();
  const contacts = await prisma.contact.findMany({
    where: { email: { not: null } },
    select: { id: true, email: true, kind: true },
  });
  const contactByEmail = new Map(contacts.map((c) => [c.email!.toLowerCase(), c]));

  const result: IngestResult = {
    fetched: messages.length,
    stored: 0,
    skippedDuplicates: 0,
    byDecision: { ...EMPTY_DECISIONS },
    routedTo: {},
    needsCeo: 0,
  };

  for (const message of messages) {
    const existing = await prisma.communication.findUnique({ where: { externalId: message.externalId } });
    if (existing) {
      result.skippedDuplicates += 1;
      continue;
    }

    const contact = message.fromAddress ? contactByEmail.get(message.fromAddress.toLowerCase()) : undefined;
    const verdict = triage({
      subject: message.subject,
      body: message.body,
      fromAddress: message.fromAddress,
      fromName: message.fromName,
      knownContact: Boolean(contact),
      receivedAt: message.receivedAt,
    });

    // Who should deal with it. The catalogue and the routing engine decide, not
    // the fact that it happened to arrive in the CEO's inbox.
    const workKey = verdict.workKey ?? DEPARTMENT_WORK[verdict.suggestedDepartment ?? 'OPERATIONS'];
    const decision = route({
      workKey,
      staff,
      context: {
        urgency: verdict.urgencyScore >= 0.9 ? 'URGENT' : verdict.urgencyScore >= 0.6 ? 'HIGH' : 'NORMAL',
        // Triage reads text, not records, so treat it as an unverified reading.
        missingInputs: verdict.decision === 'DRAFT_FOR_REVIEW' ? ['message'] : [],
      },
    });

    await prisma.communication.create({
      data: {
        channel: 'EMAIL',
        direction: 'INBOUND',
        externalId: message.externalId,
        subject: message.subject,
        body: message.body,
        fromName: message.fromName,
        fromAddress: message.fromAddress,
        toAddresses: message.toAddresses,
        receivedAt: message.receivedAt,
        category: verdict.category as CommunicationCategory,
        triage: verdict.decision,
        triageReason: verdict.reasons.join(' '),
        urgencyScore: verdict.urgencyScore,
        ownerId: decision.ownerId,
        contactId: contact?.id ?? null,
        domain: verdict.category === 'PERSONAL' ? 'PERSONAL' : 'BUSINESS',
      },
    });

    // Anything that needs a person gets a task with an owner and a next action.
    // Archived mail gets nothing — that is the point of archiving it.
    if (verdict.decision !== 'ARCHIVE') {
      await prisma.task.create({
        data: {
          title: `${subjectLine(message)} — ${verdict.decision.replace(/_/g, ' ').toLowerCase()}`,
          detail: `From ${message.fromName ?? message.fromAddress ?? 'unknown sender'}. ${verdict.reasons.join(' ')}`,
          status: 'PENDING',
          priority: decision.priority,
          ownerType: decision.ownerType,
          ownerId: decision.ownerId,
          department: decision.department,
          createdByAi: true,
          source: 'email',
          nextAction: nextActionFor(verdict.decision),
          escalationLevel: decision.escalationLevel,
          requiredApproval: decision.requiredApproval,
          estimatedMinutes: decision.estimatedMinutes,
          routingRationale: decision.rationale,
          dueAt: verdict.deadlines[0] ?? null,
          domain: verdict.category === 'PERSONAL' ? 'PERSONAL' : 'BUSINESS',
        },
      });
    }

    result.stored += 1;
    result.byDecision[verdict.decision] += 1;
    const owner = decision.ownerName ?? 'unassigned';
    result.routedTo[owner] = (result.routedTo[owner] ?? 0) + 1;
    if (decision.ceoInvolvement === 'decision' || decision.ceoInvolvement === 'approval') result.needsCeo += 1;
  }

  return result;
}

function subjectLine(message: IncomingMessage): string {
  const subject = message.subject?.trim();
  return subject && subject.length ? subject.slice(0, 120) : '(no subject)';
}

function nextActionFor(decision: TriageDecision): string {
  switch (decision) {
    case 'AI_HANDLE':
      return 'Prepare the response and the next step, then send once approved.';
    case 'AUTO_REPLY':
      return 'Send the approved standard response.';
    case 'DRAFT_FOR_REVIEW':
      return 'Draft a reply for review before it is sent.';
    case 'DELEGATE':
      return 'Handle it, or say who should.';
    case 'ESCALATE':
      return 'Read this one — it needs a decision.';
    case 'ARCHIVE':
      return 'No action needed.';
  }
}

/** Reads from where the last ingest stopped, so nothing is missed or repeated. */
async function defaultSince(now: Date): Promise<Date> {
  const latest = await prisma.communication.findFirst({
    where: { channel: 'EMAIL', direction: 'INBOUND' },
    orderBy: { receivedAt: 'desc' },
    select: { receivedAt: true },
  });
  return latest?.receivedAt ?? new Date(now.getTime() - 7 * 86_400_000);
}
