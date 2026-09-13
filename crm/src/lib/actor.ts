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
