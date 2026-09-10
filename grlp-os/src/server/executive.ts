import { prisma } from './db';
import { getBusinessSnapshot, getStaff, isEmpty } from './snapshot';
import { sweep, type RiskFinding } from '../domain/risk';
import { route } from '../domain/routing';
import { assessCapacity, planBatch, recoveredTime, tierFor, type WorkRecord } from '../domain/capacity';
import { formatDuration } from '../lib/format';
import { guard } from '../domain/approvals';
import type { Priority, RoutingDecision } from '../domain/types';

/**
 * The executive layer (§8–§11, §25, §46, §47).
 *
 * This is where "prepare everything for me" lives. It sweeps the business, works
 * out for each finding whether a person is needed at all, does what it is
 * authorised to do, and returns a short account of what was handled and what is
 * genuinely left for the CEO.
 *
 * The measure of success is the last number it returns: how much of the day it
 * gave back.
 */

export interface PreparedItem {
  finding: RiskFinding;
  decision: RoutingDecision;
  /**
   * This is a plan, not a record of what happened. `ready` means no person is
   * needed and the system is authorised to act — it does not mean it has acted.
   * Execution happens in the executor, which writes what really changed.
   */
  outcome: 'ready' | 'delegated' | 'prepared_for_approval' | 'needs_ceo' | 'blocked';
  detail: string;
  minutesSaved: number;
}

export interface PreparationResult {
  ranAt: Date;
  empty: boolean;
  items: PreparedItem[];
  ready: PreparedItem[];
  delegated: PreparedItem[];
  awaitingApproval: PreparedItem[];
  needsCeo: PreparedItem[];
  blocked: PreparedItem[];
  /** Time that could be removed if the plan is run. Not yet removed. */
  available: ReturnType<typeof recoveredTime>;
  ceoMinutesRequired: number;
  headline: string;
}

/** Maps a risk finding to the catalogued work that resolves it. */
const FINDING_WORK: Record<RiskFinding['kind'], string> = {
  FORGOTTEN_LEAD: 'lead.first_response',
  OVERDUE_FOLLOW_UP: 'buyer.follow_up',
  UNSIGNED_DOCUMENT: 'transaction.chase_document',
  INCOMPLETE_FILE: 'fica.collect',
  MISSED_DEADLINE: 'staff.task_chase',
  STALLED_TRANSACTION: 'transaction.chase_document',
  UNANSWERED_CLIENT: 'email.routine_reply',
  OVERDUE_STAFF_TASK: 'staff.task_chase',
  NEGLECTED_RENEWAL: 'rental.lease_renewal',
  MANDATE_EXPIRING: 'mandate.prepare',
  UNRESOLVED_ESCALATION: 'strategy.decision',
};

