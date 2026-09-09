import { readFile } from 'node:fs/promises';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { parseWhatsAppExport, titleFromFilename } from '../src/domain/whatsapp-export';
import { analyseThread } from '../src/domain/thread-analysis';
import { importWhatsAppExport, isOneOfUs } from '../src/server/whatsapp-import';
import { CAPABILITIES, parseWebhook, verifySignature, verifyWebhookSubscription, whatsappConfig } from '../src/integrations/whatsapp';
import { createHmac } from 'node:crypto';

const prisma = new PrismaClient();
const OUR = ['Mandy Pelser', 'Kandy'];
const NOW = new Date('2026-09-09T09:00:00Z');

/** An Android export, day-first, as a South African phone produces. */
const ANDROID_EXPORT = `08/09/2026, 08:14 - Messages and calls are end-to-end encrypted.
08/09/2026, 08:15 - Thandiwe Ndlovu: Morning Mandy, any news on the Sedgefield house?
08/09/2026, 08:16 - Thandiwe Ndlovu: We are still very keen on Erf 2481
08/09/2026, 09:02 - Mandy Pelser: Morning Thandiwe. I'll send you the updated market assessment by 12/09/2026.
08/09/2026, 09:03 - Mandy Pelser: The asking is R4 250 000
09/09/2026, 07:40 - Thandiwe Ndlovu: Thanks. Can you confirm whether the electrical COC is done?
09/09/2026, 07:41 - Thandiwe Ndlovu: Also we need to know about 14 Protea Street`;

/** An iOS export, with seconds and brackets. */
const IOS_EXPORT = `[2026/09/08, 14:32:11] Kandy: Hi Pieter, the OTP is ready
[2026/09/08, 14:35:02] Pieter Bothma: Great, please send it through
[2026/09/08, 14:36:40] Kandy: I will email it this afternoon`;

beforeEach(async () => {
  await prisma.task.deleteMany({ where: { source: { startsWith: 'whatsapp:' } } });
  await prisma.commitment.deleteMany({});
  await prisma.communication.deleteMany({ where: { channel: 'WHATSAPP' } });
  await prisma.messageThread.deleteMany({});
});

afterAll(async () => {
  await prisma.task.deleteMany({ where: { source: { startsWith: 'whatsapp:' } } });
  await prisma.commitment.deleteMany({});
  await prisma.communication.deleteMany({ where: { channel: 'WHATSAPP' } });
  await prisma.messageThread.deleteMany({});
  await prisma.$disconnect();
});

