import { describe, expect, it } from 'vitest';
import { extractDeadlines, summariseInbox, triage } from './triage';

describe('inbox triage keeps the right things off the CEO', () => {
  it('sends maintenance to rentals, not to Mandy', () => {
    const r = triage({ subject: 'Geyser leaking at 12 Marine Drive', body: 'Water everywhere in the ceiling.' });
    expect(r.category).toBe('RENTAL');
    expect(r.suggestedDepartment).toBe('RENTALS');
    expect(r.decision).toBe('DELEGATE');
  });

  it('treats a burst pipe as an emergency without treating it as the CEO’s', () => {
    const r = triage({ subject: 'Burst pipe — urgent', body: 'Flooding the kitchen' });
    expect(r.urgencyScore).toBeGreaterThan(0.9);
    expect(r.suggestedDepartment).toBe('RENTALS');
  });

  it('sends arrears to accounts', () => {
    const r = triage({ subject: 'Overdue rent for August', body: 'Statement of account attached' });
    expect(r.suggestedDepartment).toBe('ACCOUNTS');
    expect(r.workKey).toBe('rental.arrears_follow_up');
  });

  it('handles a viewing request itself', () => {
    const r = triage({ subject: 'Can I book a viewing?', body: 'Available Saturday to view the Sedgefield house' });
    expect(r.decision).toBe('AI_HANDLE');
    expect(r.workKey).toBe('viewing.schedule');
  });

  it('recognises a valuation request as a seller lead', () => {
    const r = triage({ subject: 'What is my property worth?', body: 'Thinking of selling' });
    expect(r.workKey).toBe('market_assessment.prepare');
    expect(r.urgencyScore).toBeGreaterThanOrEqual(0.7);
  });

  it('escalates an offer immediately', () => {
    const r = triage({ subject: 'Signed offer to purchase attached', body: 'Please find the OTP' });
    expect(r.decision).toBe('ESCALATE');
    expect(r.urgencyScore).toBeGreaterThan(0.9);
  });

  it('escalates anything legal', () => {
    const r = triage({ subject: 'Letter of demand', body: 'Our attorneys acting for the seller' });
    expect(r.category).toBe('URGENT');
    expect(r.suggestedDepartment).toBe('EXECUTIVE');
  });

  it('archives bulk mail without a second thought', () => {
    const r = triage({ subject: 'Property24 weekly digest', fromAddress: 'no-reply@portal.example' });
    expect(r.decision).toBe('ARCHIVE');
    expect(r.urgencyScore).toBeLessThan(0.1);
  });

  it('never auto-answers a stranger it does not understand', () => {
    const r = triage({ subject: 'Hello', body: 'A question about something', knownContact: false });
    expect(r.decision).toBe('DRAFT_FOR_REVIEW');
    expect(r.reasons.join(' ')).toMatch(/a person reads this one/);
  });

  it('raises urgency when the sender says it is urgent', () => {
    const calm = triage({ subject: 'Lease renewal', body: 'When convenient' });
    const pressed = triage({ subject: 'Lease renewal — urgent', body: 'Needed by close of business' });
    expect(pressed.urgencyScore).toBeGreaterThan(calm.urgencyScore);
  });

  it('separates personal correspondence from company business', () => {
    const r = triage({ subject: "Emma's school concert", body: 'Parents evening next week' });
    expect(r.category).toBe('PERSONAL');
  });

  it('summarises an inbox into the buckets the dashboard shows', () => {
    const messages = [
      triage({ subject: 'Geyser leaking' }),
      triage({ subject: 'Book a viewing' }),
      triage({ fromAddress: 'no-reply@x.example' }),
      triage({ subject: 'Signed offer to purchase' }),
    ];
    const s = summariseInbox(messages);
    expect(s.DELEGATE).toBe(1);
    expect(s.AI_HANDLE).toBe(1);
    expect(s.ARCHIVE).toBe(1);
    expect(s.ESCALATE).toBe(1);
  });
});

describe('deadline extraction', () => {
  const now = new Date('2026-09-07T00:00:00Z');

  it('reads ISO and South African day-first dates', () => {
    expect(extractDeadlines('Please respond by 2026-09-15.', now)[0]?.toISOString().slice(0, 10)).toBe('2026-09-15');
    expect(extractDeadlines('Bond approval due 15/10/2026', now)[0]?.toISOString().slice(0, 10)).toBe('2026-10-15');
  });

  it('reads written month names', () => {
    expect(extractDeadlines('Occupation on 1 November 2026', now)[0]?.toISOString().slice(0, 10)).toBe('2026-11-01');
  });

  it('understands "tomorrow"', () => {
    expect(extractDeadlines('I need this tomorrow', now)[0]?.toISOString().slice(0, 10)).toBe('2026-09-08');
  });

  it('returns nothing rather than guessing at vague timing', () => {
    expect(extractDeadlines('Sometime soon would be good', now)).toHaveLength(0);
    expect(extractDeadlines('The 2020s were difficult', now)).toHaveLength(0);
  });

  it('de-duplicates a date mentioned twice', () => {
    expect(extractDeadlines('By 2026-09-15, and again 2026-09-15', now)).toHaveLength(1);
  });
});
