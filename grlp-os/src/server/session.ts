import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, resolveSession } from './auth';
import type { Principal } from './permissions';

/** Reads the signed-in person, or null. Safe to call from any server component. */
export async function currentUser(): Promise<Principal | null> {
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value);
}

/** Reads the signed-in person, or sends them to sign in. */
export async function requireUser(): Promise<Principal> {
  const user = await currentUser();
  if (!user) redirect('/sign-in');
  return user;
}
