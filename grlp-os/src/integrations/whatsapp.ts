import { createHmac, timingSafeEqual } from 'node:crypto';
import { normalisePhone } from '../domain/contact-match';
import type { EnvLike } from './registry';

/**
 * WhatsApp — read only, by construction.
 *
 * This module deliberately contains no function that sends, replies, reacts,
 * marks as read, or otherwise writes to WhatsApp. That is the guarantee GRLP
 * asked for, and a test asserts it holds by reading this file. Adding a send
 * function here will fail that test.
 *
 * Two ways in, and it is worth being clear about what each can and cannot do:
 *
 *   1. Chat export. Mandy exports a conversation from her phone as a .txt file.
 *      Works on her real chats today, includes history, needs no API and changes
 *      nothing about how she uses WhatsApp. Manual, one chat at a time.
 *
 *   2. WhatsApp Business Cloud API. Live, via webhook. It only ever sees the
 *      messages of a dedicated business number registered with Meta — never a
 *      personal account, and never conversations that happened before it was
 *      connected. A number moved onto the Business API can no longer be used in
 *      the ordinary WhatsApp app.
 *
 * There is a third route — unofficial libraries that drive WhatsApp Web. It is
 * against WhatsApp's terms and gets numbers banned, so it is not built here.
 */

export const WHATSAPP_ENV = ['WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'] as const;

export interface WhatsAppConfig {
  appSecret: string;
  verifyToken: string;
  /**
   * Meta's id for the number, from WhatsApp → API Setup. It is a long number of
   * its own and is *not* the telephone number — confusing the two is the usual
   * reason a webhook never delivers anything.
   */
  phoneNumberId?: string;
  /** The number in dialling form, used to tell our own messages from theirs. */
  businessNumber?: string;
  /** The WhatsApp Business Account this number belongs to. Recorded, not called. */
  businessAccountId?: string;
}

export function whatsappConfig(env: EnvLike = process.env): WhatsAppConfig | null {
  const missing = WHATSAPP_ENV.filter((k) => !env[k]?.trim());
  if (missing.length) return null;
  return {
    appSecret: env.WHATSAPP_APP_SECRET!.trim(),
    verifyToken: env.WHATSAPP_VERIFY_TOKEN!.trim(),
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID?.trim() || undefined,
    businessNumber: env.WHATSAPP_BUSINESS_NUMBER?.trim() || undefined,
    businessAccountId: env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || undefined,
  };
}

/**
 * What is still needed before the live feed can work, in the words Meta uses
 * for each one. Returned rather than thrown so a setup screen can show the list.
 */
export function whatsappSetupGaps(env: EnvLike = process.env): string[] {
  const gaps: string[] = [];
  if (!env.WHATSAPP_APP_SECRET?.trim()) {
    gaps.push('WHATSAPP_APP_SECRET — Meta app → Settings → Basic → App secret.');
  }
  if (!env.WHATSAPP_VERIFY_TOKEN?.trim()) {
    gaps.push('WHATSAPP_VERIFY_TOKEN — any long random string you invent; Meta only echoes it back.');
  }
  if (!env.WHATSAPP_PHONE_NUMBER_ID?.trim()) {
    gaps.push('WHATSAPP_PHONE_NUMBER_ID — WhatsApp → API Setup. A long number, not the telephone number.');
  }
  if (!env.WHATSAPP_BUSINESS_NUMBER?.trim()) {
    gaps.push('WHATSAPP_BUSINESS_NUMBER — the number in dialling form, so our own messages can be told apart.');
  }
  return gaps;
}

/**
 * Meta verifies a webhook by calling it with a challenge. Returns the challenge
 * to echo back, or null to refuse — a wrong token must never be accepted.
 */
export function verifyWebhookSubscription(
  params: { mode?: string; token?: string; challenge?: string },
  config: WhatsAppConfig,
): string | null {
  if (params.mode !== 'subscribe') return null;
  if (!params.token || !params.challenge) return null;

  const expected = Buffer.from(config.verifyToken);
  const given = Buffer.from(params.token);
  if (expected.length !== given.length) return null;
  return timingSafeEqual(expected, given) ? params.challenge : null;
}

/**
 * Every delivery is signed. An unsigned or wrongly signed body is discarded:
 * without this check anyone who learns the URL could inject messages into the
 * client record.
 */
export function verifySignature(rawBody: string, header: string | undefined, config: WhatsAppConfig): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', config.appSecret).update(rawBody).digest('hex');
  const given = header.slice('sha256='.length);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

export interface InboundMessage {
  externalId: string;
  threadKey: string;
  from: string;
  fromName: string | null;
  text: string;
  sentAt: Date;
  /** Set for anything that is not plain text. */
  mediaType: string | null;
  isFromUs: boolean;
}

interface Payload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          to?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          [k: string]: unknown;
        }>;
      };
    }>;
  }>;
}

/**
 * Reads messages out of a webhook delivery. Anything it does not understand is
 * skipped rather than guessed at — a half-read message in a client's record is
 * worse than a missing one.
 */
export function parseWebhook(payload: unknown, config?: WhatsAppConfig): InboundMessage[] {
  // A webhook endpoint is reachable by anyone who learns the URL, so a malformed
  // or empty body must be shrugged off rather than throw a 500.
  if (payload == null || typeof payload !== 'object') return [];

  const body = payload as Payload;
  const out: InboundMessage[] = [];
  if (!Array.isArray(body.entry)) return [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) continue;

      const names = new Map(
        (value.contacts ?? []).map((c) => [c.wa_id ?? '', c.profile?.name ?? null] as const),
      );

      for (const message of value.messages) {
        if (!message.id || !message.from || !message.timestamp) continue;

        const seconds = Number(message.timestamp);
        if (!Number.isFinite(seconds)) continue;

        const type = message.type ?? 'text';
        const text = type === 'text' ? (message.text?.body ?? '') : '';

        // Ours or theirs is decided by the telephone number, not by the
        // phone-number id: those are different identifiers, and comparing them
        // marked every message as the client's. The business number can be
        // configured or read off the delivery itself.
        const ourNumber = config?.businessNumber ?? value.metadata?.display_phone_number;
        const isFromUs = ourNumber != null && samePhoneNumber(message.from, ourNumber);

        out.push({
          externalId: message.id,
          // A conversation is with the other party, so a message we sent belongs
          // to the recipient's thread rather than to one of our own.
          threadKey: `whatsapp:${isFromUs ? (message.to ?? message.from) : message.from}`,
          from: message.from,
          fromName: names.get(message.from) ?? null,
          text,
          sentAt: new Date(seconds * 1000),
          mediaType: type === 'text' ? null : type,
          isFromUs,
        });
      }
    }
  }

  return out;
}

/** Two numbers written differently are still one number. */
function samePhoneNumber(a: string, b: string): boolean {
  const left = normalisePhone(a);
  const right = normalisePhone(b);
  return left != null && left === right;
}

/**
 * Stated here so it can be asserted, and so anyone reading the module knows the
 * omission is deliberate rather than unfinished.
 */
export const CAPABILITIES = {
  read: true,
  send: false,
  reply: false,
  react: false,
  markRead: false,
  reason: 'GRLP asked for an assistant that organises WhatsApp and never speaks on their behalf.',
} as const;
