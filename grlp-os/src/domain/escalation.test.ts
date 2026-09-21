import { describe, expect, it } from 'vitest';
import { IncompleteEscalationError, levelFor, renderBrief, validateEscalation, type EscalationPayload } from './escalation';

const complete: EscalationPayload = {
  level: 'L3_CEO',
  title: 'Seller wants to withdraw a signed sole mandate',
  issue: 'The seller at 14 Protea Street has asked to cancel a sole mandate with 71 days left to run.',
  context: 'Listed 3 weeks ago at R4.2m. Two viewings, no offers. The seller cites a family relocation.',
  actionsTaken: ['Confirmed the mandate dates', 'Asked the seller for the reason in writing', 'Held the marketing spend'],
  options: [
    { key: 'release', label: 'Release the mandate', consequence: 'Goodwill kept; no commission', reversible: false },
    { key: 'hold', label: 'Hold to term', consequence: 'Mandate stands; relationship strain', reversible: true },
    { key: 'convert', label: 'Convert to open mandate', consequence: 'Some chance retained', reversible: true },
  ],
  recommendation: 'Convert to an open mandate',
  recommendationReason: 'It keeps a route to commission without forcing an unwilling seller to term.',
  decisionRequired: 'Release, hold, or convert?',
};

describe('escalations are decision-ready or they are not raised', () => {
  it('accepts a fully researched escalation', () => {
    expect(() => validateEscalation({ ...complete })).not.toThrow();
  });

  it('rejects "there is a problem"', () => {
    expect(() => validateEscalation({ title: 'Problem', issue: 'Something went wrong' })).toThrow(IncompleteEscalationError);
  });

  it('rejects an escalation with no recommendation', () => {
    const { recommendation, ...rest } = complete;
    void recommendation;
    expect(() => validateEscalation({ ...rest })).toThrow(/recommendation/);
  });

  it('rejects a single-option "decision", which is not a decision', () => {
    expect(() => validateEscalation({ ...complete, options: [complete.options[0]!] })).toThrow(/two options/);
  });

  it('renders a brief that leads with the decision, not the history', () => {
    const brief = renderBrief(complete);
    expect(brief).toContain('DECISION REQUIRED');
    expect(brief).toContain('RECOMMENDATION');
    expect(brief).toContain('ALREADY DONE');
    expect(brief.split('\n').length).toBeLessThan(20);
  });
});

describe('levelFor keeps level 3 narrow', () => {
  it('leaves resolvable work at staff level', () => {
    expect(levelFor({ departmentCanResolve: true }).level).toBe('L1_STAFF');
  });

  it('uses management for work a department cannot resolve alone', () => {
    expect(levelFor({ departmentCanResolve: false }).level).toBe('L2_MANAGEMENT');
  });

  it('reaches the CEO for legal exposure', () => {
    const r = levelFor({ riskFlags: ['LEGAL_OR_COMPLIANCE'] });
    expect(r.level).toBe('L3_CEO');
    expect(r.reasons[0]).toMatch(/legal/);
  });

  it('reaches the CEO on financial impact, and says the number', () => {
    const r = levelFor({ financialImpactZar: 250_000 });
    expect(r.level).toBe('L3_CEO');
    // en-ZA groups with a space: R250 000.
    expect(r.reasons.join(' ')).toMatch(/R\s?250\s000/);
  });

  it('does not reach the CEO for a small spend', () => {
    expect(levelFor({ financialImpactZar: 4_000, departmentCanResolve: true }).level).toBe('L1_STAFF');
  });

  it('always explains why it chose the level', () => {
    for (const args of [{ departmentCanResolve: true }, { departmentCanResolve: false }, { unresolvedByStaff: true }]) {
      expect(levelFor(args).reasons.length).toBeGreaterThan(0);
    }
  });
});
