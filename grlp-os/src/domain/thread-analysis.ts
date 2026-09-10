import { extractDeadlines, triage, type CommunicationCategory } from './triage';
import type { ParsedMessage } from './whatsapp-export';
import type { Priority } from './types';

/**
 * Reads a WhatsApp conversation the way a good assistant would: what is this
 * chat about, who is waiting on whom, what did anyone undertake to do, and what
 * is buried in it that should be a task.
 *
 * All of it is rules, so it is testable and it runs without a language model.
 * The model, where connected, writes the prose summary — it does not decide any
 * of the findings below.
 *
 * Nothing here can send a message. That is the point.
 */

export interface Commitment {
  /** The sentence it was found in, so a person can check the reading. */
  quote: string;
  /** "us" when someone on the GRLP side undertook it. */
  side: 'us' | 'them';
  what: string;
  saidAt: Date;
  dueAt: Date | null;
  speaker: string;
}

export interface OpenQuestion {
  quote: string;
  askedBy: string;
  askedAt: Date;
  /** Hours it has gone unanswered at the time of analysis. */
  waitingHours: number;
}

export interface ThreadAnalysis {
  category: CommunicationCategory;
  importance: Priority;
  /** True when the other side spoke last and appears to want something. */
  waitingOnUs: boolean;
  waitingHours: number;
  commitments: Commitment[];
  openQuestions: OpenQuestion[];
  deadlines: Date[];
  /** Named things worth being able to search for: properties, erven, amounts. */
  mentions: { properties: string[]; amounts: string[]; erven: string[] };
  messageCount: number;
  participants: string[];
  /** A factual outline, built without a model. */
  outline: string;
}

