import { describe, expect, it } from 'vitest';
import { assertAllowed, guard, isAutonomous, minimumLevelForRisks, ApprovalBoundaryError } from './approvals';

describe('guardrails: what the system may never do alone', () => {
  it('refuses to sign a document', () => {
    const r = guard({ workKey: 'otp.prepare', grantedLevel: 'AUTO', actor: 'AI', effects: ['sign_document'] });
    expect(r.allowed).toBe(false);
    expect(r.violatedRule).toBe('SIGN_AS_HUMAN');
  });

  it('refuses to sign even when a human approval exists for the preparation', () => {
    const r = guard({
      workKey: 'otp.prepare',
      grantedLevel: 'SIGNATURE',
      actor: 'AI',
      humanApprovalId: 'appr_1',
      effects: ['sign_document'],
    });
    expect(r.allowed).toBe(false);
  });

  it('refuses to write its own contract wording', () => {
    const r = guard({ workKey: 'otp.prepare', grantedLevel: 'AUTO', actor: 'AI', effects: ['generate_clause'] });
    expect(r.violatedRule).toBe('ALTER_TEMPLATE_CLAUSE');
  });

  it('refuses to send as the CEO without her approval of that message', () => {
    const r = guard({ workKey: 'email.draft_for_ceo', grantedLevel: 'AUTO', actor: 'AI', effects: ['send_as_ceo'] });
    expect(r.violatedRule).toBe('IMPERSONATE_CEO');
  });

  it('allows sending as the CEO once she has approved that message', () => {
    const r = guard({
      workKey: 'email.draft_for_ceo',
      grantedLevel: 'APPROVAL',
      actor: 'AI',
      humanApprovalId: 'appr_9',
      effects: ['send_as_ceo'],
    });
    expect(r.allowed).toBe(true);
  });

  it('refuses to issue a valuation opinion by itself', () => {
    const r = guard({ workKey: 'market_assessment.prepare', grantedLevel: 'AUTO', actor: 'AI' });
    expect(r.allowed).toBe(false);
    expect(r.violatedRule).toBe('PROFESSIONAL_SIGN_OFF');
  });

  it('lets the system get on with genuinely autonomous work', () => {
    expect(guard({ workKey: 'email.triage', grantedLevel: 'AUTO', actor: 'AUTOMATION' }).allowed).toBe(true);
    expect(guard({ workKey: 'viewing.feedback_request', grantedLevel: 'AUTO_WITH_RULES', actor: 'AI', effects: ['send_email'] }).allowed).toBe(true);
  });

  it('never lets a granted level override the catalogue’s requirement', () => {
    // An agent that claims a higher grant than the work permits is still refused.
    const r = guard({ workKey: 'mandate.prepare', grantedLevel: 'AUTO', actor: 'AI', effects: ['file'] });
    expect(r.allowed).toBe(false);
    expect(r.requiredLevel).toBe('APPROVAL');
  });

  it('does not restrict a person acting within their own authority', () => {
    expect(guard({ workKey: 'mandate.prepare', grantedLevel: 'APPROVAL', actor: 'USER', actorRole: 'CEO' }).allowed).toBe(true);
  });

  it('throws with a usable message at call sites where proceeding is a bug', () => {
    expect(() => assertAllowed({ workKey: 'otp.prepare', grantedLevel: 'AUTO', actor: 'AI', effects: ['sign_document'] }))
      .toThrow(ApprovalBoundaryError);
  });
});

describe('approval levels', () => {
  it('treats only AUTO and AUTO_WITH_RULES as autonomous', () => {
    expect(isAutonomous('AUTO')).toBe(true);
    expect(isAutonomous('AUTO_WITH_RULES')).toBe(true);
    for (const l of ['REVIEW', 'APPROVAL', 'SIGNATURE', 'MANDY_ONLY'] as const) {
      expect(isAutonomous(l)).toBe(false);
    }
  });

  it('raises the floor when risk is present', () => {
    expect(minimumLevelForRisks(['LEGAL_OR_COMPLIANCE'])).toBe('MANDY_ONLY');
    expect(minimumLevelForRisks(['SIGNIFICANT_FINANCIAL'])).toBe('APPROVAL');
    expect(minimumLevelForRisks([])).toBe('AUTO');
  });
});
