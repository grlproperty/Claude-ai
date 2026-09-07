import { formatZar } from '../lib/format';
import { getWorkSpec, type WorkKindSpec } from './work-catalogue';
import type {
  ApprovalLevel,
  Department,
  EscalationLevel,
  Priority,
  RiskFlag,
  RoutingDecision,
  StaffMember,
  WorkContext,
} from './types';

/**
 * The ownership engine.
 *
 * Every piece of work runs through the same hierarchy:
 *
 *   1. Can the AI do it?            → the AI does it.
 *   2. Can it be automated?         → a rule does it.
 *   3. Does a human need to do it?  → which human, by responsibility.
 *   4. Who is the best person?      → role, ownership, workload, availability.
 *   5. Does Mandy actually need to be involved? → usually not.
 *
 * Step 5 is the point of the whole system. The CEO is only reached when her
 * authority, her professional judgement, or a genuine exception demands it —
 * never because nobody else was obvious. Where no owner can be justified the
 * engine says so (`needsOwnershipDecision`) instead of guessing, so that work
 * is never quietly dumped on whoever happens to be nearby.
 */

/** Risks that pull a matter to the CEO whatever the work catalogue says. */
const CEO_RISK_FLAGS: ReadonlySet<RiskFlag> = new Set<RiskFlag>([
  'LEGAL_OR_COMPLIANCE',
  'STAFF_MANAGEMENT',
  'BUSINESS_STRATEGY',
  'PROFESSIONAL_JUDGEMENT',
  'MAJOR_CLIENT_RELATIONSHIP',
  'REPUTATIONAL',
]);

/** Risks worth the CEO knowing about, but not worth interrupting her to decide. */
const CEO_AWARENESS_FLAGS: ReadonlySet<RiskFlag> = new Set<RiskFlag>([
  'SIGNIFICANT_FINANCIAL',
]);

const APPROVAL_RANK: Record<ApprovalLevel, number> = {
  AUTO: 0,
  AUTO_WITH_RULES: 1,
  REVIEW: 2,
  APPROVAL: 3,
  SIGNATURE: 4,
  MANDY_ONLY: 5,
};

const PRIORITY_RANK: Record<Priority, number> = { LOW: 0, NORMAL: 1, HIGH: 2, URGENT: 3 };

export function highestApproval(a: ApprovalLevel, b: ApprovalLevel): ApprovalLevel {
  return APPROVAL_RANK[a] >= APPROVAL_RANK[b] ? a : b;
}

function highestPriority(a: Priority, b: Priority): Priority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

/** Load as a fraction of capacity. Above 1 the person is over-committed. */
export function loadFactor(s: StaffMember): number {
  if (s.weeklyCapacityHours <= 0) return Number.POSITIVE_INFINITY;
  return s.committedHours / s.weeklyCapacityHours;
}

/**
 * Ranks candidates so the best person wins: the one who already owns the
 * relationship, then the least loaded, then the one with fewest overdue items.
 */
function rankCandidates(candidates: StaffMember[], relationshipOwnerId?: string | null): StaffMember[] {
  return [...candidates].sort((a, b) => {
    if (relationshipOwnerId) {
      const aOwns = a.id === relationshipOwnerId ? 0 : 1;
      const bOwns = b.id === relationshipOwnerId ? 0 : 1;
      if (aOwns !== bOwns) return aOwns - bOwns;
    }
    const loadDelta = loadFactor(a) - loadFactor(b);
    if (Math.abs(loadDelta) > 0.05) return loadDelta;
    if (a.overdueCount !== b.overdueCount) return a.overdueCount - b.overdueCount;
    return a.name.localeCompare(b.name);
  });
}

function isAvailable(s: StaffMember): boolean {
  return s.active && !s.away && s.acceptsDelegation;
}

/** Review effort is a fraction of doing the work by hand, with a sane floor. */
export function reviewMinutes(manualMinutes: number): number {
  return Math.max(3, Math.round(manualMinutes * 0.15));
}

export interface RouteInput {
  workKey: string;
  context?: WorkContext;
  staff: StaffMember[];
  /** Overrides the catalogue's manual-minutes estimate where a better one exists. */
  manualMinutesOverride?: number;
}

