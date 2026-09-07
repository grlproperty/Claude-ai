import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { prisma } from './db';
import type { Principal } from './permissions';

/**
 * Session authentication.
 *
 * Sessions are JWTs in an HttpOnly, SameSite=Lax cookie, backed by a database
 * row so that a session can be revoked immediately — a signed token alone cannot
 * be withdrawn, which matters when someone leaves.
 *
 * Single sign-on through Google Workspace or Microsoft 365 is the intended
 * production path; the interface for it is in the integration registry and is
 * reported as unconnected until credentials exist.
 */

export const SESSION_COOKIE = 'grlp_session';
const SESSION_DAYS = 7;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 characters. Generate one with: openssl rand -base64 48');
  }
  return new TextEncoder().encode(s);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  // Always run a comparison so a missing hash takes the same time as a wrong one.
  const target = hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
  const ok = await bcrypt.compare(plain, target);
  return hash != null && ok;
}

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 12) throw new Error('A password must be at least 12 characters.');
  return bcrypt.hash(plain, 12);
}

export interface SessionToken {
  token: string;
  expiresAt: Date;
}

export async function createSession(userId: string, meta: { userAgent?: string; ip?: string } = {}): Promise<SessionToken> {
  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await prisma.session.create({
    data: { userId, tokenHash: hashToken(raw), expiresAt, userAgent: meta.userAgent, ip: meta.ip },
  });

  const token = await new SignJWT({ sid: raw, uid: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());

  return { token, expiresAt };
}

export async function resolveSession(token: string | undefined): Promise<Principal | null> {
  if (!token) return null;

  let payload: { sid?: unknown; uid?: unknown };
  try {
    ({ payload } = await jwtVerify(token, secret()));
  } catch {
    return null;
  }
  if (typeof payload.sid !== 'string') return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(payload.sid) },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!session.user.active) return null;

  return {
    id: session.user.id,
    name: session.user.name,
    role: session.user.role,
    department: session.user.department,
    isCeo: session.user.isCeo,
  };
}

export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sid === 'string') {
      await prisma.session.updateMany({
        where: { tokenHash: hashToken(payload.sid), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  } catch {
    // An unreadable token is already useless.
  }
}

/** Revokes every session for a user — used when someone leaves. */
export async function revokeAllSessions(userId: string): Promise<number> {
  const result = await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  return result.count;
}
