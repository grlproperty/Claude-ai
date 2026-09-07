import { formatDuration } from '../lib/format';
import type { NotificationTier, Priority } from './types';

/**
 * CEO capacity protection (§28) and the hours-recovered metric (§48).
 *
 * The point of the whole system is the number at the bottom of this file. It is
 * counted conservatively: only work the system actually finished is claimed, a
 * prepared document counts for the preparation and not the review, and nothing
 * is claimed for merely telling someone that work exists.
 */

export interface DayLoad {
  meetingMinutes: number;
  openDecisions: number;
  openTasks: number;
  overdueTasks: number;
  /** Times the CEO was pulled out of what she was doing. */
  interruptionCount: number;
  /** Minutes of work still requiring her personally today. */
  humanRequiredMinutes: number;
  /** Working minutes available. */
  availableMinutes: number;
}

export type LoadState = 'clear' | 'busy' | 'stretched' | 'overloaded';

export interface CapacityAssessment {
  loadScore: number;
  state: LoadState;
  committedMinutes: number;
  freeMinutes: number;
  headline: string;
  recommendations: CapacityRecommendation[];
}

export interface CapacityRecommendation {
  kind: 'delegate' | 'automate' | 'reschedule' | 'batch' | 'decline' | 'defer';
  detail: string;
  minutesFreed: number;
}

export function assessCapacity(load: DayLoad): CapacityAssessment {
  const decisionMinutes = load.openDecisions * 4;
  const committed = load.meetingMinutes + load.humanRequiredMinutes + decisionMinutes;
  const free = load.availableMinutes - committed;
  const utilisation = load.availableMinutes > 0 ? committed / load.availableMinutes : 1;

  // Interruptions and overdue work cost more than the clock says they do.
  const friction = load.interruptionCount * 0.02 + Math.min(load.overdueTasks, 20) * 0.01;
  const loadScore = Number(Math.min(2, utilisation + friction).toFixed(2));

  const state: LoadState =
    loadScore >= 1 ? 'overloaded' : loadScore >= 0.85 ? 'stretched' : loadScore >= 0.6 ? 'busy' : 'clear';

  const recommendations: CapacityRecommendation[] = [];

  if (state === 'overloaded' || state === 'stretched') {
    if (load.meetingMinutes > 180) {
      recommendations.push({
        kind: 'reschedule',
        detail: `${formatDuration(load.meetingMinutes)} of meetings today. Moving the least time-critical one clears the afternoon.`,
        minutesFreed: 60,
      });
    }
    if (load.openDecisions > 5) {
      recommendations.push({
        kind: 'batch',
        detail: `${load.openDecisions} decisions are waiting. Taking them in one sitting costs less than ${load.openDecisions} interruptions.`,
        minutesFreed: Math.round(load.openDecisions * 1.5),
      });
    }
    if (load.humanRequiredMinutes > 120) {
      recommendations.push({
        kind: 'delegate',
        detail: 'Some of what is queued for you has an owner elsewhere. Review the delegation suggestions.',
        minutesFreed: Math.round(load.humanRequiredMinutes * 0.3),
      });
    }
    if (load.interruptionCount > 8) {
      recommendations.push({
        kind: 'defer',
        detail: `${load.interruptionCount} interruptions so far. Non-urgent notifications can be held until 16:00.`,
        minutesFreed: load.interruptionCount * 3,
      });
    }
  }

  if (state === 'overloaded' && free < 0) {
    recommendations.push({
      kind: 'decline',
      detail: `Today is over-committed by ${formatDuration(Math.abs(free))}. Something has to move.`,
      minutesFreed: Math.abs(free),
    });
  }

  return {
    loadScore,
    state,
    committedMinutes: committed,
    freeMinutes: free,
    headline: headlineFor(state, free),
    recommendations,
  };
}

function headlineFor(state: LoadState, free: number): string {
  switch (state) {
    case 'clear':
      return `Your day has room — ${formatDuration(Math.max(0, free))} uncommitted.`;
    case 'busy':
      return `A full day, but it fits — ${formatDuration(Math.max(0, free))} spare.`;
    case 'stretched':
      return `Tight. ${formatDuration(Math.max(0, free))} spare, with no room for anything unexpected.`;
    case 'overloaded':
      return `Over-committed by ${formatDuration(Math.abs(Math.min(0, free)))}. Recommendations below.`;
  }
}

// ── hours recovered ────────────────────────────────────────────────────────

export interface WorkRecord {
  /** How the work was disposed of. */
  disposition: 'ai_completed' | 'automated' | 'delegated' | 'human_required';
  minutes: number;
  /** Whose time this was. Only the CEO's counts toward her recovered hours. */
  forUserId: string;
}

export interface RecoveredTime {
  aiCompletedMinutes: number;
  automatedMinutes: number;
  delegatedMinutes: number;
  humanRequiredMinutes: number;
  /** The headline: work that would have been the CEO's and no longer is. */
  recoveredMinutes: number;
  breakdown: string;
}

export function recoveredTime(records: WorkRecord[], forUserId: string): RecoveredTime {
  const mine = records.filter((r) => r.forUserId === forUserId);
  const sum = (d: WorkRecord['disposition']) =>
    mine.filter((r) => r.disposition === d).reduce((t, r) => t + Math.max(0, r.minutes), 0);

  const ai = sum('ai_completed');
  const automated = sum('automated');
  const delegated = sum('delegated');
  const humanRequired = sum('human_required');

  return {
    aiCompletedMinutes: ai,
    automatedMinutes: automated,
    delegatedMinutes: delegated,
    humanRequiredMinutes: humanRequired,
    recoveredMinutes: ai + automated + delegated,
    breakdown: [
      `AI completed: ${formatDuration(ai)}`,
      `Automation: ${formatDuration(automated)}`,
      `Delegated: ${formatDuration(delegated)}`,
      `Your time required: ${formatDuration(humanRequired)}`,
      `Recovered: ${formatDuration(ai + automated + delegated)}`,
    ].join(' · '),
  };
}

// ── notification intelligence (§52, §53) ───────────────────────────────────

export interface NotifiableItem {
  priority: Priority;
  requiresDecision: boolean;
  /** True when the recipient owns it; false when they are only being informed. */
  isOwner: boolean;
  dueAt?: Date | null;
}

export function tierFor(item: NotifiableItem, now = new Date()): NotificationTier {
  const dueSoon = item.dueAt != null && item.dueAt.getTime() - now.getTime() < 4 * 3_600_000;

  if (item.priority === 'URGENT' && item.isOwner) return 'URGENT';
  if (item.requiresDecision) return dueSoon ? 'URGENT' : 'DECISION';
  if (item.priority === 'HIGH' && item.isOwner) return 'ATTENTION';
  return 'INFORMATION';
}

/**
 * Anything below a decision is held and released together, so six small things
 * cost one interruption rather than six.
 */
export function shouldBatch(tier: NotificationTier): boolean {
  return tier === 'INFORMATION' || tier === 'ATTENTION';
}

export interface BatchPlan {
  immediate: number;
  batched: number;
  interruptionsAvoided: number;
  message: string | null;
}

export function planBatch(tiers: NotificationTier[]): BatchPlan {
  const batched = tiers.filter(shouldBatch).length;
  const immediate = tiers.length - batched;
  return {
    immediate,
    batched,
    interruptionsAvoided: Math.max(0, batched - (batched > 0 ? 1 : 0)),
    message: batched
      ? `${batched} non-urgent item${batched === 1 ? '' : 's'} grouped into one summary.`
      : null,
  };
}