describe('it can never reply — that is structural, not a policy', () => {
  it('has no send, reply, react or mark-read function anywhere in the WhatsApp module', async () => {
    const source = await readFile('src/integrations/whatsapp.ts', 'utf8');
    const code = source
      .split('\n')
      .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//') && !l.trim().startsWith('/*'))
      .join('\n');

    for (const forbidden of [/export\s+(?:async\s+)?function\s+send/i, /export\s+(?:async\s+)?function\s+reply/i, /export\s+(?:async\s+)?function\s+react/i, /export\s+(?:async\s+)?function\s+markRead/i]) {
      expect(forbidden.test(code), `a ${forbidden} function was added to the WhatsApp module`).toBe(false);
    }
    // Nothing may POST to WhatsApp either.
    expect(/graph\.facebook\.com/.test(code)).toBe(false);
  });

  it('says plainly what it can and cannot do', () => {
    expect(CAPABILITIES.read).toBe(true);
    expect(CAPABILITIES.send).toBe(false);
    expect(CAPABILITIES.reply).toBe(false);
  });

  it('the import service does not send either', async () => {
    const source = await readFile('src/server/whatsapp-import.ts', 'utf8');
    expect(/\.send\(/.test(source)).toBe(false);
  });
});

describe('reading a chat export', () => {
  it('reads a South African Android export day-first', () => {
    const parsed = parseWhatsAppExport(ANDROID_EXPORT);
    expect(parsed.format).toBe('android');
    // 08/09/2026 is 8 September, not 9 August.
    expect(parsed.firstMessageAt?.getDate()).toBe(8);
    expect(parsed.firstMessageAt?.getMonth()).toBe(8);
    expect(parsed.participants).toEqual(['Mandy Pelser', 'Thandiwe Ndlovu']);
    expect(parsed.isGroup).toBe(false);
  });

  it('reads an iOS export with brackets and seconds', () => {
    const parsed = parseWhatsAppExport(IOS_EXPORT);
    expect(parsed.format).toBe('ios');
    expect(parsed.messages).toHaveLength(3);
    expect(parsed.messages[0]!.sender).toBe('Kandy');
  });

  it('keeps system notices out of the conversation', () => {
    const parsed = parseWhatsAppExport(ANDROID_EXPORT);
    expect(parsed.messages.filter((m) => m.isSystem)).toHaveLength(1);
    expect(parsed.participants).not.toContain('');
  });

  it('joins a message that runs over several lines', () => {
    const parsed = parseWhatsAppExport(`08/09/2026, 08:15 - Kandy: First line\nsecond line\nthird line`);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]!.text).toBe('First line\nsecond line\nthird line');
  });

  it('notices an attachment', () => {
    const parsed = parseWhatsAppExport(`08/09/2026, 08:15 - Kandy: OTP-signed.pdf (file attached)`);
    expect(parsed.messages[0]!.attachment).toContain('OTP-signed.pdf');
  });

  it('reports lines it could not read rather than dropping them', () => {
    const parsed = parseWhatsAppExport('this line has no date at all and no previous message');
    expect(parsed.unparsedLines).toHaveLength(1);
  });

  it('takes the thread title from the export filename', () => {
    expect(titleFromFilename('WhatsApp Chat with Thandiwe Ndlovu.txt')).toBe('Thandiwe Ndlovu');
    expect(titleFromFilename('WhatsApp Chat - Sedgefield Sale.txt')).toBe('Sedgefield Sale');
  });
});

describe('understanding the conversation', () => {
  const analysis = () => analyseThread(parseWhatsAppExport(ANDROID_EXPORT).messages, { ourNames: OUR, now: NOW });

  it('knows the other side is waiting, and for how long', () => {
    const a = analysis();
    expect(a.waitingOnUs).toBe(true);
    expect(a.waitingHours).toBeGreaterThan(0);
    expect(a.openQuestions.length).toBeGreaterThan(0);
    expect(a.openQuestions[0]!.askedBy).toBe('Thandiwe Ndlovu');
  });

  it('finds what we undertook to do, and quotes it', () => {
    const ours = analysis().commitments.filter((c) => c.side === 'us');
    expect(ours.length).toBeGreaterThan(0);
    expect(ours[0]!.what).toMatch(/market assessment/i);
    expect(ours[0]!.quote).toContain('send you the updated market assessment');
    expect(ours[0]!.dueAt?.toISOString().slice(0, 10)).toBe('2026-09-12');
  });

  it('does not mistake their undertaking for ours', () => {
    const a = analyseThread(parseWhatsAppExport(IOS_EXPORT).messages, { ourNames: OUR, now: NOW });
    const theirs = a.commitments.filter((c) => c.side === 'them');
    const ours = a.commitments.filter((c) => c.side === 'us');
    expect(ours.some((c) => /email it this afternoon/i.test(c.what))).toBe(true);
    expect(theirs.every((c) => c.speaker !== 'Kandy')).toBe(true);
  });

  it('pulls out the things worth searching for later', () => {
    const a = analysis();
    expect(a.mentions.erven).toContain('Erf 2481');
    expect(a.mentions.amounts.some((x) => x.includes('4 250 000'))).toBe(true);
    expect(a.mentions.properties.some((p) => p.includes('Protea Street'))).toBe(true);
  });

  it('categorises the conversation with the same rules as the inbox', () => {
    const rental = analyseThread(
      parseWhatsAppExport('08/09/2026, 08:15 - Tenant: The geyser has burst, water everywhere').messages,
      { ourNames: OUR, now: NOW },
    );
    expect(rental.category).toBe('RENTAL');
    expect(rental.importance).toBe('URGENT');
  });

  it('writes an outline without needing a language model', () => {
    const a = analysis();
    expect(a.outline).toMatch(/messages between/);
    expect(a.outline).toMatch(/unanswered/);
  });

  it('says nothing rather than inventing findings for an empty chat', () => {
    const a = analyseThread([], { ourNames: OUR, now: NOW });
    expect(a.commitments).toHaveLength(0);
    expect(a.waitingOnUs).toBe(false);
    expect(a.outline).toBe('No messages.');
  });
});

