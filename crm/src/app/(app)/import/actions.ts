'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import { readAsUser, withUser } from '@/lib/db.ts';
import { requestMeta, requirePermission, requireUser } from '@/lib/session.ts';
import { formText, parseOrThrow } from '@/lib/validate.ts';
import { getNumberSetting, setSetting } from '@/lib/settings.ts';
import type { Ctx } from '@/lib/actor.ts';
import {
  cancelImportBatch,
  createImportBatch,
  getImportBatch,
  newBatchSchema,
  saveMapping,
} from '@/lib/import/batches.ts';
import { commitImport, previewImport, rollbackImport } from '@/lib/import/commit.ts';
import { parseCsvSheet, parseSheet } from '@/lib/import/parse.ts';
import { fetchImportUrl } from '@/lib/import/url.ts';
import { fieldsFor } from '@/lib/import/fields.ts';
import type { Mapping } from '@/lib/import/mapping.ts';

async function context(): Promise<Ctx> {
  const user = await requireUser();
  return {
    actor: { id: user.id, email: user.email, permissions: user.permissions },
    meta: await requestMeta(),
  };
}

/**
 * Starting an import.
 *
 * The file is read and its rows stored, but nothing is written to a person or
 * a property: that only happens at commit, after somebody has looked at the
 * preview.
 */
export async function startImportAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  let createdId: string | null = null;

  const result = await runAction<undefined>('import.start', async () => {
    const user = await requirePermission('IMPORT_CREATE', 'imports');
    const ctx = await context();

    const input = parseOrThrow(newBatchSchema, {
      name: formText(formData, 'name'),
      entityType: formText(formData, 'entityType'),
      sourceSystem: formText(formData, 'sourceSystem') || 'generic',
      notes: formText(formData, 'notes'),
    });

    const maxBytes = await readAsUser(user.id, (db) =>
      getNumberSetting(db, 'import.max_bytes', 10 * 1024 * 1024),
    );

    const file = formData.get('file');
    const pasted = formText(formData, 'pasted');
    const sourceUrl = formText(formData, 'sourceUrl');

    let sourceKind: 'file' | 'paste' | 'url';
    let sourceName: string | null = null;
    let bytes: Uint8Array;
    let mediaType: string | null = null;

    if (file instanceof File && file.size > 0) {
      if (file.size > maxBytes) {
        return {
          ok: false as const,
          message: `That file is ${Math.round(file.size / 1024 / 1024)}MB, which is larger than imports allow.`,
        };
      }
      sourceKind = 'file';
      sourceName = file.name;
      mediaType = file.type || null;
      bytes = new Uint8Array(await file.arrayBuffer());
    } else if (sourceUrl) {
      // Every protection for this lives in fetchImportUrl, on the server.
      const fetched = await withUser(user.id, (db) => fetchImportUrl(db, sourceUrl));
      sourceKind = 'url';
      sourceName = fetched.filename;
      mediaType = fetched.mediaType;
      bytes = fetched.bytes;
    } else if (pasted) {
      if (pasted.length > maxBytes) {
        return { ok: false as const, message: 'That is more text than imports allow.' };
      }
      sourceKind = 'paste';
      sourceName = 'Pasted text';
      bytes = new TextEncoder().encode(pasted);
    } else {
      return {
        ok: false as const,
        message: 'Choose a file, paste the rows, or give a web address to fetch.',
      };
    }

    const sheet =
      sourceKind === 'paste'
        ? parseCsvSheet(new TextDecoder().decode(bytes), bytes)
        : await parseSheet({ bytes, filename: sourceName, mediaType });

    const created = await withUser(user.id, (db) =>
      createImportBatch(db, ctx, { ...input, sourceKind, sourceName, sourceUrl: sourceUrl || null }, sheet),
    );
    createdId = created.id;

    const notes = [`${created.batchRef} started with ${sheet.rows.length} rows.`];
    if (created.sameFileAs) {
      notes.push(
        `This is the same file as ${created.sameFileAs.batchRef}${
          created.sameFileAs.committedAt ? ', which was already imported' : ''
        }.`,
      );
    }
    for (const warning of sheet.warnings.slice(0, 3)) notes.push(warning);

    return { ok: true as const, message: notes.join(' ') };
  });

  if (result.ok && createdId) {
    revalidatePath('/import');
    redirect(`/import/${createdId}`);
  }
  return result;
}

/**
 * Saving the column mapping.
 *
 * The form posts one field per column, named for the column. Only columns the
 * file actually has and only real field keys survive; saveMapping checks the
 * columns again against the stored headers, so a stale or edited form cannot
 * introduce a column that was never there.
 */
