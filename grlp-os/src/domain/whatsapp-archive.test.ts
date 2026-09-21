import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';

import {
  UnreadableExportError,
  bestExportName,
  looksLikeConversation,
  looksLikeZip,
  readChatExport,
} from './whatsapp-archive';

const ANDROID = `21/07/2026, 09:14 - Thandiwe Nkosi: Morning Mandy, any news on the offer?
21/07/2026, 09:31 - Mandy Pelser: I'll call the buyer's agent this morning.`;

const IOS = `[21/07/2026, 09:14:02] Thandiwe Nkosi: Morning Mandy, any news on the offer?
[21/07/2026, 09:31:44] Mandy Pelser: I'll call the buyer's agent this morning.`;

const bytes = (text: string) => new TextEncoder().encode(text);

function zipOf(files: Record<string, string>): Uint8Array {
  const zip = new PizZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generate({ type: 'uint8array' });
}

describe('recognising an export', () => {
  it('reads the format Android produces', () => {
    expect(looksLikeConversation(ANDROID)).toBe(true);
  });

  it('reads the format an iPhone produces', () => {
    expect(looksLikeConversation(IOS)).toBe(true);
  });

  it('reads a 12-hour clock with a narrow space before am/pm', () => {
    expect(looksLikeConversation('[21/07/2026, 9:14:02 AM] Thandiwe: Morning')).toBe(true);
  });

  // Importing something that is not a chat would report success over nothing.
  it('does not mistake an ordinary document for a conversation', () => {
    expect(looksLikeConversation('Dear Mandy,\n\nPlease find attached the FICA pack.\n\nRegards')).toBe(false);
  });

  it('spots a zip by its first four bytes', () => {
    expect(looksLikeZip(zipOf({ 'a.txt': 'x' }))).toBe(true);
    expect(looksLikeZip(bytes(ANDROID))).toBe(false);
  });
});

describe('reading a plain .txt export', () => {
  it('returns the conversation and keeps the filename', () => {
    const file = readChatExport('WhatsApp Chat with Thandiwe Nkosi.txt', bytes(ANDROID));
    expect(file.content).toContain('any news on the offer');
    expect(file.sourceName).toBe('WhatsApp Chat with Thandiwe Nkosi.txt');
    expect(file.mediaNames).toEqual([]);
  });

  it('refuses a file that is not a chat, and says what to do instead', () => {
    expect(() => readChatExport('invoice.txt', bytes('Invoice 4821\nTotal R12 000'))).toThrow(/Export Chat/);
  });

  it('refuses an empty file', () => {
    expect(() => readChatExport('empty.txt', new Uint8Array())).toThrow(UnreadableExportError);
  });
});

describe('reading a .zip export', () => {
  it('finds _chat.txt and lists the media beside it', () => {
    const file = readChatExport(
      'WhatsApp Chat - Thandiwe Nkosi.zip',
      zipOf({ '_chat.txt': IOS, 'IMG-20260721-WA0007.jpg': 'binary', '00000042-PHOTO.jpg': 'binary' }),
    );
    expect(file.sourceName).toBe('_chat.txt');
    expect(file.content).toContain("I'll call the buyer's agent");
    expect(file.mediaNames).toEqual(['00000042-PHOTO.jpg', 'IMG-20260721-WA0007.jpg']);
  });

  it('takes the only .txt when it is not named _chat.txt', () => {
    const file = readChatExport('export.zip', zipOf({ 'WhatsApp Chat with Lisa.txt': ANDROID }));
    expect(file.sourceName).toBe('WhatsApp Chat with Lisa.txt');
  });

  // A macOS-zipped folder carries a shadow copy of every file.
  it('ignores the __MACOSX shadow entries', () => {
    const file = readChatExport(
      'export.zip',
      zipOf({ '__MACOSX/._chat.txt': 'junk', '_chat.txt': ANDROID, '__MACOSX/._IMG.jpg': 'junk' }),
    );
    expect(file.sourceName).toBe('_chat.txt');
    expect(file.mediaNames).toEqual([]);
  });

  it('passes over a .txt that is not a conversation and takes the one that is', () => {
    const file = readChatExport('export.zip', zipOf({ 'readme.txt': 'Exported from WhatsApp', 'chat.txt': ANDROID }));
    expect(file.sourceName).toBe('chat.txt');
  });

  it('refuses an archive with no chat file in it', () => {
    expect(() => readChatExport('photos.zip', zipOf({ 'IMG-1.jpg': 'binary' }))).toThrow(/no chat file/i);
  });

  it('refuses an archive whose text files are not conversations', () => {
    expect(() => readChatExport('docs.zip', zipOf({ 'notes.txt': 'Remember to call the bank' }))).toThrow(
      /No conversation could be read/,
    );
  });
});

describe('naming the conversation', () => {
  // The inner file is always _chat.txt; only the outer name says who it is with.
  it('prefers the uploaded name when the archive names it _chat.txt', () => {
    expect(bestExportName('WhatsApp Chat - Thandiwe Nkosi.zip', '_chat.txt')).toBe(
      'WhatsApp Chat - Thandiwe Nkosi.zip',
    );
  });

  it('prefers the inner name when that is the one carrying the person', () => {
    expect(bestExportName('export.zip', 'WhatsApp Chat with Thandiwe Nkosi.txt')).toBe(
      'WhatsApp Chat with Thandiwe Nkosi.txt',
    );
  });

  it('strips the folder from an inner path', () => {
    expect(bestExportName('export.zip', 'chats/WhatsApp Chat with Lisa.txt')).toBe('WhatsApp Chat with Lisa.txt');
  });
});
