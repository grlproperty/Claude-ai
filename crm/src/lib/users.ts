import { z } from 'zod';
import type { Ctx } from './actor.ts';
import type { Db } from './db.ts';
import { holds } from './actor.ts';
import { recordAudit } from './audit.ts';
import { companyDomainMessage, isCompanyEmail, normaliseEmail } from './auth.ts';
import { ConcurrencyError, ForbiddenError, NotFoundError, ValidationError } from './errors.ts';
import { hashToken, newToken } from './tokens.ts';
import { ROLES, ROLE_LABELS, isPermission, type Permission, type RoleCode } from './permissions.ts';
import { optionalText } from './validate.ts';
import type { UserStatus } from './domain.ts';

/**
 * Managing who may use the CRM (spec 7, 8, 9, 10).
 *
 * This is a private internal CRM. There is no public registration and
 * never will be: the first authorised company user becomes Management,
 * and after that Management invites people. An invited person sets their
 * own password from a single-use link, so a password is never typed by
 * one person on behalf of another and never stored in plain text.
 *
 * A user is disabled or suspended, never deleted. Everything they did —
 * every conversation logged, every status changed, every commission
 * approved — has to stay attributable, so the row stays and only the
 * ability to sign in goes away (spec 104).
 */

// Re-exported so callers that already have this module need not reach for
// two; the list itself lives in domain.ts, which is safe in the browser.
export { USER_STATUSES, type UserStatus } from './domain.ts';

export const inviteInputSchema = z.object({
  email: z
    .string()
    .trim()
    .min(3, 'Give their company email address.')
    .transform((value) => normaliseEmail(value))
    .refine((value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), 'That is not an email address.')
    .refine((value) => isCompanyEmail(value), companyDomainMessage()),
  fullName: z.string().trim().min(2, 'Give their full name.').max(120),
  role: z.enum(ROLES),
  jobTitle: optionalText,
});
export type InviteInput = z.infer<typeof inviteInputSchema>;

export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  displayName: string | null;
  jobTitle: string | null;
  status: UserStatus;
  roles: { code: string; label: string }[];
  lastLoginAt: string | null;
  passwordSetAt: string | null;
  lockedUntil: string | null;
  overrides: { permission: string; allowed: boolean }[];
  rowVersion: number;
}

export async function listUsers(db: Db): Promise<UserRow[]> {
  const rows = await db.query<{
    id: string;
    email: string;
    full_name: string;
    display_name: string | null;
    job_title: string | null;
    status: UserStatus;
    last_login_at: Date | null;
    password_set_at: Date | null;
    locked_until: Date | null;
    row_version: number;
    role_codes: string[] | null;
  }>(
    `select u.id, u.email, u.full_name, u.display_name, u.job_title, u.status,
            u.last_login_at, u.password_set_at, u.locked_until, u.row_version,
            (select array_agg(r.code order by r.code)
               from user_roles ur join roles r on r.id = ur.role_id
              where ur.user_id = u.id) as role_codes
       from users u
      order by case u.status when 'active' then 0 when 'invited' then 1 else 2 end,
               u.full_name`,
  );

  const overrides = await db.query<{ user_id: string; permission: string; allowed: boolean }>(
    `select o.user_id, p.code as permission, (o.effect = 'grant') as allowed
       from user_permission_overrides o
       join permissions p on p.id = o.permission_id`,
  );

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    displayName: row.display_name,
    jobTitle: row.job_title,
    status: row.status,
    roles: (row.role_codes ?? []).map((code) => ({
      code,
      label: ROLE_LABELS[code as RoleCode] ?? code,
    })),
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    passwordSetAt: row.password_set_at?.toISOString() ?? null,
    lockedUntil: row.locked_until?.toISOString() ?? null,
    overrides: overrides
      .filter((entry) => entry.user_id === row.id)
      .map((entry) => ({ permission: entry.permission, allowed: entry.allowed })),
    rowVersion: row.row_version,
  }));
}

export interface PendingInvitation {
  id: string;
  email: string;
  fullName: string;
  roleLabel: string;
  invitedByName: string | null;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
}

export async function listPendingInvitations(db: Db): Promise<PendingInvitation[]> {
  const rows = await db.query<{
    id: string;
    email: string;
    full_name: string;
    role_code: string;
    invited_by_name: string | null;
    created_at: Date;
    expires_at: Date;
  }>(
    `select i.id, i.email, i.full_name, r.code as role_code,
            coalesce(u.display_name, u.full_name) as invited_by_name,
            i.created_at, i.expires_at
       from user_invitations i
       join roles r on r.id = i.role_id
       left join users u on u.id = i.created_by
      where i.accepted_at is null and i.revoked_at is null
      order by i.created_at desc`,
  );

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    roleLabel: ROLE_LABELS[row.role_code as RoleCode] ?? row.role_code,
    invitedByName: row.invited_by_name,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    isExpired: row.expires_at.getTime() < Date.now(),
  }));
}

