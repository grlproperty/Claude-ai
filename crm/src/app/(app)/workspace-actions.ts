'use server';

import { revalidatePath } from 'next/cache';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import { withUser } from '@/lib/db.ts';
import { requestMeta, requireUser } from '@/lib/session.ts';
import { formBool, formText, parseOrThrow } from '@/lib/validate.ts';
import {
  deleteSavedView,
  savedViewInputSchema,
  saveView,
  setTags,
  toggleFavourite,
} from '@/lib/workspace.ts';
import type { Ctx } from '@/lib/actor.ts';

/**
 * The small actions that belong to no one page (spec 87, 88, 89).
 *
 * A star, a saved view, a set of tags. Favourites and saved views are
 * scoped to the acting user by row level security, so none of these can
 * touch somebody else's.
 */

async function context(): Promise<Ctx> {
  const user = await requireUser();
  return {
    actor: { id: user.id, email: user.email, permissions: user.permissions },
    meta: await requestMeta(),
  };
}

export async function toggleFavouriteAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const path = formText(formData, 'path');

  const result = await runAction<undefined>('favourite.toggle', async () => {
    const ctx = await context();
    const outcome = await withUser(ctx.actor.id, (db) =>
      toggleFavourite(db, ctx, formText(formData, 'entityType'), formText(formData, 'entityId')),
    );
    return {
      ok: true as const,
      message: outcome === 'added' ? 'Starred. Only you can see this.' : 'No longer starred.',
    };
  });

  if (result.ok) {
    if (path) revalidatePath(path);
    revalidatePath('/');
  }
  return result;
}

export async function saveViewAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('view.save', async () => {
    const ctx = await context();
    const input = parseOrThrow(savedViewInputSchema, {
      name: formText(formData, 'name'),
      entityType: formText(formData, 'entityType'),
      query: formText(formData, 'query'),
      isShared: formBool(formData, 'isShared'),
    });
    await withUser(ctx.actor.id, (db) => saveView(db, ctx, input));
    return {
      ok: true as const,
      message: input.isShared
        ? 'Saved, and shared with the office.'
        : 'Saved. Only you can see it.',
    };
  });

  if (result.ok) revalidatePath(formText(formData, 'path') || '/');
  return result;
}

export async function deleteViewAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('view.delete', async () => {
    const ctx = await context();
    await withUser(ctx.actor.id, (db) => deleteSavedView(db, formText(formData, 'viewId')));
    return { ok: true as const, message: 'View removed.' };
  });

  if (result.ok) revalidatePath(formText(formData, 'path') || '/');
  return result;
}

export async function setTagsAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const path = formText(formData, 'path');

  const result = await runAction<undefined>('tags.set', async () => {
    const ctx = await context();
    const entityType = formText(formData, 'entityType');
    const entityId = formText(formData, 'entityId');
    const tagIds = formData
      .getAll('tagIds')
      .filter((value): value is string => typeof value === 'string' && value.length > 0);

    await withUser(ctx.actor.id, (db) => setTags(db, ctx, entityType, entityId, tagIds));
    return { ok: true as const, message: 'Tags saved.' };
  });

  if (result.ok && path) revalidatePath(path);
  return result;
}
