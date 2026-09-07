import type { ApprovalLevel, Department, Priority, Role } from './types';

/**
 * What the AI is allowed to do with a kind of work.
 *
 *  COMPLETE — the AI finishes it end to end. A human sees the outcome, not the work.
 *  PREPARE  — the AI produces the finished work product; an authorised human
 *             reviews, approves and (where required) signs it.
 *  ASSIST   — the AI can gather and draft, but the substantive act is human.
 *  NONE     — human only. The AI may not act.
 */
export type AiCapability = 'COMPLETE' | 'PREPARE' | 'ASSIST' | 'NONE';

export interface WorkKindSpec {
  key: string;
  label: string;
  department: Department;
  /** Roles that may own this work. Order is preference order. */
  roles: Role[];
  aiCapability: AiCapability;
  /** True when the work is deterministic enough for a rule, with no judgement. */
  automatable: boolean;
  /** Approval required before the output has effect. */
  requiredApproval: ApprovalLevel;
  /** The CEO's own authority is inherent to this work, whatever its value. */
  ceoAuthorityRequired: boolean;
  /** Rand value at or above which this must reach the CEO regardless of kind. */
  ceoFinancialThresholdZar?: number;
  /** Minutes a person would spend doing this by hand. Drives the saved-time metric. */
  manualMinutes: number;
  /** Inputs without which the AI cannot complete the work. */
  requiredInputs: string[];
  defaultPriority: Priority;
  /**
   * Explicitly true for work that must never land on the CEO as routine, even
   * if she is the only person free. Routine rental administration is the
   * clearest example.
   */
  neverRoutineForCeo: boolean;
}

const spec = (s: WorkKindSpec): WorkKindSpec => s;

/**
 * The catalogue is data, not code paths. GRLP can add a kind of work — and the
 * routing, approval and time-saving behaviour follows — without touching the
 * engine.
 */
