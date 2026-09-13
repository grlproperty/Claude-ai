import { env } from './env.ts';
import { withUser } from './db.ts';
import { AppError, ValidationError } from './errors.ts';
import { checkPasswordStrength, hashPassword, verifyPassword } from './password.ts';
import { recordAudit } from './audit.ts';
import { hashToken } from './tokens.ts';
import type { RequestMeta } from './tokens.ts';

/**
 * Authentication rules for a private internal CRM (spec 7).
 *
 * There is no public registration. Only company addresses may sign in. The
 * first authorised company user becomes Management; after that, Management
 * invites everyone else and the invited person chooses their own password.
 */

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isCompanyEmail(email: string): boolean {
  const domain = normaliseEmail(email).split('@')[1];
  if (!domain) return false;
  return env.allowedEmailDomains().includes(domain);
}

export function companyDomainMessage(): string {
  const domains = env.allowedEmailDomains().map((d) => `@${d}`).join(' or ');
  return `Only ${domains} company email addresses may use this system.`;
}

interface CredentialRow {
  user_id: string;
  email: string;
  full_name: string;
  status: string;
  password_hash: string | null;
  locked_until: string | null;
}

const GENERIC_FAILURE = 'That email address and password do not match.';

/**
 * Verifies a sign-in. The same message comes back for an unknown address and
 * a wrong password, so the form cannot be used to discover who works here.
 */