export async function prepareEverything(forUserId: string, now = new Date()): Promise<PreparationResult> {
  const [staff, snapshot, empty] = await Promise.all([getStaff(), getBusinessSnapshot(), isEmpty()]);
  const findings = sweep(snapshot, now);

  const items: PreparedItem[] = findings.map((finding) => {
    const workKey = FINDING_WORK[finding.kind];
    const decision = route({
      workKey,
      staff,
      context: {
        relationshipOwnerId: finding.ownerId,
        urgency: finding.severity,
        unresolvedByStaff: finding.kind === 'UNRESOLVED_ESCALATION',
        missingInputs: finding.autoResolvable ? [] : ['human judgement'],
      },
    });

    const machine = decision.ownerType === 'AI' || decision.ownerType === 'AUTOMATION';
    const allowed = guard({
      workKey,
      grantedLevel: decision.requiredApproval,
      actor: machine ? (decision.ownerType as 'AI' | 'AUTOMATION') : 'USER',
      effects: ['send_email', 'create_task'],
    });

    let outcome: PreparedItem['outcome'];
    let detail: string;

    if (decision.ceoInvolvement === 'decision') {
      outcome = 'needs_ceo';
      detail = decision.rationale;
    } else if (machine && allowed.allowed) {
      outcome = 'ready';
      detail = `${finding.suggestedAction} No person needed — ready to run.`;
    } else if (machine && !allowed.allowed) {
      outcome = 'prepared_for_approval';
      detail = `Prepared, and waiting on ${decision.approverName ?? 'an authorised person'}. ${allowed.reason}`;
    } else if (decision.ownerId) {
      outcome = 'delegated';
      detail = `${finding.suggestedAction} Assigned to ${decision.ownerName}. ${decision.rationale}`;
    } else {
      outcome = 'blocked';
      detail = decision.rationale;
    }

    const minutesSaved =
      outcome === 'ready' || outcome === 'prepared_for_approval'
        ? decision.minutesSavedIfAutomated
        : outcome === 'delegated'
          ? decision.estimatedMinutes
          : 0;

    return { finding, decision, outcome, detail, minutesSaved };
  });

  const by = (o: PreparedItem['outcome']) => items.filter((i) => i.outcome === o);
  const ready = by('ready');
  const delegated = by('delegated');
  const awaitingApproval = by('prepared_for_approval');
  const needsCeo = by('needs_ceo');
  const blocked = by('blocked');

  // This is what is *available* to remove, not what has been removed. The
  // recovered figure on the dashboard comes from the execution ledger instead.
  const records: WorkRecord[] = [
    ...ready.map((i) => ({ disposition: i.decision.ownerType === 'AUTOMATION' ? ('automated' as const) : ('ai_completed' as const), minutes: i.minutesSaved, forUserId })),
    ...awaitingApproval.map((i) => ({ disposition: 'ai_completed' as const, minutes: i.minutesSaved, forUserId })),
    ...delegated.map((i) => ({ disposition: 'delegated' as const, minutes: i.minutesSaved, forUserId })),
    ...needsCeo.map((i) => ({ disposition: 'human_required' as const, minutes: i.decision.estimatedMinutes, forUserId })),
    ...awaitingApproval
      .filter((i) => i.decision.approverId === forUserId)
      .map((i) => ({ disposition: 'human_required' as const, minutes: i.decision.estimatedMinutes, forUserId })),
  ];

  const recovered = recoveredTime(records, forUserId);

  return {
    ranAt: now,
    empty,
    items,
    ready,
    delegated,
    awaitingApproval,
    needsCeo,
    blocked,
    available: recovered,
    ceoMinutesRequired: recovered.humanRequiredMinutes,
    headline: empty
      ? 'No operational records have been imported yet, so there is nothing to prepare. Connect a mailbox or import your CRM records to begin.'
      : findings.length === 0
        ? 'Nothing is falling through the cracks. There is nothing for you to pick up.'
        : `${ready.length} can be handled without you, ${delegated.length} to delegate, ${awaitingApproval.length} prepared for approval, ${needsCeo.length} for you. ` +
          `About ${formatDuration(recovered.recoveredMinutes)} of work ready to be taken off your plate; roughly ${formatDuration(recovered.humanRequiredMinutes)} needs you.`,
  };
}

// ── the CEO's day ──────────────────────────────────────────────────────────

export interface DecisionCard {
  id: string;
  title: string;
  issue: string;
  context: string;
  actionsTaken: string[];
  options: unknown;
  recommendation: string;
  recommendationReason: string;
  decisionRequired: string;
  financialImpact: string | null;
  clientImpact: string | null;
  dueAt: Date | null;
  waitingDays: number;
}

export async function decisionInbox(userId: string): Promise<DecisionCard[]> {
  const escalations = await prisma.escalation.findMany({
    where: { resolvedAt: null, OR: [{ assigneeId: userId }, { level: 'L3_CEO' }] },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
  });

  return escalations.map((e) => ({
    id: e.id,
    title: e.title,
    issue: e.issue,
    context: e.context,
    actionsTaken: e.actionsTaken,
    options: e.options,
    recommendation: e.recommendation,
    recommendationReason: e.recommendationReason,
    decisionRequired: e.decisionRequired,
    financialImpact: e.financialImpact ? e.financialImpact.toString() : null,
    clientImpact: e.clientImpact,
    dueAt: e.dueAt,
    waitingDays: Math.floor((Date.now() - e.createdAt.getTime()) / 86_400_000),
  }));
}

export interface DailyBrief {
  greeting: string;
  topThree: Array<{ title: string; why: string }>;
  meetings: Array<{ title: string; startsAt: Date; prepared: boolean }>;
  decisions: DecisionCard[];
  aiCompleted: string[];
  staffMatters: string[];
  salesMatters: string[];
  rentalEscalations: string[];
  risks: string[];
  capacity: ReturnType<typeof assessCapacity>;
  recommendation: string;
  notifications: ReturnType<typeof planBatch>;
}

