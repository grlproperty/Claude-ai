import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import PizZip from 'pizzip';

import { intakeExport, intakeMany, isChatExportAttachment } from '../src/server/whatsapp-intake';
import { ingestLiveMessages } from '../src/server/whatsapp-live';
import {
  createContactForThread,
  fileThread,
  settleCommitment,
  suggestContact,
  threadDetail,
} from '../src/server/threads';
import { ForbiddenError, type Principal } from '../src/server/permissions';
import { ingestMail } from '../src/server/mail-ingest';
import type { IncomingMessage, MailTransport, OutgoingMessage } from '../src/integrations/mailbox';
import type { InboundMessage } from '../src/integrations/whatsapp';

const prisma = new PrismaClient();

const CHAT = `08/09/2026, 08:15 - Thandiwe Ndlovu: Morning Mandy, any news on the Sedgefield house?
08/09/2026, 09:02 - Mandy Pelser: Morning Thandiwe. I'll send you the updated market assessment by 12/09/2026.
09/09/2026, 07:40 - Thandiwe Ndlovu: Can you confirm whether the electrical COC is done?`;

const bytes = (text: string) => new TextEncoder().encode(text);

function zipOf(files: Record<string, string>): Uint8Array {
  const zip = new PizZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generate({ type: 'uint8array' });
}

let ceo: Principal;
let agent: Principal;

async function principals() {
  const mandy = await prisma.user.findFirstOrThrow({ where: { role: 'CEO' } });
  const other = await prisma.user.findFirstOrThrow({ where: { role: 'SALES_AGENT', active: true } });
  const shape = (u: typeof mandy): Principal => ({
    id: u.id, name: u.name, role: u.role, department: u.department, isCeo: u.role === 'CEO',
  });
  return { ceo: shape(mandy), agent: shape(other) };
}

async function clean() {
  await prisma.task.deleteMany({ where: { source: { startsWith: 'whatsapp:' } } });
  await prisma.task.deleteMany({ where: { source: 'decision-inbox' } });
  await prisma.auditLog.deleteMany({ where: { action: { startsWith: 'whatsapp.' } } });
  await prisma.commitment.deleteMany({});
  await prisma.communication.deleteMany({ where: { channel: 'WHATSAPP' } });
  await prisma.messageThread.deleteMany({});
  await prisma.contact.deleteMany({ where: { notes: { contains: 'WhatsApp conversation' } } });
  await prisma.contact.deleteMany({ where: { lastName: 'Ndlovu' } });
}

beforeEach(async () => {
  await clean();
  ({ ceo, agent } = await principals());
});

afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe('bringing a chat in the way Mandy actually would', () => {
  it('takes the .txt straight from the phone', async () => {
    const result = await intakeExport({
      filename: 'WhatsApp Chat with Thandiwe Ndlovu.txt',
      bytes: bytes(CHAT),
      channel: 'upload',
      ownerId: ceo.id,
      actorId: ceo.id,
    });

    expect(result.ok).toBe(true);
    expect(result.thread?.messages).toBe(3);
    expect(result.thread?.waitingOnUs).toBe(true);
  });

  it('takes the .zip WhatsApp produces when media is included', async () => {
    const result = await intakeExport({
      filename: 'WhatsApp Chat - Thandiwe Ndlovu.zip',
      bytes: zipOf({ '_chat.txt': CHAT, 'IMG-20260908-WA0001.jpg': 'binary' }),
      channel: 'upload',
      actorId: ceo.id,
    });

    expect(result.ok).toBe(true);
    expect(result.mediaCount).toBe(1);
    // The outer filename is the only place the person's name appears.
    expect(result.thread?.title).toContain('Thandiwe Ndlovu');
  });

  it('refuses something that is not a chat, and says so rather than importing nothing', async () => {
    const result = await intakeExport({
      filename: 'bank-statement.txt',
      bytes: bytes('Statement period 01/09/2026 to 30/09/2026\nClosing balance R12 400'),
      channel: 'upload',
      actorId: ceo.id,
    });

    expect(result.ok).toBe(false);
    expect(result.problem).toMatch(/Export Chat/);
    expect(await prisma.messageThread.count()).toBe(0);
  });

  it('records how a conversation got in', async () => {
    await intakeExport({
      filename: 'WhatsApp Chat with Thandiwe Ndlovu.txt',
      bytes: bytes(CHAT),
      channel: 'upload',
      actorId: ceo.id,
    });

    const entry = await prisma.auditLog.findFirst({ where: { action: 'whatsapp.imported.upload' } });
    expect(entry?.actorId).toBe(ceo.id);
  });

  // One bad file in a batch of ten must not cost the other nine.
  it('carries on past a file it cannot read', async () => {
    const results = await intakeMany(
      [
        { filename: 'notes.txt', bytes: bytes('remember to call the bank') },
        { filename: 'WhatsApp Chat with Thandiwe Ndlovu.txt', bytes: bytes(CHAT) },
      ],
      { channel: 'upload', actorId: ceo.id },
    );

    expect(results.map((r) => r.ok)).toEqual([false, true]);
    expect(await prisma.messageThread.count()).toBe(1);
  });

  it('knows which mail attachments are worth trying', () => {
    expect(isChatExportAttachment('_chat.txt', 'text/plain')).toBe(true);
    expect(isChatExportAttachment('WhatsApp Chat - Lisa.zip', 'application/zip')).toBe(true);
    expect(isChatExportAttachment('mandate.pdf', 'application/pdf')).toBe(false);
    expect(isChatExportAttachment('report.txt', 'application/pdf')).toBe(false);
  });
});

