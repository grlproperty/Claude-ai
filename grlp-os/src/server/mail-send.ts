import { prisma } from './db';
import { guard } from '../domain/approvals';
import { mailTransport, mailboxConfig, type MailTransport } from '../integrations/mailbox';
import type { Principal } from './permissions';

/**
 * Sending (§19, §20).
 *
 * A message leaves GRLP only when a person has approved that specific message.
 * The rule that the system never sends as Mandy without her approval is enforced
 * here as well as in the guard, because this is the last point at which it can be.
 */

export class NotApprovedError extends Error {
  readonly code = 'NOT_APPROVED';
  constructor(message: string) {
    super(message);
    this.name = 'NotApprovedError';
  }
}

export interface SendResult {
  sent: boolean;
  messageId?: string;
  reason?: string;
}

export interface SendOptions {
  communicationId: string;
  approver: Principal;
  transport?: MailTransport;
  now?: Date;
}

/**
 * Sends the approved draft on a communication. Refuses if there is no draft, if
 * the draft has not been approved, or if the mailbox is not connected — and says
 * which, so nobody is left wondering whether the client heard from them.
 */
export async function sendApprovedReply({ communicationId, approver, transport, now = new Date() }: SendOptions): Promise<SendResult> {
  const communication = await prisma.communication.findUniqueOrThrow({ where: { id: communicationId } });

  if (!communication.draftReply?.trim()) {
    return { sent: false, reason: 'There is no draft to send.' };
  }
  if (!communication.draftApproved) {
    throw new NotApprovedError(
      'This draft has not been approved. A reply is only sent once a person has approved that specific message.',
    );
  }
  if (communication.sentAt) {
    return { sent: false, reason: 'This reply has already been sent.' };
  }
  if (!communication.fromAddress) {
    return { sent: false, reason: 'The original message has no reply address.' };
  }

  const permission = guard({
    grantedLevel: 'APPROVAL',
    actor: 'AI',
    humanApprovalId: `${approver.id}:${communicationId}`,
    effects: approver.isCeo ? ['send_email', 'send_as_ceo'] : ['send_email'],
  });
  if (!permission.allowed) return { sent: false, reason: permission.reason };

  if (!transport && !mailboxConfig()) {
    return {
      sent: false,
      reason:
        'The mailbox is not connected, so nothing was sent. Set MAIL_IMAP_HOST, MAIL_SMTP_HOST, MAIL_USER and MAIL_PASSWORD.',
    };
  }

  const post = transport ?? mailTransport();
  const subject = communication.subject?.toLowerCase().startsWith('re:')
    ? communication.subject
    : `Re: ${communication.subject ?? '(no subject)'}`;

  const { messageId } = await post.send({
    to: communication.fromAddress,
    subject,
    text: communication.draftReply,
    inReplyTo: communication.externalId,
  });

  await prisma.communication.update({
    where: { id: communicationId },
    data: { sentAt: now, answeredAt: now },
  });

  await prisma.aiAction.create({
    data: {
      agent: 'communication',
      action: 'send_reply',
      status: 'COMPLETED',
      summary: `Replied to ${communication.fromName ?? communication.fromAddress} about "${communication.subject ?? 'no subject'}".`,
      initiatedBy: approver.id,
      inputRefs: { communicationId },
      outputRefs: { messageId },
      // The drafting was the saved work; approving and sending was quick.
      minutesSaved: 8,
      savedFor: approver.id,
      requiredApproval: 'APPROVAL',
      startedAt: now,
      finishedAt: now,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorType: 'AI',
      actorId: approver.id,
      action: 'communication.sent',
      entity: 'communication',
      entityId: communicationId,
      after: { messageId, to: communication.fromAddress },
      rationale: `Approved by ${approver.name} before sending.`,
    },
  });

  return { sent: true, messageId };
}