export async function signInWithPassword(input: {
  email: string;
  password: string;
  meta: RequestMeta;
}): Promise<{ userId: string; email: string; fullName: string }> {
  const email = normaliseEmail(input.email);

  if (!isCompanyEmail(email)) {
    await recordAttempt(email, input.meta, false, 'domain_not_allowed');
    throw new AppError('domain_not_allowed', companyDomainMessage(), 403);
  }

  // Throttle by source address before doing any expensive hashing.
  const failures = await withUser(null, (db) =>
    db.maybeOne<{ n: number }>('select app.auth_recent_failures($1, $2) as n', [
      input.meta.ip,
      900,
    ]),
  );
  if ((failures?.n ?? 0) >= 20) {
    throw new AppError(
      'rate_limited',
      'Too many sign-in attempts from this connection. Please wait fifteen minutes and try again.',
      429,
    );
  }

  const row = await withUser(null, (db) =>
    db.maybeOne<CredentialRow>('select * from app.auth_credentials($1)', [email]),
  );

  // Hash against a dummy value when the address is unknown so that the
  // response takes the same time either way.
  const ok = await verifyPassword(
    input.password,
    row?.password_hash ??
      'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  );

  if (!row || !ok) {
    await recordAttempt(email, input.meta, false, row ? 'bad_password' : 'unknown_email');
    throw new AppError('bad_credentials', GENERIC_FAILURE, 401);
  }

  if (row.locked_until && new Date(row.locked_until) > new Date()) {
    await recordAttempt(email, input.meta, false, 'locked');
    throw new AppError(
      'locked',
      'This account is temporarily locked after repeated failed attempts. Please try again shortly.',
      423,
    );
  }

  if (row.status !== 'active') {
    await recordAttempt(email, input.meta, false, `status_${row.status}`);
    throw new AppError(
      'account_not_active',
      row.status === 'invited'
        ? 'This account has not been set up yet. Please use the invitation link you were sent.'
        : 'This account has been disabled. Please speak to management.',
      403,
    );
  }

  await recordAttempt(email, input.meta, true, null);
  return { userId: row.user_id, email: row.email, fullName: row.full_name };
}

async function recordAttempt(
  email: string,
  meta: RequestMeta,
  ok: boolean,
  reason: string | null,
): Promise<void> {
  await withUser(null, (db) =>
    db.query('select app.auth_record_attempt($1, $2, $3, $4)', [email, meta.ip, ok, reason]),
  );
}

export async function bootstrapNeeded(): Promise<boolean> {
  const row = await withUser(null, (db) =>
    db.maybeOne<{ needed: boolean }>('select app.bootstrap_needed() as needed'),
  );
  return row?.needed ?? false;
}

/** First-run setup: the first authorised company user becomes Management. */
export async function completeBootstrap(input: {
  email: string;
  fullName: string;
  password: string;
  meta: RequestMeta;
}): Promise<string> {
  const email = normaliseEmail(input.email);
  const fieldErrors: Record<string, string[]> = {};

  if (!isCompanyEmail(email)) fieldErrors.email = [companyDomainMessage()];
  if (input.fullName.trim().length < 2) fieldErrors.fullName = ['Please enter your full name.'];
  const pwProblems = checkPasswordStrength(input.password);
  if (pwProblems.length > 0) fieldErrors.password = pwProblems;
  if (Object.keys(fieldErrors).length > 0) throw new ValidationError(fieldErrors);

  if (!(await bootstrapNeeded())) {
    throw new AppError('already_set_up', 'Setup has already been completed. Please sign in.', 409);
  }

  const passwordHash = await hashPassword(input.password);

  return withUser(null, async (db) => {
    const row = await db.one<{ bootstrap_management: string }>(
      'select app.bootstrap_management($1, $2, $3)',
      [email, input.fullName.trim(), passwordHash],
    );
    const userId = row.bootstrap_management;
    await db.query('select set_config($1, $2, true)', ['app.user_id', userId]);
    await recordAudit(db, { id: userId, email }, input.meta, {
      action: 'setup.completed',
      entityType: 'user',
      entityId: userId,
      entityLabel: input.fullName.trim(),
      context: { role: 'MANAGEMENT', note: 'First authorised company user completed setup.' },
    });
    return userId;
  });
}

export interface InvitationSummary {
  invitationId: string;
  email: string;
  fullName: string;
  roleName: string;
  expiresAt: string;
}

export async function loadInvitation(token: string): Promise<InvitationSummary | null> {
  const row = await withUser(null, (db) =>
    db.maybeOne<{
      invitation_id: string;
      email: string;
      full_name: string;
      role_name: string;
      expires_at: Date;
    }>('select * from app.invitation_load($1)', [hashToken(token)]),
  );
  if (!row) return null;
  return {
    invitationId: row.invitation_id,
    email: row.email,
    fullName: row.full_name,
    roleName: row.role_name,
    expiresAt: row.expires_at.toISOString(),
  };
}

/** An invited user chooses their own password; it is never set for them. */
export async function acceptInvitation(input: {
  token: string;
  password: string;
  meta: RequestMeta;
}): Promise<string> {
  const problems = checkPasswordStrength(input.password);
  if (problems.length > 0) throw new ValidationError({ password: problems });

  const invitation = await loadInvitation(input.token);
  if (!invitation) {
    throw new AppError(
      'invitation_invalid',
      'This invitation link is no longer valid. Please ask management to send a new one.',
      410,
    );
  }
  if (!isCompanyEmail(invitation.email)) {
    throw new AppError('domain_not_allowed', companyDomainMessage(), 403);
  }

  const passwordHash = await hashPassword(input.password);

  return withUser(null, async (db) => {
    const row = await db.one<{ invitation_accept: string }>(
      'select app.invitation_accept($1, $2)',
      [hashToken(input.token), passwordHash],
    );
    const userId = row.invitation_accept;
    await db.query('select set_config($1, $2, true)', ['app.user_id', userId]);
    await recordAudit(db, { id: userId, email: invitation.email }, input.meta, {
      action: 'user.invitation_accepted',
      entityType: 'user',
      entityId: userId,
      entityLabel: invitation.fullName,
      context: { role: invitation.roleName },
    });
    return userId;
  });
}

/** Changing your own password ends every other session for that account. */
export async function changeOwnPassword(input: {
  userId: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  meta: RequestMeta;
}): Promise<void> {
  const problems = checkPasswordStrength(input.newPassword);
  if (problems.length > 0) throw new ValidationError({ newPassword: problems });

  const row = await withUser(null, (db) =>
    db.maybeOne<CredentialRow>('select * from app.auth_credentials($1)', [input.email]),
  );
  if (!row || !(await verifyPassword(input.currentPassword, row.password_hash))) {
    throw new ValidationError({ currentPassword: ['That is not your current password.'] });
  }

  const passwordHash = await hashPassword(input.newPassword);
  await withUser(input.userId, async (db) => {
    await db.query('select app.set_password($1, $2)', [input.userId, passwordHash]);
    await db.query('select app.session_revoke_all($1)', [input.userId]);
    await recordAudit(db, { id: input.userId, email: input.email }, input.meta, {
      action: 'user.password_changed',
      entityType: 'user',
      entityId: input.userId,
      context: { note: 'All other sessions were ended.' },
    });
  });
}
