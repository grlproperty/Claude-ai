'use server';

import { revalidatePath } from 'next/cache';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import { withUser } from '@/lib/db.ts';
import { requestMeta, requirePermission, requireUser } from '@/lib/session.ts';
import { formBool, formList, formText, parseOrThrow } from '@/lib/validate.ts';
import { setSetting } from '@/lib/settings.ts';
import {
  createTag,
  setTagActive,
  tagInputSchema,
} from '@/lib/workspace.ts';
import {
  inviteUser,
  inviteInputSchema,
  revokeInvitation,
  setPermissionOverride,
  setUserRoles,
  setUserStatus,
  type UserStatus,
} from '@/lib/users.ts';
import type { RoleCode } from '@/lib/permissions.ts';
import type { Ctx } from '@/lib/actor.ts';

async function context(): Promise<Ctx> {
  const user = await requireUser();
  return {
    actor: { id: user.id, email: user.email, permissions: user.permissions },
    meta: await requestMeta(),
  };
}

/**
 * Inviting somebody.
 *
 * The link comes back in the result because the CRM cannot send it: there
 * is no mail server (spec 6, 115). Whoever invited them passes it on, and
 * the message says so rather than implying an email went out.
 */
export async function inviteUserAction(
  _previous: ActionResult<{ link: string }> | undefined,
  formData: FormData,
): Promise<ActionResult<{ link: string }>> {
  const result = await runAction<{ link: string }>('user.invite', async () => {
    const user = await requirePermission('USERS_ADMIN', 'user administration');
    const ctx = await context();
    const input = parseOrThrow(inviteInputSchema, {
      email: formText(formData, 'email'),
      fullName: formText(formData, 'fullName'),
      role: formText(formData, 'role'),
      jobTitle: formText(formData, 'jobTitle'),
    });

    const invitation = await withUser(user.id, (db) => inviteUser(db, ctx, input));
    const origin = formText(formData, 'origin');
    const link = `${origin}/invite/${invitation.token}`;

    return {
      ok: true as const,
      message:
        `${invitation.email} has been invited. THE CRM HAS NOT SENT ANYTHING — `
        + 'copy the link below and give it to them yourself. It works once and lasts seven days.',
      data: { link },
    };
  });

  if (result.ok) revalidatePath('/settings/users');
  return result;
}

export async function revokeInvitationAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('user.revoke-invitation', async () => {
    const user = await requirePermission('USERS_ADMIN', 'user administration');
    const ctx = await context();
    await withUser(user.id, (db) => revokeInvitation(db, ctx, formText(formData, 'invitationId')));
    return { ok: true as const, message: 'That link no longer works.' };
  });

  if (result.ok) revalidatePath('/settings/users');
  return result;
}

export async function setUserStatusAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('user.set-status', async () => {
    const user = await requirePermission('USERS_ADMIN', 'user administration');
    const ctx = await context();
    const status = formText(formData, 'status') as UserStatus;
    await withUser(user.id, (db) =>
      setUserStatus(db, ctx, formText(formData, 'userId'), status, formText(formData, 'reason') || null),
    );
    return {
      ok: true as const,
      message:
        status === 'active'
          ? 'Reactivated. They can sign in again.'
          : 'Done. They cannot sign in, and everything they did stays on the record.',
    };
  });

  if (result.ok) revalidatePath('/settings/users');
  return result;
}

export async function setUserRolesAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('user.set-roles', async () => {
    const user = await requirePermission('USERS_ADMIN', 'user administration');
    const ctx = await context();
    await withUser(user.id, (db) =>
      setUserRoles(db, ctx, formText(formData, 'userId'), formList(formData, 'roles') as RoleCode[]),
    );
    return { ok: true as const, message: 'Roles saved.' };
  });

  if (result.ok) revalidatePath('/settings/users');
  return result;
}

export async function setOverrideAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('user.set-override', async () => {
    const user = await requirePermission('USERS_ADMIN', 'user administration');
    const ctx = await context();
    await withUser(user.id, (db) =>
      setPermissionOverride(
        db,
        ctx,
        formText(formData, 'userId'),
        formText(formData, 'permission'),
        formText(formData, 'decision') as 'grant' | 'deny' | 'clear',
        formText(formData, 'reason') || null,
      ),
    );
    return { ok: true as const, message: 'Saved, and recorded in the audit log.' };
  });

  if (result.ok) revalidatePath('/settings/users');
  return result;
}

export async function setSettingAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('setting.set', async () => {
    const user = await requirePermission('SETTINGS_ADMIN', 'settings');
    const ctx = await context();
    const key = formText(formData, 'key');
    const raw = formText(formData, 'value');
    const kind = formText(formData, 'kind');

    // Typed by the form rather than guessed from the text, so "false"
    // cannot quietly become the string "false".
    const value: unknown =
      kind === 'number'
        ? Number(raw)
        : kind === 'boolean'
          ? formBool(formData, 'value')
          : kind === 'json'
            ? JSON.parse(raw || 'null')
            : raw;

    if (kind === 'number' && !Number.isFinite(value as number)) {
      return { ok: false as const, message: 'That needs to be a number.' };
    }

    await withUser(user.id, (db) => setSetting(db, ctx, key, value));
    return { ok: true as const, message: 'Saved. It takes effect immediately.' };
  });

  if (result.ok) {
    revalidatePath('/settings/business');
    revalidatePath('/settings/system');
  }
  return result;
}

export async function createTagAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('tag.create', async () => {
    const user = await requirePermission('SETTINGS_ADMIN', 'tags');
    const ctx = await context();
    await withUser(user.id, (db) =>
      createTag(
        db,
        ctx,
        parseOrThrow(tagInputSchema, {
          name: formText(formData, 'name'),
          colour: formText(formData, 'colour') || 'neutral',
        }),
      ),
    );
    return { ok: true as const, message: 'Tag added.' };
  });

  if (result.ok) revalidatePath('/settings/tags');
  return result;
}

export async function setTagActiveAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('tag.set-active', async () => {
    const user = await requirePermission('SETTINGS_ADMIN', 'tags');
    const active = formBool(formData, 'isActive');
    await withUser(user.id, (db) => setTagActive(db, formText(formData, 'tagId'), active));
    return {
      ok: true as const,
      message: active
        ? 'Back in use.'
        : 'Retired. It stays on every record that already carries it.',
    };
  });

  if (result.ok) revalidatePath('/settings/tags');
  return result;
}
