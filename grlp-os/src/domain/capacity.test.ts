import { describe, expect, it } from 'vitest';
import { assessCapacity, planBatch, recoveredTime, shouldBatch, tierFor, type DayLoad } from './capacity';

const day = (o: Partial<DayLoad> = {}): DayLoad => ({
  meetingMinutes: 60,
  openDecisions: 2,
  openTasks: 10,
  overdueTasks: 0,
  interruptionCount: 2,
  humanRequiredMinutes: 60,
  availableMinutes: 480,
  ...o,
});

describe('capacity protection', () => {
  it('says a light day is light', () => {
    const a = assessCapacity(day());
    expect(a.state).toBe('clear');
    expect(a.recommendations).toHaveLength(0);
    expect(a.headline).toMatch(/room/);
  });

  it('recognises an over-committed day and says by how much', () => {
    const a = assessCapacity(day({ meetingMinutes: 360, humanRequiredMinutes: 240, openDecisions: 9, interruptionCount: 12 }));
    expect(a.state).toBe('overloaded');
    expect(a.freeMinutes).toBeLessThan(0);
    expect(a.recommendations.some((r) => r.kind === 'decline')).toBe(true);
  });

  it('recommends batching rather than more interruptions', () => {
    const a = assessCapacity(day({ openDecisions: 9, humanRequiredMinutes: 200, meetingMinutes: 200 }));
    expect(a.recommendations.some((r) => r.kind === 'batch')).toBe(true);
  });

  it('counts interruptions and overdue work as real cost', () => {
    const calm = assessCapacity(day({ interruptionCount: 0, overdueTasks: 0 }));
    const fractured = assessCapacity(day({ interruptionCount: 15, overdueTasks: 12 }));
    expect(fractured.loadScore).toBeGreaterThan(calm.loadScore);
  });
});

describe('hours recovered is counted conservatively', () => {
  const records = [
    { disposition: 'ai_completed' as const, minutes: 200, forUserId: 'mandy' },
    { disposition: 'automated' as const, minutes: 70, forUserId: 'mandy' },
    { disposition: 'delegated' as const, minutes: 45, forUserId: 'mandy' },
    { disposition: 'human_required' as const, minutes: 38, forUserId: 'mandy' },
    { disposition: 'ai_completed' as const, minutes: 500, forUserId: 'jason' },
  ];

  it('counts only the named person’s time', () => {
    const r = recoveredTime(records, 'mandy');
    expect(r.aiCompletedMinutes).toBe(200);
    expect(r.recoveredMinutes).toBe(315);
  });

  it('never counts work that still needs her as recovered', () => {
    const r = recoveredTime(records, 'mandy');
    expect(r.humanRequiredMinutes).toBe(38);
    expect(r.recoveredMinutes).not.toContain(38);
    expect(r.breakdown).toContain('Your time required: 38 m');
  });

  it('reads the way the metric is spoken', () => {
    expect(recoveredTime(records, 'mandy').breakdown).toContain('AI completed: 3 h 20 m');
  });

  it('ignores negative or nonsense durations', () => {
    const r = recoveredTime([{ disposition: 'ai_completed', minutes: -60, forUserId: 'mandy' }], 'mandy');
    expect(r.recoveredMinutes).toBe(0);
  });
});

describe('notification intelligence', () => {
  it('interrupts only for urgent work the person owns', () => {
    expect(tierFor({ priority: 'URGENT', requiresDecision: false, isOwner: true })).toBe('URGENT');
    expect(tierFor({ priority: 'URGENT', requiresDecision: false, isOwner: false })).toBe('INFORMATION');
  });

  it('treats a decision as a decision, and a deadline as urgent', () => {
    expect(tierFor({ priority: 'NORMAL', requiresDecision: true, isOwner: true })).toBe('DECISION');
    expect(tierFor({ priority: 'NORMAL', requiresDecision: true, isOwner: true, dueAt: new Date(Date.now() + 3_600_000) })).toBe('URGENT');
  });

  it('holds everything below a decision for the batch', () => {
    expect(shouldBatch('INFORMATION')).toBe(true);
    expect(shouldBatch('ATTENTION')).toBe(true);
    expect(shouldBatch('DECISION')).toBe(false);
    expect(shouldBatch('URGENT')).toBe(false);
  });

  it('turns six small things into one interruption', () => {
    const plan = planBatch(['INFORMATION', 'INFORMATION', 'ATTENTION', 'INFORMATION', 'ATTENTION', 'INFORMATION']);
    expect(plan.batched).toBe(6);
    expect(plan.immediate).toBe(0);
    expect(plan.interruptionsAvoided).toBe(5);
    expect(plan.message).toMatch(/grouped into one summary/);
  });
});
