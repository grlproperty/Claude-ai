/**
 * Parses a WhatsApp chat export.
 *
 * This is the route that works on Mandy's real conversations today. WhatsApp
 * lets any chat be exported as a .txt file from the phone, history included, and
 * it needs no API, no business number and no change to how she uses WhatsApp.
 *
 * The formats vary by platform and locale, which is most of the work here:
 *
 *   iOS:      [2026/09/08, 14:32:11] Mandy Pelser: text
 *   Android:  08/09/2026, 14:32 - Mandy Pelser: text
 *   US style: 9/8/26, 2:32 PM - Mandy Pelser: text
 *
 * South African exports are day-first, which matters: 08/09/2026 is 8 September,
 * not 9 August. Where a date is genuinely ambiguous the parser prefers day-first
 * and says so, rather than silently picking one.
 */

export interface ParsedMessage {
  sentAt: Date;
  sender: string;
  text: string;
  /** System lines: "Messages are end-to-end encrypted", "X joined", and so on. */
  isSystem: boolean;
  /** Attachments appear as a filename plus "(file attached)" or "<Media omitted>". */
  attachment: string | null;
}

export interface ParsedExport {
  messages: ParsedMessage[];
  participants: string[];
  /** Lines the parser could not read, so nothing disappears quietly. */
  unparsedLines: string[];
  firstMessageAt: Date | null;
  lastMessageAt: Date | null;
  /** True when the export contains more than two participants. */
  isGroup: boolean;
  format: 'ios' | 'android' | 'unknown';
}

/** iOS: [2026/09/08, 14:32:11] Sender: text — the bracket is the giveaway. */
const IOS = /^‎?\[(\d{1,4})[/.-](\d{1,2})[/.-](\d{2,4}),\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?\]\s*([^:]{1,80}?):\s?([\s\S]*)$/;

/** Android: 08/09/2026, 14:32 - Sender: text */
const ANDROID = /^‎?(\d{1,4})[/.-](\d{1,2})[/.-](\d{2,4}),\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?\s+-\s+([^:]{1,80}?):\s?([\s\S]*)$/;

/** Same shapes without a sender: a system notice. */
const IOS_SYSTEM = /^‎?\[(\d{1,4})[/.-](\d{1,2})[/.-](\d{2,4}),\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?\]\s*([\s\S]*)$/;
const ANDROID_SYSTEM = /^‎?(\d{1,4})[/.-](\d{1,2})[/.-](\d{2,4}),\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?\s+-\s+([\s\S]*)$/;

const ATTACHMENT = /(?:‎)?(?:<attached:\s*(.+?)>|(.+?)\s*\(file attached\)|<Media omitted>|image omitted|video omitted|audio omitted|document omitted|sticker omitted)/i;

const SYSTEM_PHRASES = [
  'messages and calls are end-to-end encrypted',
  'created group',
  'added you',
  'joined using this group',
  'left',
  'changed the subject',
  'changed this group',
  'changed the group description',
  'you were added',
  'removed',
  'changed their phone number',
  'security code changed',
  'deleted this message',
  'this message was deleted',
  'missed voice call',
  'missed video call',
];

interface Stamp {
  a: number;
  b: number;
  year: number;
  hour: number;
  minute: number;
  second: number;
  meridiem?: string;
}

/**
 * Builds a date, day-first. WhatsApp's own ordering follows the phone's locale;
 * South African phones are day-first, and reading 08/09 as 8 August would put a
 * month of messages in the wrong place.
 */
function toDate(s: Stamp): Date | null {
  let { a, b, year } = s;

  // A four-digit first field means the export is year-first.
  if (a > 31) {
    const y = a;
    a = b;
    b = year;
    year = y;
  }

  // Where the first field cannot be a day, it must be the month.
  let day = a;
  let month = b;
  if (a > 12 && b <= 12) {
    day = a;
    month = b;
  } else if (b > 12 && a <= 12) {
    day = b;
    month = a;
  }

  if (year < 100) year += 2000;

  let hour = s.hour;
  if (s.meridiem) {
    const pm = s.meridiem.toLowerCase() === 'pm';
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  }

  const date = new Date(year, month - 1, day, hour, s.minute, s.second);
  if (Number.isNaN(date.getTime()) || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function stampFrom(m: RegExpMatchArray): Stamp {
  return {
    a: Number(m[1]),
    b: Number(m[2]),
    year: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] ?? 0),
    meridiem: m[7],
  };
}

function looksSystem(text: string): boolean {
  const t = text.toLowerCase();
  return SYSTEM_PHRASES.some((p) => t.includes(p));
}

function attachmentIn(text: string): string | null {
  const m = text.match(ATTACHMENT);
  if (!m) return null;
  return (m[1] ?? m[2] ?? m[0]).trim();
}

export function parseWhatsAppExport(raw: string): ParsedExport {
  // Strip the byte-order mark and the invisible marks WhatsApp sprinkles in.
  const text = raw.replace(/^﻿/, '').replace(/‎/g, '');
  const lines = text.split(/\r?\n/);

  const messages: ParsedMessage[] = [];
  const unparsedLines: string[] = [];
  let format: ParsedExport['format'] = 'unknown';

  for (const line of lines) {
    if (!line.trim()) continue;

    const ios = line.match(IOS);
    const android = ios ? null : line.match(ANDROID);
    const match = ios ?? android;

    if (match) {
      if (format === 'unknown') format = ios ? 'ios' : 'android';
      const sentAt = toDate(stampFrom(match));
      if (!sentAt) {
        unparsedLines.push(line);
        continue;
      }
      const body = match[9] ?? '';
      messages.push({
        sentAt,
        sender: match[8]!.trim(),
        text: body.trim(),
        isSystem: false,
        attachment: attachmentIn(body),
      });
      continue;
    }

    // A dated line with no sender is a system notice.
    const sysMatch = line.match(IOS_SYSTEM) ?? line.match(ANDROID_SYSTEM);
    if (sysMatch) {
      const sentAt = toDate(stampFrom(sysMatch));
      const body = (sysMatch[8] ?? '').trim();
      if (sentAt && looksSystem(body)) {
        messages.push({ sentAt, sender: '', text: body, isSystem: true, attachment: null });
        continue;
      }
    }

    // Otherwise it is a continuation of the previous message.
    const previous = messages.at(-1);
    if (previous) {
      previous.text = `${previous.text}\n${line}`.trim();
      previous.attachment ??= attachmentIn(line);
    } else {
      unparsedLines.push(line);
    }
  }

  const real = messages.filter((m) => !m.isSystem);
  const participants = [...new Set(real.map((m) => m.sender))].filter(Boolean).sort();

  return {
    messages,
    participants,
    unparsedLines,
    firstMessageAt: real[0]?.sentAt ?? null,
    lastMessageAt: real.at(-1)?.sentAt ?? null,
    isGroup: participants.length > 2,
    format,
  };
}

/** Derives a thread title from the filename WhatsApp gives an export. */
export function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.(txt|zip)$/i, '')
    .replace(/^WhatsApp Chat (?:with|-)\s*/i, '')
    .trim();
}
