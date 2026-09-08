import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ingestMail } from '../src/server/mail-ingest';
import { NotApprovedError, sendApprovedReply } from '../src/server/mail-send';
import { mailboxConfig, requireMailbox, type IncomingMessage, type MailTransport, type OutgoingMessage } from '../src/integrations/mailbox';
import { IntegrationNotConfiguredError } from '../src/integrations/registry';
import { mailboxConnected } from '../src/server/executor';
import type { Principal } from '../src/server/permissions';

/**
 * The mailbox logic is tested against a fake transport, so ingestion, triage,
 * routing, de-duplication and the send guard are all verified without a network
 * or a live mailbox. What cannot be tested here is whether the real IMAP server
 * accepts the credentials — that check is `verify()`, run against the real host.
 */

const prisma = new PrismaClient();
const TAG = 'MAILTEST';
const NOW = new Date('2026-09-08T09:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

let mandy: Principal;

class FakeTransport implements MailTransport {
  sent: OutgoingMessage[] = [];
  constructor(private messages: IncomingMessage[] = []) {}
  async fetchSince(since: Date, limit: number) {
    return this.messages.filter((m) => m.receivedAt >= since).slice(0, limit);
  }
  async send(message: OutgoingMessage) {
    this.sent.push(message);
    return { messageId: `<fake-${this.sent.length}@grproperty.co.za>` };
  }
  async verify() {
    return { ok: true };
  }
}

function message(over: Partial<IncomingMessage> & { externalId: string }): IncomingMessage {
  return {
    subject: 'Enquiry',
    body: 'Hello',
    fromName: 'A Sender',
    fromAddress: 'sender@example.invalid',
    toAddresses: ['mandy@grproperty.co.za'],
    receivedAt: hoursAgo(2),
    inReplyTo: null,
    ...over,
  };
}

beforeAll(async () => {
  const user = await prisma.user.findFirstOrThrow({ where: { isCeo: true } });
  mandy = { id: user.id, name: user.name, role: user.role, department: user.department, isCeo: user.isCeo };
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entity: 'communication' } });
  await prisma.aiAction.deleteMany({ where: { agent: { in: ['communication'] } } });
  await prisma.task.deleteMany({ where: { source: 'email' } });
  await prisma.communication.deleteMany({ where: { externalId: { startsWith: TAG } } });
  await prisma.$disconnect();
});

describe('configuration', () => {
  it('is not configured on a bare environment, and says what is missing', () => {
    expect(mailboxConfig({})).toBeNull();
    try {
      requireMailbox({});
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(IntegrationNotConfiguredError);
      expect((e as Error).message).toContain('MAIL_IMAP_HOST');
      expect((e as Error).message).toContain('Nothing has been sent, saved or changed');
    }
  });

  it('reads the real settings for a xneelo-hosted mailbox', () => {
    const config = mailboxConfig({
      MAIL_IMAP_HOST: 'mail.grproperty.co.za',
      MAIL_SMTP_HOST: 'mail.grproperty.co.za',
      MAIL_USER: 'mandy@grproperty.co.za',
      MAIL_PASSWORD: 'secret',
    })!;
    expect(config.imapPort).toBe(993);
    expect(config.imapSecure).toBe(true);
    // 587 is STARTTLS, not implicit TLS — getting this wrong fails to connect.
    expect(config.smtpPort).toBe(587);
    expect(config.smtpSecure).toBe(false);
    expect(config.fromAddress).toBe('mandy@grproperty.co.za');
  });

  it('treats port 465 as implicit TLS', () => {
    const config = mailboxConfig({
      MAIL_IMAP_HOST: 'h', MAIL_SMTP_HOST: 'h', MAIL_USER: 'u', MAIL_PASSWORD: 'p', MAIL_SMTP_PORT: '465',
    })!;
    expect(config.smtpSecure).toBe(true);
  });

  it('counts the mailbox as a way to send', () => {
    expect(mailboxConnected({})).toBe(false);
    expect(mailboxConnected({ MAIL_IMAP_HOST: 'h', MAIL_SMTP_HOST: 'h', MAIL_USER: 'u', MAIL_PASSWORD: 'p' })).toBe(true);
  });
});