/** First person, future intent: the shape of a promise. */
const COMMITMENT_PATTERNS: RegExp[] = [
  /\bi(?:'| a)?ll\s+(?:go\s+)?([a-z][^.!?\n]{4,90})/i,
  /\bi\s+will\s+([a-z][^.!?\n]{4,90})/i,
  /\bi\s+(?:am|'m)\s+going\s+to\s+([a-z][^.!?\n]{4,90})/i,
  /\bwe(?:'| wi)?ll\s+([a-z][^.!?\n]{4,90})/i,
  /\bwe\s+will\s+([a-z][^.!?\n]{4,90})/i,
  /\blet\s+me\s+([a-z][^.!?\n]{4,90})/i,
  /\bi\s+(?:can|shall)\s+(?:send|get|do|check|call|arrange|sort|confirm)\s*([^.!?\n]{0,80})/i,
];

/** Phrases that turn a statement into a request aimed at the reader. */
const REQUEST_PATTERNS = [
  /\bcan you\b/i, /\bcould you\b/i, /\bwould you\b/i, /\bplease (?:send|confirm|advise|let me know|check|call)/i,
  /\bany (?:news|update|feedback)\b/i, /\bwhen (?:can|will|do)\b/i, /\bwhat(?:'s| is) the\b/i,
  /\bhave you\b/i, /\bdid you\b/i, /\bare you able\b/i, /\bwaiting (?:on|for)\b/i,
];

const URGENT = /\b(urgent|asap|today|immediately|deadline|expires?|lapse|final notice)\b/i;

/** Erf 2481, Erf 9071/3 — a South African property is identified by its erf. */
const ERF = /\berf\s*(?:no\.?\s*)?(\d{1,6}(?:\/\d{1,4})?)/gi;
/** R4 250 000, R4,25m, R850k */
const AMOUNT = /R\s?\d[\d\s.,]{2,}(?:\s?[mk]\b)?/gi;
/** A street address is the other way a property is named in conversation. */
const STREET = /\b\d{1,5}[a-z]?\s+[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,2}\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Close|Crescent|Way|Laan|Straat|Weg)\b/g;

export interface AnalyseOptions {
  /** Names on the GRLP side, so "us" and "them" can be told apart. */
  ourNames: string[];
  now?: Date;
}

export function analyseThread(messages: ParsedMessage[], { ourNames, now = new Date() }: AnalyseOptions): ThreadAnalysis {
  const real = messages.filter((m) => !m.isSystem && m.text.trim());
  const ours = new Set(ourNames.map((n) => n.toLowerCase().trim()));
  const isOurs = (sender: string) => ours.has(sender.toLowerCase().trim());

  const participants = [...new Set(real.map((m) => m.sender))].filter(Boolean).sort();
  const body = real.map((m) => m.text).join('\n');

  // Category comes from the same rules the inbox uses, so a geyser is a rental
  // matter whether it arrives by email or by WhatsApp.
  const verdict = triage({ subject: participants.join(', '), body, knownContact: true, receivedAt: now });

  const commitments: Commitment[] = [];
  for (const message of real) {
    for (const pattern of COMMITMENT_PATTERNS) {
      const m = message.text.match(pattern);
      if (!m) continue;
      const what = (m[1] ?? '').trim().replace(/[,;]$/, '');
      if (what.length < 4) continue;
      const dates = extractDeadlines(message.text, message.sentAt);
      commitments.push({
        quote: sentenceAround(message.text, m.index ?? 0),
        side: isOurs(message.sender) ? 'us' : 'them',
        what,
        saidAt: message.sentAt,
        dueAt: dates[0] ?? null,
        speaker: message.sender,
      });
      break;
    }
  }

  // A question from the other side that nobody on our side answered afterwards.
  const openQuestions: OpenQuestion[] = [];
  for (const [i, message] of real.entries()) {
    if (isOurs(message.sender)) continue;
    const asks = message.text.includes('?') || REQUEST_PATTERNS.some((p) => p.test(message.text));
    if (!asks) continue;
    const answered = real.slice(i + 1).some((later) => isOurs(later.sender));
    if (answered) continue;
    openQuestions.push({
      quote: message.text.slice(0, 200),
      askedBy: message.sender,
      askedAt: message.sentAt,
      waitingHours: Math.round((now.getTime() - message.sentAt.getTime()) / 3_600_000),
    });
  }

  const last = real.at(-1);
  const waitingOnUs = Boolean(last && !isOurs(last.sender) && openQuestions.length > 0);
  const waitingHours = waitingOnUs && last ? Math.round((now.getTime() - last.sentAt.getTime()) / 3_600_000) : 0;

  let importance: Priority = 'NORMAL';
  if (URGENT.test(body)) importance = 'HIGH';
  if (waitingOnUs && waitingHours > 48) importance = 'HIGH';
  if (verdict.urgencyScore >= 0.9) importance = 'URGENT';

  return {
    category: verdict.category,
    importance,
    waitingOnUs,
    waitingHours,
    commitments,
    openQuestions,
    deadlines: extractDeadlines(body, now),
    mentions: {
      erven: unique([...body.matchAll(ERF)].map((m) => `Erf ${m[1]}`)),
      amounts: unique([...body.matchAll(AMOUNT)].map((m) => m[0].replace(/\s+/g, ' ').trim())),
      properties: unique(body.match(STREET) ?? []),
    },
    messageCount: real.length,
    participants,
    outline: buildOutline({ participants, real, commitments, openQuestions, waitingOnUs, waitingHours }),
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].slice(0, 12);
}

/** The sentence containing a match, so a quote reads as a sentence. */
function sentenceAround(text: string, index: number): string {
  const before = text.lastIndexOf('.', index);
  const start = Math.max(0, before + 1);
  const after = text.indexOf('.', index);
  const end = after === -1 ? Math.min(text.length, start + 200) : after + 1;
  return text.slice(start, end).trim().slice(0, 200);
}

function buildOutline(args: {
  participants: string[];
  real: ParsedMessage[];
  commitments: Commitment[];
  openQuestions: OpenQuestion[];
  waitingOnUs: boolean;
  waitingHours: number;
}): string {
  const { participants, real, commitments, openQuestions, waitingOnUs, waitingHours } = args;
  if (!real.length) return 'No messages.';

  const span = real[0]!.sentAt.toLocaleDateString('en-ZA');
  const to = real.at(-1)!.sentAt.toLocaleDateString('en-ZA');
  const parts = [`${real.length} messages between ${participants.join(' and ')}, ${span} to ${to}.`];

  const ourCommitments = commitments.filter((c) => c.side === 'us' && !c.dueAt);
  const dated = commitments.filter((c) => c.dueAt);
  if (ourCommitments.length) parts.push(`${ourCommitments.length} undertaking(s) given by us.`);
  if (dated.length) parts.push(`${dated.length} with a date attached.`);
  if (openQuestions.length) parts.push(`${openQuestions.length} question(s) unanswered.`);
  if (waitingOnUs) parts.push(`They spoke last, ${waitingHours} hours ago.`);

  return parts.join(' ');
}
