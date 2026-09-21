import { prisma } from './db';
import { readChatExport, bestExportName, UnreadableExportError } from '../domain/whatsapp-archive';
import { importWhatsAppExport, type ImportedThread } from './whatsapp-import';

/**
 * One way in for every WhatsApp conversation, however it arrives.
 *
 * Getting a chat into the system used to mean running a command on the server.
 * Mandy is not going to do that, and an assistant she cannot feed is not an
 * assistant. So the same path now serves a file dropped on the Messages page, a
 * chat mailed in from her phone, and the command line — because the two-tap
 * route on the phone is Export Chat → Mail, and that should be enough.
 *
 * Still no sending. This is the intake; there is no counterpart.
 */

export type IntakeChannel = 'upload' | 'email' | 'file';

export interface IntakeRequest {
  filename: string;
  bytes: Uint8Array;
  /** Whose WhatsApp this is. */
  ownerId?: string | null;
  /** Who or what fed it in, for the audit entry. */
  channel: IntakeChannel;
  actorId?: string | null;
  dryRun?: boolean;
  now?: Date;
}

export interface IntakeResult {
  filename: string;
  ok: boolean;
  /** Present when it worked. */
  thread?: ImportedThread;
  /** Present when it did not, in words worth showing someone. */
  problem?: string;
  mediaCount?: number;
}

export async function intakeExport(request: IntakeRequest): Promise<IntakeResult> {
  const { filename, bytes, channel } = request;

  let file;
  try {
    file = readChatExport(filename, bytes);
  } catch (error) {
    if (error instanceof UnreadableExportError) return { filename, ok: false, problem: error.message };
    throw error;
  }

  const thread = await importWhatsAppExport({
    content: file.content,
    filename: bestExportName(filename, file.sourceName),
    ownerId: request.ownerId ?? null,
    dryRun: request.dryRun,
    now: request.now,
  });

  if (!request.dryRun) {
    await prisma.auditLog.create({
      data: {
        actorType: request.actorId ? 'USER' : 'AI',
        actorId: request.actorId ?? null,
        action: `whatsapp.imported.${channel}`,
        entity: 'MessageThread',
        entityId: thread.threadId,
        after: {
          filename,
          messages: thread.messages,
          newMessages: thread.newMessages,
          media: file.mediaNames.length,
        },
        rationale: `WhatsApp conversation "${thread.title}" brought in from ${describe(channel)}.`,
      },
    });
  }

  return { filename, ok: true, thread, mediaCount: file.mediaNames.length };
}

/**
 * Several at once — an export usually arrives as a handful of chats, and a
 * failure in one must not stop the rest. Each is reported on its own.
 */
export async function intakeMany(
  files: Array<{ filename: string; bytes: Uint8Array }>,
  common: Omit<IntakeRequest, 'filename' | 'bytes'>,
): Promise<IntakeResult[]> {
  const results: IntakeResult[] = [];
  for (const file of files) {
    try {
      results.push(await intakeExport({ ...common, ...file }));
    } catch (error) {
      results.push({ filename: file.filename, ok: false, problem: (error as Error).message });
    }
  }
  return results;
}

function describe(channel: IntakeChannel): string {
  switch (channel) {
    case 'upload':
      return 'a file uploaded on the Messages page';
    case 'email':
      return 'an export mailed in from a phone';
    case 'file':
      return 'the command line';
  }
}

/** Attachments worth trying. Anything else in the message is left alone. */
export function isChatExportAttachment(filename: string, contentType?: string): boolean {
  const name = filename.toLowerCase();
  if (name.endsWith('.zip')) return true;
  if (!name.endsWith('.txt')) return false;
  if (contentType && !/^text\//i.test(contentType) && contentType !== 'application/octet-stream') return false;
  return true;
}