export const WORK_CATALOGUE: Record<string, WorkKindSpec> = Object.fromEntries(
  [
    // ── sales administration ───────────────────────────────────────────────
    spec({
      key: 'market_assessment.prepare',
      label: 'Prepare market assessment (CMA)',
      department: 'SALES',
      roles: ['CEO', 'SALES_AGENT'],
      aiCapability: 'PREPARE',
      automatable: false,
      // Pricing a client's home is professional judgement. The AI does the
      // analysis; the valuation opinion stays with the CEO.
      requiredApproval: 'MANDY_ONLY',
      ceoAuthorityRequired: true,
      manualMinutes: 120,
      requiredInputs: ['property.addressLine', 'property.propertyType', 'comparables'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: false,
    }),
    spec({
      key: 'mandate.prepare',
      label: 'Prepare mandate package',
      department: 'SALES',
      roles: ['CEO', 'SALES_AGENT'],
      aiCapability: 'PREPARE',
      automatable: false,
      requiredApproval: 'APPROVAL',
      ceoAuthorityRequired: false,
      ceoFinancialThresholdZar: 5_000_000,
      manualMinutes: 75,
      requiredInputs: ['property.addressLine', 'seller.fullName', 'seller.idNumber', 'listPrice'],
      defaultPriority: 'HIGH',
      neverRoutineForCeo: false,
    }),
    spec({
      key: 'otp.prepare',
      label: 'Prepare offer to purchase',
      department: 'SALES',
      roles: ['CEO', 'SALES_AGENT'],
      aiCapability: 'PREPARE',
      automatable: false,
      // An OTP creates binding obligations. It is prepared by the system and
      // signed by people — never the other way round.
      requiredApproval: 'SIGNATURE',
      ceoAuthorityRequired: false,
      ceoFinancialThresholdZar: 5_000_000,
      manualMinutes: 90,
      requiredInputs: ['buyer.fullName', 'buyer.idNumber', 'property.addressLine', 'offer.amount'],
      defaultPriority: 'URGENT',
      neverRoutineForCeo: false,
    }),
    spec({
      key: 'otp.validate',
      label: 'Validate incoming offer to purchase',
      department: 'SALES',
      roles: ['SALES_AGENT', 'OPERATIONS'],
      aiCapability: 'COMPLETE',
      automatable: false,
      requiredApproval: 'REVIEW',
      ceoAuthorityRequired: false,
      manualMinutes: 35,
      requiredInputs: ['document'],
      defaultPriority: 'URGENT',
      neverRoutineForCeo: false,
    }),
    spec({
      key: 'listing.publish',
      label: 'Publish listing to portals',
      department: 'MARKETING',
      roles: ['MARKETING_ADMIN'],
      aiCapability: 'PREPARE',
      automatable: false,
      requiredApproval: 'REVIEW',
      ceoAuthorityRequired: false,
      manualMinutes: 30,
      requiredInputs: ['property.addressLine', 'property.askingPrice', 'listing.copy'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'listing.copy',
      label: 'Write listing copy',
      department: 'MARKETING',
      roles: ['MARKETING_ADMIN'],
      aiCapability: 'PREPARE',
      automatable: false,
      requiredApproval: 'REVIEW',
      ceoAuthorityRequired: false,
      manualMinutes: 40,
      requiredInputs: ['property.addressLine', 'property.propertyType'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: true,
    }),

    // ── pipeline & follow-up ───────────────────────────────────────────────
    spec({
      key: 'lead.assign',
      label: 'Assign an incoming lead',
      department: 'SALES',
      roles: ['SALES_AGENT'],
      aiCapability: 'COMPLETE',
      automatable: true,
      requiredApproval: 'AUTO',
      ceoAuthorityRequired: false,
      manualMinutes: 5,
      requiredInputs: ['contact.name'],
      defaultPriority: 'HIGH',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'lead.first_response',
      label: 'Respond to a new enquiry',
      department: 'SALES',
      roles: ['SALES_AGENT'],
      aiCapability: 'PREPARE',
      automatable: false,
      requiredApproval: 'AUTO_WITH_RULES',
      ceoAuthorityRequired: false,
      manualMinutes: 12,
      requiredInputs: ['contact.name'],
      defaultPriority: 'HIGH',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'viewing.schedule',
      label: 'Schedule a viewing',
      department: 'SALES',
      roles: ['SALES_AGENT'],
      aiCapability: 'COMPLETE',
      automatable: true,
      requiredApproval: 'AUTO_WITH_RULES',
      ceoAuthorityRequired: false,
      manualMinutes: 10,
      requiredInputs: ['property.addressLine', 'contact.name', 'slot'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'viewing.feedback_request',
      label: 'Request viewing feedback',
      department: 'SALES',
      roles: ['SALES_AGENT'],
      aiCapability: 'COMPLETE',
      automatable: true,
      requiredApproval: 'AUTO_WITH_RULES',
      ceoAuthorityRequired: false,
      manualMinutes: 8,
      requiredInputs: ['viewing'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'seller.progress_update',
      label: 'Send seller progress update',
      department: 'SALES',
      roles: ['SALES_AGENT'],
      aiCapability: 'PREPARE',
      automatable: false,
      requiredApproval: 'AUTO_WITH_RULES',
      ceoAuthorityRequired: false,
      manualMinutes: 20,
      requiredInputs: ['property.addressLine', 'seller.fullName'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'buyer.follow_up',
      label: 'Follow up with a buyer',
      department: 'SALES',
      roles: ['SALES_AGENT'],
      aiCapability: 'PREPARE',
      automatable: false,
      requiredApproval: 'AUTO_WITH_RULES',
      ceoAuthorityRequired: false,
      manualMinutes: 12,
      requiredInputs: ['contact.name'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: true,
    }),

    // ── transaction progression ────────────────────────────────────────────
    spec({
      key: 'transaction.build_checklist',
      label: 'Build transaction checklist',
      department: 'SALES',
      roles: ['OPERATIONS', 'SALES_AGENT'],
      aiCapability: 'COMPLETE',
      automatable: true,
      requiredApproval: 'AUTO',
      ceoAuthorityRequired: false,
      manualMinutes: 25,
      requiredInputs: ['transaction'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'transaction.chase_document',
      label: 'Chase an outstanding transaction document',
      department: 'SALES',
      roles: ['OPERATIONS', 'SALES_AGENT'],
      aiCapability: 'COMPLETE',
      automatable: true,
      requiredApproval: 'AUTO_WITH_RULES',
      ceoAuthorityRequired: false,
      manualMinutes: 15,
      requiredInputs: ['transaction', 'document.kind'],
      defaultPriority: 'HIGH',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'fica.collect',
      label: 'Request FICA documents',
      department: 'ACCOUNTS',
      roles: ['ACCOUNTS', 'OPERATIONS'],
      aiCapability: 'COMPLETE',
      automatable: true,
      requiredApproval: 'AUTO_WITH_RULES',
      ceoAuthorityRequired: false,
      manualMinutes: 15,
      requiredInputs: ['contact.name', 'contact.email'],
      defaultPriority: 'HIGH',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'fica.verify',
      label: 'Verify FICA documents',
      department: 'ACCOUNTS',
      roles: ['ACCOUNTS', 'OPERATIONS'],
      // Compliance verification is a human determination. The AI may only
      // point out what is missing or inconsistent.
      aiCapability: 'ASSIST',
      automatable: false,
      requiredApproval: 'REVIEW',
      ceoAuthorityRequired: false,
      manualMinutes: 20,
      requiredInputs: ['documents'],
      defaultPriority: 'HIGH',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'commission.statement',
      label: 'Prepare commission statement',
      department: 'ACCOUNTS',
      roles: ['ACCOUNTS'],
      aiCapability: 'PREPARE',
      automatable: false,
      requiredApproval: 'APPROVAL',
      ceoAuthorityRequired: false,
      ceoFinancialThresholdZar: 250_000,
      manualMinutes: 30,
      requiredInputs: ['transaction', 'commissionPct'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: true,
    }),

    // ── rentals — routine rental administration is never the CEO's ─────────
    spec({
      key: 'rental.maintenance_routine',
      label: 'Routine maintenance request',
      department: 'RENTALS',
      roles: ['RENTALS'],
      aiCapability: 'PREPARE',
      automatable: false,
      requiredApproval: 'AUTO_WITH_RULES',
      ceoAuthorityRequired: false,
      ceoFinancialThresholdZar: 15_000,
      manualMinutes: 20,
      requiredInputs: ['property.addressLine', 'issue'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'rental.maintenance_major',
      label: 'Major maintenance / structural issue',
      department: 'RENTALS',
      roles: ['RENTALS'],
      aiCapability: 'ASSIST',
      automatable: false,
      requiredApproval: 'APPROVAL',
      ceoAuthorityRequired: false,
      ceoFinancialThresholdZar: 15_000,
      manualMinutes: 45,
      requiredInputs: ['property.addressLine', 'issue', 'quote'],
      defaultPriority: 'HIGH',
      neverRoutineForCeo: false,
    }),
    spec({
      key: 'rental.lease_renewal',
      label: 'Lease renewal',
      department: 'RENTALS',
      roles: ['RENTALS'],
      aiCapability: 'PREPARE',
      automatable: false,
      requiredApproval: 'APPROVAL',
      ceoAuthorityRequired: false,
      manualMinutes: 35,
      requiredInputs: ['lease', 'tenant.fullName'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'rental.arrears_follow_up',
      label: 'Rental arrears follow-up',
      department: 'ACCOUNTS',
      roles: ['ACCOUNTS'],
      aiCapability: 'PREPARE',
      automatable: false,
      requiredApproval: 'AUTO_WITH_RULES',
      ceoAuthorityRequired: false,
      manualMinutes: 15,
      requiredInputs: ['tenant.fullName', 'amount'],
      defaultPriority: 'HIGH',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'rental.deposit_refund',
      label: 'Deposit reconciliation and refund',
      department: 'ACCOUNTS',
      roles: ['ACCOUNTS'],
      aiCapability: 'PREPARE',
      automatable: false,
      requiredApproval: 'APPROVAL',
      ceoAuthorityRequired: false,
      manualMinutes: 30,
      requiredInputs: ['lease', 'inspection'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: true,
    }),

    // ── communication ──────────────────────────────────────────────────────
    spec({
      key: 'email.triage',
      label: 'Triage inbox',
      department: 'OPERATIONS',
      roles: ['OPERATIONS'],
      aiCapability: 'COMPLETE',
      automatable: true,
      requiredApproval: 'AUTO',
      ceoAuthorityRequired: false,
      manualMinutes: 2,
      requiredInputs: ['message'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'email.routine_reply',
      label: 'Answer a routine enquiry',
      department: 'OPERATIONS',
      roles: ['OPERATIONS'],
      aiCapability: 'COMPLETE',
      automatable: false,
      requiredApproval: 'AUTO_WITH_RULES',
      ceoAuthorityRequired: false,
      manualMinutes: 8,
      requiredInputs: ['message'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'email.draft_for_ceo',
      label: 'Draft a reply in the CEO’s voice',
      department: 'EXECUTIVE',
      roles: ['CEO'],
      aiCapability: 'PREPARE',
      automatable: false,
      // The system drafts; it never sends as Mandy without her approval.
      requiredApproval: 'APPROVAL',
      ceoAuthorityRequired: true,
      manualMinutes: 15,
      requiredInputs: ['message'],
      defaultPriority: 'HIGH',
      neverRoutineForCeo: false,
    }),
    spec({
      key: 'meeting.prepare_brief',
      label: 'Prepare meeting brief',
      department: 'EXECUTIVE',
      roles: ['CEO'],
      aiCapability: 'COMPLETE',
      automatable: true,
      requiredApproval: 'AUTO',
      ceoAuthorityRequired: false,
      manualMinutes: 40,
      requiredInputs: ['meeting'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: false,
    }),
    spec({
      key: 'meeting.capture_actions',
      label: 'Turn meeting notes into tasks',
      department: 'EXECUTIVE',
      roles: ['CEO', 'OPERATIONS'],
      aiCapability: 'COMPLETE',
      automatable: true,
      requiredApproval: 'REVIEW',
      ceoAuthorityRequired: false,
      manualMinutes: 25,
      requiredInputs: ['meeting.notes'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: false,
    }),

    // ── marketing ──────────────────────────────────────────────────────────
    spec({
      key: 'marketing.social_post',
      label: 'Social media post',
      department: 'MARKETING',
      roles: ['MARKETING_ADMIN'],
      aiCapability: 'PREPARE',
      automatable: false,
      requiredApproval: 'REVIEW',
      ceoAuthorityRequired: false,
      manualMinutes: 25,
      requiredInputs: ['subject'],
      defaultPriority: 'LOW',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'marketing.newsletter',
      label: 'Newsletter campaign',
      department: 'MARKETING',
      roles: ['MARKETING_ADMIN'],
      aiCapability: 'PREPARE',
      automatable: false,
      requiredApproval: 'APPROVAL',
      ceoAuthorityRequired: false,
      manualMinutes: 90,
      requiredInputs: ['subject', 'audience'],
      defaultPriority: 'LOW',
      neverRoutineForCeo: true,
    }),

    // ── staff & executive ──────────────────────────────────────────────────
    spec({
      key: 'staff.task_chase',
      label: 'Chase an overdue staff task',
      department: 'OPERATIONS',
      roles: ['OPERATIONS'],
      aiCapability: 'COMPLETE',
      automatable: true,
      requiredApproval: 'AUTO_WITH_RULES',
      ceoAuthorityRequired: false,
      manualMinutes: 8,
      requiredInputs: ['task'],
      defaultPriority: 'NORMAL',
      neverRoutineForCeo: true,
    }),
    spec({
      key: 'staff.performance_matter',
      label: 'Staff performance or conduct matter',
      department: 'EXECUTIVE',
      roles: ['CEO'],
      // People matters are not delegated to software.
      aiCapability: 'NONE',
      automatable: false,
      requiredApproval: 'MANDY_ONLY',
      ceoAuthorityRequired: true,
      manualMinutes: 60,
      requiredInputs: [],
      defaultPriority: 'HIGH',
      neverRoutineForCeo: false,
    }),
    spec({
      key: 'strategy.decision',
      label: 'Business strategy decision',
      department: 'EXECUTIVE',
      roles: ['CEO'],
      aiCapability: 'ASSIST',
      automatable: false,
      requiredApproval: 'MANDY_ONLY',
      ceoAuthorityRequired: true,
      manualMinutes: 60,
      requiredInputs: [],
      defaultPriority: 'HIGH',
      neverRoutineForCeo: false,
    }),

    // ── personal executive assistance ──────────────────────────────────────
    spec({
      key: 'personal.reminder',
      label: 'Personal reminder',
      department: 'EXECUTIVE',
      roles: ['CEO'],
      aiCapability: 'COMPLETE',
      automatable: true,
      requiredApproval: 'AUTO',
      ceoAuthorityRequired: false,
      manualMinutes: 3,
      requiredInputs: ['subject'],
      defaultPriority: 'LOW',
      neverRoutineForCeo: false,
    }),
    spec({
      key: 'personal.appointment',
      label: 'Personal appointment arrangement',
      department: 'EXECUTIVE',
      roles: ['CEO'],
      aiCapability: 'PREPARE',
      automatable: false,
      requiredApproval: 'REVIEW',
      ceoAuthorityRequired: false,
      manualMinutes: 15,
      requiredInputs: ['subject'],
      defaultPriority: 'LOW',
      neverRoutineForCeo: false,
    }),
  ].map((s) => [s.key, s]),
);

export function getWorkSpec(key: string): WorkKindSpec | undefined {
  return WORK_CATALOGUE[key];
}

export const WORK_KEYS = Object.keys(WORK_CATALOGUE);
