import { assess, type AssessInput } from '../domain/market-assessment';
import { formatZar } from '../lib/format';
import type { Agent, AgentContext, AgentResult } from './types';

/**
 * Prepares the market assessment (§13). The analysis is arithmetic, so this runs
 * without a language model; the pricing opinion is never the agent's to give.
 */
export const marketAssessmentAgent: Agent<AssessInput> = {
  key: 'market_assessment',
  name: 'Market Assessment Agent',
  description: 'Analyses comparable evidence and prepares the assessment for the CEO’s pricing opinion.',
  needsModel: false,

  async run(input, ctx: AgentContext): Promise<AgentResult> {
    const result = assess({ ...input, now: input.now ?? ctx.now });
    const done = result.status === 'PREPARED';

    return {
      agent: 'market_assessment',
      action: `Market assessment — ${input.subject.addressLine}`,
      status: done ? 'completed' : 'needs_input',
      summary: done
        ? `Prepared: ${formatZar(result.recommendedLow!)}–${formatZar(result.recommendedHigh!)} on ${result.usedCount} adjusted comparables (${result.confidence} confidence). Your pricing opinion is the remaining step.`
        : result.executiveSummary,
      outputs: [
        { label: 'Indicated range', value: done ? { low: result.recommendedLow, high: result.recommendedHigh } : null, provenance: 'INFERENCE', basis: result.workings.method },
        { label: 'Workings', value: result.workings, provenance: 'FACT', basis: 'Arithmetic over the supplied comparables.' },
        { label: 'Comparables', value: result.comparables, provenance: 'FACT', basis: 'As supplied, with each adjustment recorded.' },
        { label: 'Executive summary', value: result.executiveSummary, provenance: 'RECOMMENDATION', basis: 'Derived from the workings above.' },
      ],
      missing: result.missingInputs,
      // Two hours of analysis, less the review. Claimed only when it produced a range.
      minutesSaved: done ? 102 : 0,
      savedFor: ctx.forUserId,
      requiredApproval: 'MANDY_ONLY',
      ownerType: 'AI',
      blockedReason: done ? undefined : `Needs ${result.missingInputs.join('; ')}.`,
    };
  },
};