describe('ingestion', () => {
  it('reads nothing and says so when the mailbox is not connected', async () => {
    const result = await ingestMail({ now: NOW });
    expect(result.fetched).toBe(0);
    expect(result.unavailable).toMatch(/not connected/);
    expect(result.unavailable).toMatch(/Nothing was read/);
  });

  it('stores a message, triages it, and gives it an owner', async () => {
    const transport = new FakeTransport([
      message({ externalId: `${TAG}-1`, subject: 'Geyser burst at the Wilderness cottage', body: 'Water through the ceiling' }),
    ]);
    const result = await ingestMail({ transport, since: hoursAgo(48), now: NOW });

    expect(result.stored).toBe(1);
    expect(result.byDecision.DELEGATE).toBe(1);

    const stored = await prisma.communication.findUniqueOrThrow({ where: { externalId: `${TAG}-1` } });
    expect(stored.category).toBe('RENTAL');
    expect(stored.triage).toBe('DELEGATE');
    expect(stored.triageReason).toBeTruthy();
    expect(stored.ownerId).toBeTruthy();
  });

  it('creates a task with a next action and the routing reason', async () => {
    const transport = new FakeTransport([
      message({ externalId: `${TAG}-2`, subject: 'Overdue rent for August', body: 'Statement of account attached' }),
    ]);
    await ingestMail({ transport, since: hoursAgo(48), now: NOW });

    const task = await prisma.task.findFirstOrThrow({ where: { source: 'email', title: { contains: 'Overdue rent' } } });
    expect(task.nextAction).toBeTruthy();
    expect(task.routingRationale).toBeTruthy();
    expect(task.department).toBe('ACCOUNTS');
    expect(task.createdByAi).toBe(true);
  });

  it('never ingests the same message twice', async () => {
    const transport = new FakeTransport([message({ externalId: `${TAG}-3`, subject: 'Book a viewing' })]);
    const first = await ingestMail({ transport, since: hoursAgo(48), now: NOW });
    const second = await ingestMail({ transport, since: hoursAgo(48), now: NOW });

    expect(first.stored).toBe(1);
    expect(second.stored).toBe(0);
    expect(second.skippedDuplicates).toBe(1);
    expect(await prisma.communication.count({ where: { externalId: `${TAG}-3` } })).toBe(1);
  });

  it('does not create a task for mail it archives', async () => {
    const transport = new FakeTransport([
      message({ externalId: `${TAG}-4`, subject: 'Weekly portal digest', fromAddress: 'no-reply@portal.invalid' }),
    ]);
    const result = await ingestMail({ transport, since: hoursAgo(48), now: NOW });

    expect(result.byDecision.ARCHIVE).toBe(1);
    expect(await prisma.task.count({ where: { source: 'email', title: { contains: 'portal digest' } } })).toBe(0);
  });

  it('keeps maintenance off the CEO even when addressed to her', async () => {
    const transport = new FakeTransport([
      message({ externalId: `${TAG}-5`, subject: 'Leaking tap at 12 Marine Drive', toAddresses: ['mandy@grproperty.co.za'] }),
    ]);
    await ingestMail({ transport, since: hoursAgo(48), now: NOW });

    const stored = await prisma.communication.findUniqueOrThrow({ where: { externalId: `${TAG}-5` } });
    expect(stored.ownerId).not.toBe(mandy.id);
  });

  it('picks the deadline out of the message and puts it on the task', async () => {
    const transport = new FakeTransport([
      message({ externalId: `${TAG}-6`, subject: 'Bond documents', body: 'The bank needs these by 2026-09-15.' }),
    ]);
    await ingestMail({ transport, since: hoursAgo(48), now: NOW });

    const task = await prisma.task.findFirstOrThrow({ where: { source: 'email', title: { contains: 'Bond documents' } } });
    expect(task.dueAt?.toISOString().slice(0, 10)).toBe('2026-09-15');
  });

  it('marks personal mail as personal, so it stays out of company workflows', async () => {
    const transport = new FakeTransport([
      message({ externalId: `${TAG}-7`, subject: 'School concert next week', body: 'Parents evening and the family dinner after' }),
    ]);
    await ingestMail({ transport, since: hoursAgo(48), now: NOW });

    const stored = await prisma.communication.findUniqueOrThrow({ where: { externalId: `${TAG}-7` } });
    expect(stored.domain).toBe('PERSONAL');
  });

  it('never sends anything during ingestion', async () => {
    const transport = new FakeTransport([message({ externalId: `${TAG}-8`, subject: 'Can I book a viewing?' })]);
    await ingestMail({ transport, since: hoursAgo(48), now: NOW });
    expect(transport.sent).toHaveLength(0);
  });
});

