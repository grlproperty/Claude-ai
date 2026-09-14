'use server';

import { revalidatePath } from 'next/cache';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import { withUser } from '@/lib/db.ts';
import { requestMeta, requireUser } from '@/lib/session.ts';
import { formText } from '@/lib/validate.ts';
import { markAllRead, markRead } from '@/lib/notifications.ts';
import type { Ctx } from '@/lib/actor.ts';

async function context(): Promise<Ctx> {
  const user = await requireUser();
  return {
    actor: { id: user.id, email: user.email, permissions: user.permissions },
    meta: await requestMeta(),
  };
}

export async function markReadAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('notification.read', async () => {
    const ctx = await context();
    await withUser(ctx.actor.id, (db) => markRead(db, ctx, formText(formData, 'id')));
    return { ok: true as const, message: 'Marked as read.' };
  });

  if (result.ok) {
    revalidatePath('/notifications');
    revalidatePath('/');
  }
  return result;
}

export async function markAllReadAction(
  _previous: ActionResult | undefined,
  _formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('notification.read-all', async () => {
    const ctx = await context();
    const count = await withUser(ctx.actor.id, (db) => markAllRead(db, ctx));
    return { ok: true as const, message: `${count} marked as read.` };
  });

  if (result.ok) {
    revalidatePath('/notifications');
    revalidatePath('/');
  }
  return result;
}
