import { NextResponse } from 'next/server';

import { parseWebhook, verifySignature, verifyWebhookSubscription, whatsappConfig } from '../../../integrations/whatsapp';
import { ingestLiveMessages } from '../../../server/whatsapp-live';

export const dynamic = 'force-dynamic';

/**
 * The live WhatsApp feed, for a Business number.
 *
 * Read-only in both directions that matter: Meta delivers messages here, and
 * there is no code anywhere in this system that sends one back. The endpoint
 * exists so that conversations on a business number are organised as they
 * happen rather than whenever somebody remembers to export a chat.
 *
 * Unconfigured, it returns 404 rather than 500 — an endpoint that answers
 * usefully before it is set up tells the internet something it need not know.
 */

export async function GET(request: Request) {
  const config = whatsappConfig();
  if (!config) return new NextResponse('Not found', { status: 404 });

  const url = new URL(request.url);
  const challenge = verifyWebhookSubscription(
    {
      mode: url.searchParams.get('hub.mode') ?? undefined,
      token: url.searchParams.get('hub.verify_token') ?? undefined,
      challenge: url.searchParams.get('hub.challenge') ?? undefined,
    },
    config,
  );

  if (challenge == null) return new NextResponse('Forbidden', { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
}

export async function POST(request: Request) {
  const config = whatsappConfig();
  if (!config) return new NextResponse('Not found', { status: 404 });

  // The signature is over the exact bytes sent, so the body is read as text and
  // parsed afterwards — re-serialising it would change what is being checked.
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get('x-hub-signature-256') ?? undefined, config)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Signed but unreadable: acknowledged, because Meta would otherwise retry
    // it forever, and there is nothing a retry would fix.
    return NextResponse.json({ received: 0 }, { status: 200 });
  }

  const messages = parseWebhook(payload, config);

  try {
    const result = await ingestLiveMessages(messages);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    // A failure here is ours, and Meta should send it again rather than drop it.
    console.error('WhatsApp ingestion failed', error);
    return new NextResponse('Ingestion failed', { status: 500 });
  }
}
