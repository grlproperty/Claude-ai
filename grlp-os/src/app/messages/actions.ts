'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '../../server/session';
import { intakeMany } from '../../server/whatsapp-intake';
import {
  CannotCreateContactError,
  createContactForThread,
  fileThread,
  settleCommitment,
  type ThreadFiling,
} from '../../server/threads';
import { ForbiddenError } from '../../server/permissions';
import type { CommunicationCategory } from '../../domain/triage';
import type { Priority } from '../../domain/types';
import type { FilingState, ImportReport, UploadState } from './form-state';

const CATEGORIES = [
  'URGENT', 'CLIENT', 'SALES', 'RENTAL', 'STAFF',
  'FINANCE', 'MARKETING', 'PERSONAL', 'INFORMATIONAL', 'LOW_PRIORITY',
] as const;

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

const CONTACT_KINDS = ['LEAD', 'BUYER', 'SELLER', 'LANDLORD', 'TENANT', 'SUPPLIER', 'OTHER'] as const;

/** 25MB. A chat export with a year of photographs in it is still under this. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Takes chat exports straight from the browser.
 *
 * This is the whole point of the upload: on the phone it is Export Chat →
 * share, and on this screen it is drop the file. Nobody has to run a command on
 * a server, which is what stood between Mandy and using any of this.
 */
export async function uploadExports(_previous: UploadState, formData: FormData): Promise<UploadState> {
  const user = await requireUser();

  const uploaded = formData.getAll('exports').filter((f): f is File => f instanceof File && f.size > 0);
  if (!uploaded.length) {
    return { problems: ['Choose at least one exported chat.'], reports: [] };
  }

  const problems: string[] = [];
  const files: Array<{ filename: string; bytes: Uint8Array }> = [];

  for (const file of uploaded) {
    if (file.size > MAX_BYTES) {
      problems.push(`${file.name} is larger than 25MB. Export it again without media.`);
      continue;
    }
    files.push({ filename: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  }

  const results = await intakeMany(files, { channel: 'upload', ownerId: user.id, actorId: user.id });

  const reports: ImportReport[] = results.map((r) => ({
    filename: r.filename,
    ok: r.ok,
    problem: r.problem,
    title: r.thread?.title,
    threadId: r.thread?.threadId,
    messages: r.thread?.messages,
    newMessages: r.thread?.newMessages,
    category: r.thread?.category,
    waitingOnUs: r.thread?.waitingOnUs,
    commitments: r.thread?.commitments,
    tasksCreated: r.thread?.tasksCreated,
    linkedContact: r.thread?.linkedContact ?? null,
  }));

  revalidatePath('/messages');
  return { problems, reports };
}

function optional<T extends readonly string[]>(
  formData: FormData,
  field: string,
  allowed: T,
): T[number] | undefined {
  const raw = formData.get(field);
  if (raw == null) return undefined;
  const value = String(raw).trim();
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T[number]) : undefined;
}

/** Files a conversation: what it is about, whose it is, who it concerns. */
export async function fileThreadAction(_previous: FilingState, formData: FormData): Promise<FilingState> {
  const user = await requireUser();
  const threadId = String(formData.get('threadId') ?? '').trim();
  if (!threadId) return { problems: ['That conversation could not be identified.'], message: null };

  const changes: ThreadFiling = {};

  const category = optional(formData, 'category', CATEGORIES);
  if (category) changes.category = category as CommunicationCategory;

  const importance = optional(formData, 'importance', PRIORITIES);
  if (importance) changes.importance = importance as Priority;

  // These three are clearable, so an empty string means "no longer linked"
  // rather than "leave it as it was".
  for (const field of ['ownerId', 'contactId', 'propertyId'] as const) {
    if (formData.has(field)) changes[field] = String(formData.get(field) ?? '').trim() || null;
  }

  if (formData.has('archived')) changes.archived = String(formData.get('archived')) === 'true';

  try {
    await fileThread(user, threadId, changes);
    revalidatePath(`/messages/${threadId}`);
    revalidatePath('/messages');
    return { problems: [], message: 'Filed.' };
  } catch (error) {
    if (error instanceof ForbiddenError) return { problems: [error.message], message: null };
    throw error;
  }
}

/** Makes a client record from a conversation with someone not on the books. */
export async function createClientAction(_previous: FilingState, formData: FormData): Promise<FilingState> {
  const user = await requireUser();
  const threadId = String(formData.get('threadId') ?? '').trim();
  const kind = optional(formData, 'kind', CONTACT_KINDS) ?? 'LEAD';
  if (!threadId) return { problems: ['That conversation could not be identified.'], message: null };

  try {
    await createContactForThread(user, threadId, kind);
    revalidatePath(`/messages/${threadId}`);
    revalidatePath('/messages');
    return { problems: [], message: 'Client record created, and the conversation is now their history.' };
  } catch (error) {
    if (error instanceof CannotCreateContactError) return { problems: [error.message], message: null };
    if (error instanceof ForbiddenError) return { problems: [error.message], message: null };
    throw error;
  }
}

/** Marks an undertaking as done. */
export async function settleCommitmentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const commitmentId = String(formData.get('commitmentId') ?? '').trim();
  const threadId = String(formData.get('threadId') ?? '').trim();
  if (!commitmentId) return;

  await settleCommitment(user, commitmentId);
  if (threadId) revalidatePath(`/messages/${threadId}`);
  revalidatePath('/messages');
}
