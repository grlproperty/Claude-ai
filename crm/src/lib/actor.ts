import type { Permission } from './permissions.ts';
import type { RequestMeta } from './tokens.ts';

/**
 * Who is doing something, and from where.
 *
 * Passed explicitly into every write so that a data module never has to
 * reach for a request context, which is also what makes them testable.
 */
export interface Actor {
  id: string;
  email: string;
  permissions: ReadonlySet<Permission>;
}

export interface Ctx {
  actor: Actor;
  meta: RequestMeta;
}

export function holds(actor: Actor, permission: Permission): boolean {
  return actor.permissions.has(permission);
}

export const NO_META: RequestMeta = { ip: null, userAgent: null };

/**
 * Which agent a record should be left with after an edit.
 *
 * Row level security confines an agent to their own records, so clearing the
 * agent would hide the record from the very person who just saved it — the
 * write is refused outright by the policy's check. Management, who can see
 * everything, may genuinely leave a record unassigned; an agent keeps the
 * agent it had, or takes it themselves.
 */
export function agentToKeep(
  actor: Actor,
  requested: string | null | undefined,
  existing?: string | null,
): string | null {
  if (requested) return requested;
  if (holds(actor, 'DATA_VIEW_ALL')) return null;
  return existing ?? actor.id;
}
