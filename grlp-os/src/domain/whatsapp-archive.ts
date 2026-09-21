/**
 * Reading what WhatsApp actually hands you.
 *
 * "Export chat" does not produce one predictable thing. Depending on the phone
 * and whether media was included, it is a bare .txt, or a .zip holding a .txt
 * named `_chat.txt` beside the photographs. Mandy should not have to know which
 * she has, so this works it out rather than asking.
 *
 * Reading only. Nothing in this file, or anything it calls, can send.
 */

import PizZip from 'pizzip';

export interface ChatExportFile {
  /** The conversation itself. */
  content: string;
  /** Where it came from inside the archive, or the file's own name. */
  sourceName: string;
  /** Media alongside the conversation. Listed, not stored: names are enough to
   *  show that "IMG-20260714-WA0007.jpg" in the text was a real photograph. */
  mediaNames: string[];
}

export class UnreadableExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnreadableExportError';
  }
}

/** The first four bytes of every zip file. */
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

export function looksLikeZip(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((b, i) => bytes[i] === b);
}

/**
 * A conversation has to have at least one line that reads like a WhatsApp
 * message. Without this a spreadsheet or a signature block would import as an
 * empty chat and look like a successful import of nothing.
 */
const MESSAGE_LINE =
  /^\s*\[?\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4},?\s+\d{1,2}[:.]\d{2}(?:[:.]\d{2})?\s*(?:[  \s]*[ap]\.?m\.?)?\]?\s*[-–]?\s*[^:]{1,80}:/im;

export function looksLikeConversation(text: string): boolean {
  return MESSAGE_LINE.test(text);
}

/**
 * Picks the conversation out of an archive. `_chat.txt` is what WhatsApp names
 * it; where that is absent the only .txt file is taken, and where there are
 * several the one that reads like a conversation wins.
 */
function chooseChatFile(files: Array<{ name: string; text: () => string }>): { name: string; content: string } {
  const texts = files.filter((f) => /\.txt$/i.test(f.name) && !/^__MACOSX\//.test(f.name));
  if (!texts.length) throw new UnreadableExportError('That archive holds no chat file. Export the chat again.');

  const named = texts.find((f) => /(^|\/)_chat\.txt$/i.test(f.name));
  const candidates = named ? [named, ...texts.filter((f) => f !== named)] : texts;

  for (const file of candidates) {
    const content = file.text();
    if (looksLikeConversation(content)) return { name: file.name, content };
  }

  throw new UnreadableExportError(
    'No conversation could be read out of that archive. It may be an export of something other than a chat.',
  );
}

/**
 * Turns an uploaded or emailed file into a conversation. Throws with something
 * worth reading when it cannot: an import that silently produces nothing is the
 * worst outcome, because it looks like it worked.
 */
export function readChatExport(filename: string, bytes: Uint8Array): ChatExportFile {
  if (bytes.length === 0) throw new UnreadableExportError('That file is empty.');

  if (looksLikeZip(bytes)) {
    let zip: PizZip;
    try {
      zip = new PizZip(Buffer.from(bytes));
    } catch {
      throw new UnreadableExportError('That .zip could not be opened. It may have been damaged in transit.');
    }

    const entries = Object.values(zip.files).filter((f) => !f.dir);
    const chosen = chooseChatFile(entries.map((f) => ({ name: f.name, text: () => f.asText() })));

    return {
      content: chosen.content,
      sourceName: chosen.name,
      mediaNames: entries
        .map((f) => f.name)
        .filter((n) => n !== chosen.name && !/\.txt$/i.test(n) && !/^__MACOSX\//.test(n))
        .sort(),
    };
  }

  const content = new TextDecoder('utf-8').decode(bytes);
  if (!looksLikeConversation(content)) {
    throw new UnreadableExportError(
      'That file is not a WhatsApp chat export. In WhatsApp: open the chat, tap the name, Export Chat.',
    );
  }

  return { content, sourceName: filename, mediaNames: [] };
}

/**
 * The name WhatsApp gives an export carries the other party's name, and the
 * archive's inner file does not. Prefers whichever of the two actually says who
 * the conversation is with.
 */
export function bestExportName(uploadedName: string, innerName: string): string {
  const inner = innerName.split('/').pop() ?? innerName;
  if (/^_chat\.txt$/i.test(inner)) return uploadedName;
  if (/whatsapp chat with/i.test(inner)) return inner;
  if (/whatsapp chat with/i.test(uploadedName)) return uploadedName;
  return inner || uploadedName;
}
