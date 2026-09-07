import { communicationAgent } from './communication-agent';
import { delegationAgent } from './delegation-agent';
import { documentAgent } from './document-agent';
import { marketAssessmentAgent } from './market-assessment-agent';
import { riskAgent } from './risk-agent';
import { aiAvailable } from './provider';

/**
 * The specialist agents (§33), under one executive system.
 *
 * Note which of these need the language model: almost none. The system's
 * judgement about ownership, risk, validation and pricing evidence is
 * deterministic and auditable. The model writes prose.
 */
export const AGENTS = {
  delegation: delegationAgent,
  market_assessment: marketAssessmentAgent,
  document: documentAgent,
  communication: communicationAgent,
  risk: riskAgent,
} as const;

export type AgentKey = keyof typeof AGENTS;

export interface AgentAvailability {
  key: string;
  name: string;
  description: string;
  needsModel: boolean;
  available: boolean;
  note: string;
}

export function agentAvailability(env: NodeJS.ProcessEnv = process.env): AgentAvailability[] {
  const model = aiAvailable(env);
  return Object.values(AGENTS).map((a) => ({
    key: a.key,
    name: a.name,
    description: a.description,
    needsModel: a.needsModel,
    available: a.needsModel ? model : true,
    note: a.needsModel && !model ? 'Requires the Claude API key.' : 'Runs without the AI provider.',
  }));
}