/**
 * Inviting somebody.
 *
 * Returns the one-time link, because the CRM cannot send it: there is no
 * mail server (spec 6, 115). Whoever invited them passes it on themselves,
 * and the CRM says so rather than pretending an email went out.
 *
 * The token is returned once and stored only as a hash, so this link
 * cannot be recovered later — it can only be reissued.
 */
export async function inviteUser(
  db: Db,
  ctx: Ctx,
  input: InviteInput,
): Promise<{ invitationId: string; token: string; email: string }> {
  if (!holds(ctx.actor, 'USERS_ADMIN')) throw new ForbiddenError('user administration');

  const existing = await db.maybeOne<{ id: string; status: string }>(
    'select id, status from users where email = $1',
    [input.email],
  );
  if (existing) {
    throw new ValidationError(
      { email: [`${input.email} already has an account (${existing.status}).`] },
      'That person already has an account. Reactivate it rather than making a second one.',
    );
  }

  const pending = await db.maybeOne<{ id: string }>(
    `select id from user_invitations
      where email = $1 and accepted_at is null and revoked_at is null`,
    [input.email],
  );
  if (pending) {
    // Superseded rather than duplicated, so only one live link exists.
    await db.query('update user_invitations set revoked_at = now() where id = $1', [pending.id]);
  }

  const token = newToken();
  const row = await db.one<{ id: string }>(
    `insert into user_invitations
       (email, full_name, role_id, token_hash, expires_at, created_by)
     values ($1, $2, (select id from roles where code = $3), $4,
             now() + interval '7 days', $5)
     returning id`,
    [input.email, input.fullName, input.role, hashToken(token), ctx.actor.id],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'user.invited',
    entityType: 'user_invitation',
    entityId: row.id,
    // The token itself is never written to the audit log.
    context: { email: input.email, role: input.role },
  });

  return { invitationId: row.id, token, email: input.email };
}

export async function revokeInvitation(db: Db, ctx: Ctx, id: string): Promise<void> {
  if (!holds(ctx.actor, 'USERS_ADMIN')) throw new ForbiddenError('user administration');

  const updated = await db.count(
    'update user_invitations set revoked_at = now() where id = $1 and accepted_at is null',
    [id],
  );
  if (updated === 0) throw new NotFoundError('That invitation');

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'user.invitation_revoked',
    entityType: 'user_invitation',
    entityId: id,
  });
}

/**
 * Changing somebody's status.
 *
 * Nothing is deleted. A suspended or disabled user cannot sign in, and
 * every session they have is revoked at once, but their name stays on
 * everything they did (spec 10, 104).
 */
export async function setUserStatus(
  db: Db,
  ctx: Ctx,
  userId: string,
  status: UserStatus,
  reason: string | null,
): Promise<void> {
  if (!holds(ctx.actor, 'USERS_ADMIN')) throw new ForbiddenError('user administration');

  if (userId === ctx.actor.id && status !== 'active') {
    throw new ValidationError(
      { status: ['You cannot suspend or disable your own account.'] },
      'Somebody else must do that, so the office is never locked out of its own CRM.',
    );
  }

  const before = await db.maybeOne<{ status: string; email: string }>(
    'select status, email from users where id = $1',
    [userId],
  );
  if (!before) throw new NotFoundError('That user');

  // The last active user who can administer users must stay able to.
  if (status !== 'active') {
    const remaining = await db.one<{ count: number }>(
      `select count(*)::int as count
         from users u
         join user_roles ur on ur.user_id = u.id
         join role_permissions rp on rp.role_id = ur.role_id
         join permissions p on p.id = rp.permission_id
        where u.status = 'active' and u.id <> $1 and p.code = 'USERS_ADMIN'`,
      [userId],
    );
    if (Number(remaining.count) === 0) {
      throw new ValidationError(
        { status: ['This is the last person who can administer users.'] },
        'Give somebody else that permission first, or the office cannot get back in.',
      );
    }
  }

  await db.query('update users set status = $2, updated_by = $3 where id = $1', [
    userId,
    status,
    ctx.actor.id,
  ]);

  if (status !== 'active') {
    // Whatever they are signed in on stops working immediately.
    await db.query('select app.session_revoke_all($1)', [userId]);
  }

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'user.status_changed',
    entityType: 'user',
    entityId: userId,
    changes: { status: { from: before.status, to: status } },
    context: { email: before.email, reason },
  });
}

