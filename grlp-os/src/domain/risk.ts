import type { Priority } from './types';

/**
 * The proactive monitor (§31).
 *
 * It runs on a schedule and answers the question nobody has time to ask: what is
 * quietly going wrong? Findings carry a stable fingerprint so the same problem
 * is recognised across sweeps rather than raised again every hour, and each one
 * says whether the system can fix it without a person.
 */

export type RiskKind =
  | 'FORGOTTEN_LEAD'
  | 'OVERDUE_FOLLOW_UP'
  | 'UNSIGNED_DOCUMENT'
  | 'INCOMPLETE_FILE'
  | 'MISSED_DEADLINE'
  | 'STALLED_TRANSACTION'
  | 'UNANSWERED_CLIENT'
  | 'OVERDUE_STAFF_TASK'
  | 'NEGLECTED_RENEWAL'
  | 'MANDATE_EXPIRING'
  | 'UNRESOLVED_ESCALATION';

export interface RiskFinding {
  kind: RiskKind;
  fingerprint: string;
  severity: Priority;
  title: string;
  detail: string;
  subjectType: string;
  subjectId: string;
  ownerId: string | null;
  suggestedAction: string;
  /** True when the system can resolve this itself, given its authorisations. */
  autoResolvable: boolean;
}

/** Thresholds live in one place so GRLP can tune them without a code change. */
export interface RiskThresholds {
  leadNoContactHours: number;
  leadStalledDays: number;
  viewingFeedbackHours: number;
  clientUnansweredHours: number;
  transactionStalledDays: number;
  mandateExpiryWarningDays: number;
  signatureChaseDays: number;
  sellerUpdateDays: number;
}

export const DEFAULT_THRESHOLDS: RiskThresholds = {
  leadNoContactHours: 24,
  leadStalledDays: 14,
  viewingFeedbackHours: 24,
  clientUnansweredHours: 24,
  transactionStalledDays: 7,
  mandateExpiryWarningDays: 30,
  signatureChaseDays: 3,
  sellerUpdateDays: 6,
};

export interface SnapshotLead {
  id: string;
  stage: string;
  contactName: string;
  ownerId: string | null;
  createdAt: Date;
  lastContactAt: Date | null;
}

export interface SnapshotViewing {
  id: string;
  propertyRef: string;
  contactName: string;
  agentId: string | null;
  completedAt: Date | null;
  feedback: string | null;
  sellerUpdatedAt: Date | null;
}

export interface SnapshotCommunication {
  id: string;
  subject: string | null;
  fromName: string | null;
  ownerId: string | null;
  receivedAt: Date;
  answeredAt: Date | null;
  category: string | null;
}

export interface SnapshotDocument {
  id: string;
  title: string;
  kind: string;
  status: string;
  ownerId: string | null;
  awaitingSignatureSince: Date | null;
  missingFieldCount: number;
}

export interface SnapshotTask {
  id: string;
  title: string;
  ownerId: string | null;
  ownerName: string | null;
  dueAt: Date | null;
  status: string;
}

export interface SnapshotTransaction {
  id: string;
  propertyRef: string;
  stage: string;
  agentId: string | null;
  lastMovementAt: Date;
  outstandingItems: string[];
}

export interface SnapshotMandate {
  id: string;
  propertyRef: string;
  status: string;
  agentId: string | null;
  endDate: Date | null;
}

export interface SnapshotEscalation {
  id: string;
  title: string;
  level: string;
  assigneeId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  dueAt: Date | null;
}

export interface BusinessSnapshot {
  leads: SnapshotLead[];
  viewings: SnapshotViewing[];
  communications: SnapshotCommunication[];
  documents: SnapshotDocument[];
  tasks: SnapshotTask[];
  transactions: SnapshotTransaction[];
  mandates: SnapshotMandate[];
  escalations: SnapshotEscalation[];
}