export async function saveMappingAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const batchId = formText(formData, 'batchId');

  const result = await runAction<undefined>('import.save-mapping', async () => {
    const user = await requirePermission('IMPORT_CREATE', 'imports');
    const ctx = await context();

    const batch = await readAsUser(user.id, (db) => getImportBatch(db, batchId));
    if (!batch) return { ok: false as const, message: 'That import could not be found.' };

    const validKeys = new Set(fieldsFor(batch.entityType).map((field) => field.key));
    const mapping: Mapping = {};
    for (const header of batch.headers) {
      const chosen = formText(formData, `column:${header}`);
      if (chosen && validKeys.has(chosen)) mapping[header] = chosen;
    }

    await withUser(user.id, (db) =>
      saveMapping(db, ctx, batchId, mapping, Number(formText(formData, 'rowVersion'))),
    );
    return {
      ok: true as const,
      message: `${Object.keys(mapping).length} column(s) matched. Now check what it will do.`,
    };
  });

  if (result.ok) revalidatePath(`/import/${batchId}`);
  return result;
}

export async function previewImportAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const batchId = formText(formData, 'batchId');

  const result = await runAction<undefined>('import.preview', async () => {
    const user = await requirePermission('IMPORT_CREATE', 'imports');
    const ctx = await context();
    const outcome = await withUser(user.id, (db) => previewImport(db, ctx, batchId));

    const parts = [`${outcome.create} new`, `${outcome.update} to update`];
    if (outcome.skip > 0) parts.push(`${outcome.skip} to leave alone`);
    if (outcome.error > 0) parts.push(`${outcome.error} that cannot be imported`);
    return {
      ok: true as const,
      message: `Checked: ${parts.join(', ')}. Nothing has been written yet.`,
    };
  });

  if (result.ok) revalidatePath(`/import/${batchId}`);
  return result;
}

export async function commitImportAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const batchId = formText(formData, 'batchId');

  let done: { created: number; updated: number } | null = null;

  const result = await runAction<undefined>('import.commit', async () => {
    const user = await requirePermission('IMPORT_CREATE', 'imports');
    const ctx = await context();

    // withUser runs one transaction, which is what makes this all-or-nothing.
    const outcome = await withUser(user.id, (db) =>
      commitImport(db, ctx, batchId, Number(formText(formData, 'rowVersion'))),
    );
    done = outcome;

    return {
      ok: true as const,
      message: `Imported: ${outcome.created} created, ${outcome.updated} updated.`,
    };
  });

  if (result.ok && done) {
    revalidatePath(`/import/${batchId}`);
    revalidatePath('/people');
    revalidatePath('/properties');
    // The form that showed this message is gone once the import has run, so
    // the outcome is carried on the URL and shown by the page instead.
    const { created, updated } = done as { created: number; updated: number };
    redirect(`/import/${batchId}?imported=${created}.${updated}`);
  }
  return result;
}

export async function rollbackImportAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const batchId = formText(formData, 'batchId');

  let rolled: { archived: number; leftAlone: number } | null = null;

  const result = await runAction<undefined>('import.rollback', async () => {
    const user = await requirePermission('IMPORT_CREATE', 'imports');
    const ctx = await context();
    const outcome = await withUser(user.id, (db) =>
      rollbackImport(
        db,
        ctx,
        batchId,
        formText(formData, 'rollbackReason'),
        Number(formText(formData, 'rowVersion')),
      ),
    );
    rolled = outcome;

    return {
      ok: true as const,
      message:
        `${outcome.archived} record(s) this import created were archived. ` +
        `${outcome.leftAlone} it only updated were left as they are — their earlier values ` +
        'are in the audit log.',
    };
  });

  if (result.ok && rolled) {
    revalidatePath(`/import/${batchId}`);
    revalidatePath('/people');
    revalidatePath('/properties');
    const { archived, leftAlone } = rolled as { archived: number; leftAlone: number };
    redirect(`/import/${batchId}?rolledback=${archived}.${leftAlone}`);
  }
  return result;
}

export async function cancelImportAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const batchId = formText(formData, 'batchId');

  const result = await runAction<undefined>('import.cancel', async () => {
    const user = await requirePermission('IMPORT_CREATE', 'imports');
    const ctx = await context();
    await withUser(user.id, (db) =>
      cancelImportBatch(db, ctx, batchId, Number(formText(formData, 'rowVersion'))),
    );
    return { ok: true as const, message: 'Import cancelled. Nothing was written.' };
  });

  if (result.ok) revalidatePath('/import');
  return result;
}

/**
 * The hosts an import may fetch from.
 *
 * Deliberately administrator-only and deliberately a list rather than a
 * switch: "allow any address" is not offered, because that is the hole.
 */
export async function setAllowedHostsAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('import.set-allowed-hosts', async () => {
    const user = await requirePermission('SETTINGS_ADMIN', 'import settings');
    const ctx = await context();

    const raw = formText(formData, 'hosts');
    const hosts = raw
      .split(/[\s,]+/)
      .map((entry) => entry.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
      .filter((entry) => entry.length > 0);

    const bad = hosts.filter((host) => !/^[a-z0-9.-]+$/.test(host));
    if (bad.length > 0) {
      return { ok: false as const, message: `"${bad[0]}" is not a host name.` };
    }

    await withUser(user.id, (db) => setSetting(db, ctx, 'import.url_allowed_hosts', hosts));
    return {
      ok: true as const,
      message:
        hosts.length === 0
          ? 'Importing from a web address is now switched off.'
          : `Imports may now fetch from ${hosts.join(', ')}.`,
    };
  });

  if (result.ok) revalidatePath('/import/settings');
  return result;
}
