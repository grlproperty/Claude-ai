import { prisma } from './db';
import { ForbiddenError, type Principal } from './permissions';
import {
  InvalidDecisionError,
  resolveDecision,
  type DecisionInput,
  type DecisionOutcome,
} from '../domain/decisions';
import type { EscalationOption } from '../domain/escalation';

/**
 * Carrying out a decision taken in the inbox (§25).
 *
 * The domain module decides what a decision means. This writes it down: the
 * escalation, the work it creates, and the audit trail. All of it in one
 * transaction, because a delegation that records the hand-over but loses the
 * task is worse than one that fails outright — the matter would leave Mandy's
 * inbox and land nowhere.
 */

export interface DecisionResult {
  outcome: DecisionOutcome;
  resolved: boolean;
  taskId: string | null;
  /** Written for the person who took the decision, in their own terms. */
  message: string;
}

/** Who may be handed a matter. Never includes the person deciding. */
export async function delegationCandidates(deciderId: string) {
  const staff = await prisma.user.findMany({
    where: { active: true, id: { not: deciderId } },
    select: { id: true, name: true, role: true, department: true },
    orderBy: [{ department: 'asc' }, { name: 'asc' }],
  });
  return staff;
}

export async function recordDecision(
  actor: Principal,
  escalationId: string,
  input: DecisionInput,
  now = new Date(),
): Promise<DecisionResult> {
  const escalation = await prisma.escalation.findUnique({ where: { id: escalationId } });
  if (!escalation) throw new InvalidDecisionError(['That matter no longer exists.']);

  // The inbox shows a matter to its assignee, and shows every L3 matter to the
  // CEO. Deciding follows the same rule — no wider.
  const mine = escalation.assigneeId === actor.id;
  const ceoMatter = escalation.level === 'L3_CEO' && actor.isCeo;
  if (!mine && !ceoMatter) throw new ForbiddenError('decide:escalation');

  const effect = resolveDecision(input, {
    escalationId,
    deciderId: actor.id,
    options: (Array.isArray(escalation.options) ? escalation.options : []) as unknown as EscalationOption[],
    recommendation: escalation.recommendation,
    alreadyResolved: escalation.resolvedAt != null,
    now,
  });

  // A named owner has to be a real, active person: a task owned by nobody is
  // the failure this system exists to prevent.
  if (effect.task) {
    const owner = await prisma.user.findFirst({ where: { id: effect.task.ownerId, active: true } });
    if (!owner) throw new InvalidDecisionError(['That person is not on the team, or is no longer active.']);
  }

  const taskId = await prisma.$transaction(async (tx) => {
    let createdTaskId: string | null = null;

    if (effect.task) {
      const task = await tx.task.create({
        data: {
          title: effect.task.title,
          // The matter travels with the task: whoever picks it up should not
          // have to find the escalation to learn what it is about.
          detail: `${effect.task.detail}\n\nMatter: ${escalation.title}\n${escalation.issue}`,
          ownerType: 'USER',
          ownerId: effect.task.ownerId,
          createdById: actor.id,
          createdByAi: false,
          source: 'decision-inbox',
          priority: escalation.dueAt && escalation.dueAt <= now ? 'URGENT' : 'HIGH',
          dueAt: effect.task.dueAt ?? escalation.dueAt,
          escalationLevel: 'L1_STAFF',
          routingRationale: `Named by ${actor.name} when deciding "${escalation.title}".`,
        },
      });
      createdTaskId = task.id;
    }

    await tx.escalation.update({
      where: { id: escalationId },
      data: {
        actionsTaken: [...escalation.actionsTaken, effect.historyEntry],
        outcome: effect.outcome,
        ...(effect.resolves
          ? { resolvedAt: now, resolutionNote: effect.resolutionNote }
          : {}),
        ...(effect.newDueAt ? { dueAt: effect.newDueAt } : {}),
        ...(createdTaskId ? { taskId: createdTaskId } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: actor.id,
        action: `decision.${effect.outcome.toLowerCase()}`,
        entity: 'Escalation',
        entityId: escalationId,
        before: { resolvedAt: null, outcome: escalation.outcome },
        after: { resolved: effect.resolves, outcome: effect.outcome, taskId: createdTaskId },
        rationale: effect.historyEntry,
      },
    });

    return createdTaskId;
  });

  return {
    outcome: effect.outcome,
    resolved: effect.resolves,
    taskId,
    message: messageFor(effect.outcome, effect.resolves),
  };
}

function messageFor(outcome: DecisionOutcome, resolved: boolean): string {
  switch (outcome) {
    case 'APPROVED':
      return 'Approved and recorded.';
    case 'REJECTED':
      return 'Rejected and recorded.';
    case 'DELEGATED':
      return 'Handed over. It is now on their list, with the reason attached.';
    case 'INFORMATION_REQUESTED':
      return 'Asked. The matter stays here until the answer comes back.';
    case 'DEFERRED':
      return resolved ? 'Deferred.' : 'Deferred. It returns on the date you set.';
  }
}
