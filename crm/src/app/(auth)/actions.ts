'use server';

import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import {
  acceptInvitation,
  completeBootstrap,
  signInWithPassword,
} from '@/lib/auth.ts';
import { endSession, requestMeta, startSession } from '@/lib/session.ts';

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Where to send someone after they sign in, refusing anything off-site. */
function safeNext(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export async function signInAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const next = safeNext(text(formData, 'next'));

  const result = await runAction('sign-in', async () => {
    const meta = await requestMeta();
    const user = await signInWithPassword({
      email: text(formData, 'email'),
      password: text(formData, 'password'),
      meta,
    });
    await startSession(user.userId);
    return { ok: true as const };
  });

  if (result.ok) redirect(next);
  return result;
}

export async function setupAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction('setup', async () => {
    const meta = await requestMeta();
    const password = text(formData, 'password');
    if (password !== text(formData, 'confirmPassword')) {
      return {
        ok: false as const,
        message: 'The two passwords do not match.',
        fieldErrors: { confirmPassword: ['The two passwords do not match.'] },
      };
    }
    const userId = await completeBootstrap({
      email: text(formData, 'email'),
      fullName: text(formData, 'fullName'),
      password,
      meta,
    });
    await startSession(userId);
    return { ok: true as const };
  });

  if (result.ok) redirect('/');
  return result;
}

export async function acceptInvitationAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction('accept-invitation', async () => {
    const meta = await requestMeta();
    const password = text(formData, 'password');
    if (password !== text(formData, 'confirmPassword')) {
      return {
        ok: false as const,
        message: 'The two passwords do not match.',
        fieldErrors: { confirmPassword: ['The two passwords do not match.'] },
      };
    }
    const userId = await acceptInvitation({
      token: text(formData, 'token'),
      password,
      meta,
    });
    await startSession(userId);
    return { ok: true as const };
  });

  if (result.ok) redirect('/');
  return result;
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect('/sign-in');
}