describe('telling our people from theirs', () => {
  it('matches the name WhatsApp shows against the staff record', () => {
    // WhatsApp shows whatever is in the phone's contacts.
    expect(isOneOfUs('Mandy Pelser', ['Mandy'])).toBe(true);
    expect(isOneOfUs('Mandy', ['Mandy'])).toBe(true);
    expect(isOneOfUs('Mandy GRLP', ['Mandy'])).toBe(true);
    expect(isOneOfUs('Kandy Grieve', ['Kandy'])).toBe(true);
  });

  it('does not mistake a client for a colleague', () => {
    expect(isOneOfUs('Thandiwe Ndlovu', ['Mandy', 'Kandy'])).toBe(false);
    expect(isOneOfUs('Amanda Smith', ['Mandy'])).toBe(false);
    expect(isOneOfUs('', ['Mandy'])).toBe(false);
  });
});

describe('importing a conversation into the system', () => {
  it('stores the thread, the messages and what is outstanding', async () => {
    const r = await importWhatsAppExport({
      content: ANDROID_EXPORT,
      filename: 'WhatsApp Chat with Thandiwe Ndlovu.txt',
      ourNames: OUR,
      now: NOW,
    });

    expect(r.messages).toBe(6);
    expect(r.newMessages).toBe(6);
    expect(r.waitingOnUs).toBe(true);
    expect(r.commitments).toBeGreaterThan(0);
    expect(r.title).toBe('Thandiwe Ndlovu');

    const thread = await prisma.messageThread.findFirstOrThrow({ where: { title: 'Thandiwe Ndlovu' } });
    expect(thread.summary).toBeTruthy();
    // A model's reading is never presented as the conversation itself.
    expect(thread.summaryProvenance).toBe('INFERENCE');
  });

  it('raises a task to reply, owned by a person, saying the system will not send', async () => {
    const r = await importWhatsAppExport({
      content: ANDROID_EXPORT,
      filename: 'WhatsApp Chat with Thandiwe Ndlovu.txt',
      ourNames: OUR,
      now: NOW,
    });
    expect(r.tasksCreated).toBeGreaterThan(0);

    const task = await prisma.task.findFirstOrThrow({ where: { title: { startsWith: 'Reply on WhatsApp' } } });
    expect(task.ownerType).toBe('USER');
    expect(task.nextAction).toMatch(/does not send on WhatsApp/);
    expect(task.detail).toContain('electrical COC');
  });

  it('raises a task for what we undertook, with the date we gave', async () => {
    await importWhatsAppExport({ content: ANDROID_EXPORT, filename: 'x.txt', ourNames: OUR, now: NOW });
    const task = await prisma.task.findFirstOrThrow({ where: { title: { startsWith: 'Undertaken on WhatsApp' } } });
    expect(task.dueAt?.toISOString().slice(0, 10)).toBe('2026-09-12');
    expect(task.detail).toContain('market assessment');
  });

  it('leaves a promise with the person who made it', async () => {
    // The staff list comes from the database, where the CEO is "Mandy" and the
    // chat shows "Mandy Pelser".
    await importWhatsAppExport({ content: ANDROID_EXPORT, filename: 'x.txt', now: NOW });
    const task = await prisma.task.findFirstOrThrow({
      where: { title: { startsWith: 'Undertaken on WhatsApp' } },
      include: { owner: true },
    });
    expect(task.owner?.name).toBe('Mandy');
    expect(task.routingRationale).toMatch(/stays with them/);
  });

  it('re-importing the same export duplicates nothing', async () => {
    const first = await importWhatsAppExport({ content: ANDROID_EXPORT, filename: 'x.txt', ourNames: OUR, now: NOW });
    const second = await importWhatsAppExport({ content: ANDROID_EXPORT, filename: 'x.txt', ourNames: OUR, now: NOW });

    expect(first.newMessages).toBe(6);
    expect(second.newMessages).toBe(0);
    expect(await prisma.messageThread.count()).toBe(1);
    expect(await prisma.commitment.count()).toBe(first.commitments);
    expect(second.tasksCreated).toBe(0);
  });

  it('changes nothing on a dry run', async () => {
    const r = await importWhatsAppExport({ content: ANDROID_EXPORT, filename: 'x.txt', ourNames: OUR, dryRun: true, now: NOW });
    expect(r.threadId).toBe('(dry run)');
    expect(await prisma.messageThread.count()).toBe(0);
  });
});

