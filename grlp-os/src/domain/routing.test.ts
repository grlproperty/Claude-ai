import { describe, expect, it } from 'vitest';
import { route, requiresCeo, loadFactor } from './routing';
import { WORK_CATALOGUE } from './work-catalogue';
import type { StaffMember } from './types';

/** The real GRLP team. Loads are the variable under test, not the people. */
function team(overrides: Partial<Record<string, Partial<StaffMember>>> = {}): StaffMember[] {
  const base: StaffMember[] = [
    { id: 'mandy', name: 'Mandy', role: 'CEO', department: 'EXECUTIVE', isCeo: true, active: true, acceptsDelegation: true, weeklyCapacityHours: 45, committedHours: 40, overdueCount: 3, away: false },
    { id: 'kandy', name: 'Kandy', role: 'SALES_AGENT', department: 'SALES', isCeo: false, active: true, acceptsDelegation: true, weeklyCapacityHours: 40, committedHours: 20, overdueCount: 0, away: false },
    { id: 'jason', name: 'Jason', role: 'SALES_AGENT', department: 'SALES', isCeo: false, active: true, acceptsDelegation: true, weeklyCapacityHours: 40, committedHours: 30, overdueCount: 2, away: false },
    { id: 'angela', name: 'Angela', role: 'SALES_AGENT', department: 'SALES', isCeo: false, active: true, acceptsDelegation: true, weeklyCapacityHours: 40, committedHours: 12, overdueCount: 0, away: false },
    { id: 'laurel', name: 'Laurel', role: 'SALES_AGENT', department: 'SALES', isCeo: false, active: true, acceptsDelegation: true, weeklyCapacityHours: 40, committedHours: 25, overdueCount: 1, away: false },
    { id: 'linda', name: 'Linda', role: 'MARKETING_ADMIN', department: 'MARKETING', isCeo: false, active: true, acceptsDelegation: true, weeklyCapacityHours: 40, committedHours: 22, overdueCount: 1, away: false },
    { id: 'lisa', name: 'Lisa', role: 'RENTALS', department: 'RENTALS', isCeo: false, active: true, acceptsDelegation: true, weeklyCapacityHours: 40, committedHours: 26, overdueCount: 0, away: false },
    { id: 'marion', name: 'Marion', role: 'ACCOUNTS', department: 'ACCOUNTS', isCeo: false, active: true, acceptsDelegation: true, weeklyCapacityHours: 40, committedHours: 24, overdueCount: 0, away: false },
  ];
  return base.map((s) => ({ ...s, ...(overrides[s.id] ?? {}) }));
}

describe('routing: step 1 & 2 — work that needs no person', () => {
  it('handles inbox triage without involving anybody', () => {
    const d = route({ workKey: 'email.triage', staff: team() });
    expect(d.ownerType).toBe('AUTOMATION');
    expect(d.ownerId).toBeNull();
    expect(d.ceoInvolvement).toBe('none');
    expect(d.estimatedMinutes).toBe(0);
  });

  it('assigns an incoming lead automatically and saves the manual minutes', () => {
    const d = route({ workKey: 'lead.assign', staff: team() });
    expect(d.ownerType).toBe('AUTOMATION');
    expect(d.minutesSavedIfAutomated).toBe(WORK_CATALOGUE['lead.assign']!.manualMinutes);
  });

  it('stops the AI short when a required input is missing', () => {
    const d = route({
      workKey: 'transaction.chase_document',
      staff: team(),
      context: { missingInputs: ['document.kind'] },
    });
    expect(d.ownerType).toBe('USER');
    expect(d.rationale).toContain('document.kind');
  });
});

describe('routing: prepared work goes to review, not to the doer', () => {
  it('prepares a mandate and sends it to a sales agent to approve — not Mandy', () => {
    const d = route({ workKey: 'mandate.prepare', staff: team(), context: { valueZar: 2_500_000 } });
    expect(d.ownerType).toBe('AI');
    expect(d.approverId).not.toBe('mandy');
    expect(requiresCeo(d)).toBe(false);
    // The saving is real work removed, not the whole task claimed.
    expect(d.minutesSavedIfAutomated).toBeGreaterThan(0);
    expect(d.estimatedMinutes).toBeLessThan(WORK_CATALOGUE['mandate.prepare']!.manualMinutes);
  });

  it('escalates the same mandate to Mandy once it crosses the value threshold', () => {
    const d = route({ workKey: 'mandate.prepare', staff: team(), context: { valueZar: 8_000_000 } });
    expect(d.approverId).toBe('mandy');
    expect(d.ceoInvolvement).toBe('decision');
    expect(d.rationale).toMatch(/threshold/);
  });

  it('keeps the valuation opinion with Mandy but does the analysis for her', () => {
    const d = route({ workKey: 'market_assessment.prepare', staff: team() });
    expect(d.ownerType).toBe('AI');
    expect(d.approverId).toBe('mandy');
    expect(d.requiredApproval).toBe('MANDY_ONLY');
    // She reviews rather than prepares: most of the two hours is removed.
    expect(d.estimatedMinutes).toBeLessThanOrEqual(20);
  });

  it('routes an OTP to signature and never claims to sign it', () => {
    const d = route({ workKey: 'otp.prepare', staff: team(), context: { valueZar: 1_800_000 } });
    expect(d.requiredApproval).toBe('SIGNATURE');
    expect(d.ownerType).toBe('AI');
    expect(d.nextAction).toMatch(/review/i);
  });
});

