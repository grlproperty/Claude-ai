import { PrismaClient } from '@prisma/client';
import { createImapSmtpTransport, mailboxConfig } from '../src/integrations/mailbox';
import { ingestMail } from '../src/server/mail-ingest';

/**
 * Mailbox operator tooling.
 *
 *   npx tsx scripts/mail.ts test      — log in to the mailbox and report the result
 *   npx tsx scripts/mail.ts ingest    — read new mail, triage it, route it
 *   npx tsx scripts/mail.ts ingest --days 3
 *
 * `test` is the honest definition of "connected": it performs a real IMAP login.
 * Run it wherever the application will run — a sandbox that only allows HTTPS
 * cannot reach IMAP, and will report a connection failure that says nothing about
 * whether the credentials are right.
 */

function redact(value: string): string {
  return value.length <= 2 ? '••' : `${value[0]}${'•'.repeat(Math.min(8, value.length - 2))}${value.at(-1)}`;
}

async function test() {
  const config = mailboxConfig();
  if (!config) {
    console.error('The mailbox is not configured.\n');
    console.error('Set these in .env:');
    console.error('  MAIL_IMAP_HOST   e.g. mail.grproperty.co.za');
    console.error('  MAIL_SMTP_HOST   e.g. mail.grproperty.co.za');
    console.error('  MAIL_USER        the full email address');
    console.error('  MAIL_PASSWORD    the mailbox password');
    console.error('\nOptional: MAIL_IMAP_PORT (993), MAIL_SMTP_PORT (587), MAIL_FROM_ADDRESS, MAIL_FROM_NAME');
    process.exit(1);
  }

  console.log('Connecting with:');
  console.log(`  IMAP      ${config.imapHost}:${config.imapPort} (${config.imapSecure ? 'TLS' : 'STARTTLS'})`);
  console.log(`  SMTP      ${config.smtpHost}:${config.smtpPort} (${config.smtpSecure ? 'TLS' : 'STARTTLS'})`);
  console.log(`  User      ${config.user}`);
  console.log(`  Password  ${redact(config.password)}`);
  console.log('');

  const result = await createImapSmtpTransport(config).verify();
  if (result.ok) {
    console.log('Connected. The mailbox is reachable and the credentials were accepted.');
    return;
  }

  console.error(`Could not connect: ${result.detail}`);
  console.error('\nThe usual causes, in order of likelihood:');
  console.error('  · Wrong password, or the mailbox requires its own password rather than the account password.');
  console.error('  · IMAP disabled for the mailbox in the hosting control panel.');
  console.error('  · Port 993 blocked by the network this is running on.');
  console.error('  · Host name wrong — try the provider’s server name rather than mail.<your-domain>.');
  process.exit(1);
}

async function ingest(days: number) {
  const prisma = new PrismaClient();
  try {
    const since = new Date(Date.now() - days * 86_400_000);
    const result = await ingestMail({ since });

    if (result.unavailable) {
      console.error(result.unavailable);
      process.exit(1);
    }

    console.log(`Read ${result.fetched} message(s) since ${since.toISOString().slice(0, 10)}.`);
    console.log(`Stored ${result.stored}; skipped ${result.skippedDuplicates} already seen.`);
    console.log('');
    console.log('Triage:');
    for (const [decision, count] of Object.entries(result.byDecision)) {
      if (count) console.log(`  ${decision.replace(/_/g, ' ').toLowerCase().padEnd(18)} ${count}`);
    }
    if (Object.keys(result.routedTo).length) {
      console.log('');
      console.log('Routed to:');
      for (const [who, count] of Object.entries(result.routedTo)) {
        console.log(`  ${who.padEnd(18)} ${count}`);
      }
    }
    console.log('');
    console.log(`${result.needsCeo} of ${result.stored} needed the CEO.`);
    console.log('Nothing was sent. Replies go out only after a person approves the draft.');
  } finally {
    await prisma.$disconnect();
  }
}

const [command, ...rest] = process.argv.slice(2);
const daysArg = rest.indexOf('--days');
const days = daysArg >= 0 ? Number(rest[daysArg + 1] ?? 7) : 7;

const run =
  command === 'test'
    ? test()
    : command === 'ingest'
      ? ingest(Number.isFinite(days) ? days : 7)
      : Promise.reject(new Error('Usage: npx tsx scripts/mail.ts test | ingest [--days N]'));

run.catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
