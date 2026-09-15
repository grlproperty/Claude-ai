import { route } from '../domain/routing';
import type { StaffMember, WorkContext } from '../domain/types';
import type { Agent, AgentContext, AgentResult } from './types';

export interface DelegationInput {
  workKey: string;
  staff: StaffMember[];
  context?: WorkContext;
  subject?: string;
}

/**
 * Decides who owns a piece of work (§54). Deterministic: it needs no language
 * model, so delegation keeps working whatever the state of the AI provider.
 */
export const delegationAgent: Agent<DelegationInput> = {
  key: 'delegation',
  name: 'Delegation Agent',
  description: 'Decides whether the AI, an automation, a member of staff or the CEO owns a piece of work.',
  needsModel: false,

  async run(input, ctx: AgentContext): Promise<AgentResult> {
    const decision = route({ workKey: input.workKey, staff: input.staff, context: input.context });
    const machineOwned = decision.ownerType === 'AI' || decision.ownerType === 'AUTOMATION';

    return {
      agent: 'delegation',
      action: `Route ${input.subject ?? input.workKey}`,
      status: decision.needsOwnershipDecision ? 'needs_input' : 'completed',
      summary: decision.nextAction,
      outputs: [
        { label: 'Owner', value: decision.ownerName ?? 'unassigned', provenance: 'DECISION', basis: decision.rationale },
        { label: 'Approval required', value: decision.requiredApproval, provenance: 'FACT', basis: 'Work catalogue.' },
        { label: 'Does this need Mandy?', value: decision.ceoInvolvement, provenance: 'DECISION', basis: decision.rationale },
      ],
      missing: input.context?.missingInputs ?? [],
      // Routing itself saves the few minutes of deciding, and only when it decided.
      minutesSaved: decision.needsOwnershipDecision ? 0 : 2,
      savedFor: ctx.forUserId,
      requiredApproval: decision.requiredApproval,
      ownerType: decision.ownerType,
      blockedReason: decision.needsOwnershipDecision ? decision.rationale : undefined,
    };
  },
};
