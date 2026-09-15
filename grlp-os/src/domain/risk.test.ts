import { describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT, autoResolvableShare, sweep, type BusinessSnapshot } from './risk';

const NOW = new Date('2026-09-07T09:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const daysAhead = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

const snap = (over: Partial<BusinessSnapshot>): BusinessSnapshot => ({ ...EMPTY_SNAPSHOT, ...over });

describe('the sweep finds what nobody has time to look for', () => {
  it('catches an enquiry that was never answered', () => {
    const f = sweep(
      snap({ leads: [{ id: 'l1', stage: 'NEW', contactName: 'R Adams', ownerId: 'kandy', createdAt: hoursAgo(30), lastContactAt: null }] }),
      NOW,
    );
    expect(f[0]?.kind).toBe('FORGOTTEN_LEAD');
    expect(f[0]?.autoResolvable).toBe(true);
    expect(f[0]?.ownerId).toBe('kandy');
  });

  it('escalates the severity the longer an enquiry sits', () => {
    const young = sweep(snap({ leads: [{ id: 'l1', stage: 'NEW', contactName: 'A', ownerId: null, createdAt: hoursAgo(30), lastContactAt: null }] }), NOW);
    const old = sweep(snap({ leads: [{ id: 'l1', stage: 'NEW', contactName: 'A', ownerId: null, createdAt: hoursAgo(100), lastContactAt: null }] }), NOW);
    expect(young[0]?.severity).toBe('HIGH');
    expect(old[0]?.severity).toBe('URGENT');
  });

  it('leaves converted and lost leads alone', () => {
    const f = sweep(
      snap({
        leads: [
          { id: 'l1', stage: 'CONVERTED', contactName: 'A', ownerId: null, createdAt: daysAgo(90), lastContactAt: null },
          { id: 'l2', stage: 'LOST', contactName: 'B', ownerId: null, createdAt: daysAgo(90), lastContactAt: null },
        ],
      }),
      NOW,
    );
    expect(f).toHaveLength(0);
  });

  it('notices a seller who has heard nothing since a viewing', () => {
    const f = sweep(
      snap({
        viewings: [{ id: 'v1', propertyRef: 'GRLP-114', contactName: 'M Botha', agentId: 'jason', completedAt: daysAgo(8), feedback: 'Liked it', sellerUpdatedAt: null }],
      }),
      NOW,
    );
    const finding = f.find((x) => x.title.includes('Seller'));
    expect(finding?.severity).toBe('HIGH');
    expect(finding?.detail).toMatch(/8 days/);
  });

  it('notices a transaction that has stopped moving, and what it is waiting on', () => {
    const f = sweep(
      snap({
        transactions: [{ id: 't1', propertyRef: 'GRLP-114', stage: 'BOND_APPLICATION', agentId: 'kandy', lastMovementAt: daysAgo(25), outstandingItems: ['bond approval letter'] }],
      }),
      NOW,
    );
    expect(f[0]?.kind).toBe('STALLED_TRANSACTION');
    expect(f[0]?.severity).toBe('URGENT');
    expect(f[0]?.suggestedAction).toContain('bond approval letter');
  });

  it('warns before a mandate expires and again once it has lapsed', () => {
    const expiring = sweep(snap({ mandates: [{ id: 'm1', propertyRef: 'GRLP-9', status: 'ACTIVE', agentId: 'angela', endDate: daysAhead(10) }] }), NOW);
    const lapsed = sweep(snap({ mandates: [{ id: 'm1', propertyRef: 'GRLP-9', status: 'ACTIVE', agentId: 'angela', endDate: daysAgo(5) }] }), NOW);
    expect(expiring[0]?.kind).toBe('MANDATE_EXPIRING');
    expect(lapsed[0]?.kind).toBe('NEGLECTED_RENEWAL');
    // A renewal conversation is a person's job, not the system's.
    expect(expiring[0]?.autoResolvable).toBe(false);
  });

  it('chases an unsigned document', () => {
    const f = sweep(snap({ documents: [{ id: 'd1', title: 'Sole mandate — GRLP-114', kind: 'MANDATE', status: 'AWAITING_SIGNATURE', ownerId: 'kandy', awaitingSignatureSince: daysAgo(6), missingFieldCount: 0 }] }), NOW);
    expect(f[0]?.kind).toBe('UNSIGNED_DOCUMENT');
  });

  it('does not chase a document that has only just gone out', () => {
    const f = sweep(snap({ documents: [{ id: 'd1', title: 'x', kind: 'MANDATE', status: 'AWAITING_SIGNATURE', ownerId: null, awaitingSignatureSince: hoursAgo(6), missingFieldCount: 0 }] }), NOW);
    expect(f).toHaveLength(0);
  });

  it('separates a merely overdue task from a genuinely missed deadline', () => {
    const f = sweep(
      snap({
        tasks: [
          { id: 't1', title: 'Send seller pack', ownerId: 'linda', ownerName: 'Linda', dueAt: daysAgo(2), status: 'PENDING' },
          { id: 't2', title: 'Submit compliance file', ownerId: 'marion', ownerName: 'Marion', dueAt: daysAgo(12), status: 'PENDING' },
        ],
      }),
      NOW,
    );
    expect(f.find((x) => x.subjectId === 't1')?.kind).toBe('OVERDUE_STAFF_TASK');
    expect(f.find((x) => x.subjectId === 't2')?.kind).toBe('MISSED_DEADLINE');
  });

  it('asks for an owner when an overdue task has none', () => {
    const f = sweep(snap({ tasks: [{ id: 't1', title: 'x', ownerId: null, ownerName: null, dueAt: daysAgo(2), status: 'PENDING' }] }), NOW);
    expect(f[0]?.autoResolvable).toBe(false);
    expect(f[0]?.suggestedAction).toBe('Assign an owner.');
  });

  it('flags a decision the CEO has been sitting on', () => {
    const f = sweep(snap({ escalations: [{ id: 'e1', title: 'Seller wants out', level: 'L3_CEO', assigneeId: 'mandy', createdAt: daysAgo(4), resolvedAt: null, dueAt: daysAgo(1) }] }), NOW);
    expect(f[0]?.kind).toBe('UNRESOLVED_ESCALATION');
    expect(f[0]?.severity).toBe('URGENT');
  });

  it('ignores low-priority correspondence when hunting for unanswered clients', () => {
    const f = sweep(
      snap({
        communications: [
          { id: 'c1', subject: 'Newsletter', fromName: 'Portal', ownerId: null, receivedAt: daysAgo(5), answeredAt: null, category: 'LOW_PRIORITY' },
          { id: 'c2', subject: 'Following up on my offer', fromName: 'T Mokoena', ownerId: 'jason', receivedAt: daysAgo(4), answeredAt: null, category: 'CLIENT' },
        ],
      }),
      NOW,
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.subjectId).toBe('c2');
  });

  it('gives a stable fingerprint so the same problem is not raised twice', () => {
    const s = snap({ leads: [{ id: 'l1', stage: 'NEW', contactName: 'A', ownerId: null, createdAt: hoursAgo(30), lastContactAt: null }] });
    expect(sweep(s, NOW)[0]?.fingerprint).toBe(sweep(s, new Date(NOW.getTime() + 3_600_000))[0]?.fingerprint);
  });

  it('sorts the most serious findings first', () => {
    const f = sweep(
      snap({
        leads: [{ id: 'l1', stage: 'QUALIFIED', contactName: 'A', ownerId: null, createdAt: daysAgo(60), lastContactAt: daysAgo(20) }],
        transactions: [{ id: 't1', propertyRef: 'X', stage: 'CONVEYANCING', agentId: null, lastMovementAt: daysAgo(30), outstandingItems: [] }],
      }),
      NOW,
    );
    expect(f[0]?.severity).toBe('URGENT');
  });

  it('finds nothing wrong with a business in good order', () => {
    expect(sweep(EMPTY_SNAPSHOT, NOW)).toHaveLength(0);
    expect(autoResolvableShare([])).toBe(1);
  });

  it('reports how much of the sweep it can clear itself', () => {
    const f = sweep(
      snap({
        leads: [{ id: 'l1', stage: 'NEW', contactName: 'A', ownerId: null, createdAt: hoursAgo(30), lastContactAt: null }],
        mandates: [{ id: 'm1', propertyRef: 'X', status: 'ACTIVE', agentId: null, endDate: daysAhead(10) }],
      }),
      NOW,
    );
    expect(autoResolvableShare(f)).toBe(0.5);
  });
});
