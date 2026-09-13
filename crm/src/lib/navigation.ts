import type { IconName } from '@/components/icons.tsx';
import type { Permission } from './permissions.ts';

/**
 * Main navigation (spec 81). Kept deliberately short and in business order,
 * not alphabetised, so an agent's daily route through the CRM is the obvious
 * one. Each entry names the permission that reveals it; the server checks the
 * same permission again on the page itself.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Shown when the user holds any one of these. */
  permissions: Permission[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: 'dashboard', permissions: [] },
  { href: '/people', label: 'People', icon: 'people', permissions: ['PEOPLE_VIEW'] },
  { href: '/properties', label: 'Properties', icon: 'property', permissions: ['PROPERTIES_VIEW'] },
  { href: '/sales', label: 'Sales', icon: 'sales', permissions: ['SALES_VIEW'] },
  { href: '/rentals', label: 'Rentals', icon: 'rentals', permissions: ['RENTALS_VIEW'] },
  { href: '/leads', label: 'Leads', icon: 'leads', permissions: ['LEADS_VIEW'] },
  { href: '/tasks', label: 'Tasks', icon: 'tasks', permissions: ['TASKS_VIEW'] },
  { href: '/calendar', label: 'Calendar', icon: 'calendar', permissions: ['TASKS_VIEW'] },
  {
    href: '/communications',
    label: 'Communications',
    icon: 'communications',
    permissions: ['COMMUNICATION_VIEW'],
  },
  { href: '/compliance', label: 'Compliance', icon: 'compliance', permissions: ['COMPLIANCE_VIEW'] },
  { href: '/fica', label: 'FICA', icon: 'fica', permissions: ['FICA_VIEW'] },
  { href: '/import', label: 'Import Data', icon: 'import', permissions: ['IMPORT_VIEW'] },
  { href: '/commissions', label: 'Commissions', icon: 'commission', permissions: ['COMMISSION_VIEW'] },
  { href: '/reports', label: 'Reports', icon: 'reports', permissions: ['REPORTS_VIEW'] },
  { href: '/settings', label: 'Settings', icon: 'settings', permissions: [] },
];

export function visibleNavItems(held: ReadonlySet<Permission>): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => item.permissions.length === 0 || item.permissions.some((p) => held.has(p)),
  );
}

/** Quick add (spec 88). Person and property creation always runs a duplicate check first. */
export interface QuickAddItem {
  href: string;
  label: string;
  hint?: string;
  permission: Permission;
}

export const QUICK_ADD: QuickAddItem[] = [
  { href: '/people/new', label: 'Person', hint: 'Runs a duplicate check', permission: 'PEOPLE_CREATE' },
  {
    href: '/properties/new',
    label: 'Property',
    hint: 'Runs a duplicate check',
    permission: 'PROPERTIES_CREATE',
  },
  { href: '/leads/new', label: 'Lead', permission: 'LEADS_CREATE' },
  { href: '/tasks/new', label: 'Task', permission: 'TASKS_CREATE' },
  { href: '/calendar/new', label: 'Appointment', permission: 'TASKS_CREATE' },
  { href: '/communications/new', label: 'Log communication', permission: 'COMMUNICATION_CREATE' },
];
