import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { env } from './env.ts';
import { readAsUser, withUser } from './db.ts';
import { ForbiddenError, NotAuthenticatedError } from './errors.ts';
import type { Permission, RoleCode } from './permissions.ts';
import { hashToken, newToken, safeEqual, type RequestMeta } from './tokens.ts';

const SESSION_COOKIE = 'grlp_session';
const AGENT_FILTER_COOKIE = 'grlp_agent_filter';

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  displayName: string;
  officeId: string | null;
  teamId: string | null;
  roles: RoleCode[];
  permissions: ReadonlySet<Permission>;
}

export type { RequestMeta } from './tokens.ts';
export { safeEqual };

export const newSessionToken = newToken;
export const hashSessionToken = hashToken;

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  return { ip: ip && ip.length > 0 ? ip : null, userAgent: h.get('user-agent') };
}

interface SessionRow {
  session_id: string;
  user_id: string;
  email: string;
  full_name: string;
  display_name: string | null;
  office_id: string | null;
  team_id: string | null;
  role_codes: string[];
  permission_codes: string[];
}

/**
 * Resolves the session cookie to the signed-in user. Cached per request, so
 * a page that checks permissions in ten places still makes one query.
 *
 * A suspended or disabled account resolves to null immediately: the check is
 * in the SQL function, not in a cached token claim.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const row = await readAsUser(null, (db) =>
    db.maybeOne<SessionRow>('select * from app.session_load($1)', [tokenHash]),
  );
  if (!row) return null;

  return {
    id: row.user_id,
    email: row.email,
    fullName: row.full_name,
    displayName: row.display_name ?? row.full_name.split(' ')[0] ?? row.full_name,
    officeId: row.office_id,
    teamId: row.team_id,
    roles: row.role_codes as RoleCode[],
    permissions: new Set(row.permission_codes as Permission[]),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new NotAuthenticatedError();
  return user;
}

export function can(user: CurrentUser | null, permission: Permission): boolean {
  return user?.permissions.has(permission) ?? false;
}

export function canAny(user: CurrentUser | null, ...permissions: Permission[]): boolean {
  return permissions.some((p) => can(user, p));
}

/**
 * The server-side gate. Every server action and route handler calls this;
 * hiding a button is never the control (spec 9).
 */
export async function requirePermission(
  permission: Permission,
  what?: string,
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.permissions.has(permission)) throw new ForbiddenError(what ?? 'this area');
  return user;
}

export async function startSession(userId: string): Promise<void> {
  const token = newSessionToken();
  const hours = env.sessionHours();
  const expiresAt = new Date(Date.now() + hours * 3600_000);
  const meta = await requestMeta();

  await withUser(null, (db) =>
    db.query('select app.session_create($1, $2, $3, $4, $5)', [
      userId,
      hashSessionToken(token),
      expiresAt.toISOString(),
      meta.ip,
      meta.userAgent,
    ]),
  );

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction(),
    path: '/',
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await withUser(null, (db) =>
      db.query('select app.session_revoke($1)', [hashSessionToken(token)]),
    );
  }
  jar.delete(SESSION_COOKIE);
  jar.delete(AGENT_FILTER_COOKIE);
}

// ---------------------------------------------------------------------------
// Management agent filter (spec 10)
//
// This is a view filter, never a security boundary. An agent without
// DATA_VIEW_ALL is already confined by row level security, so the filter can
// only ever narrow what management sees, not widen what anyone else sees.
// ---------------------------------------------------------------------------

export async function getAgentFilter(user: CurrentUser): Promise<string | null> {
  if (!user.permissions.has('DATA_VIEW_ALL')) return user.id;
  const jar = await cookies();
  const value = jar.get(AGENT_FILTER_COOKIE)?.value;
  return value && value !== 'all' ? value : null;
}

export async function setAgentFilter(agentId: string | null): Promise<void> {
  const jar = await cookies();
  if (!agentId || agentId === 'all') {
    jar.delete(AGENT_FILTER_COOKIE);
    return;
  }
  jar.set(AGENT_FILTER_COOKIE, agentId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction(),
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export { SESSION_COOKIE, AGENT_FILTER_COOKIE };
