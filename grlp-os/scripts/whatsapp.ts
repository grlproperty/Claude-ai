import { PrismaClient } from '@prisma/client';

import { whatsappConfig, whatsappSetupGaps } from '../src/integrations/whatsapp';
import { checkIntegration, INTEGRATIONS } from '../src/integrations/registry';
import { lastWhatsAppDelivery } from '../src/server/whatsapp-live';
import { normalisePhone } from '../src/domain/contact-match';

/**
 * WhatsApp Business setup and status.
 *
 *   npx tsx scripts/whatsapp.ts setup   — what to paste into Meta, and what is missing
 *   npx tsx scripts/whatsapp.ts status  — whether Meta has ever actually delivered
 *
 * Nothing here contacts Meta. Receiving messages needs no access token — only
 * the app secret, to check that a delivery really came from them — so there is
 * no credential here that could send anything.
 */

function redact(value: string): string {
  return value.length <= 4 ? '••••' : `${value.slice(0, 2)}${'•'.repeat(8)}${value.slice(-2)}`;
}

function setup() {
  const publicUrl = (process.env.PUBLIC_URL ?? 'https://your-host').replace(/\/+$/, '');
  const config = whatsappConfig();
  const gaps = whatsappSetupGaps();

  console.log('WhatsApp Business — live feed setup\n');

  console.log('In the Meta app, under WhatsApp → Configuration → Webhook:');
  console.log(`  Callback URL   ${publicUrl}/api/whatsapp`);
  console.log(`  Verify token   ${config?.verifyToken ?? '(set WHATSAPP_VERIFY_TOKEN first)'}`);
  console.log('  Subscribe to   messages');
  console.log('                 smb_message_echoes   ← only if the number also');
  console.log('                                        runs the WhatsApp Business app');
  console.log('');
  console.log('The URL must be reachable from the internet over HTTPS. Meta calls it');
  console.log('once with the verify token before it will save the subscription.');
  console.log('');
  console.log('smb_message_echoes carries the replies sent from the phone. Without it');
  console.log('the system sees only the client\u2019s half and every conversation looks');
  console.log('as though nobody has answered.\n');

  console.log('Configuration:');
  const rows: Array<[string, string]> = [
    ['App secret', config?.appSecret ? redact(config.appSecret) : 'not set'],
    ['Verify token', config?.verifyToken ? redact(config.verifyToken) : 'not set'],
    ['Phone number id', config?.phoneNumberId ?? 'not set'],
    ['Business number', config?.businessNumber ?? 'not set'],
    ['Business account id', config?.businessAccountId ?? 'not set'],
  ];
  for (const [label, value] of rows) console.log(`  ${label.padEnd(20)} ${value}`);

  if (gaps.length) {
    console.log('\nStill needed:');
    for (const gap of gaps) console.log(`  · ${gap}`);
  }

  // The mistake that costs an afternoon: the telephone number pasted into the
  // field that wants Meta's id for it. The webhook then verifies, delivers, and
  // silently matches nothing.
  if (config?.phoneNumberId && config.businessNumber) {
    const id = normalisePhone(config.phoneNumberId);
    if (id && id === normalisePhone(config.businessNumber)) {
      console.log('\n  ✗ The phone number id and the business number are the same value.');
      console.log('    They are different things. The id is in WhatsApp → API Setup,');
      console.log('    directly under the number itself.');
    }
  }

  console.log('\nNothing in this system sends a WhatsApp message. Receiving needs no');
  console.log('access token, so none is asked for here.');
}

async function status() {
  const prisma = new PrismaClient();
  try {
    const spec = INTEGRATIONS.find((i) => i.key === 'whatsapp')!;
    const state = await checkIntegration(spec);

    console.log('WhatsApp Business — status\n');
    console.log(`  Configuration   ${state.status}`);
    console.log(`  ${state.detail}`);

    const delivery = await lastWhatsAppDelivery();
    console.log('');
    if (delivery) {
      console.log(`  Meta last delivered   ${delivery.at.toLocaleString('en-ZA')}`);
      if (delivery.note) console.log(`  ${delivery.note}`);
    } else {
      console.log('  Meta has never delivered anything to this installation.');
      console.log('  Credentials being present is not the same as the subscription being live.');
      console.log('  Send a message to the business number and run this again.');
    }

    const threads = await prisma.messageThread.count({ where: { externalId: { startsWith: 'whatsapp:2' } } });
    const exported = await prisma.messageThread.count({ where: { externalId: { startsWith: 'whatsapp:export:' } } });
    console.log('');
    console.log(`  ${threads} conversation(s) from the live feed, ${exported} from chat exports.`);
  } finally {
    await prisma.$disconnect();
  }
}

const [command] = process.argv.slice(2);
const run =
  command === 'setup'
    ? Promise.resolve(setup())
    : command === 'status'
      ? status()
      : Promise.reject(new Error('Usage: npx tsx scripts/whatsapp.ts setup | status'));

run.catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
