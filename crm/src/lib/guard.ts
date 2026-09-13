import { redirect } from 'next/navigation';
import { getCurrentUser, type CurrentUser } from './session.ts';
import type { Permission } from './permissions.ts';

/**
 * Page-level guards.
 *
 * Server actions and route handlers use requirePermission() from session.ts,
 * which throws. Pages redirect instead, because a signed-out visitor should
 * land on the sign-in screen rather than an error.
 */

export async function requireUserOrRedirect(nextPath?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(nextPath ? `/sign-in?next=${encodeURIComponent(nextPath)}` : '/sign-in');
  }
  return user;
}

export async function requirePermissionOrRedirect(
  permission: Permission,
  nextPath?: string,
): Promise<CurrentUser> {
  const user = await requireUserOrRedirect(nextPath);
  if (!user.permissions.has(permission)) redirect('/no-access');
  return user;
}

export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