describe('the live feed', () => {
  const message = (over: Partial<InboundMessage> = {}): InboundMessage => ({
    externalId: 'wamid.1',
    threadKey: 'whatsapp:27825551234',
    from: '27825551234',
    fromName: 'Thandiwe Ndlovu',
    text: 'Any news on the Sedgefield house?',
    sentAt: new Date('2026-09-20T08:15:00Z'),
    mediaType: null,
    isFromUs: false,
    ...over,
  });

  it('stores a message and reads the conversation around it', async () => {
    const result = await ingestLiveMessages([message()]);
    expect(result.stored).toBe(1);

    const thread = await prisma.messageThread.findUniqueOrThrow({ where: { externalId: 'whatsapp:27825551234' } });
    expect(thread.counterpartyPhone).toBe('27825551234');
    expect(thread.waitingOnUs).toBe(true);
    expect(thread.summary).toBeTruthy();
  });

  // Meta retries a delivery until it gets a 200, so the same message arrives twice.
  it('does not double a conversation when a delivery is repeated', async () => {
    await ingestLiveMessages([message()]);
    const second = await ingestLiveMessages([message()]);

    expect(second.stored).toBe(0);
    expect(await prisma.communication.count({ where: { channel: 'WHATSAPP' } })).toBe(1);
  });

  it('stops saying they are waiting once we answer', async () => {
    await ingestLiveMessages([message()]);
    await ingestLiveMessages([
      message({
        externalId: 'wamid.2',
        isFromUs: true,
        fromName: 'Mandy',
        text: 'Morning Thandiwe, I will call the seller today.',
        sentAt: new Date('2026-09-20T09:00:00Z'),
      }),
    ]);

    const thread = await prisma.messageThread.findUniqueOrThrow({ where: { externalId: 'whatsapp:27825551234' } });
    expect(thread.waitingOnUs).toBe(false);
    expect(thread.messageCount).toBe(2);
  });

  // A delivery carrying only our own reply used to overwrite the client's
  // number with GRLP's, and the conversation would then match whoever holds it.
  it('keeps the client\u2019s number when the only new message is ours', async () => {
    await ingestLiveMessages([message()]);
    await ingestLiveMessages([
      message({
        externalId: 'wamid.ours',
        isFromUs: true,
        from: '27740000000',
        fromName: 'Mandy',
        text: 'I will call you at 2pm.',
        sentAt: new Date('2026-09-20T09:00:00Z'),
      }),
    ]);

    const thread = await prisma.messageThread.findUniqueOrThrow({ where: { externalId: 'whatsapp:27825551234' } });
    expect(thread.counterpartyPhone).toBe('27825551234');
  });

  it('files the conversation against a client whose number matches', async () => {
    const contact = await prisma.contact.create({
      data: { kind: 'BUYER', firstName: 'Thandiwe', lastName: 'Ndlovu', phone: '082 555 1234' },
    });

    await ingestLiveMessages([message()]);

    const thread = await prisma.messageThread.findUniqueOrThrow({ where: { externalId: 'whatsapp:27825551234' } });
    expect(thread.contactId).toBe(contact.id);
  });
});

