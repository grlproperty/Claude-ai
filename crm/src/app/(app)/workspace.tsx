'use client';

import { useActionState, useId } from 'react';
import Link from 'next/link';
import {
  deleteViewAction,
  saveViewAction,
  setTagsAction,
  toggleFavouriteAction,
} from './workspace-actions.ts';
import { Badge, Checkbox, Field, Input, Label } from '@/components/ui/primitives.tsx';
import { ConfirmSubmitButton, FormResult, SubmitButton } from '@/components/ui/form.tsx';
import type { SavedView } from '@/lib/workspace.ts';
import type { ActionResult } from '@/lib/action-result.ts';

type State = ActionResult | undefined;

/**
 * The star on a record (spec 89).
 *
 * Private to the person who set it. Row level security keeps favourites
 * to their own user, so management cannot see what somebody starred
 * either — what a person keeps an eye on is not office business.
 */
export function FavouriteButton({
  entityType,
  entityId,
  path,
  isFavourite,
}: {
  entityType: string;
  entityId: string;
  path: string;
  isFavourite: boolean;
}) {
  const [, action] = useActionState<State, FormData>(toggleFavouriteAction, undefined);

  return (
    <form action={action}>
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="path" value={path} />
      <SubmitButton
        size="sm"
        pendingLabel="…"
        aria-label={isFavourite ? 'Remove from your favourites' : 'Add to your favourites'}
      >
        {isFavourite ? '★ Starred' : '☆ Star'}
      </SubmitButton>
    </form>
  );
}

/**
 * Saving the filters somebody is looking at (spec 88).
 *
 * A saved view is a named link and nothing more, so there is no second
 * query language to keep in step with the filters on the page.
 */
export function SaveViewPanel({
  entityType,
  query,
  path,
  views,
}: {
  entityType: string;
  query: string;
  path: string;
  views: SavedView[];
}) {
  const formId = useId();
  const [saveState, save] = useActionState<State, FormData>(saveViewAction, undefined);
  const [deleteState, remove] = useActionState<State, FormData>(deleteViewAction, undefined);

  return (
    <div className="border-t border-line-soft p-4 sm:p-5">
      <FormResult state={saveState} />
      <FormResult state={deleteState} />

      {views.length > 0 ? (
        <ul className="mb-3 flex flex-wrap items-center gap-2">
          {views.map((view) => (
            <li key={view.id} className="flex items-center gap-1">
              <Link
                href={view.href}
                className="tap inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-[0.8125rem] font-medium hover:border-brand hover:text-brand"
              >
                {view.name}
              </Link>
              {view.isShared ? (
                <Badge tone="info">
                  {view.isMine ? 'Shared by you' : `Shared by ${view.ownerName ?? 'a colleague'}`}
                </Badge>
              ) : null}
              {view.isMine ? (
                <form action={remove}>
                  <input type="hidden" name="viewId" value={view.id} />
                  <input type="hidden" name="path" value={path} />
                  <ConfirmSubmitButton
                    size="sm"
                    pendingLabel="…"
                    confirm={`Remove the view "${view.name}"?`}
                  >
                    ×
                  </ConfirmSubmitButton>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <form action={save} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="query" value={query} />
        <input type="hidden" name="path" value={path} />
        <Field
          label="Save these filters as"
          htmlFor={`${formId}-name`}
          hint="A saved view is just this page's filters, named."
        >
          <Input id={`${formId}-name`} name="name" placeholder="My Wilderness sellers" />
        </Field>
        <Label className="text-[0.8125rem]">
          <Checkbox name="isShared" value="on" />
          Share with the office
        </Label>
        <SubmitButton size="sm" pendingLabel="Saving…">
          Save the view
        </SubmitButton>
      </form>
    </div>
  );
}

/** The office's labels on one record (spec 87). */
export function TagPanel({
  entityType,
  entityId,
  path,
  tags,
  selected,
}: {
  entityType: string;
  entityId: string;
  path: string;
  tags: { id: string; name: string; colour: string }[];
  selected: string[];
}) {
  const [state, action] = useActionState<State, FormData>(setTagsAction, undefined);
  const held = new Set(selected);

  return (
    <form action={action} className="space-y-3 border-t border-line-soft p-4 sm:p-5">
      {state ? <FormResult state={state} /> : null}
      <input type="hidden" name="entityType" value={entityType} />
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="path" value={path} />

      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {tags.map((tag) => (
          <Label key={tag.id} className="text-[0.8125rem]">
            <Checkbox name="tagIds" value={tag.id} defaultChecked={held.has(tag.id)} />
            {tag.name}
          </Label>
        ))}
      </div>

      <SubmitButton size="sm" pendingLabel="Saving…">
        Save tags
      </SubmitButton>
    </form>
  );
}
