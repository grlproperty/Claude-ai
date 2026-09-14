import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from './env.ts';

/**
 * Token helpers, kept free of any Next.js import so that authentication can
 * be exercised by the test suite without a request context.
 */

export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Session and invitation tokens are stored only as an HMAC, so a copy of the
 * database cannot be used to impersonate anyone or to redeem an invitation.
 */
export function hashToken(token: string): string {
  return createHmac('sha256', env.sessionSecret()).update(token).digest('hex');
}

/** Constant-time comparison for anything user-supplied. */
export function safeEqual(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

/** Where the request came from, for audit and rate limiting. */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}