describe('the live webhook, when a business number is connected', () => {
  const config = { appSecret: 'secret', verifyToken: 'verify-me', phoneNumberId: '123' };

  it('is not configured on a bare environment', () => {
    expect(whatsappConfig({})).toBeNull();
  });

  it('accepts Meta’s verification only with the right token', () => {
    expect(verifyWebhookSubscription({ mode: 'subscribe', token: 'verify-me', challenge: 'abc' }, config)).toBe('abc');
    expect(verifyWebhookSubscription({ mode: 'subscribe', token: 'wrong', challenge: 'abc' }, config)).toBeNull();
    expect(verifyWebhookSubscription({ mode: 'unsubscribe', token: 'verify-me', challenge: 'abc' }, config)).toBeNull();
  });

  it('discards a delivery that is not correctly signed', () => {
    const body = JSON.stringify({ entry: [] });
    const good = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
    expect(verifySignature(body, good, config)).toBe(true);
    expect(verifySignature(body, 'sha256=deadbeef', config)).toBe(false);
    expect(verifySignature(body, undefined, config)).toBe(false);
    expect(verifySignature('tampered', good, config)).toBe(false);
  });

  it('reads messages out of a delivery', () => {
    const messages = parseWebhook({
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: '123' },
            contacts: [{ wa_id: '27825551234', profile: { name: 'T Ndlovu' } }],
            messages: [{ id: 'wamid.1', from: '27825551234', timestamp: '1788000000', type: 'text', text: { body: 'Any news?' } }],
          },
        }],
      }],
    }, config);

    expect(messages).toHaveLength(1);
    expect(messages[0]!.fromName).toBe('T Ndlovu');
    expect(messages[0]!.text).toBe('Any news?');
    expect(messages[0]!.threadKey).toBe('whatsapp:27825551234');
  });

  it('skips anything it cannot read rather than guessing', () => {
    expect(parseWebhook({ entry: [{ changes: [{ value: { messages: [{ id: 'x' }] } }] }] })).toHaveLength(0);
    expect(parseWebhook({})).toHaveLength(0);
    expect(parseWebhook(null)).toHaveLength(0);
  });

  it('records a media message without pretending to have its contents', () => {
    const messages = parseWebhook({
      entry: [{ changes: [{ value: { messages: [{ id: 'w2', from: '27825551234', timestamp: '1788000000', type: 'image' }] } }] }],
    });
    expect(messages[0]!.mediaType).toBe('image');
    expect(messages[0]!.text).toBe('');
  });
});
