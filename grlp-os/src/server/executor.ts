import { prisma } from './db';
import { guard } from '../domain/approvals';
import { isConfigured, type EnvLike } from '../integrations/registry';
import { mailboxConfig } from '../integrations/mailbox';
import type { PreparedItem } from './executive';

/**
 * Actually does the work.
 *
 * The planner decides what could be done without a person. This is what carries
 * it out, and it is deliberately strict about the difference: an action is only
 * recorded as done if something really changed. Where an action needs an
 * integration GRLP has not connected — sending mail, for instance — it says so
 * and records nothing as completed.
 *
 * Every execution writes an AiAction row. That ledger, not an estimate, is where
 * the hours-recovered figure comes from.
 */

export type Effect = 'create_task' | 'send_email' | 'update_record';

/** What each effect needs before it can genuinely happen. */
const EFFECT_REQUIREMENTS: Record<Effect, { integration?: string; describe: string }> = {
  create_task: { describe: 'create a task with an owner and a due date' },
  update_record: { describe: 'update the record' },
  send_email: { integration: 'mailbox', describe: 'send the message' },
};

export interface ExecutionOutcome {
  fingerprint: string;
  title: string;
  /** done — something changed. prepared — as far as it could go. refused — a boundary. */
  result: 'done' | 'prepared' | 'refused';
  effectsApplied: Effect[];
  effectsBlocked: Array<{ effect: Effect; reason: string }>;
  taskId: string | null;
  aiActionId: string;
  minutesSaved: number;
  detail: string;
}

/**
 * True when a mailbox the system can actually send through is configured.
 * GRLP's own IMAP/SMTP mailbox is the primary route; the hosted providers are
 * alternatives if the agency ever moves.
 */
export function mailboxConnected(env: EnvLike = process.env): boolean {
  return (
    mailboxConfig(env) != null || isConfigured('google_workspace', env) || isConfigured('microsoft_365', env)
  );
}

export async function executePlan(items: PreparedItem[], forUserId: string, now = new Date()): Promise<ExecutionOutcome[]> {
  const outcomes: ExecutionOutcome[] = [];

  for (const item of items) {
    const machine = item.decision.ownerType === 'AI' || item.decision.ownerType === 'AUTOMATION';
    if (!machine) continue;

    const permission = guard({
      workKey: undefined,
      grantedLevel: item.decision.requiredApproval,
      actor: item.decision.ownerType as 'AI' | 'AUTOMATION',
      effects: ['create_task'],
    });

    // Sending is the effect that needs a mailbox; creating the task never does.
    const wanted: Effect[] = ['create_task'];
    if (/send|reply|request|chase|update/i.test(item.finding.suggestedAction)) wanted.push('send_email');

    const applied: Effect[] = [];
    const blocked: ExecutionOutcome['effectsBlocked'] = [];
    let taskId: string | null = null;

    if (!permission.allowed) {
      const action = await recordAction({
        item,
        forUserId,
        status: 'BLOCKED_BY_APPROVAL',
        minutesSaved: 0,
        summary: `${item.finding.title} — not actioned. ${permission.reason}`,
        blockedReason: permission.reason,
        now,
      });
      outcomes.push({
        fingerprint: item.finding.fingerprint,
        title: item.finding.title,
        result: 'refused',
        effectsApplied: [],
        effectsBlocked: [{ effect: 'create_task', reason: permission.reason }],
        taskId: null,
        aiActionId: action.id,
        minutesSaved: 0,
        detail: permission.reason,
      });
      continue;
    }

    // Creating the task is real work and always possible.
    const task = await prisma.task.create({
      data: {
        title: item.finding.title,
        detail: item.finding.detail,
        status: 'PENDING',
        priority: item.finding.severity,
        ownerType: item.decision.ownerType,
        ownerId: item.decision.ownerId,
        department: item.decision.department,
        createdByAi: true,
        source: `risk:${item.finding.kind}`,
        nextAction: item.finding.suggestedAction,
        escalationLevel: item.decision.escalationLevel,
        requiredApproval: item.decision.requiredApproval,
        estimatedMinutes: item.decision.estimatedMinutes,
        routingRationale: item.decision.rationale,
      },
    });
    taskId = task.id;
    applied.push('create_task');

    if (wanted.includes('send_email')) {
      if (mailboxConnected()) {
        // Sending happens through the communication pipeline once a draft has
        // been approved. It is never triggered silently from a sweep — a client
        // hearing from GRLP is a deliberate act, not a side effect.
        blocked.push({
          effect: 'send_email',
          reason: 'The mailbox is connected. The message is queued for drafting and approval before it is sent.',
        });
      } else {
        blocked.push({
          effect: 'send_email',
          reason: `Cannot ${EFFECT_REQUIREMENTS.send_email.describe}: no mailbox is connected. The task is created and the next action recorded, but nothing has been sent.`,
        });
      }
    }

    const fullyDone = blocked.length === 0;
    // Time is only claimed for what actually happened. A created task is worth
    // the few minutes of noticing and writing it down, not the whole job.
    const minutesSaved = fullyDone ? item.minutesSaved : Math.min(item.minutesSaved, 5);

    const detail = fullyDone
      ? `${item.finding.suggestedAction} Task created and assigned.`
      : `Task created and assigned. ${blocked.map((b) => b.reason).join(' ')}`;

    const action = await recordAction({
      item,
      forUserId,
      status: 'COMPLETED',
      minutesSaved,
      summary: `${item.finding.title} — ${detail}`,
      now,
      taskId,
    });

    outcomes.push({
      fingerprint: item.finding.fingerprint,
      title: item.finding.title,
      result: fullyDone ? 'done' : 'prepared',
      effectsApplied: applied,
      effectsBlocked: blocked,
      taskId,
      aiActionId: action.id,
      minutesSaved,
      detail,
    });
  }

  return outcomes;
}

async function recordAction(args: {
  item: PreparedItem;
  forUserId: string;
  status: 'COMPLETED' | 'BLOCKED_BY_APPROVAL' | 'FAILED';
  minutesSaved: number;
  summary: string;
  blockedReason?: string;
  now: Date;
  taskId?: string | null;
}) {
  const { item, forUserId, status, minutesSaved, summary, blockedReason, now, taskId } = args;

  const action = await prisma.aiAction.create({
    data: {
      agent: 'executive',
      action: `resolve:${item.finding.kind}`,
      status,
      summary,
      initiatedBy: forUserId,
      inputRefs: { subjectType: item.finding.subjectType, subjectId: item.finding.subjectId, fingerprint: item.finding.fingerprint },
      outputRefs: taskId ? { taskId } : {},
      minutesSaved,
      savedFor: forUserId,
      requiredApproval: item.decision.requiredApproval,
      blockedReason,
      startedAt: now,
      finishedAt: now,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorType: item.decision.ownerType,
      actorId: null,
      action: `executive.${status === 'COMPLETED' ? 'executed' : 'refused'}`,
      entity: item.finding.subjectType,
      entityId: item.finding.subjectId,
      after: { taskId: taskId ?? null, aiActionId: action.id },
      rationale: item.decision.rationale,
    },
  });

  return action;
}

/** The hours-recovered figure, read from what was actually executed. */
export async function recoveredToday(userId: string, now = new Date()): Promise<number> {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const result = await prisma.aiAction.aggregate({
    where: { savedFor: userId, status: 'COMPLETED', finishedAt: { gte: dayStart } },
    _sum: { minutesSaved: true },
  });
  return result._sum.minutesSaved ?? 0;
}
