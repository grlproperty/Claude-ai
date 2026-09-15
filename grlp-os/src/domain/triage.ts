/**
 * Inbox triage (§20, §21).
 *
 * Mandy's inbox must not be her task list. Classification here is deterministic
 * and testable: rules first, so the behaviour is predictable and auditable. The
 * language model is used to draft replies and to read genuinely ambiguous
 * messages, never to decide the rules.
 */

export type CommunicationCategory =
  | 'URGENT'
  | 'CLIENT'
  | 'SALES'
  | 'RENTAL'
  | 'STAFF'
  | 'FINANCE'
  | 'MARKETING'
  | 'PERSONAL'
  | 'INFORMATIONAL'
  | 'LOW_PRIORITY';

export type TriageDecision = 'AI_HANDLE' | 'AUTO_REPLY' | 'DRAFT_FOR_REVIEW' | 'DELEGATE' | 'ESCALATE' | 'ARCHIVE';

export interface TriageInput {
  subject?: string | null;
  body?: string | null;
  fromAddress?: string | null;
  fromName?: string | null;
  /** True when the sender matches a known client, seller or buyer record. */
  knownContact?: boolean;
  /** Set when a record already ties this sender to an agent. */
  relationshipOwnerId?: string | null;
  receivedAt?: Date;
}

export interface TriageResult {
  category: CommunicationCategory;
  decision: TriageDecision;
  /** 0–1. Above 0.7 the message interrupts; below 0.3 it waits for a batch. */
  urgencyScore: number;
  reasons: string[];
  /** Department best placed to answer, where the rules can tell. */
  suggestedDepartment: 'SALES' | 'RENTALS' | 'ACCOUNTS' | 'MARKETING' | 'EXECUTIVE' | null;
  /** Deadlines mentioned in the text, for the follow-up engine. */
  deadlines: Date[];
  workKey: string | null;
}

interface Rule {
  key: string;
  test: RegExp;
  category: CommunicationCategory;
  decision: TriageDecision;
  urgency: number;
  department: TriageResult['suggestedDepartment'];
  workKey?: string;
  reason: string;
}

/** Ordered: the first matching rule wins, so put the decisive signals first. */
const RULES: Rule[] = [
  {
    key: 'bulk_sender',
    test: /(no-?reply|do-?not-?reply|newsletter@|mailer@|notifications?@|unsubscribe)/i,
    category: 'LOW_PRIORITY',
    decision: 'ARCHIVE',
    urgency: 0.02,
    department: null,
    reason: 'Bulk or automated sender.',
  },
  {
    key: 'legal_complaint',
    test: /\b(attorneys? acting|letter of demand|ombud|litigation|sue|legal action|PPRA|complaint against)\b/i,
    category: 'URGENT',
    decision: 'ESCALATE',
    urgency: 1,
    department: 'EXECUTIVE',
    reason: 'Potential legal or regulatory exposure.',
  },
  {
    key: 'offer',
    test: /\b(offer to purchase|\botp\b|signed offer|counter-?offer|accepted the offer)\b/i,
    category: 'SALES',
    decision: 'ESCALATE',
    urgency: 0.95,
    department: 'SALES',
    workKey: 'otp.validate',
    reason: 'An offer is in play — time-sensitive and contractual.',
  },
  {
    key: 'conveyancing',
    test: /\b(conveyanc|transfer duty|deeds office|attorney|lodg(ed|ement)|bond grant|bond approv)/i,
    category: 'SALES',
    decision: 'DELEGATE',
    urgency: 0.75,
    department: 'SALES',
    workKey: 'transaction.chase_document',
    reason: 'Transfer progress — belongs with the transaction file.',
  },
  {
    key: 'maintenance_emergency',
    test: /\b(burst|flooding|no water|no electricity|gas leak|break-?in|fire|sewer(age)?)\b/i,
    category: 'RENTAL',
    decision: 'DELEGATE',
    urgency: 0.95,
    department: 'RENTALS',
    workKey: 'rental.maintenance_major',
    reason: 'Emergency maintenance — rentals must act now.',
  },
  {
    key: 'maintenance',
    test: /\b(maintenance|repair|geyser|plumb|leak|broken|blocked drain|handyman|contractor)\b/i,
    category: 'RENTAL',
    decision: 'DELEGATE',
    urgency: 0.5,
    department: 'RENTALS',
    workKey: 'rental.maintenance_routine',
    reason: 'Routine maintenance — rentals owns this.',
  },
  {
    key: 'arrears',
    test: /\b(arrears|outstanding (amount|balance)|overdue (rent|payment)|unpaid|statement of account|invoice)\b/i,
    category: 'FINANCE',
    decision: 'DELEGATE',
    urgency: 0.6,
    department: 'ACCOUNTS',
    workKey: 'rental.arrears_follow_up',
    reason: 'Money owed — accounts owns this.',
  },
  {
    key: 'lease',
    test: /\b(lease renewal|renew (my|the) lease|notice to vacate|tenant|landlord|deposit refund)\b/i,
    category: 'RENTAL',
    decision: 'DELEGATE',
    urgency: 0.45,
    department: 'RENTALS',
    workKey: 'rental.lease_renewal',
    reason: 'Lease administration — rentals owns this.',
  },
  {
    key: 'viewing',
    test: /\b(view(ing)?|show ?house|come (and )?see|available to view|book a viewing|appointment to see)\b/i,
    category: 'SALES',
    decision: 'AI_HANDLE',
    urgency: 0.6,
    department: 'SALES',
    workKey: 'viewing.schedule',
    reason: 'A viewing request — the system can offer times and book it.',
  },
  {
    key: 'valuation',
    test: /\b(valuation|market assessment|what (is|is my) (my )?(house|property) worth|appraisal|cma)\b/i,
    category: 'SALES',
    decision: 'AI_HANDLE',
    urgency: 0.7,
    department: 'SALES',
    workKey: 'market_assessment.prepare',
    reason: 'A valuation request — a seller lead worth acting on today.',
  },
  {
    key: 'listing_enquiry',
    test: /\b(is (this|the) (property|house) still available|more (info|information|photos)|price of|enquir)/i,
    category: 'SALES',
    decision: 'AI_HANDLE',
    urgency: 0.65,
    department: 'SALES',
    workKey: 'lead.first_response',
    reason: 'A buyer enquiry — first response goes out now.',
  },
  {
    key: 'fica',
    test: /\b(fica|proof of address|certified copy|id copy|source of funds)\b/i,
    category: 'CLIENT',
    decision: 'AI_HANDLE',
    urgency: 0.5,
    department: 'ACCOUNTS',
    workKey: 'fica.collect',
    reason: 'Compliance documents — the system can request and track them.',
  },
  {
    key: 'staff',
    test: /\b(leave request|sick|resign|salary|payslip|my hours|roster)\b/i,
    category: 'STAFF',
    decision: 'ESCALATE',
    urgency: 0.6,
    department: 'EXECUTIVE',
    reason: 'A staff matter — for management, not for software.',
  },
  {
    key: 'marketing',
    test: /\b(advertis|social media|instagram|facebook|campaign|brochure|photo ?shoot)\b/i,
    category: 'MARKETING',
    decision: 'DELEGATE',
    urgency: 0.25,
    department: 'MARKETING',
    workKey: 'marketing.social_post',
    reason: 'Marketing work.',
  },
];

