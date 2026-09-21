import { autoResolvableShare, sweep, type BusinessSnapshot, type RiskFinding } from '../domain/risk';
import type { Agent, AgentContext, AgentResult } from './types';

/**
 * "What's falling through the cracks?" (§31). Deterministic, and the reason the
 * system is useful without being asked anything.
 */
export const riskAgent: Agent<{ snapshot: BusinessSnapshot }> = {
  key: 'risk',
  name: 'Risk Agent',
  description: 'Sweeps the business for forgotten leads, silent sellers, stalled deals and missed deadlines.',
  needsModel: false,

  async run(input, ctx: AgentContext): Promise<AgentResult> {
    const findings: RiskFinding[] = sweep(input.snapshot, ctx.now);
    const urgent = findings.filter((f) => f.severity === 'URGENT' || f.severity === 'HIGH');
    const autoShare = autoResolvableShare(findings);

    return {
      agent: 'risk',
      action: 'Sweep for work falling through the cracks',
      status: 'completed',
      summary: findings.length
        ? `${findings.length} finding${findings.length === 1 ? '' : 's'}, ${urgent.length} needing attention. ${Math.round(autoShare * 100)}% can be cleared without a person.`
        : 'Nothing is falling through the cracks.',
      outputs: [
        { label: 'Findings', value: findings, provenance: 'FACT', basis: 'Thresholds applied to the current records.' },
        { label: 'Can be cleared automatically', value: findings.filter((f) => f.autoResolvable), provenance: 'RECOMMENDATION', basis: 'Findings whose suggested action the system is authorised to take.' },
      ],
      missing: [],
      // Finding the problems is real work; a person doing this sweep by hand
      // would spend far longer, but only the review time is claimed.
      minutesSaved: findings.length ? 30 : 10,
      savedFor: ctx.forUserId,
      requiredApproval: 'AUTO',
      ownerType: 'AI',
    };
  },
};
