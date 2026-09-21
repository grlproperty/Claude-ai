import { triage, type TriageInput, type TriageResult } from '../domain/triage';
import { GRLP_VOICE, aiAvailable, complete } from './provider';
import type { Agent, AgentContext, AgentResult } from './types';
import { unavailable } from './types';

export interface CommunicationInput extends TriageInput {
  /** Set to also produce a draft reply. Triage alone needs no model. */
  draftReply?: boolean;
  /** The person the reply is signed by. Never defaults to the CEO. */
  replyFromName?: string;
  /** Facts the drafter may use. It must not introduce any others. */
  knownFacts?: string[];
}

/**
 * Triage and drafting (§20, §21).
 *
 * Triage is rule-based and always available. Drafting needs the model, and when
 * the model is absent the agent says so rather than sending something generic.
 */
export const communicationAgent: Agent<CommunicationInput> = {
  key: 'communication',
  name: 'Communication Agent',
  description: 'Classifies incoming messages, routes them, and drafts replies for approval.',
  needsModel: false,

  async run(input, ctx: AgentContext): Promise<AgentResult> {
    const result: TriageResult = triage({ ...input, receivedAt: input.receivedAt ?? ctx.now });

    const outputs: AgentResult['outputs'] = [
      { label: 'Category', value: result.category, provenance: 'INFERENCE', basis: result.reasons.join(' ') },
      { label: 'Decision', value: result.decision, provenance: 'RECOMMENDATION', basis: result.reasons.join(' ') },
      { label: 'Urgency', value: result.urgencyScore, provenance: 'INFERENCE', basis: 'Rule match plus any urgency the sender signalled.' },
    ];
    if (result.deadlines.length) {
      outputs.push({
        label: 'Deadlines mentioned',
        value: result.deadlines,
        provenance: 'FACT',
        basis: 'Read from unambiguous dates in the message text.',
      });
    }

    let minutesSaved = 2; // the triage itself
    let draft: string | null = null;
    let modelUsage: AgentResult['modelUsage'];

    const wantsDraft = input.draftReply && ['AI_HANDLE', 'AUTO_REPLY', 'DRAFT_FOR_REVIEW'].includes(result.decision);

    if (wantsDraft && !aiAvailable()) {
      return {
        ...unavailable('communication', 'Draft a reply', 'the Claude API key is not configured'),
        summary:
          `Triaged as ${result.category} → ${result.decision}. The draft reply could not be written because the AI provider is not connected; triage, routing and the deadline read all still applied.`,
        outputs,
        minutesSaved,
        savedFor: ctx.forUserId,
        status: 'completed',
      };
    }

    if (wantsDraft) {
      const completion = await complete({
        system: GRLP_VOICE,
        temperature: 0.3,
        prompt: [
          'Draft a reply to this message.',
          `Sign it from: ${input.replyFromName ?? 'the responsible agent'}.`,
          '',
          `Subject: ${input.subject ?? '(none)'}`,
          `From: ${input.fromName ?? 'Unknown'}`,
          `Message:\n${input.body ?? '(no body)'}`,
          '',
          input.knownFacts?.length
            ? `The only facts you may state are these:\n${input.knownFacts.map((f) => `- ${f}`).join('\n')}`
            : 'You have been given no confirmed facts about this matter. Acknowledge, and say the details are being confirmed. Do not state any price, date or figure.',
          '',
          'Return the email body only.',
        ].join('\n'),
      });
      draft = completion.text;
      modelUsage = { model: completion.model, inputTokens: completion.inputTokens, outputTokens: completion.outputTokens };
      minutesSaved += 8;
      outputs.push({
        label: 'Draft reply',
        value: draft,
        provenance: 'RECOMMENDATION',
        basis: 'Written from the message and the confirmed facts supplied. Requires approval before sending.',
      });
    }

    return {
      agent: 'communication',
      action: 'Triage message',
      status: 'completed',
      summary: `${result.category} → ${result.decision}${result.suggestedDepartment ? ` (${result.suggestedDepartment.toLowerCase()})` : ''}${draft ? ', draft reply ready for approval' : ''}.`,
      outputs,
      missing: [],
      minutesSaved,
      savedFor: ctx.forUserId,
      // A drafted reply is never sent without approval, whatever the triage said.
      requiredApproval: draft ? 'APPROVAL' : 'AUTO',
      ownerType: 'AI',
      modelUsage,
    };
  },
};