export function route({ workKey, context = {}, staff, manualMinutesOverride }: RouteInput): RoutingDecision {
  const spec = getWorkSpec(workKey);
  const ceo = staff.find((s) => s.isCeo) ?? null;

  // Unknown work is never guessed at. It becomes an explicit ownership question
  // for management rather than a silent assignment.
  if (!spec) {
    return {
      ownerType: 'USER',
      ownerId: null,
      ownerName: null,
      approverId: null,
      approverName: null,
      department: 'OPERATIONS',
      requiredApproval: 'REVIEW',
      escalationLevel: 'L2_MANAGEMENT',
      ceoInvolvement: 'none',
      priority: context.urgency ?? 'NORMAL',
      estimatedMinutes: 15,
      minutesSavedIfAutomated: 0,
      nextAction: `Decide who owns "${workKey}" and add it to the work catalogue.`,
      rationale:
        `"${workKey}" is not in the work catalogue, so the system will not guess an owner. ` +
        'Management decides ownership once, and every future instance routes automatically.',
      needsOwnershipDecision: true,
    };
  }

  const manualMinutes = manualMinutesOverride ?? spec.manualMinutes;
  const riskFlags = context.riskFlags ?? [];
  const value = context.valueZar ?? null;
  const missing = context.missingInputs ?? [];
  const blockingInputs = spec.requiredInputs.filter((i) => missing.includes(i));

  // ── step 5, evaluated first because it changes everything below ──────────
  const overFinancialThreshold =
    spec.ceoFinancialThresholdZar != null && value != null && value >= spec.ceoFinancialThresholdZar;
  const ceoRiskFlags = riskFlags.filter((f) => CEO_RISK_FLAGS.has(f));
  const ceoRequired =
    spec.ceoAuthorityRequired ||
    overFinancialThreshold ||
    ceoRiskFlags.length > 0 ||
    context.unresolvedByStaff === true;

  const ceoReasons: string[] = [];
  if (spec.ceoAuthorityRequired) ceoReasons.push('this work carries the CEO’s own authority');
  if (overFinancialThreshold) {
    ceoReasons.push(
      `the value (${formatZar(value!)}) is at or above the ${formatZar(spec.ceoFinancialThresholdZar!)} threshold`,
    );
  }
  for (const f of ceoRiskFlags) ceoReasons.push(`a ${f.toLowerCase().replace(/_/g, ' ')} risk was flagged`);
  if (context.unresolvedByStaff) ceoReasons.push('staff could not resolve it');

  const priority = highestPriority(spec.defaultPriority, context.urgency ?? 'LOW');

  // ── steps 1 & 2: can this be done without a person at all? ───────────────
  const aiUnblocked = blockingInputs.length === 0;
  const canAutomate =
    spec.automatable && aiUnblocked && APPROVAL_RANK[spec.requiredApproval] <= APPROVAL_RANK.AUTO_WITH_RULES;
  const canAiComplete = spec.aiCapability === 'COMPLETE' && aiUnblocked;
  const canAiPrepare = spec.aiCapability === 'PREPARE' && aiUnblocked;

  // Personal work never reaches company staff, whatever the catalogue says.
  const personal = context.domain === 'PERSONAL';

  if (canAutomate || canAiComplete) {
    const ownerType = canAutomate ? 'AUTOMATION' : 'AI';
    // Even work the AI completes can require a human to sign off the output.
    const needsHumanSignOff = APPROVAL_RANK[spec.requiredApproval] >= APPROVAL_RANK.REVIEW;
    const approver = needsHumanSignOff
      ? pickApprover({ spec, staff, ceo, ceoRequired, relationshipOwnerId: context.relationshipOwnerId })
      : null;

    return {
      ownerType,
      ownerId: null,
      ownerName: canAutomate ? 'Automation' : 'AI',
      approverId: approver?.id ?? null,
      approverName: approver?.name ?? null,
      department: spec.department,
      requiredApproval: spec.requiredApproval,
      escalationLevel: 'L1_STAFF',
      ceoInvolvement: ceoInvolvementFor({ spec, ceoRequired, approver, ceo, riskFlags }),
      priority,
      estimatedMinutes: needsHumanSignOff ? reviewMinutes(manualMinutes) : 0,
      minutesSavedIfAutomated: needsHumanSignOff ? manualMinutes - reviewMinutes(manualMinutes) : manualMinutes,
      nextAction: needsHumanSignOff
        ? `${spec.label} — completed by ${ownerType === 'AI' ? 'the AI' : 'automation'}; ${approver?.name ?? 'an authorised reviewer'} to sign off.`
        : `${spec.label} — handled end to end. No person needed.`,
      rationale: `${spec.label} is fully ${canAutomate ? 'automatable' : 'within the AI’s remit'} and every required input is present, so no one is interrupted.`,
      needsOwnershipDecision: false,
    };
  }

  if (canAiPrepare) {
    const approver = pickApprover({ spec, staff, ceo, ceoRequired, relationshipOwnerId: context.relationshipOwnerId });
    const review = reviewMinutes(manualMinutes);
    return {
      ownerType: 'AI',
      ownerId: null,
      ownerName: 'AI',
      approverId: approver?.id ?? null,
      approverName: approver?.name ?? null,
      department: spec.department,
      requiredApproval: spec.requiredApproval,
      escalationLevel: approver?.isCeo ? 'L3_CEO' : 'L1_STAFF',
      ceoInvolvement: ceoInvolvementFor({ spec, ceoRequired, approver, ceo, riskFlags }),
      priority,
      estimatedMinutes: review,
      minutesSavedIfAutomated: manualMinutes - review,
      nextAction: `${spec.label} — prepared and ready for ${approver?.name ?? 'an authorised reviewer'} to review.`,
      rationale:
        `The AI can produce the finished ${spec.label.toLowerCase()}, but ${spec.requiredApproval === 'SIGNATURE' ? 'a signature' : 'approval'} ` +
        `is required, so ${approver?.name ?? 'an authorised person'} reviews the completed work instead of doing it.` +
        (ceoReasons.length ? ` It reaches Mandy because ${ceoReasons.join(', and ')}.` : ''),
      needsOwnershipDecision: false,
    };
  }

  // ── steps 3 & 4: a person must do this. Which person? ────────────────────
  const blockedNote = blockingInputs.length
    ? ` The AI stopped short because ${blockingInputs.join(', ')} ${blockingInputs.length === 1 ? 'is' : 'are'} missing.`
    : '';

  if (personal) {
    return {
      ownerType: 'USER',
      ownerId: ceo?.id ?? null,
      ownerName: ceo?.name ?? null,
      approverId: null,
      approverName: null,
      department: 'EXECUTIVE',
      requiredApproval: spec.requiredApproval,
      escalationLevel: 'L1_STAFF',
      ceoInvolvement: 'none',
      priority,
      estimatedMinutes: manualMinutes,
      minutesSavedIfAutomated: 0,
      nextAction: `${spec.label} — personal matter, kept out of company workflows.`,
      rationale: `This is personal, so it is never routed to company staff.${blockedNote}`,
      needsOwnershipDecision: false,
    };
  }

  if (ceoRequired && ceo) {
    return {
      ownerType: 'USER',
      ownerId: ceo.id,
      ownerName: ceo.name,
      approverId: null,
      approverName: null,
      department: 'EXECUTIVE',
      requiredApproval: highestApproval(spec.requiredApproval, 'MANDY_ONLY'),
      escalationLevel: 'L3_CEO',
      ceoInvolvement: 'decision',
      priority: highestPriority(priority, 'HIGH'),
      estimatedMinutes: manualMinutes,
      minutesSavedIfAutomated: 0,
      nextAction: `${spec.label} — requires Mandy’s decision.`,
      rationale: `Routed to Mandy because ${ceoReasons.join(', and ') || 'it requires CEO authority'}.${blockedNote}`,
      needsOwnershipDecision: false,
    };
  }

  const pool = staff.filter((s) => !s.isCeo && spec.roles.includes(s.role));
  const inDepartment = pool.filter((s) => s.department === spec.department);
  const available = (list: StaffMember[]) => list.filter(isAvailable);

  const tiers: Array<{ list: StaffMember[]; why: string }> = [
    { list: available(inDepartment), why: `responsibility sits with ${spec.department.toLowerCase()}` },
    { list: available(pool), why: `the role required is ${spec.roles.filter((r) => r !== 'CEO').join(' or ').toLowerCase()}` },
    { list: inDepartment.filter((s) => s.active), why: 'everyone in the responsible department is away or at capacity' },
  ];

  for (const tier of tiers) {
    if (!tier.list.length) continue;
    const ranked = rankCandidates(tier.list, context.relationshipOwnerId);
    const chosen = ranked[0]!;
    const owns = chosen.id === context.relationshipOwnerId;
    const overloaded = loadFactor(chosen) > 1;

    return {
      ownerType: 'USER',
      ownerId: chosen.id,
      ownerName: chosen.name,
      approverId: null,
      approverName: null,
      department: chosen.department,
      requiredApproval: spec.requiredApproval,
      escalationLevel: 'L1_STAFF',
      ceoInvolvement: riskFlags.some((f) => CEO_AWARENESS_FLAGS.has(f)) ? 'informed' : 'none',
      priority,
      estimatedMinutes: manualMinutes,
      minutesSavedIfAutomated: 0,
      nextAction: `${spec.label} — assigned to ${chosen.name}.`,
      rationale:
        (owns
          ? `${chosen.name} already owns this relationship`
          : `${tier.why}, and ${chosen.name} has the most room (${Math.round(loadFactor(chosen) * 100)}% committed)`) +
        `. Mandy is not involved.${overloaded ? ` Note: ${chosen.name} is already over capacity.` : ''}${blockedNote}`,
      needsOwnershipDecision: false,
    };
  }

  // Nobody qualified. This is a management question, not a reason to hand it to
  // the CEO or to whoever is least busy.
  return {
    ownerType: 'USER',
    ownerId: null,
    ownerName: null,
    approverId: null,
    approverName: null,
    department: spec.department,
    requiredApproval: spec.requiredApproval,
    escalationLevel: 'L2_MANAGEMENT',
    ceoInvolvement: 'none',
    priority,
    estimatedMinutes: manualMinutes,
    minutesSavedIfAutomated: 0,
    nextAction: `${spec.label} — no qualified owner available; management to assign.`,
    rationale:
      `No active ${spec.roles.filter((r) => r !== 'CEO').join('/')} is available in ${spec.department.toLowerCase()}. ` +
      'The system will not invent an owner.' +
      blockedNote,
    needsOwnershipDecision: true,
  };
}