export async function setUserRoles(
  db: Db,
  ctx: Ctx,
  userId: string,
  roles: RoleCode[],
): Promise<void> {
  if (!holds(ctx.actor, 'USERS_ADMIN')) throw new ForbiddenError('user administration');
  if (roles.length === 0) {
    throw new ValidationError(
      { roles: ['Give them at least one role.'] },
      'A user with no role can sign in and see nothing, which is worse than being disabled.',
    );
  }

  const before = await db.query<{ code: string }>(
    'select r.code from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = $1',
    [userId],
  );

  await db.query(
    `delete from user_roles ur
      using roles r
      where ur.role_id = r.id and ur.user_id = $1 and r.code <> all($2::text[])`,
    [userId, roles],
  );
  for (const role of roles) {
    await db.query(
      `insert into user_roles (user_id, role_id)
       select $1, id from roles where code = $2
       on conflict do nothing`,
      [userId, role],
    );
  }

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'user.roles_changed',
    entityType: 'user',
    entityId: userId,
    changes: { roles: { from: before.map((row) => row.code).sort(), to: [...roles].sort() } },
  });
}

/**
 * A per-user exception to what their role allows.
 *
 * Used sparingly, and recorded loudly: an override is the kind of thing
 * that gets granted for one afternoon and forgotten for two years, so
 * every one of them shows on the user's row in Settings.
 */
export async function setPermissionOverride(
  db: Db,
  ctx: Ctx,
  userId: string,
  permission: string,
  decision: 'grant' | 'deny' | 'clear',
  reason: string | null,
): Promise<void> {
  if (!holds(ctx.actor, 'USERS_ADMIN')) throw new ForbiddenError('user administration');
  if (!isPermission(permission)) {
    throw new ValidationError({ permission: ['That is not a permission.'] });
  }

  if (decision === 'clear') {
    await db.query(
      `delete from user_permission_overrides o
        using permissions p
        where o.permission_id = p.id and o.user_id = $1 and p.code = $2`,
      [userId, permission],
    );
  } else {
    await db.query(
      `insert into user_permission_overrides (user_id, permission_id, effect, reason, created_by)
       select $1, p.id, $3, $4, $5 from permissions p where p.code = $2
       on conflict (user_id, permission_id)
         do update set effect = excluded.effect, reason = excluded.reason`,
      [userId, permission, decision, reason, ctx.actor.id],
    );
  }

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'user.permission_override',
    entityType: 'user',
    entityId: userId,
    context: { permission, decision, reason },
  });
}

export async function updateUserProfile(
  db: Db,
  ctx: Ctx,
  userId: string,
  input: { fullName: string; displayName: string | null; jobTitle: string | null; phone: string | null },
  expectedVersion: number,
): Promise<void> {
  if (!holds(ctx.actor, 'USERS_ADMIN') && userId !== ctx.actor.id) {
    throw new ForbiddenError('that user');
  }

  const updated = await db.count(
    `update users set full_name = $2, display_name = $3, job_title = $4, phone = $5,
            updated_by = $6
      where id = $1 and row_version = $7`,
    [
      userId,
      input.fullName,
      input.displayName,
      input.jobTitle,
      input.phone,
      ctx.actor.id,
      expectedVersion,
    ],
  );
  if (updated === 0) throw new ConcurrencyError();

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'user.profile_updated',
    entityType: 'user',
    entityId: userId,
  });
}

/** Everything a role allows, for the table in Settings. */
export async function rolePermissionMatrix(
  db: Db,
): Promise<{ roles: string[]; byPermission: { permission: Permission; held: string[] }[] }> {
  const rows = await db.query<{ role_code: string; permission: string }>(
    `select r.code as role_code, p.code as permission
       from role_permissions rp
       join roles r on r.id = rp.role_id
       join permissions p on p.id = rp.permission_id
      order by p.code`,
  );

  const byPermission = new Map<string, string[]>();
  for (const row of rows) {
    const held = byPermission.get(row.permission) ?? [];
    held.push(row.role_code);
    byPermission.set(row.permission, held);
  }

  return {
    roles: [...ROLES],
    byPermission: [...byPermission.entries()]
      .filter(([permission]) => isPermission(permission))
      .map(([permission, held]) => ({ permission: permission as Permission, held })),
  };
}
