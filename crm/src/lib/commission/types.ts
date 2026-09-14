/**
 * Commission vocabulary (spec 61 to 66, 141).
 *
 * The words and the statuses, kept in one place so nothing in the CRM has
 * to guess at them. The distinction that matters most is between a
 * commission worked out, a commission approved, and a commission somebody
 * has recorded as paid: three different things that must never be added
 * together.
 */

export const COMMISSION_BASES = {
  percent_of_value: 'A percentage of the price',
  fixed_amount: 'A fixed amount',
  months_of_rent: "Months of the tenant's rent",
  percent_of_annual_rent: "A percentage of a year's rent",
} as const;
export type CommissionBasis = keyof typeof COMMISSION_BASES;

export const COMMISSION_STATUSES = {
  draft: 'Being worked out',
  submitted: 'Waiting for approval',
  approved: 'Approved',
  rejected: 'Sent back',
  invoiced: 'Invoiced',
  paid: 'Recorded as paid',
  cancelled: 'Cancelled',
} as const;
export type CommissionStatus = keyof typeof COMMISSION_STATUSES;

export const SPLIT_ROLES = {
  primary: 'Primary agent',
  sharing: 'Sharing agent',
  referral: 'Referral',
  introducer: 'Introducer',
  office: 'The office',
} as const;
export type SplitRole = keyof typeof SPLIT_ROLES;

export const RULE_APPLIES_TO = { sale: 'Sales', rental: 'Rentals' } as const;

/** The keys of a label map, shaped for a zod enum. */
export const keys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]];

/** Which statuses a commission may move to from where it is now. */
const NEXT_STATUSES: Record<CommissionStatus, CommissionStatus[]> = {
  draft: ['draft', 'submitted', 'cancelled'],
  submitted: ['submitted', 'approved', 'rejected', 'draft', 'cancelled'],
  approved: ['approved', 'invoiced', 'paid', 'cancelled'],
  rejected: ['rejected', 'draft', 'submitted', 'cancelled'],
  invoiced: ['invoiced', 'paid', 'cancelled'],
  paid: ['paid'],
  cancelled: ['cancelled'],
};

export function mayMoveTo(from: CommissionStatus, to: CommissionStatus): boolean {
  return (NEXT_STATUSES[from] ?? []).includes(to);
}
