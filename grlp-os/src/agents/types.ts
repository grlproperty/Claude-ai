import type { ApprovalLevel, OwnerType } from '../domain/types';

/**
 * The agent contract (§33).
 *
 * Every agent returns the same shape, so the executive layer can compose them,
 * the audit trail can record them, and the hours-recovered metric can count them
 * without knowing what any individual agent does.
 */

export type Provenance = 'FACT' | 'INFERENCE' | 'RECOMMENDATION' | 'DECISION';

export interface AgentOutput {
  /** What this is, in the words a person would use. */
  label: string;
  /** The content itself — a draft, a document body, a list, a number. */
  value: unknown;
  provenance: Provenance;
  /** Where it came from, so an inference is never mistaken for a fact. */
  basis: string;
}

export interface AgentResult {
  agent: string;
  action: string;
  status: 'completed' | 'needs_input' | 'blocked' | 'unavailable';
  /** One line, written for a busy reader. */
  summary: string;
  outputs: AgentOutput[];
  /** Inputs the agent needed and did not have. */
  missing: string[];
  /** Human minutes this genuinely removed. Zero unless the work is actually done. */
  minutesSaved: number;
  /** Whose time was saved. */
  savedFor: string | null;
  requiredApproval: ApprovalLevel;
  ownerType: OwnerType;
  /** Set when the agent could not act, in language a person can act on. */
  blockedReason?: string;
  modelUsage?: { model: string; inputTokens: number; outputTokens: number };
}

export interface AgentContext {
  /** Who the work is being done for. */
  forUserId: string;
  /** The acting user, for permission checks. */
  actingUserId: string;
  now: Date;
}

export interface Agent<I> {
  key: string;
  name: string;
  description: string;
  /** True when the agent cannot function without the language model. */
  needsModel: boolean;
  run: (input: I, ctx: AgentContext) => Promise<AgentResult>;
}

/** Standard result for an agent that cannot run because the model is absent. */
export function unavailable(agent: string, action: string, reason: string): AgentResult {
  return {
    agent,
    action,
    status: 'unavailable',
    summary: `${action} is unavailable: ${reason}`,
    outputs: [],
    missing: [],
    minutesSaved: 0,
    savedFor: null,
    requiredApproval: 'REVIEW',
    ownerType: 'AI',
    blockedReason: reason,
  };
}
