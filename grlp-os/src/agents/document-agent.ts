import { prepareDocument, type PrepareInput } from '../domain/documents';
import type { Agent, AgentContext, AgentResult } from './types';

/**
 * Populates an approved template and checks the result (§12, §14, §15).
 * No language model is involved: contract fields are copied from records, never
 * generated.
 */
export const documentAgent: Agent<PrepareInput & { manualMinutes?: number }> = {
  key: 'document',
  name: 'Document Agent',
  description: 'Populates approved templates from the records on file and validates the result.',
  needsModel: false,

  async run(input, ctx: AgentContext): Promise<AgentResult> {
    const doc = prepareDocument(input);
    const manualMinutes = input.manualMinutes ?? 75;
    const reviewMinutes = Math.max(3, Math.round(manualMinutes * 0.15));

    const errors = doc.issues.filter((i) => i.severity === 'error');
    const warnings = doc.issues.filter((i) => i.severity === 'warning');

    return {
      agent: 'document',
      action: `Prepare ${doc.templateKey} (v${doc.templateVersion})`,
      status: doc.readyForReview ? 'completed' : 'needs_input',
      summary: doc.readyForReview
        ? `${doc.templateKey.toUpperCase()} prepared from template v${doc.templateVersion}. ${doc.summary} Ready for review.`
        : `${doc.templateKey.toUpperCase()} prepared as far as the records allow. ${doc.summary}`,
      outputs: [
        { label: 'Document', value: doc.body, provenance: 'FACT', basis: `Template ${doc.templateKey} v${doc.templateVersion}, fields copied from the records.` },
        { label: 'Fields', value: doc.fields, provenance: 'FACT', basis: 'Each field records the record it came from.' },
        { label: 'Checks', value: { errors, warnings }, provenance: 'FACT', basis: 'Field validation and cross-field consistency checks.' },
      ],
      missing: doc.missingRequired,
      // Only the preparation is claimed; the review is still a person's time.
      minutesSaved: doc.readyForReview ? manualMinutes - reviewMinutes : 0,
      savedFor: ctx.forUserId,
      requiredApproval: doc.requiredApproval,
      ownerType: 'AI',
      blockedReason: doc.readyForReview
        ? undefined
        : [
            doc.missingRequired.length ? `Missing: ${doc.missingRequired.join(', ')}.` : null,
            errors.length ? `Errors: ${errors.map((e) => `${e.field} — ${e.message}`).join(' ')}` : null,
          ]
            .filter(Boolean)
            .join(' '),
    };
  },
};
