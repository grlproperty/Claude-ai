import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { executePlan, recoveredToday } from '../src/server/executor';
import type { PreparedItem } from '../src/server/executive';
import type { RiskFinding } from '../src/domain/risk';
import type { RoutingDecision } from '../src/domain/types';

/**
 * The executor is where the system's honesty is decided: it must not record
 * work as done when nothing changed, and it must say what it could not do.
 */

const prisma = new PrismaClient();
const TAG = 'EXECTEST';
let userId: string;

beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: `${TAG}@grlp.invalid` },
    update: {},
    create: { email: `${TAG}@grlp.invalid`, name: `${TAG} User`, role: 'SALES_AGENT', department: 'SALES' },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { startsWith: TAG } } });
  await prisma.aiAction.deleteMany({ where: { savedFor: userId } });
  await prisma.task.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  await prisma.$disconnect();
});

function finding(over: Partial<RiskFinding> = {}): RiskFinding {
  return {
    kind: 'OVERDUE_FOLLOW_UP',
    fingerprint: `${TAG}:${Math.random()}`,
    severity: 'NORMAL',
    title: `${TAG} Buyer has gone quiet`,
    detail: 'No contact for 15 days.',
    subjectType: 'lead',
    subjectId: `${TAG}-lead-1`,
    ownerId: null,
    suggestedAction: 'Send a follow-up message.',
    autoResolvable: true,
    ...over,
  };
}

function decision(over: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    ownerType: 'AI',
    ownerId: null,
    ownerName: 'AI',
    approverId: null,
    approverName: null,
    department: 'SALES',
    requiredApproval: 'AUTO_WITH_RULES',
    escalationLevel: 'L1_STAFF',
    ceoInvolvement: 'none',
    priority: 'NORMAL',
    estimatedMinutes: 0,
    minutesSavedIfAutomated: 12,
    nextAction: 'Follow up.',
    rationale: 'Within the AI’s remit.',
    needsOwnershipDecision: false,
    ...over,
  };
}

const item = (f = finding(), d = decision()): PreparedItem => ({
  finding: f,
  decision: d,
  outcome: 'ready',
  detail: 'ready',
  minutesSaved: d.minutesSavedIfAutomated,
});

describe('the executor changes something, or says it did not', () => {
  it('creates a real task, with the routing reason attached', async () => {
    const [outcome] = await executePlan([item()], userId);
    expect(outcome!.taskId).toBeTruthy();

    const task = await prisma.task.findUniqueOrThrow({ where: { id: outcome!.taskId! } });
    expect(task.createdByAi).toBe(true);
    expect(task.nextAction).toBe('Send a follow-up message.');
    expect(task.routingRationale).toContain('remit');
  });

  it('does not claim a message was sent when no mailbox is connected', async () => {
    const [outcome] = await executePlan([item()], userId);
    expect(outcome!.result).toBe('prepared');
    expect(outcome!.effectsBlocked.map((b) => b.effect)).toContain('send_email');
    expect(outcome!.detail).toMatch(/nothing has been sent/i);
  });

  it('claims only a few minutes when it could not finish the job', async () => {
    const [outcome] = await executePlan([item()], userId);
    // The full 12 minutes are only earned by actually sending.
    expect(outcome!.minutesSaved).toBeLessThanOrEqual(5);
  });

  it('records the full saving when nothing was blocked', async () => {
    const noSend = finding({ suggestedAction: 'Assign an owner and open the file.', title: `${TAG} File needs opening` });
    const [outcome] = await executePlan([item(noSend)], userId);
    expect(outcome!.result).toBe('done');
    expect(outcome!.effectsBlocked).toHaveLength(0);
    expect(outcome!.minutesSaved).toBe(12);
  });

  it('refuses to act above its approval level, and records the refusal', async () => {
    const [outcome] = await executePlan([item(finding(), decision({ requiredApproval: 'MANDY_ONLY' }))], userId);
    expect(outcome!.result).toBe('refused');
    expect(outcome!.taskId).toBeNull();
    expect(outcome!.minutesSaved).toBe(0);

    const action = await prisma.aiAction.findUniqueOrThrow({ where: { id: outcome!.aiActionId } });
    expect(action.status).toBe('BLOCKED_BY_APPROVAL');
    expect(action.blockedReason).toBeTruthy();
  });

  it('leaves human-owned work alone', async () => {
    const outcomes = await executePlan([item(finding(), decision({ ownerType: 'USER', ownerId: userId }))], userId);
    expect(outcomes).toHaveLength(0);
  });

  it('writes an audit line for everything it does', async () => {
    const f = finding({ subjectId: `${TAG}-audited` });
    await executePlan([item(f)], userId);
    const logs = await prisma.auditLog.findMany({ where: { entityId: `${TAG}-audited` } });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]!.rationale).toBeTruthy();
  });

  it('counts recovered time from the ledger, not from the plan', async () => {
    const before = await recoveredToday(userId);
    await executePlan([item(finding({ suggestedAction: 'Open the file.' }))], userId);
    const after = await recoveredToday(userId);
    expect(after).toBe(before + 12);
  });
});
