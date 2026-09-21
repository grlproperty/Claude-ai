import { describe, expect, it } from 'vitest';

import { InvalidDecisionError, resolveDecision, type DecisionContext } from './decisions';

const NOW = new Date('2026-09-15T08:00:00Z');
const LATER = new Date('2026-09-22T08:00:00Z');
const EARLIER = new Date('2026-09-01T08:00:00Z');

const context = (over: Partial<DecisionContext> = {}): DecisionContext => ({
  escalationId: 'esc_1',
  deciderId: 'user_mandy',
  options: [
    { key: 'accept', label: 'Accept the offer at R4 250 000', consequence: 'Transfer proceeds', reversible: false },
    { key: 'counter', label: 'Counter at R4 400 000', consequence: 'Buyer may walk', reversible: true },
  ],
  recommendation: 'Counter at R4 400 000',
  alreadyResolved: false,
  now: NOW,
  ...over,
});

describe('approving', () => {
  it('records which option was approved, not merely that something was', () => {
    const effect = resolveDecision({ outcome: 'APPROVED', optionKey: 'counter' }, context());
    expect(effect.resolves).toBe(true);
    expect(effect.outcome).toBe('APPROVED');
    expect(effect.chosenOption?.key).toBe('counter');
    expect(effect.resolutionNote).toBe('Counter at R4 400 000');
  });

  it('will not approve in the abstract when options were offered', () => {
    expect(() => resolveDecision({ outcome: 'APPROVED' }, context())).toThrow(InvalidDecisionError);
  });

  it('approves the recommendation when the escalation offered no options', () => {
    const effect = resolveDecision({ outcome: 'APPROVED' }, context({ options: [] }));
    expect(effect.resolutionNote).toBe('Counter at R4 400 000');
  });

  it('rejects an option the escalation never offered', () => {
    try {
      resolveDecision({ outcome: 'APPROVED', optionKey: 'withdraw' }, context());
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as InvalidDecisionError).problems).toContain('That option was not one of the options offered.');
    }
  });

  // Whoever reads the history later needs to know this one could not be taken back.
  it('says so in the history when the approved option is irreversible', () => {
    const effect = resolveDecision({ outcome: 'APPROVED', optionKey: 'accept' }, context());
    expect(effect.historyEntry).toContain('cannot be undone');
  });

  it('does not claim irreversibility for a reversible option', () => {
    const effect = resolveDecision({ outcome: 'APPROVED', optionKey: 'counter' }, context());
    expect(effect.historyEntry).not.toContain('cannot be undone');
  });
});

describe('rejecting', () => {
  it('requires a reason', () => {
    expect(() => resolveDecision({ outcome: 'REJECTED' }, context())).toThrow(
      /Say why it is rejected/,
    );
  });

  it('treats whitespace as no reason at all', () => {
    expect(() => resolveDecision({ outcome: 'REJECTED', note: '   ' }, context())).toThrow(InvalidDecisionError);
  });

  it('carries the reason into the record and the history', () => {
    const effect = resolveDecision({ outcome: 'REJECTED', note: 'Below the mandate price.' }, context());
    expect(effect.resolves).toBe(true);
    expect(effect.resolutionNote).toBe('Below the mandate price.');
    expect(effect.historyEntry).toContain('Below the mandate price.');
  });
});

describe('delegating', () => {
  it('requires a named person — there is no default owner', () => {
    try {
      resolveDecision({ outcome: 'DELEGATED' }, context());
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as InvalidDecisionError).problems).toContain('Name the person this goes to.');
    }
  });

  it('refuses delegation back to the person deciding', () => {
    expect(() => resolveDecision({ outcome: 'DELEGATED', assigneeId: 'user_mandy' }, context())).toThrow(
      /delegating to yourself/,
    );
  });

  it('creates work owned by the person it went to, and leaves the inbox', () => {
    const effect = resolveDecision(
      { outcome: 'DELEGATED', assigneeId: 'user_lisa', note: 'Lisa handles the rentbook side.' },
      context(),
    );
    expect(effect.resolves).toBe(true);
    expect(effect.task?.ownerId).toBe('user_lisa');
    expect(effect.task?.detail).toBe('Lisa handles the rentbook side.');
  });

  it('shortens a long recommendation into a usable task title', () => {
    const effect = resolveDecision(
      { outcome: 'DELEGATED', assigneeId: 'user_lisa' },
      context({ recommendation: 'x'.repeat(200) }),
    );
    expect(effect.task!.title.length).toBeLessThanOrEqual('Delegated: '.length + 80);
    expect(effect.task!.title).toContain('…');
  });
});

describe('asking for more information', () => {
  it('requires both a person and a question', () => {
    expect(() => resolveDecision({ outcome: 'INFORMATION_REQUESTED', assigneeId: 'user_marion' }, context())).toThrow(
      /what you are asking for/,
    );
    expect(() => resolveDecision({ outcome: 'INFORMATION_REQUESTED', note: 'When did they pay?' }, context())).toThrow(
      /Name the person/,
    );
  });

  // The question is not the answer: the decision is still Mandy's to take.
  it('keeps the matter in the inbox', () => {
    const effect = resolveDecision(
      { outcome: 'INFORMATION_REQUESTED', assigneeId: 'user_marion', note: 'When did the deposit clear?' },
      context(),
    );
    expect(effect.resolves).toBe(false);
    expect(effect.task?.ownerId).toBe('user_marion');
    expect(effect.historyEntry).toContain('When did the deposit clear?');
  });
});

describe('deferring', () => {
  it('requires a date and a reason', () => {
    try {
      resolveDecision({ outcome: 'DEFERRED' }, context());
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as InvalidDecisionError).problems).toEqual([
        'Give the date it comes back.',
        'Say what it is waiting for.',
      ]);
    }
  });

  it('refuses a date in the past', () => {
    expect(() =>
      resolveDecision({ outcome: 'DEFERRED', deferUntil: EARLIER, note: 'Waiting on the bank.' }, context()),
    ).toThrow(/must be in the future/);
  });

  it('keeps the matter open and moves when it is due', () => {
    const effect = resolveDecision(
      { outcome: 'DEFERRED', deferUntil: LATER, note: 'Waiting on the bond approval.' },
      context(),
    );
    expect(effect.resolves).toBe(false);
    expect(effect.newDueAt).toEqual(LATER);
    expect(effect.task).toBeNull();
  });
});

describe('a matter already decided', () => {
  it('cannot be decided again', () => {
    expect(() =>
      resolveDecision({ outcome: 'APPROVED', optionKey: 'counter' }, context({ alreadyResolved: true })),
    ).toThrow(/already been decided/);
  });
});

describe('reporting problems', () => {
  it('reports every problem at once rather than one per attempt', () => {
    try {
      resolveDecision({ outcome: 'DEFERRED', assigneeId: 'user_mandy' }, context());
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as InvalidDecisionError).problems.length).toBeGreaterThan(2);
    }
  });
});
