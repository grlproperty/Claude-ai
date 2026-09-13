import { headers } from 'next/headers';
import { AppError } from './errors.ts';

/**
 * Origin check for route handlers that change state.
 *
 * Next verifies the origin of server actions itself, and the session cookie
 * is SameSite=Lax, but route handlers accept plain form posts, so they get an
 * explicit check of their own.
 */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get('origin');
  if (!origin) return; // same-origin form posts often send no Origin header

  const host = h.get('x-forwarded-host') ?? h.get('host');
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError('bad_origin', 'That request could not be verified. Please try again.', 403);
  }
  if (!host || originHost !== host) {
    throw new AppError('bad_origin', 'That request could not be verified. Please try again.', 403);
  }
}
