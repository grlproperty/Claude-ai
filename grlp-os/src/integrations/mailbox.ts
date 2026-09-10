import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { IntegrationNotConfiguredError, type EnvLike } from './registry';

/**
 * The GRLP mailbox: IMAP for reading, SMTP for sending.
 *
 * grproperty.co.za is hosted on a standard South African mail host (xneelo /
 * rdsa-mail), not Google Workspace or Microsoft 365, so there is no OAuth client
 * to create — the mailbox authenticates with a username and password.
 *
 * Two consequences follow, and both are handled here rather than hidden:
 *
 *   1. The password is a full mailbox credential, not a scoped token. It lives in
 *      the environment, never in the database and never in the repository, and it
 *      should belong to a mailbox created for this system where possible.
 *   2. There is no refresh-token dance, so "connected" means one thing only: a
 *      real IMAP login succeeded. `verify()` performs that login.
 */

export interface MailboxConfig {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  user: string;
  password: string;
  /** Implicit TLS on 993/465; STARTTLS on 143/587. */
  imapSecure: boolean;
  smtpSecure: boolean;
  /** The address replies are sent from, if it differs from the login. */
  fromAddress: string;
  fromName: string;
}

export const MAILBOX_ENV = [
  'MAIL_IMAP_HOST',
  'MAIL_SMTP_HOST',
  'MAIL_USER',
  'MAIL_PASSWORD',
] as const;

export function mailboxConfig(env: EnvLike = process.env): MailboxConfig | null {
  const missing = MAILBOX_ENV.filter((k) => !env[k]?.trim());
  if (missing.length) return null;

  const imapPort = Number(env.MAIL_IMAP_PORT ?? 993);
  const smtpPort = Number(env.MAIL_SMTP_PORT ?? 587);

  return {
    imapHost: env.MAIL_IMAP_HOST!.trim(),
    imapPort,
    smtpHost: env.MAIL_SMTP_HOST!.trim(),
    smtpPort,
    user: env.MAIL_USER!.trim(),
    password: env.MAIL_PASSWORD!,
    imapSecure: imapPort === 993,
    smtpSecure: smtpPort === 465,
    fromAddress: env.MAIL_FROM_ADDRESS?.trim() || env.MAIL_USER!.trim(),
    fromName: env.MAIL_FROM_NAME?.trim() || 'Garden Route Lifestyle Property',
  };
}

export function requireMailbox(env: EnvLike = process.env): MailboxConfig {
  const config = mailboxConfig(env);
  if (!config) {
    throw new IntegrationNotConfiguredError(
      'mailbox',
      MAILBOX_ENV.filter((k) => !env[k]?.trim()),
    );
  }
  return config;
}

/** A message as the system stores it, independent of the mail library. */
export interface IncomingMessage {
  /** Stable across fetches, so a message is never ingested twice. */
  externalId: string;
  subject: string | null;
  body: string | null;
  fromName: string | null;
  fromAddress: string | null;
  toAddresses: string[];
  receivedAt: Date;
  /** Set when the message is a reply, so threads can be followed. */
  inReplyTo: string | null;
}

/**
 * The transport seam. Production uses IMAP and SMTP; tests substitute a fake, so
 * ingestion and sending logic are tested without a network or a real mailbox.
 */
export interface MailTransport {
  fetchSince(since: Date, limit: number): Promise<IncomingMessage[]>;
  send(message: OutgoingMessage): Promise<{ messageId: string }>;
  verify(): Promise<{ ok: boolean; detail?: string }>;
}

export interface OutgoingMessage {
  to: string;
  subject: string;
  /** Plain text. The system does not send HTML it did not compose. */
  text: string;
  inReplyTo?: string | null;
  replyTo?: string | null;
}

export function createImapSmtpTransport(config: MailboxConfig): MailTransport {
  return {
    async fetchSince(since, limit) {
      const client = new ImapFlow({
        host: config.imapHost,
        port: config.imapPort,
        secure: config.imapSecure,
        auth: { user: config.user, pass: config.password },
        logger: false,
      });

      await client.connect();
      const messages: IncomingMessage[] = [];
      try {
        const lock = await client.getMailboxLock('INBOX');
        try {
          // `since` is date-granular in IMAP; the exact timestamp is filtered below.
          const uids = await client.search({ since });
          const recent = (uids || []).slice(-limit);

          for (const uid of recent) {
            const item = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
            if (!item || !item.source) continue;

            const parsed = await simpleParser(item.source);
            const receivedAt = parsed.date ?? item.envelope?.date ?? new Date();
            if (receivedAt < since) continue;

            const from = parsed.from?.value?.[0];
            const to = Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : [];

            messages.push({
              // Message-ID is the mail system's own identifier; fall back to the
              // account-scoped UID so a message without one is still de-duplicated.
              externalId: parsed.messageId ?? `${config.user}:uid:${uid}`,
              subject: parsed.subject ?? null,
              body: (parsed.text ?? '').trim() || null,
              fromName: from?.name || null,
              fromAddress: from?.address ?? null,
              toAddresses: to.flatMap((t) => t.value.map((v) => v.address ?? '').filter(Boolean)),
              receivedAt,
              inReplyTo: parsed.inReplyTo ?? null,
            });
          }
        } finally {
          lock.release();
        }
      } finally {
        await client.logout().catch(() => client.close());
      }

      return messages.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
    },

    async send(message) {
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: { user: config.user, pass: config.password },
      });

      const info = await transporter.sendMail({
        from: { name: config.fromName, address: config.fromAddress },
        to: message.to,
        subject: message.subject,
        text: message.text,
        inReplyTo: message.inReplyTo ?? undefined,
        references: message.inReplyTo ?? undefined,
        replyTo: message.replyTo ?? undefined,
      });

      return { messageId: info.messageId };
    },

    async verify() {
      const client = new ImapFlow({
        host: config.imapHost,
        port: config.imapPort,
        secure: config.imapSecure,
        auth: { user: config.user, pass: config.password },
        logger: false,
      });
      try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');
        lock.release();
        await client.logout();
        return { ok: true };
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },
  };
}

/** Convenience: the configured transport, or a typed refusal. */
export function mailTransport(env: EnvLike = process.env): MailTransport {
  return createImapSmtpTransport(requireMailbox(env));
}