export const EMPTY_SNAPSHOT: BusinessSnapshot = {
  leads: [],
  viewings: [],
  communications: [],
  documents: [],
  tasks: [],
  transactions: [],
  mandates: [],
  escalations: [],
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function sweep(
  snapshot: BusinessSnapshot,
  now = new Date(),
  thresholds: RiskThresholds = DEFAULT_THRESHOLDS,
): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const hoursSince = (d: Date) => (now.getTime() - d.getTime()) / HOUR;
  const daysSince = (d: Date) => (now.getTime() - d.getTime()) / DAY;

  // A new enquiry nobody has answered is the most expensive thing on this list.
  for (const lead of snapshot.leads) {
    if (['CONVERTED', 'LOST'].includes(lead.stage)) continue;

    const reference = lead.lastContactAt ?? lead.createdAt;
    const idle = hoursSince(reference);

    if (!lead.lastContactAt && idle > thresholds.leadNoContactHours) {
      findings.push({
        kind: 'FORGOTTEN_LEAD',
        fingerprint: `lead:${lead.id}:never-contacted`,
        severity: idle > 72 ? 'URGENT' : 'HIGH',
        title: `${lead.contactName} has never been contacted`,
        detail: `The enquiry came in ${Math.round(idle)} hours ago and there is still no first contact.`,
        subjectType: 'lead',
        subjectId: lead.id,
        ownerId: lead.ownerId,
        suggestedAction: 'Send the first-response message and book a call.',
        autoResolvable: true,
      });
    } else if (lead.lastContactAt && daysSince(lead.lastContactAt) > thresholds.leadStalledDays) {
      findings.push({
        kind: 'OVERDUE_FOLLOW_UP',
        fingerprint: `lead:${lead.id}:stalled`,
        severity: 'NORMAL',
        title: `${lead.contactName} has gone quiet`,
        detail: `No contact for ${Math.round(daysSince(lead.lastContactAt))} days while still at ${lead.stage.toLowerCase()}.`,
        subjectType: 'lead',
        subjectId: lead.id,
        ownerId: lead.ownerId,
        suggestedAction: 'Send a follow-up and either revive or close the lead.',
        autoResolvable: true,
      });
    }
  }

  for (const v of snapshot.viewings) {
    if (!v.completedAt) continue;
    const since = hoursSince(v.completedAt);

    if (!v.feedback && since > thresholds.viewingFeedbackHours) {
      findings.push({
        kind: 'OVERDUE_FOLLOW_UP',
        fingerprint: `viewing:${v.id}:no-feedback`,
        severity: 'NORMAL',
        title: `No feedback from ${v.contactName} on ${v.propertyRef}`,
        detail: `The viewing was ${Math.round(since)} hours ago and no feedback has been recorded.`,
        subjectType: 'viewing',
        subjectId: v.id,
        ownerId: v.agentId,
        suggestedAction: 'Request feedback from the buyer.',
        autoResolvable: true,
      });
    }

    if (!v.sellerUpdatedAt && since > thresholds.sellerUpdateDays * 24) {
      findings.push({
        kind: 'OVERDUE_FOLLOW_UP',
        fingerprint: `viewing:${v.id}:seller-not-updated`,
        severity: 'HIGH',
        title: `Seller of ${v.propertyRef} has not been updated`,
        detail: `A viewing took place ${Math.round(since / 24)} days ago and the seller has heard nothing since.`,
        subjectType: 'viewing',
        subjectId: v.id,
        ownerId: v.agentId,
        suggestedAction: 'Send the seller a progress update covering the viewing.',
        autoResolvable: true,
      });
    }
  }

  for (const c of snapshot.communications) {
    if (c.answeredAt || c.category === 'LOW_PRIORITY' || c.category === 'INFORMATIONAL') continue;
    const since = hoursSince(c.receivedAt);
    if (since > thresholds.clientUnansweredHours) {
      findings.push({
        kind: 'UNANSWERED_CLIENT',
        fingerprint: `comm:${c.id}:unanswered`,
        severity: since > 72 ? 'HIGH' : 'NORMAL',
        title: `${c.fromName ?? 'A client'} is waiting for a reply`,
        detail: `"${c.subject ?? 'No subject'}" arrived ${Math.round(since)} hours ago and has not been answered.`,
        subjectType: 'communication',
        subjectId: c.id,
        ownerId: c.ownerId,
        suggestedAction: 'Draft and send a reply, or route it to whoever owns the relationship.',
        autoResolvable: true,
      });
    }
  }

  for (const d of snapshot.documents) {
    if (d.awaitingSignatureSince && daysSince(d.awaitingSignatureSince) > thresholds.signatureChaseDays) {
      findings.push({
        kind: 'UNSIGNED_DOCUMENT',
        fingerprint: `doc:${d.id}:unsigned`,
        severity: 'HIGH',
        title: `${d.title} is still unsigned`,
        detail: `It has been out for signature for ${Math.round(daysSince(d.awaitingSignatureSince))} days.`,
        subjectType: 'document',
        subjectId: d.id,
        ownerId: d.ownerId,
        suggestedAction: 'Chase the signatory and confirm they received it.',
        autoResolvable: true,
      });
    }
    if (d.missingFieldCount > 0 && ['IN_REVIEW', 'GENERATED'].includes(d.status)) {
      findings.push({
        kind: 'INCOMPLETE_FILE',
        fingerprint: `doc:${d.id}:incomplete`,
        severity: 'NORMAL',
        title: `${d.title} is missing ${d.missingFieldCount} field${d.missingFieldCount === 1 ? '' : 's'}`,
        detail: 'The document cannot go for approval until the outstanding information is supplied.',
        subjectType: 'document',
        subjectId: d.id,
        ownerId: d.ownerId,
        suggestedAction: 'Request the missing information from the client or agent.',
        autoResolvable: true,
      });
    }
  }

  for (const t of snapshot.tasks) {
    if (['DONE', 'CANCELLED'].includes(t.status) || !t.dueAt) continue;
    if (t.dueAt.getTime() >= now.getTime()) continue;
    const overdueDays = daysSince(t.dueAt);
    findings.push({
      kind: overdueDays > 7 ? 'MISSED_DEADLINE' : 'OVERDUE_STAFF_TASK',
      fingerprint: `task:${t.id}:overdue`,
      severity: overdueDays > 7 ? 'HIGH' : 'NORMAL',
      title: `${t.title} is ${Math.round(overdueDays)} day${Math.round(overdueDays) === 1 ? '' : 's'} overdue`,
      detail: `Owned by ${t.ownerName ?? 'nobody'}, due ${t.dueAt.toISOString().slice(0, 10)}.`,
      subjectType: 'task',
      subjectId: t.id,
      ownerId: t.ownerId,
      suggestedAction: t.ownerId ? 'Remind the owner, and reassign if it stays stuck.' : 'Assign an owner.',
      autoResolvable: Boolean(t.ownerId),
    });
  }

  for (const tx of snapshot.transactions) {
    if (['CLOSED', 'CANCELLED', 'REGISTERED'].includes(tx.stage)) continue;
    const idle = daysSince(tx.lastMovementAt);
    if (idle > thresholds.transactionStalledDays) {
      findings.push({
        kind: 'STALLED_TRANSACTION',
        fingerprint: `tx:${tx.id}:stalled`,
        severity: idle > 21 ? 'URGENT' : 'HIGH',
        title: `${tx.propertyRef} has not moved in ${Math.round(idle)} days`,
        detail:
          `Stuck at ${tx.stage.replace(/_/g, ' ').toLowerCase()}.` +
          (tx.outstandingItems.length ? ` Outstanding: ${tx.outstandingItems.join(', ')}.` : ''),
        subjectType: 'transaction',
        subjectId: tx.id,
        ownerId: tx.agentId,
        suggestedAction: tx.outstandingItems.length
          ? `Chase ${tx.outstandingItems[0]}.`
          : 'Ask the attorney for a status update.',
        autoResolvable: tx.outstandingItems.length > 0,
      });
    }
  }

  for (const m of snapshot.mandates) {
    if (!m.endDate || !['ACTIVE', 'SIGNED'].includes(m.status)) continue;
    const daysLeft = (m.endDate.getTime() - now.getTime()) / DAY;
    if (daysLeft > 0 && daysLeft <= thresholds.mandateExpiryWarningDays) {
      findings.push({
        kind: 'MANDATE_EXPIRING',
        fingerprint: `mandate:${m.id}:expiring`,
        severity: daysLeft <= 7 ? 'HIGH' : 'NORMAL',
        title: `Mandate on ${m.propertyRef} expires in ${Math.round(daysLeft)} days`,
        detail: 'A renewal conversation needs to happen before it lapses.',
        subjectType: 'mandate',
        subjectId: m.id,
        ownerId: m.agentId,
        suggestedAction: 'Prepare the renewal and book the conversation with the seller.',
        autoResolvable: false,
      });
    }
    if (daysLeft <= 0) {
      findings.push({
        kind: 'NEGLECTED_RENEWAL',
        fingerprint: `mandate:${m.id}:lapsed`,
        severity: 'HIGH',
        title: `Mandate on ${m.propertyRef} has lapsed`,
        detail: `It expired ${Math.round(-daysLeft)} days ago and is still marked ${m.status.toLowerCase()}.`,
        subjectType: 'mandate',
        subjectId: m.id,
        ownerId: m.agentId,
        suggestedAction: 'Confirm the position with the seller and correct the record.',
        autoResolvable: false,
      });
    }
  }

  for (const e of snapshot.escalations) {
    if (e.resolvedAt) continue;
    const waiting = daysSince(e.createdAt);
    const overdue = e.dueAt != null && e.dueAt.getTime() < now.getTime();
    if (waiting > 2 || overdue) {
      findings.push({
        kind: 'UNRESOLVED_ESCALATION',
        fingerprint: `esc:${e.id}:unresolved`,
        severity: overdue ? 'URGENT' : 'HIGH',
        title: `Decision outstanding: ${e.title}`,
        detail: `Raised ${Math.round(waiting)} days ago${overdue ? ' and now past its deadline' : ''}.`,
        subjectType: 'escalation',
        subjectId: e.id,
        ownerId: e.assigneeId,
        suggestedAction: 'Take the decision, or delegate it to someone who can.',
        autoResolvable: false,
      });
    }
  }

  return findings.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function severityRank(p: Priority): number {
  return { LOW: 0, NORMAL: 1, HIGH: 2, URGENT: 3 }[p];
}

/** How much of the sweep the system can clear without troubling anybody. */
export function autoResolvableShare(findings: RiskFinding[]): number {
  if (!findings.length) return 1;
  return findings.filter((f) => f.autoResolvable).length / findings.length;
}
