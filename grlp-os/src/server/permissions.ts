import type { DataDomain, Department, Role } from '../domain/types';

/**
 * Role-based access control (§38).
 *
 * Two rules do most of the work:
 *   - Least privilege: a person sees their own department's operational data and
 *     their own work. Only the CEO sees across the whole business.
 *   - Personal data is the CEO's alone. No member of staff, and no agent acting
 *     for a member of staff, can read it (§30).
 *
 * The AI is not a privilege escalation: an agent acting for a user gets exactly
 * that user's permissions, never more.
 */

export type Permission =
  | 'view:own_work'
  | 'view:department'
  | 'view:all_business'
  | 'view:personal'
  | 'manage:staff'
  | 'approve:mandate'
  | 'approve:otp'
  | 'approve:market_assessment'
  | 'approve:commission'
  | 'manage:templates'
  | 'manage:integrations'
  | 'manage:workflows'
  | 'view:audit'
  | 'act:as_ai';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  CEO: [
    'view:own_work',
    'view:department',
    'view:all_business',
    'view:personal',
    'manage:staff',
    'approve:mandate',
    'approve:otp',
    'approve:market_assessment',
    'approve:commission',
    'manage:templates',
    'manage:integrations',
    'manage:workflows',
    'view:audit',
    'act:as_ai',
  ],
  SALES_AGENT: ['view:own_work', 'view:department', 'approve:mandate', 'approve:otp', 'act:as_ai'],
  RENTALS: ['view:own_work', 'view:department', 'act:as_ai'],
  ACCOUNTS: ['view:own_work', 'view:department', 'approve:commission', 'act:as_ai'],
  MARKETING_ADMIN: ['view:own_work', 'view:department', 'act:as_ai'],
  OPERATIONS: ['view:own_work', 'view:department', 'act:as_ai'],
  SYSTEM: ['act:as_ai'],
};

export interface Principal {
  id: string;
  name: string;
  role: Role;
  department: Department;
  isCeo: boolean;
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
  readonly status = 403;
  constructor(readonly permission: Permission | string) {
    super(`You do not have permission to do this (${permission}).`);
    this.name = 'ForbiddenError';
  }
}

export function can(principal: Principal, permission: Permission): boolean {
  return ROLE_PERMISSIONS[principal.role].includes(permission);
}

export function require_(principal: Principal, permission: Permission): void {
  if (!can(principal, permission)) throw new ForbiddenError(permission);
}

/** Personal data belongs to one person and is never visible to anyone else. */
export function canReadDomain(principal: Principal, domain: DataDomain, ownerId: string | null): boolean {
  if (domain === 'BUSINESS') return true;
  return ownerId != null && ownerId === principal.id;
}

/**
 * The scope clause every business query is filtered by. The CEO sees the
 * business; everyone else sees their department and their own work.
 */
export interface Scope {
  allBusiness: boolean;
  department: Department | null;
  userId: string;
}

export function scopeFor(principal: Principal): Scope {
  return {
    allBusiness: can(principal, 'view:all_business'),
    department: can(principal, 'view:department') ? principal.department : null,
    userId: principal.id,
  };
}

/**
 * Builds the Prisma `where` fragment for records that carry an owner and a
 * department. Kept here so no route can forget to apply it.
 */
export function ownershipWhere(scope: Scope, fields: { ownerField?: string; departmentField?: string } = {}) {
  if (scope.allBusiness) return {};
  const ownerField = fields.ownerField ?? 'ownerId';
  const or: Array<Record<string, unknown>> = [{ [ownerField]: scope.userId }];
  if (scope.department && fields.departmentField) {
    or.push({ [fields.departmentField]: scope.department });
  }
  return { OR: or };
}

/**
 * An agent acting for a user gets that user's permissions and no more. There is
 * no service account that can read everything.
 */
export function principalForAgent(actingFor: Principal): Principal {
  return { ...actingFor };
}
