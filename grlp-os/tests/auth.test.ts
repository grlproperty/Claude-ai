import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createSession, hashPassword, resolveSession, revokeAllSessions, revokeSession, verifyPassword } from '../src/server/auth';

/**
 * Runs against a real Postgres database — the same engine production uses.
 * Set DATABASE_URL before running.
 */
const prisma = new PrismaClient();
const EMAIL = 'auth-test@grlp.invalid';
let userId: string;

beforeAll(async () => {
  process.env.SESSION_SECRET ??= 'test-secret-that-is-definitely-long-enough-32';
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: {
      email: EMAIL,
      name: 'Auth Test',
      role: 'SALES_AGENT',
      department: 'SALES',
      passwordHash: await hashPassword('a-sufficiently-long-password'),
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

describe('passwords', () => {
  it('accepts the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct-horse-battery');
    expect(await verifyPassword('correct-horse-battery', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('rejects a user with no password without throwing', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
  });

  it('refuses to set a short password', async () => {
    await expect(hashPassword('short')).rejects.toThrow(/at least 12/);
  });
});

describe('sessions', () => {
  it('issues a session that resolves to the right person', async () => {
    const { token } = await createSession(userId);
    const principal = await resolveSession(token);
    expect(principal?.id).toBe(userId);
    expect(principal?.role).toBe('SALES_AGENT');
  });

  it('rejects a forged or tampered token', async () => {
    const { token } = await createSession(userId);
    expect(await resolveSession(token.slice(0, -3) + 'aaa')).toBeNull();
    expect(await resolveSession('not-a-token')).toBeNull();
    expect(await resolveSession(undefined)).toBeNull();
  });

  it('stops accepting a revoked session immediately', async () => {
    const { token } = await createSession(userId);
    expect(await resolveSession(token)).not.toBeNull();
    await revokeSession(token);
    expect(await resolveSession(token)).toBeNull();
  });

  it('can revoke every session at once, for when someone leaves', async () => {
    const a = await createSession(userId);
    const b = await createSession(userId);
    const count = await revokeAllSessions(userId);
    expect(count).toBeGreaterThanOrEqual(2);
    expect(await resolveSession(a.token)).toBeNull();
    expect(await resolveSession(b.token)).toBeNull();
  });

  it('refuses a session for a deactivated user', async () => {
    const { token } = await createSession(userId);
    await prisma.user.update({ where: { id: userId }, data: { active: false } });
    expect(await resolveSession(token)).toBeNull();
    await prisma.user.update({ where: { id: userId }, data: { active: true } });
  });

  it('refuses an expired session', async () => {
    const { token } = await createSession(userId);
    await prisma.session.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveSession(token)).toBeNull();
  });

  it('stores only a hash of the session token, never the token', async () => {
    const { token } = await createSession(userId);
    const rows = await prisma.session.findMany({ where: { userId } });
    expect(rows.every((r) => !token.includes(r.tokenHash))).toBe(true);
    expect(rows.every((r) => r.tokenHash.length === 64)).toBe(true);
  });
});
