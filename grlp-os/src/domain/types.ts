/**
 * Shared domain types.
 *
 * These are deliberately independent of Prisma so the engines can be reasoned
 * about and unit-tested without a database. The persistence layer maps to and
 * from them.
 */

export type ApprovalLevel =
  | 'AUTO'
  | 'AUTO_WITH_RULES'
  | 'REVIEW'
  | 'APPROVAL'
  | 'SIGNATURE'
  | 'MANDY_ONLY';

export type OwnerType = 'AI' | 'AUTOMATION' | 'USER' | 'EXTERNAL';
export type EscalationLevel = 'L1_STAFF' | 'L2_MANAGEMENT' | 'L3_CEO';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type NotificationTier = 'INFORMATION' | 'ATTENTION' | 'DECISION' | 'URGENT';
export type DataDomain = 'BUSINESS' | 'PERSONAL';

export type Role =
  | 'CEO'
  | 'SALES_AGENT'
  | 'RENTALS'
  | 'ACCOUNTS'
  | 'MARKETING_ADMIN'
  | 'OPERATIONS'
  | 'SYSTEM';

export type Department =
  | 'EXECUTIVE'
  | 'SALES'
  | 'RENTALS'
  | 'ACCOUNTS'
  | 'MARKETING'
  | 'OPERATIONS';

/**
 * Risk signals that can force a matter upward regardless of what the work
 * catalogue says. These are the only reasons the CEO is pulled in for work
 * that would otherwise be handled below her.
 */
export type RiskFlag =
  | 'LEGAL_OR_COMPLIANCE'
  | 'SIGNIFICANT_FINANCIAL'
  | 'MAJOR_CLIENT_RELATIONSHIP'
  | 'STAFF_MANAGEMENT'
  | 'BUSINESS_STRATEGY'
  | 'PROFESSIONAL_JUDGEMENT'
  | 'UNRESOLVED_EXCEPTION'
  | 'REPUTATIONAL';

/** A person the routing engine can assign work to. */
export interface StaffMember {
  id: string;
  name: string;
  role: Role;
  department: Department;
  active: boolean;
  isCeo: boolean;
  acceptsDelegation: boolean;
  weeklyCapacityHours: number;
  /** Committed hours already on this person's plate for the current week. */
  committedHours: number;
  /** Count of items already past their due date. A poor sign for more work. */
  overdueCount: number;
  /** True while an absence period covers "now". */
  away: boolean;
}

/** Everything the routing engine knows about one piece of work. */
export interface WorkContext {
  /** The agent who owns the property / lead / client this work belongs to. */
  relationshipOwnerId?: string | null;
  /** Rand value at stake, where the work has one. */
  valueZar?: number | null;
  urgency?: Priority;
  riskFlags?: RiskFlag[];
  /** Inputs the system needs but does not have. Blocks AI completion. */
  missingInputs?: string[];
  /** Set when a person has already tried and could not resolve it. */
  unresolvedByStaff?: boolean;
  /** Personal work never routes to company staff. */
  domain?: DataDomain;
  dueAt?: Date | null;
}

export interface RoutingDecision {
  ownerType: OwnerType;
  ownerId: string | null;
  ownerName: string | null;
  /** Who must approve or sign the output, when approval is required. */
  approverId: string | null;
  approverName: string | null;
  department: Department;
  requiredApproval: ApprovalLevel;
  escalationLevel: EscalationLevel;
  /** How much of the CEO's attention this genuinely needs. */
  ceoInvolvement: 'none' | 'informed' | 'approval' | 'decision';
  priority: Priority;
  estimatedMinutes: number;
  /** Minutes of human work avoided if this is completed by AI or automation. */
  minutesSavedIfAutomated: number;
  nextAction: string;
  /** Plain-language explanation, shown in the UI. Routing is never opaque. */
  rationale: string;
  /** Set when the engine deliberately declined to guess an owner. */
  needsOwnershipDecision: boolean;
}
