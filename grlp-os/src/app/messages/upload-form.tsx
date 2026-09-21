'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { uploadExports } from './actions';
import { NOTHING_UPLOADED, type UploadState } from './form-state';

/**
 * Getting a conversation in.
 *
 * On the phone: open the chat, tap the name, Export Chat, Without Media, then
 * share it to yourself. Here: drop the file. That is the whole path, and it is
 * the reason this exists — the command-line import was correct and unusable.
 */
export function UploadForm() {
  const [state, formAction, pending] = useActionState<UploadState, FormData>(uploadExports, NOTHING_UPLOADED);
  const imported = state.reports.filter((r) => r.ok);
  const failed = state.reports.filter((r) => !r.ok);

  return (
    <section className="card p-5">
      <p className="eyebrow mb-1">Bring a conversation in</p>
      <h2 className="text-[0.9375rem] font-semibold">Upload a chat export</h2>

      <form action={formAction} className="mt-3.5">
        <label className="block">
          <span className="sr-only">Exported chats</span>
          <input
            type="file"
            name="exports"
            multiple
            accept=".txt,.zip,text/plain,application/zip"
            className="block w-full cursor-pointer rounded border border-dashed border-line bg-surface-sunken px-3 py-4 text-sm file:mr-3 file:rounded file:border-0 file:bg-maroon file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:border-maroon"
          />
        </label>

        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          On the phone: open the chat → tap the name → <strong className="font-medium">Export Chat</strong> →{' '}
          <strong className="font-medium">Without Media</strong> → send it to yourself. Both the .txt and the .zip
          work, and several at once is fine. Re-uploading a chat you already have adds only what is new.
        </p>

        <button
          type="submit"
          disabled={pending}
          className="mt-3 rounded bg-maroon px-4 py-2 text-sm font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-50"
        >
          {pending ? 'Reading…' : 'Import'}
        </button>
      </form>

      {state.problems.length ? (
        <ul className="mt-3 space-y-1 rounded border border-maroon-200 bg-maroon-50 px-3 py-2">
          {state.problems.map((p) => (
            <li key={p} className="text-sm text-maroon">{p}</li>
          ))}
        </ul>
      ) : null}

      {failed.length ? (
        <ul className="mt-3 space-y-1.5 rounded border border-maroon-200 bg-maroon-50 px-3 py-2">
          {failed.map((r) => (
            <li key={r.filename} className="text-sm text-maroon">
              <strong className="font-semibold">{r.filename}</strong> — {r.problem}
            </li>
          ))}
        </ul>
      ) : null}

      {imported.length ? (
        <ul className="mt-3 space-y-2 rounded border border-line bg-surface-sunken px-3 py-2.5">
          {imported.map((r) => (
            <li key={r.filename} className="text-sm">
              <Link href={`/messages/${r.threadId}`} className="font-medium text-maroon hover:underline">
                {r.title}
              </Link>
              <span className="text-ink-soft">
                {' '}
                — {r.newMessages === 0 ? 'nothing new' : `${r.newMessages} new of ${r.messages} messages`}
                {r.linkedContact ? `, filed under ${r.linkedContact}` : ''}
                {r.commitments ? `, ${r.commitments} undertaking${r.commitments === 1 ? '' : 's'}` : ''}
                {r.tasksCreated ? `, ${r.tasksCreated} task${r.tasksCreated === 1 ? '' : 's'} raised` : ''}
                {r.waitingOnUs ? '. They are waiting on a reply.' : '.'}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