function pickApprover(args: {
  spec: WorkKindSpec;
  staff: StaffMember[];
  ceo: StaffMember | null;
  ceoRequired: boolean;
  relationshipOwnerId?: string | null;
}): StaffMember | null {
  const { spec, staff, ceo, ceoRequired, relationshipOwnerId } = args;

  if (spec.requiredApproval === 'MANDY_ONLY' || ceoRequired) return ceo;

  const eligible = staff.filter((s) => !s.isCeo && spec.roles.includes(s.role) && isAvailable(s));
  if (!eligible.length) {
    // Falling back to the CEO is a last resort, and only for work that genuinely
    // needs a sign-off. Low-stakes work simply waits for its department.
    return APPROVAL_RANK[spec.requiredApproval] >= APPROVAL_RANK.APPROVAL ? ceo : null;
  }
  return rankCandidates(eligible, relationshipOwnerId)[0]!;
}

function ceoInvolvementFor(args: {
  spec: WorkKindSpec;
  ceoRequired: boolean;
  approver: StaffMember | null;
  ceo: StaffMember | null;
  riskFlags: RiskFlag[];
}): RoutingDecision['ceoInvolvement'] {
  const { spec, ceoRequired, approver, riskFlags } = args;
  if (spec.requiredApproval === 'MANDY_ONLY' || ceoRequired) return 'decision';
  if (approver?.isCeo) return 'approval';
  if (riskFlags.some((f) => CEO_AWARENESS_FLAGS.has(f))) return 'informed';
  return 'none';
}

/** Convenience for the "does this need Mandy?" question asked all over the UI. */
export function requiresCeo(decision: RoutingDecision): boolean {
  return decision.ceoInvolvement === 'decision' || decision.ceoInvolvement === 'approval';
}

export type { RoutingDecision, EscalationLevel, Department };
