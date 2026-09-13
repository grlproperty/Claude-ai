/**
 * The granular permission catalogue (spec 9), mirrored from migration 002.
 *
 * Everything in the UI and every server action refers to these codes. The
 * database holds the same list and enforces it independently, so a missing
 * check here is a bug, not a breach.
 */

export const PERMISSIONS = [
  'PEOPLE_VIEW', 'PEOPLE_CREATE', 'PEOPLE_EDIT', 'PEOPLE_DELETE',
  'PROPERTIES_VIEW', 'PROPERTIES_CREATE', 'PROPERTIES_EDIT', 'PROPERTIES_DELETE',
  'SALES_VIEW', 'SALES_CREATE', 'SALES_EDIT', 'SALES_DELETE',
  'RENTALS_VIEW', 'RENTALS_CREATE', 'RENTALS_EDIT', 'RENTALS_DELETE',
  'LEADS_VIEW', 'LEADS_CREATE', 'LEADS_EDIT', 'LEADS_DELETE',
  'TASKS_VIEW', 'TASKS_CREATE', 'TASKS_EDIT', 'TASKS_DELETE',
  'IMPORT_VIEW', 'IMPORT_CREATE',
  'COMMUNICATION_VIEW', 'COMMUNICATION_CREATE',
  'FICA_VIEW', 'FICA_CREATE', 'FICA_EDIT',
  'COMPLIANCE_VIEW', 'COMPLIANCE_CREATE', 'COMPLIANCE_EDIT',
  'NCC_ADMIN',
  'MARKETING_ADMIN',
  'COMMISSION_VIEW', 'COMMISSION_CREATE', 'COMMISSION_EDIT', 'COMMISSION_APPROVE',
  'REPORTS_VIEW', 'REPORTS_EXPORT',
  'USERS_ADMIN', 'SETTINGS_ADMIN',
  'AUDIT_LOG_VIEW',
  'DATA_VIEW_ALL', 'PERSON_ID_VIEW', 'MERGE_RECORDS', 'EXPORT_SENSITIVE',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ['MANAGEMENT', 'ADMIN', 'ACCOUNTS', 'AGENT', 'LIMITED'] as const;
export type RoleCode = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  MANAGEMENT: 'Management',
  ADMIN: 'Admin',
  ACCOUNTS: 'Accounts / FICA Officer',
  AGENT: 'Agent',
  LIMITED: 'Limited / Support',
};

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