describe('filing a conversation', () => {
  async function imported() {
    const result = await intakeExport({
      filename: 'WhatsApp Chat with Thandiwe Ndlovu.txt',
      bytes: bytes(CHAT),
      channel: 'upload',
      actorId: ceo.id,
    });
    return result.thread!.threadId;
  }

  it('changes only what was asked for', async () => {
    const id = await imported();
    await fileThread(ceo, id, { category: 'SALES' });

    const thread = await prisma.messageThread.findUniqueOrThrow({ where: { id } });
    expect(thread.category).toBe('SALES');
    // Importance was not in the form, so it must not have been cleared.
    expect(thread.importance).toBeTruthy();
  });

  it('writes what changed to the audit log', async () => {
    const id = await imported();
    await fileThread(ceo, id, { category: 'RENTAL', importance: 'HIGH' });

    const entry = await prisma.auditLog.findFirst({
      where: { action: 'whatsapp.filed', entityId: id },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry?.actorId).toBe(ceo.id);
    expect(entry?.after).toMatchObject({ category: 'RENTAL', importance: 'HIGH' });
  });

  it('lets a link be cleared as well as set', async () => {
    const id = await imported();
    const contact = await prisma.contact.create({ data: { kind: 'LEAD', firstName: 'Thandiwe', lastName: 'Ndlovu' } });

    await fileThread(ceo, id, { contactId: contact.id });
    expect((await prisma.messageThread.findUniqueOrThrow({ where: { id } })).contactId).toBe(contact.id);

    await fileThread(ceo, id, { contactId: null });
    expect((await prisma.messageThread.findUniqueOrThrow({ where: { id } })).contactId).toBeNull();
  });

  // Mandy's WhatsApp carries her family as well as her clients.
  it('hides a conversation marked personal from staff', async () => {
    const id = await imported();
    await fileThread(ceo, id, { category: 'PERSONAL' });

    await expect(threadDetail(agent, id)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await threadDetail(ceo, id)).not.toBeNull();
  });

  it('will not let someone mark a conversation personal if that hides it from them', async () => {
    const id = await imported();
    await fileThread(ceo, id, { ownerId: null });

    await expect(fileThread(agent, id, { category: 'PERSONAL' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('making a client out of a conversation', () => {
  async function imported() {
    const result = await intakeExport({
      filename: 'WhatsApp Chat with Thandiwe Ndlovu.txt',
      bytes: bytes(CHAT),
      channel: 'upload',
      actorId: ceo.id,
    });
    return result.thread!.threadId;
  }

  it('creates the record and gives it the conversation as history', async () => {
    const id = await imported();
    const contactId = await createContactForThread(ceo, id, 'BUYER');

    const contact = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
    expect(contact.firstName).toBe('Thandiwe');
    expect(contact.lastName).toBe('Ndlovu');
    expect(contact.kind).toBe('BUYER');

    const messages = await prisma.communication.count({ where: { threadId: id, contactId } });
    expect(messages).toBeGreaterThan(0);
  });

  it('refuses when the conversation already belongs to a client', async () => {
    const id = await imported();
    await createContactForThread(ceo, id, 'LEAD');
    await expect(createContactForThread(ceo, id, 'LEAD')).rejects.toThrow(/already linked/);
  });
});

describe('suggesting rather than assuming', () => {
  // The name WhatsApp shows is whatever is in the phone's contacts. "T Ndlovu"
  // is probably Thandiwe — but there could be a Theo, and filing a conversation
  // in the wrong client's history is worse than filing it in nobody's.
  const INITIAL_ONLY = `08/09/2026, 08:15 - T Ndlovu: Morning Mandy, any news on the Sedgefield house?
08/09/2026, 09:02 - Mandy Pelser: Morning. I'll send the assessment by 12/09/2026.
09/09/2026, 07:40 - T Ndlovu: Can you confirm whether the electrical COC is done?`;

  it('offers an uncertain match instead of applying it', async () => {
    await prisma.contact.create({ data: { kind: 'BUYER', firstName: 'Thandiwe', lastName: 'Ndlovu' } });

    const result = await intakeExport({
      filename: 'WhatsApp Chat with T Ndlovu.txt',
      bytes: bytes(INITIAL_ONLY),
      channel: 'upload',
      actorId: ceo.id,
    });

    const thread = await prisma.messageThread.findUniqueOrThrow({ where: { id: result.thread!.threadId } });
    expect(thread.contactId).toBeNull();

    const suggestion = await suggestContact(thread.counterpartyName, thread.counterpartyPhone);
    expect(suggestion?.certain).toBe(false);
    expect(suggestion?.reason).toContain('confirming');
  });

  it('applies a match it is sure of', async () => {
    const contact = await prisma.contact.create({
      data: { kind: 'BUYER', firstName: 'Thandiwe', lastName: 'Ndlovu' },
    });

    const result = await intakeExport({
      filename: 'WhatsApp Chat with Thandiwe Ndlovu.txt',
      bytes: bytes(CHAT),
      channel: 'upload',
      actorId: ceo.id,
    });

    const thread = await prisma.messageThread.findUniqueOrThrow({ where: { id: result.thread!.threadId } });
    expect(thread.contactId).toBe(contact.id);
  });
});

describe('an undertaking', () => {
  it('can be marked done, and says who did it', async () => {
    const result = await intakeExport({
      filename: 'WhatsApp Chat with Thandiwe Ndlovu.txt',
      bytes: bytes(CHAT),
      channel: 'upload',
      actorId: ceo.id,
    });

    const commitment = await prisma.commitment.findFirstOrThrow({ where: { threadId: result.thread!.threadId } });
    await settleCommitment(ceo, commitment.id);

    expect((await prisma.commitment.findUniqueOrThrow({ where: { id: commitment.id } })).settledAt).not.toBeNull();
    const entry = await prisma.auditLog.findFirst({ where: { action: 'whatsapp.commitment_settled' } });
    expect(entry?.actorId).toBe(ceo.id);
  });
});

describe('a chat mailed in from the phone', () => {
  // On the phone this is Export Chat → Mail. It is the nearest thing to a live
  // connection a personal WhatsApp account allows, so the mailbox has to take
  // it without anybody touching a server.
  class Postbox implements MailTransport {
    constructor(private messages: IncomingMessage[]) {}
    async fetchSince(since: Date, limit: number) {
      return this.messages.filter((m) => m.receivedAt >= since).slice(0, limit);
    }
    async send(_message: OutgoingMessage): Promise<{ messageId: string }> {
      throw new Error('this test never sends');
    }
    async verify() {
      return { ok: true };
    }
  }

  const mailed = (attachments: IncomingMessage['attachments']): IncomingMessage => ({
    externalId: `<export-${Math.random()}@grproperty.co.za>`,
    subject: 'WhatsApp Chat with Thandiwe Ndlovu',
    body: 'Sent from my iPhone',
    fromName: 'Mandy',
    fromAddress: 'mandy@grproperty.co.za',
    toAddresses: ['mandy@grproperty.co.za'],
    receivedAt: new Date(Date.now() - 3_600_000),
    inReplyTo: null,
    attachments,
  });

  it('imports the conversation attached to it', async () => {
    const result = await ingestMail({
      transport: new Postbox([
        mailed([
          {
            filename: 'WhatsApp Chat with Thandiwe Ndlovu.txt',
            contentType: 'text/plain',
            content: bytes(CHAT),
          },
        ]),
      ]),
      since: new Date(Date.now() - 86_400_000),
    });

    expect(result.whatsappImported).toHaveLength(1);
    expect(result.whatsappImported[0]!.title).toContain('Thandiwe Ndlovu');
    expect(await prisma.messageThread.count()).toBe(1);
  });

  it('takes a zipped export too', async () => {
    const result = await ingestMail({
      transport: new Postbox([
        mailed([
          {
            filename: 'WhatsApp Chat - Thandiwe Ndlovu.zip',
            contentType: 'application/zip',
            content: zipOf({ '_chat.txt': CHAT }),
          },
        ]),
      ]),
      since: new Date(Date.now() - 86_400_000),
    });

    expect(result.whatsappImported).toHaveLength(1);
  });

  it('leaves ordinary attachments alone', async () => {
    const result = await ingestMail({
      transport: new Postbox([
        mailed([{ filename: 'mandate.pdf', contentType: 'application/pdf', content: bytes('%PDF-1.7') }]),
      ]),
      since: new Date(Date.now() - 86_400_000),
    });

    expect(result.whatsappImported).toHaveLength(0);
    expect(result.whatsappRejected).toHaveLength(0);
    expect(await prisma.messageThread.count()).toBe(0);
  });

  // The mail run still has to finish: an unreadable attachment is reported,
  // never thrown.
  it('reports an attachment it cannot read and carries on', async () => {
    const result = await ingestMail({
      transport: new Postbox([
        mailed([{ filename: 'notes.txt', contentType: 'text/plain', content: bytes('call the bank') }]),
      ]),
      since: new Date(Date.now() - 86_400_000),
    });

    expect(result.whatsappRejected).toHaveLength(1);
    expect(result.stored).toBe(1);
  });
});
