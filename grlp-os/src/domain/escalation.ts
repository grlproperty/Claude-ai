import { formatZar } from '../lib/format';
import type { EscalationLevel, Priority, RiskFlag } from './types';

/**
 * Escalation (§7) and the CEO decision inbox (§25).
 *
 * An escalation to Mandy is never "there is a problem". It is a decision she can
 * take in seconds because the investigation has already been done: what happened,
 * what the system already tried, what her options are, and what it recommends.
 * The type system enforces that — an escalation cannot be constructed without
 * those parts.
 */

export interface EscalationOption {
  key: string;
  label: string;
  consequence: string;
  /** Set where choosing this option has a known rand impact. */
  financialImpactZar?: number;
  reversible: boolean;
}

export interface EscalationPayload {
  level: EscalationLevel;
  title: string;
  /** What happened. */
  issue: string;
  /** What the recipient needs to know to decide, and nothing more. */
  context: string;
  /** What the system and staff already did, so nobody repeats it. */
  actionsTaken: string[];
  options: EscalationOption[];
  recommendation: string;
  recommendationReason: string;
  /** The single question being asked. */
  decisionRequired: string;
  financialImpactZar?: number;
  clientImpact?: string;
  riskNote?: string;
  dueAt?: Date;
}

export class IncompleteEscalationError extends Error {
  constructor(readonly missing: string[]) {
    super(`An escalation cannot be raised without: ${missing.join(', ')}.`);
    this.name = 'IncompleteEscalationError';
  }
}

/**
 * Validates that an escalation is decision-ready. Raising an unresearched
 * problem to a busy person is the behaviour this system exists to stop, so it
 * is rejected at the boundary.
 */
export function validateEscalation(p: Partial<EscalationPayload>): asserts p is EscalationPayload {
  const missing: string[] = [];
  if (!p.title?.trim()) missing.push('title');
  if (!p.issue?.trim()) missing.push('issue');
  if (!p.context?.trim()) missing.push('context');
  if (!p.recommendation?.trim()) missing.push('recommendation');
  if (!p.recommendationReason?.trim()) missing.push('reason for the recommendation');
  if (!p.decisionRequired?.trim()) missing.push('the decision required');
  if (!p.options || p.options.length < 2) missing.push('at least two options');
  if (!p.actionsTaken) missing.push('actions already taken');
  if (missing.length) throw new IncompleteEscalationError(missing);
}

/**
 * Chooses the level a matter belongs at. Level 3 is deliberately narrow: it is
 * reached by authority, judgement, or an exception nobody below could resolve —
 * not by difficulty or by volume.
 */
export function levelFor(args: {
  riskFlags?: RiskFlag[];
  financialImpactZar?: number | null;
  unresolvedByStaff?: boolean;
  departmentCanResolve?: boolean;
  ceoFinancialThresholdZar?: number;
}): { level: EscalationLevel; reasons: string[] } {
  const flags = args.riskFlags ?? [];
  const threshold = args.ceoFinancialThresholdZar ?? 100_000;
  const reasons: string[] = [];

  const ceoFlags: RiskFlag[] = [
    'LEGAL_OR_COMPLIANCE',
    'STAFF_MANAGEMENT',
    'BUSINESS_STRATEGY',
    'PROFESSIONAL_JUDGEMENT',
    'MAJOR_CLIENT_RELATIONSHIP',
    'REPUTATIONAL',
  ];
  for (const f of flags) {
    if (ceoFlags.includes(f)) reasons.push(humanRisk(f));
  }
  if (args.financialImpactZar != null && args.financialImpactZar >= threshold) {
    reasons.push(`the financial impact is ${formatZar(args.financialImpactZar)}`);
  }
  if (args.unresolvedByStaff) reasons.push('it could not be resolved at staff level');

  if (reasons.length) return { level: 'L3_CEO', reasons };
  if (args.departmentCanResolve === false) {
    return { level: 'L2_MANAGEMENT', reasons: ['the responsible department cannot resolve it alone'] };
  }
  return { level: 'L1_STAFF', reasons: ['the responsible person can resolve this'] };
}

function humanRisk(f: RiskFlag): string {
  switch (f) {
    case 'LEGAL_OR_COMPLIANCE':
      return 'there is a legal or compliance exposure';
    case 'STAFF_MANAGEMENT':
      return 'it is a staff management decision';
    case 'BUSINESS_STRATEGY':
      return 'it affects business strategy';
    case 'PROFESSIONAL_JUDGEMENT':
      return 'it requires professional judgement';
    case 'MAJOR_CLIENT_RELATIONSHIP':
      return 'a major client relationship is at risk';
    case 'REPUTATIONAL':
      return 'there is reputational risk';
    case 'SIGNIFICANT_FINANCIAL':
      return 'the financial implications are significant';
    case 'UNRESOLVED_EXCEPTION':
      return 'an exception could not be resolved';
  }
}

/** Renders an escalation as the short brief a decision-maker actually reads. */
export function renderBrief(p: EscalationPayload): string {
  const lines = [
    p.title,
    '',
    `ISSUE — ${p.issue}`,
    `CONTEXT — ${p.context}`,
    `ALREADY DONE — ${p.actionsTaken.length ? p.actionsTaken.join('; ') : 'nothing yet'}`,
    '',
    'OPTIONS',
    ...p.options.map(
      (o, i) =>
        `  ${i + 1}. ${o.label} — ${o.consequence}${o.financialImpactZar != null ? ` (${formatZar(o.financialImpactZar)})` : ''}${o.reversible ? '' : ' [not reversible]'}`,
    ),
    '',
    `RECOMMENDATION — ${p.recommendation}. ${p.recommendationReason}`,
    `DECISION REQUIRED — ${p.decisionRequired}`,
  ];
  return lines.join('\n');
}

export function priorityFor(level: EscalationLevel, dueAt?: Date, now = new Date()): Priority {
  if (level === 'L3_CEO') {
    if (dueAt && dueAt.getTime() - now.getTime() < 24 * 3600_000) return 'URGENT';
    return 'HIGH';
  }
  if (level === 'L2_MANAGEMENT') return 'HIGH';
  return 'NORMAL';
}