const URGENCY_BOOSTERS = /\b(urgent|asap|immediately|today|deadline|expires?|by (close of business|cob|noon)|final notice)\b/i;
const PERSONAL_MARKERS = /\b(school|doctor|dentist|family|birthday|holiday booking|personal)\b/i;

export function triage(input: TriageInput): TriageResult {
  const text = `${input.subject ?? ''}\n${input.body ?? ''}`;
  const reasons: string[] = [];

  const matched = RULES.find((r) => r.test.test(text) || r.test.test(input.fromAddress ?? ''));

  let category: CommunicationCategory = matched?.category ?? (input.knownContact ? 'CLIENT' : 'INFORMATIONAL');
  let decision: TriageDecision = matched?.decision ?? (input.knownContact ? 'DRAFT_FOR_REVIEW' : 'DRAFT_FOR_REVIEW');
  let urgency = matched?.urgency ?? (input.knownContact ? 0.5 : 0.3);
  let department = matched?.department ?? null;
  if (matched) reasons.push(matched.reason);

  if (PERSONAL_MARKERS.test(text) && !matched) {
    category = 'PERSONAL';
    department = 'EXECUTIVE';
    decision = 'DRAFT_FOR_REVIEW';
    reasons.push('Reads as personal rather than company business.');
  }

  if (URGENCY_BOOSTERS.test(text) && category !== 'LOW_PRIORITY') {
    urgency = Math.min(1, urgency + 0.2);
    reasons.push('The sender signalled urgency.');
  }

  if (input.knownContact && category !== 'LOW_PRIORITY') {
    reasons.push('The sender is a known contact.');
    urgency = Math.min(1, urgency + 0.05);
  }

  // An unrecognised message from a stranger is never auto-answered.
  if (!matched && !input.knownContact) {
    decision = 'DRAFT_FOR_REVIEW';
    reasons.push('No rule matched and the sender is unknown, so a person reads this one.');
  }

  return {
    category,
    decision,
    urgencyScore: Number(urgency.toFixed(2)),
    reasons,
    suggestedDepartment: department,
    deadlines: extractDeadlines(text, input.receivedAt ?? new Date()),
    workKey: matched?.workKey ?? null,
  };
}

/**
 * Pulls dates out of message text so the follow-up engine can hold GRLP to them.
 * Only unambiguous forms are read; a half-understood date is worse than none.
 */
export function extractDeadlines(text: string, now = new Date()): Date[] {
  const found: Date[] = [];

  // 2026-09-15, 15/09/2026, 15-09-2026 (day-first, as used in South Africa)
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    push(found, new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))));
  }
  for (const m of text.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g)) {
    push(found, new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))));
  }

  // "15 September", "15 Sept 2026"
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  for (const m of text.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s*(\d{4})?\b/g)) {
    const idx = months.indexOf(m[2]!.slice(0, 3).toLowerCase());
    if (idx < 0) continue;
    const year = m[3] ? Number(m[3]) : now.getUTCFullYear();
    push(found, new Date(Date.UTC(year, idx, Number(m[1]))));
  }

  if (/\btomorrow\b/i.test(text)) push(found, new Date(now.getTime() + 86_400_000));

  return found.sort((a, b) => a.getTime() - b.getTime());
}

function push(list: Date[], d: Date): void {
  if (Number.isNaN(d.getTime())) return;
  if (list.some((x) => x.getTime() === d.getTime())) return;
  list.push(d);
}

/** Groups a triaged inbox into the buckets the dashboard shows. */
export function summariseInbox(results: TriageResult[]): Record<TriageDecision, number> {
  const base: Record<TriageDecision, number> = {
    AI_HANDLE: 0,
    AUTO_REPLY: 0,
    DRAFT_FOR_REVIEW: 0,
    DELEGATE: 0,
    ESCALATE: 0,
    ARCHIVE: 0,
  };
  for (const r of results) base[r.decision] += 1;
  return base;
}