export async function dailyBrief(userId: string, now = new Date()): Promise<DailyBrief> {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

  const [user, meetings, decisions, prepared, recentAi] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.meeting.findMany({
      where: { startsAt: { gte: startOfDay, lt: endOfDay }, attendees: { some: { userId } } },
      orderBy: { startsAt: 'asc' },
    }),
    decisionInbox(userId),
    prepareEverything(userId, now),
    prisma.aiAction.findMany({
      where: { status: 'COMPLETED', finishedAt: { gte: new Date(now.getTime() - 86_400_000) } },
      orderBy: { finishedAt: 'desc' },
      take: 12,
    }),
  ]);

  const meetingMinutes = meetings.reduce((t, m) => t + (m.endsAt.getTime() - m.startsAt.getTime()) / 60_000, 0);

  const capacity = assessCapacity({
    meetingMinutes,
    openDecisions: decisions.length,
    openTasks: prepared.items.length,
    overdueTasks: prepared.items.filter((i) => i.finding.kind === 'MISSED_DEADLINE' || i.finding.kind === 'OVERDUE_STAFF_TASK').length,
    interruptionCount: 0,
    humanRequiredMinutes: prepared.ceoMinutesRequired,
    availableMinutes: 480,
  });

  const topThree = [
    ...decisions.slice(0, 2).map((d) => ({ title: d.decisionRequired, why: `Waiting ${d.waitingDays} day${d.waitingDays === 1 ? '' : 's'}. ${d.recommendation}.` })),
    ...prepared.needsCeo.slice(0, 3).map((i) => ({ title: i.finding.title, why: i.decision.rationale })),
  ].slice(0, 3);

  const tiers = prepared.items.map((i) =>
    tierFor({ priority: i.finding.severity as Priority, requiresDecision: i.outcome === 'needs_ceo', isOwner: i.decision.ownerId === userId, dueAt: i.finding.kind === 'MISSED_DEADLINE' ? now : null }),
  );

  return {
    greeting: `Good morning ${user.name}.`,
    topThree,
    meetings: meetings.map((m) => ({ title: m.title, startsAt: m.startsAt, prepared: Boolean(m.briefing) })),
    decisions,
    aiCompleted: recentAi.map((a) => a.summary),
    staffMatters: prepared.delegated.map((i) => `${i.finding.title} → ${i.decision.ownerName}`),
    salesMatters: prepared.items.filter((i) => i.decision.department === 'SALES').map((i) => i.finding.title),
    rentalEscalations: prepared.items.filter((i) => i.decision.department === 'RENTALS' && i.outcome === 'needs_ceo').map((i) => i.finding.title),
    risks: prepared.items.filter((i) => i.finding.severity === 'URGENT').map((i) => i.finding.detail),
    capacity,
    recommendation: buildRecommendation(capacity, prepared),
    notifications: planBatch(tiers),
  };
}

function buildRecommendation(capacity: ReturnType<typeof assessCapacity>, prepared: PreparationResult): string {
  if (prepared.empty) return 'Import your records or connect a mailbox — the system has nothing to work on yet.';
  if (prepared.needsCeo.length === 0 && prepared.awaitingApproval.length === 0) {
    return 'Nothing needs you this morning. Spend the day on listings and clients.';
  }
  const approvals = prepared.awaitingApproval.length;
  const decisions = prepared.needsCeo.length;
  const parts: string[] = [];
  if (approvals) parts.push(`clear the ${approvals} approval${approvals === 1 ? '' : 's'} in one sitting`);
  if (decisions) parts.push(`take the ${decisions} decision${decisions === 1 ? ' that genuinely needs' : 's that genuinely need'} you`);
  if (capacity.state === 'overloaded') parts.push('then move something — today does not fit');
  const sentence = `${parts.join(', then ')}. Everything else is already moving.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

// ── end of day (§47) ───────────────────────────────────────────────────────

export interface EndOfDayReview {
  completed: number;
  stillOpen: number;
  delegated: number;
  aiHandled: number;
  atRisk: string[];
  tomorrow: string[];
  recoveredMinutes: number;
  summary: string;
}

export async function endOfDay(userId: string, now = new Date()): Promise<EndOfDayReview> {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const [completed, stillOpen, aiActions, prepared] = await Promise.all([
    prisma.task.count({ where: { completedAt: { gte: dayStart } } }),
    prisma.task.count({ where: { status: { in: ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'AWAITING_APPROVAL'] } } }),
    prisma.aiAction.findMany({ where: { status: 'COMPLETED', finishedAt: { gte: dayStart } } }),
    prepareEverything(userId, now),
  ]);

  // Only executed work counts. The plan's potential is not an achievement.
  const recoveredMinutes = aiActions.reduce((t, a) => t + a.minutesSaved, 0);

  return {
    completed,
    stillOpen,
    delegated: prepared.delegated.length,
    aiHandled: aiActions.length,
    atRisk: prepared.items.filter((i) => i.finding.severity === 'URGENT' || i.finding.severity === 'HIGH').map((i) => i.finding.title),
    tomorrow: prepared.needsCeo.map((i) => i.finding.title),
    recoveredMinutes,
    summary: `${completed} completed, ${stillOpen} open, ${prepared.delegated.length} delegated, ${aiActions.length} handled by the system. About ${formatDuration(recoveredMinutes)} recovered.`,
  };
}