describe('sending', () => {
  async function draft(externalId: string, opts: { approved: boolean; draft?: string | null }) {
    return prisma.communication.create({
      data: {
        channel: 'EMAIL', direction: 'INBOUND', externalId,
        subject: 'Following up on the Sedgefield house',
        fromName: 'T Mokoena', fromAddress: 'buyer@example.invalid',
        receivedAt: hoursAgo(6), category: 'CLIENT', triage: 'DRAFT_FOR_REVIEW',
        draftReply: opts.draft === undefined ? 'Thank you for your message. The details are being confirmed.' : opts.draft,
        draftApproved: opts.approved,
      },
    });
  }

  it('refuses to send a draft nobody approved', async () => {
    const c = await draft(`${TAG}-send-1`, { approved: false });
    await expect(sendApprovedReply({ communicationId: c.id, approver: mandy, transport: new FakeTransport() }))
      .rejects.toThrow(NotApprovedError);
  });

  it('sends an approved draft and records it', async () => {
    const c = await draft(`${TAG}-send-2`, { approved: true });
    const transport = new FakeTransport();
    const result = await sendApprovedReply({ communicationId: c.id, approver: mandy, transport, now: NOW });

    expect(result.sent).toBe(true);
    expect(transport.sent[0]?.to).toBe('buyer@example.invalid');
    expect(transport.sent[0]?.subject).toBe('Re: Following up on the Sedgefield house');
    // Threading: the reply must attach to the original conversation.
    expect(transport.sent[0]?.inReplyTo).toBe(`${TAG}-send-2`);

    const after = await prisma.communication.findUniqueOrThrow({ where: { id: c.id } });
    expect(after.sentAt).not.toBeNull();
    expect(after.answeredAt).not.toBeNull();
  });

  it('does not send the same reply twice', async () => {
    const c = await draft(`${TAG}-send-3`, { approved: true });
    const transport = new FakeTransport();
    await sendApprovedReply({ communicationId: c.id, approver: mandy, transport, now: NOW });
    const second = await sendApprovedReply({ communicationId: c.id, approver: mandy, transport, now: NOW });

    expect(second.sent).toBe(false);
    expect(second.reason).toMatch(/already been sent/);
    expect(transport.sent).toHaveLength(1);
  });

  it('refuses when there is nothing to send', async () => {
    const c = await draft(`${TAG}-send-4`, { approved: true, draft: null });
    const result = await sendApprovedReply({ communicationId: c.id, approver: mandy, transport: new FakeTransport() });
    expect(result.sent).toBe(false);
    expect(result.reason).toMatch(/no draft/i);
  });

  it('says nothing was sent when the mailbox is not connected', async () => {
    const c = await draft(`${TAG}-send-5`, { approved: true });
    const result = await sendApprovedReply({ communicationId: c.id, approver: mandy, now: NOW });
    expect(result.sent).toBe(false);
    expect(result.reason).toMatch(/not connected/);
    expect(result.reason).toMatch(/nothing was sent/i);
  });

  it('writes an audit line naming who approved it', async () => {
    const c = await draft(`${TAG}-send-6`, { approved: true });
    await sendApprovedReply({ communicationId: c.id, approver: mandy, transport: new FakeTransport(), now: NOW });
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: c.id, action: 'communication.sent' } });
    expect(log.rationale).toContain(mandy.name);
  });
});
