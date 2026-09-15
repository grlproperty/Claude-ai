import type { ApprovalLevel, RiskFlag, Role } from './types';
import { getWorkSpec } from './work-catalogue';

/**
 * Approval boundaries (§36) and the professional-conduct guardrails (§39).
 *
 * These are enforced here, in one place, so that no agent, workflow or API route
 * can quietly step over a boundary. The rule is simple and absolute: the system
 * may prepare anything, and may execute only what it has been authorised to
 * execute. Where a signature or a professional judgement is required, the system
 * routes it to a person and stops.
 */

export class ApprovalBoundaryError extends Error {
  readonly code = 'APPROVAL_BOUNDARY';
  constructor(
    message: string,
    readonly required: ApprovalLevel,
    readonly attemptedBy: string,
  ) {
    super(message);
    this.name = 'ApprovalBoundaryError';
  }
}

export class ProhibitedActionError extends Error {
  readonly code = 'PROHIBITED_ACTION';
  constructor(
    message: string,
    readonly rule: string,
  ) {
    super(message);
    this.name = 'ProhibitedActionError';
  }
}

/** Levels the system may act on by itself. Everything above needs a person. */
const AUTONOMOUS_LEVELS: ReadonlySet<ApprovalLevel> = new Set<ApprovalLevel>(['AUTO', 'AUTO_WITH_RULES']);

export function isAutonomous(level: ApprovalLevel): boolean {
  return AUTONOMOUS_LEVELS.has(level);
}

/**
 * Things the system must never do on its own, whatever it is asked (§39).
 * Each rule is checked against a described action before that action executes.
 */
export const PROHIBITED_ACTIONS = {
  SIGN_AS_HUMAN: 'The system does not sign documents on a person’s behalf.',
  LEGAL_ADVICE: 'The system does not give legal advice or make legal determinations.',
  ALTER_TEMPLATE_CLAUSE:
    'The system does not alter approved legal wording. Clauses come from an approved template version.',
  IMPERSONATE_CEO: 'The system does not send as Mandy without her explicit approval of that message.',
  PROFESSIONAL_SIGN_OFF:
    'The system does not provide professional sign-off. A valuation or compliance opinion is a person’s.',
  BYPASS_APPROVAL: 'The system does not act above its authorised approval level.',
} as const;

export type ProhibitedRule = keyof typeof PROHIBITED_ACTIONS;

export interface ExecutionRequest {
  /** Catalogue key, when the action corresponds to catalogued work. */
  workKey?: string;
  /** The level this specific action has been authorised at. */
  grantedLevel: ApprovalLevel;
  /** Who or what is attempting it. */
  actor: 'AI' | 'AUTOMATION' | 'USER';
  actorRole?: Role;
  /** Set when a human has already approved this exact action. */
  humanApprovalId?: string | null;
  /** Declared side effects, checked against the prohibitions. */
  effects?: Array<'send_email' | 'send_as_ceo' | 'sign_document' | 'generate_clause' | 'publish' | 'pay' | 'file' | 'create_task'>;
}

export interface GuardResult {
  allowed: boolean;
  requiredLevel: ApprovalLevel;
  reason: string;
  violatedRule?: ProhibitedRule;
}

/**
 * The single gate every automated action passes through.
 * Returns a decision rather than throwing, so callers can record the refusal in
 * the audit trail and tell the user plainly why nothing happened.
 */
export function guard(req: ExecutionRequest): GuardResult {
  const spec = req.workKey ? getWorkSpec(req.workKey) : undefined;
  const requiredLevel: ApprovalLevel = spec?.requiredApproval ?? req.grantedLevel;
  const effects = req.effects ?? [];
  const machine = req.actor === 'AI' || req.actor === 'AUTOMATION';

  if (machine && effects.includes('sign_document')) {
    return {
      allowed: false,
      requiredLevel: 'SIGNATURE',
      reason: PROHIBITED_ACTIONS.SIGN_AS_HUMAN,
      violatedRule: 'SIGN_AS_HUMAN',
    };
  }

  if (machine && effects.includes('generate_clause')) {
    return {
      allowed: false,
      requiredLevel: 'APPROVAL',
      reason: PROHIBITED_ACTIONS.ALTER_TEMPLATE_CLAUSE,
      violatedRule: 'ALTER_TEMPLATE_CLAUSE',
    };
  }

  if (machine && effects.includes('send_as_ceo') && !req.humanApprovalId) {
    return {
      allowed: false,
      requiredLevel: 'APPROVAL',
      reason: PROHIBITED_ACTIONS.IMPERSONATE_CEO,
      violatedRule: 'IMPERSONATE_CEO',
    };
  }

  if (machine && requiredLevel === 'MANDY_ONLY' && !req.humanApprovalId) {
    return {
      allowed: false,
      requiredLevel,
      reason: PROHIBITED_ACTIONS.PROFESSIONAL_SIGN_OFF,
      violatedRule: 'PROFESSIONAL_SIGN_OFF',
    };
  }

  if (machine && !isAutonomous(requiredLevel) && !req.humanApprovalId) {
    return {
      allowed: false,
      requiredLevel,
      reason: `${PROHIBITED_ACTIONS.BYPASS_APPROVAL} This needs ${describeLevel(requiredLevel)} first.`,
      violatedRule: 'BYPASS_APPROVAL',
    };
  }

  return { allowed: true, requiredLevel, reason: 'Within authorised limits.' };
}

/** Throwing variant, for call sites where proceeding would be a bug. */
export function assertAllowed(req: ExecutionRequest): void {
  const result = guard(req);
  if (!result.allowed) {
    throw new ApprovalBoundaryError(result.reason, result.requiredLevel, req.actor);
  }
}

export function describeLevel(level: ApprovalLevel): string {
  switch (level) {
    case 'AUTO':
      return 'no approval';
    case 'AUTO_WITH_RULES':
      return 'approval within stored parameters';
    case 'REVIEW':
      return 'a human review';
    case 'APPROVAL':
      return 'approval by an authorised person';
    case 'SIGNATURE':
      return 'an authorised signature';
    case 'MANDY_ONLY':
      return 'Mandy’s decision';
  }
}

/** Risk flags that always force at least an approval, whatever the work is. */
export function minimumLevelForRisks(flags: RiskFlag[]): ApprovalLevel {
  if (flags.includes('LEGAL_OR_COMPLIANCE') || flags.includes('PROFESSIONAL_JUDGEMENT')) return 'MANDY_ONLY';
  if (flags.includes('STAFF_MANAGEMENT') || flags.includes('BUSINESS_STRATEGY')) return 'MANDY_ONLY';
  if (flags.includes('SIGNIFICANT_FINANCIAL') || flags.includes('MAJOR_CLIENT_RELATIONSHIP')) return 'APPROVAL';
  return 'AUTO';
}