describe('routing: step 4 — the best person, by responsibility and load', () => {
  it('sends compliance verification to the back office, and only to a human', () => {
    const d = route({ workKey: 'fica.verify', staff: team() });
    // ASSIST work: the AI may flag gaps, but the determination is Marion's.
    expect(d.ownerType).toBe('USER');
    expect(d.ownerId).toBe('marion');
    expect(d.department).toBe('ACCOUNTS');
  });

  it('gives sales work to the least-loaded agent when nobody owns it', () => {
    const d = route({ workKey: 'mandate.prepare', staff: team(), context: { missingInputs: ['listPrice'] } });
    expect(d.ownerId).toBe('angela'); // 12/40 committed — the most room
  });

  it('overrides load when an agent already owns the relationship', () => {
    const d = route({
      workKey: 'mandate.prepare',
      staff: team(),
      context: { missingInputs: ['listPrice'], relationshipOwnerId: 'jason' },
    });
    expect(d.ownerId).toBe('jason');
    expect(d.rationale).toContain('already owns this relationship');
  });

  it('skips staff who are away', () => {
    const d = route({
      workKey: 'mandate.prepare',
      staff: team({ angela: { away: true } }),
      context: { missingInputs: ['listPrice'] },
    });
    expect(d.ownerId).not.toBe('angela');
  });

  it('flags overload rather than hiding it', () => {
    const d = route({
      workKey: 'mandate.prepare',
      staff: team({ kandy: { committedHours: 60 }, jason: { committedHours: 60 }, angela: { committedHours: 60 }, laurel: { committedHours: 60 } }),
      context: { missingInputs: ['listPrice'] },
    });
    expect(d.rationale).toMatch(/over capacity/);
  });
});

describe('routing: Linda is not the default dumping ground', () => {
  it('sends marketing work to Linda because it is genuinely marketing', () => {
    const d = route({ workKey: 'marketing.social_post', staff: team() });
    expect(d.department).toBe('MARKETING');
    expect(d.approverId).toBe('linda');
  });

  it('never routes sales, rental or accounts work to Linda', () => {
    const nonMarketing = Object.values(WORK_CATALOGUE).filter((s) => s.department !== 'MARKETING');
    for (const s of nonMarketing) {
      const d = route({ workKey: s.key, staff: team(), context: { missingInputs: s.requiredInputs } });
      expect(d.ownerId, `${s.key} was routed to Linda`).not.toBe('linda');
      expect(d.approverId, `${s.key} approval was routed to Linda`).not.toBe('linda');
    }
  });

  it('asks management who owns unknown work instead of guessing', () => {
    const d = route({ workKey: 'something.nobody.defined', staff: team() });
    expect(d.needsOwnershipDecision).toBe(true);
    expect(d.escalationLevel).toBe('L2_MANAGEMENT');
    expect(d.ownerId).toBeNull();
    expect(d.ceoInvolvement).toBe('none');
  });
});

describe('routing: rentals stay out of the CEO’s day', () => {
  it('routes routine maintenance to Lisa', () => {
    const d = route({ workKey: 'rental.maintenance_routine', staff: team(), context: { valueZar: 2_500 } });
    expect(d.approverId ?? d.ownerId).toBe('lisa');
    expect(requiresCeo(d)).toBe(false);
  });

  it('routes arrears to Marion, not to Mandy', () => {
    const d = route({ workKey: 'rental.arrears_follow_up', staff: team() });
    expect(d.approverId ?? d.ownerId).not.toBe('mandy');
    expect(d.department).toBe('ACCOUNTS');
  });

  it('only reaches Mandy for a major maintenance spend', () => {
    const small = route({ workKey: 'rental.maintenance_major', staff: team(), context: { valueZar: 6_000, missingInputs: ['quote'] } });
    const large = route({ workKey: 'rental.maintenance_major', staff: team(), context: { valueZar: 90_000, missingInputs: ['quote'] } });
    expect(small.ownerId).toBe('lisa');
    expect(large.ownerId).toBe('mandy');
    expect(large.escalationLevel).toBe('L3_CEO');
  });
});

describe('routing: personal work is walled off', () => {
  it('keeps personal matters away from company staff', () => {
    const d = route({
      workKey: 'personal.appointment',
      staff: team(),
      context: { domain: 'PERSONAL', missingInputs: ['subject'] },
    });
    expect(d.ownerId).toBe('mandy');
    expect(d.department).toBe('EXECUTIVE');
  });
});

/**
 * §57's product-quality metric, expressed as a test: across the whole catalogue
 * of routine work, how often is the CEO pulled in?
 */
describe('product quality: does Mandy get interrupted unnecessarily?', () => {
  const routine = Object.values(WORK_CATALOGUE).filter((s) => s.neverRoutineForCeo);

  it('never puts routine work on the CEO', () => {
    for (const s of routine) {
      const d = route({ workKey: s.key, staff: team() });
      expect(requiresCeo(d), `${s.key} reached Mandy`).toBe(false);
      expect(d.ownerId, `${s.key} was assigned to Mandy`).not.toBe('mandy');
    }
  });

  it('keeps CEO involvement under a fifth of all catalogued work', () => {
    const all = Object.values(WORK_CATALOGUE);
    const touched = all.filter((s) => requiresCeo(route({ workKey: s.key, staff: team() })));
    expect(touched.length / all.length).toBeLessThan(0.2);
  });

  it('every item that does reach Mandy explains why', () => {
    for (const s of Object.values(WORK_CATALOGUE)) {
      const d = route({ workKey: s.key, staff: team() });
      if (requiresCeo(d)) expect(d.rationale.length, `${s.key} had no rationale`).toBeGreaterThan(20);
    }
  });
});

describe('loadFactor', () => {
  it('treats zero capacity as unavailable rather than infinitely free', () => {
    const [s] = team();
    expect(loadFactor({ ...s!, weeklyCapacityHours: 0 })).toBe(Number.POSITIVE_INFINITY);
  });
});
