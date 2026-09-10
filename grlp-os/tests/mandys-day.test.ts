import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prepareEverything, dailyBrief, endOfDay } from '../src/server/executive';
import { getStaff } from '../src/server/snapshot';
import { route, requiresCeo, reviewMinutes } from '../src/domain/routing';
import { assess } from '../src/domain/market-assessment';
import { prepareDocument, type TemplateVersionSpec } from '../src/domain/documents';
import { triage } from '../src/domain/triage';
import { marketAssessmentAgent } from '../src/agents/market-assessment-agent';
import { documentAgent } from '../src/agents/document-agent';
import { communicationAgent } from '../src/agents/communication-agent';

/**
 * §63 — Mandy's day, end to end, against a real Postgres database.
 *
 * This is the product test. At each hour it asks the question the specification
 * asks: did the system do the work, or did it merely tell her about it? And
 * throughout: was she interrupted when she did not need to be?
 *
 * The records here are test fixtures created and removed by this file. They are
 * not seeded into the application — an operating system that ships with invented
 * clients would demonstrate well and mean nothing.
 */

const prisma = new PrismaClient();
const TAG = 'DAYTEST';
const NOW = new Date('2026-09-07T08:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

let mandyId: string;
let agentId: string;
let propertyId: string;

beforeAll(async () => {
  // Looked up by role, not by address — the mail domain is configuration and
  // may change; who is the CEO does not.
  const mandy = await prisma.user.findFirstOrThrow({ where: { isCeo: true } });
  const kandy = await prisma.user.findFirstOrThrow({ where: { name: 'Kandy' } });
  mandyId = mandy.id;
  agentId = kandy.id;

  const seller = await prisma.contact.create({
    data: { kind: 'SELLER', firstName: `${TAG}-Seller`, lastName: 'Botha', email: 's@example.invalid', idNumber: '8001015009087' },
  });
  const buyer = await prisma.contact.create({
    data: { kind: 'BUYER', firstName: `${TAG}-Buyer`, lastName: 'Ndlovu', email: 'b@example.invalid', idNumber: '9202204720083' },
  });
  const enquirer = await prisma.contact.create({
    data: { kind: 'LEAD', firstName: `${TAG}-Enquiry`, lastName: 'Adams', email: 'e@example.invalid' },
  });

  const property = await prisma.property.create({
    data: {
      reference: `${TAG}-114`,
      addressLine: '14 Protea Street',
      suburb: 'Sedgefield',
      town: 'Sedgefield',
      propertyType: 'house',
      bedrooms: 3,
      bathrooms: 2,
      floorSizeSqm: 180,
      landSizeSqm: 900,
      condition: 'good',
      askingPrice: 4_250_000,
      status: 'LISTED',
      agentId,
    },
  });
  propertyId = property.id;

  // 08:15 — an enquiry that arrived overnight and nobody has answered.
  await prisma.lead.create({
    data: { stage: 'NEW', source: 'website', contactId: enquirer.id, propertyId, ownerId: agentId, createdAt: hoursAgo(30), lastContactAt: null },
  });

  // A viewing three days ago whose seller has heard nothing.
  await prisma.viewing.create({
    data: { propertyId, contactId: buyer.id, scheduledAt: daysAgo(8), completedAt: daysAgo(8), feedback: 'Liked the garden', sellerUpdatedAt: null },
  });

  // 12:00 — a staff task that has slipped.
  await prisma.task.create({
    data: { title: `${TAG} Send seller pack`, status: 'PENDING', ownerId: agentId, dueAt: daysAgo(3), estimatedMinutes: 30, department: 'SALES' },
  });

  // 13:00 — an unanswered client email.
  await prisma.communication.create({
    data: {
      channel: 'EMAIL', direction: 'INBOUND', externalId: `${TAG}-mail-1`, subject: 'Following up on the Sedgefield house',
      fromName: 'T Mokoena', fromAddress: 't@example.invalid', receivedAt: daysAgo(3), category: 'CLIENT', contactId: buyer.id, ownerId: agentId,
    },
  });

  // 15:00 — a transfer that has stopped moving.
  const offer = await prisma.offer.create({
    data: { propertyId, buyerId: buyer.id, sellerId: seller.id, status: 'ACCEPTED', amount: 4_100_000, depositAmount: 410_000, bondAmount: 3_690_000 },
  });
  const tx = await prisma.transaction.create({
    data: { propertyId, offerId: offer.id, stage: 'BOND_APPLICATION', lastMovementAt: daysAgo(24) },
  });
  await prisma.transactionChecklistItem.create({
    data: { transactionId: tx.id, label: 'Bond approval letter', stage: 'BOND_APPLICATION', required: true },
  });

  await prisma.mandate.create({
    data: { propertyId, sellerId: seller.id, type: 'SOLE', status: 'ACTIVE', endDate: new Date(NOW.getTime() + 12 * 86_400_000), listPrice: 4_250_000, commissionPct: 6 },
  });
});

afterAll(async () => {
  // Order matters: children before parents.
  await prisma.transactionChecklistItem.deleteMany({ where: { transaction: { property: { reference: `${TAG}-114` } } } });
  await prisma.transaction.deleteMany({ where: { property: { reference: `${TAG}-114` } } });
  await prisma.offer.deleteMany({ where: { property: { reference: `${TAG}-114` } } });
  await prisma.mandate.deleteMany({ where: { property: { reference: `${TAG}-114` } } });
  await prisma.viewing.deleteMany({ where: { property: { reference: `${TAG}-114` } } });
  await prisma.lead.deleteMany({ where: { property: { reference: `${TAG}-114` } } });
  await prisma.communication.deleteMany({ where: { externalId: { startsWith: TAG } } });
  await prisma.task.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.property.deleteMany({ where: { reference: `${TAG}-114` } });
  await prisma.contact.deleteMany({ where: { firstName: { startsWith: TAG } } });
  await prisma.$disconnect();
});

describe('08:00 — Mandy opens the system', () => {
  it('tells her immediately what matters, in one line', async () => {
    const brief = await dailyBrief(mandyId, NOW);
    expect(brief.greeting).toBe('Good morning Mandy.');
    expect(brief.recommendation.length).toBeGreaterThan(20);
    expect(brief.capacity.headline).toBeTruthy();
  });

  it('has already found everything that is going wrong', async () => {
    const prepared = await prepareEverything(mandyId, NOW);
    const kinds = prepared.items.map((i) => i.finding.kind);
    expect(kinds).toContain('FORGOTTEN_LEAD');
    expect(kinds).toContain('STALLED_TRANSACTION');
    expect(kinds).toContain('UNANSWERED_CLIENT');
    expect(kinds).toContain('OVERDUE_STAFF_TASK');
    expect(kinds).toContain('MANDATE_EXPIRING');
  });
});

describe('08:15 — a new lead arrives', () => {
  it('assigns it and prepares the next action without asking anyone', async () => {
    const staff = await getStaff();
    const decision = route({ workKey: 'lead.assign', staff, context: { relationshipOwnerId: agentId } });
    expect(decision.ownerType).toBe('AUTOMATION');
    expect(requiresCeo(decision)).toBe(false);
    expect(decision.nextAction).toMatch(/No person needed/);
  });

  it('does not put a new enquiry on the CEO', async () => {
    const prepared = await prepareEverything(mandyId, NOW);
    const lead = prepared.items.find((i) => i.finding.kind === 'FORGOTTEN_LEAD');
    expect(lead).toBeDefined();
    expect(lead!.outcome).not.toBe('needs_ceo');
  });
});

describe('09:00 — a market assessment is required', () => {
  it('prepares it, rather than telling Mandy to prepare it', async () => {
    const result = await marketAssessmentAgent.run(
      {
        subject: { addressLine: '14 Protea Street, Sedgefield', bedrooms: 3, bathrooms: 2, floorSizeSqm: 180, condition: 'good' },
        comparables: [
          { id: 'c1', addressLine: '8 Protea Street', price: 4_000_000, isSoldPrice: true, floorSizeSqm: 175, bedrooms: 3, bathrooms: 2, distanceKm: 0.2, saleDate: daysAgo(60), sourceName: 'Deeds' },
          { id: 'c2', addressLine: '22 Kingfisher Ave', price: 4_300_000, isSoldPrice: true, floorSizeSqm: 190, bedrooms: 3, bathrooms: 2, distanceKm: 1.1, saleDate: daysAgo(90), sourceName: 'Deeds' },
          { id: 'c3', addressLine: '5 Lagoon View', price: 4_150_000, isSoldPrice: true, floorSizeSqm: 180, bedrooms: 3, bathrooms: 2, distanceKm: 0.8, saleDate: daysAgo(45), sourceName: 'Deeds' },
          { id: 'c4', addressLine: '17 Milkwood', price: 4_400_000, isSoldPrice: true, floorSizeSqm: 195, bedrooms: 4, bathrooms: 2, distanceKm: 2.0, saleDate: daysAgo(120), sourceName: 'Deeds' },
        ],
      },
      { forUserId: mandyId, actingUserId: mandyId, now: NOW },
    );

    expect(result.status).toBe('completed');
    expect(result.summary).toMatch(/Prepared/);
    // The work is done; only the judgement is left.
    expect(result.minutesSaved).toBeGreaterThan(90);
    expect(result.requiredApproval).toBe('MANDY_ONLY');
    // And the arithmetic is on the page, not hidden.
    expect(result.outputs.find((o) => o.label === 'Workings')).toBeDefined();
  });

  it('refuses to produce a number it cannot defend', () => {
    const thin = assess({
      subject: { addressLine: 'Remote plot' },
      comparables: [{ id: 'x', addressLine: 'y', price: 1_000_000, isSoldPrice: false, sourceName: 'Asking' }],
      now: NOW,
    });
    expect(thin.status).toBe('NEEDS_INPUT');
    expect(thin.recommendedLow).toBeNull();
  });
});

describe('10:00 — a mandate request arrives', () => {
  const template: TemplateVersionSpec = {
    templateKey: 'mandate',
    version: 1,
    approvedAt: new Date('2026-01-01'),
    requiredApproval: 'APPROVAL',
    signatoryRoles: ['seller', 'agent'],
    body: 'Seller {{sellerFullName}} (ID {{sellerIdNumber}}) mandates the sale of {{propertyAddress}} at {{listPrice}} for {{commissionPct}}% from {{startDate}} to {{endDate}}.',
    fields: [
      { key: 'sellerFullName', label: 'Seller full name', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'seller.fullName', order: 1 },
      { key: 'sellerIdNumber', label: 'Seller identity number', dataType: 'id_number', required: true, validators: ['sa_id'], sourcePath: 'seller.idNumber', order: 2 },
      { key: 'propertyAddress', label: 'Property address', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'property.addressLine', order: 3 },
      { key: 'listPrice', label: 'List price', dataType: 'currency', required: true, validators: ['positive'], sourcePath: 'mandate.listPrice', order: 4 },
      { key: 'commissionPct', label: 'Commission', dataType: 'number', required: true, validators: ['percentage'], sourcePath: 'mandate.commissionPct', order: 5 },
      { key: 'startDate', label: 'Start date', dataType: 'date', required: true, validators: ['date'], sourcePath: 'mandate.startDate', order: 6 },
      { key: 'endDate', label: 'End date', dataType: 'date', required: true, validators: ['date'], sourcePath: 'mandate.endDate', order: 7 },
    ],
  };

  it('prepares the package from the records already on file', async () => {
    const property = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
    const seller = await prisma.contact.findFirstOrThrow({ where: { firstName: { startsWith: TAG }, kind: 'SELLER' } });

    const result = await documentAgent.run(
      {
        template,
        checkSet: 'mandate',
        manualMinutes: 75,
        sources: {
          seller: { fullName: `${seller.firstName} ${seller.lastName}`, idNumber: seller.idNumber },
          property: { addressLine: property.addressLine },
          mandate: { listPrice: '4250000', commissionPct: '6', startDate: '2026-09-07', endDate: '2026-12-07' },
        },
      },
      { forUserId: mandyId, actingUserId: mandyId, now: NOW },
    );

    expect(result.status).toBe('completed');
    expect(result.missing).toEqual([]);
    expect(String(result.outputs[0]!.value)).toContain('14 Protea Street');
    expect(String(result.outputs[0]!.value)).not.toContain('{{');
    // 75 minutes by hand, less the 11-minute review that remains a person's.
    expect(result.minutesSaved).toBe(75 - reviewMinutes(75));
  });

  it('stops and says exactly what is missing rather than producing a half-document', async () => {
    const result = await documentAgent.run(
      { template, checkSet: 'mandate', sources: { property: { addressLine: '14 Protea Street' } } },
      { forUserId: mandyId, actingUserId: mandyId, now: NOW },
    );
    expect(result.status).toBe('needs_input');
    expect(result.missing).toContain('sellerIdNumber');
    expect(result.blockedReason).toContain('sellerIdNumber');
    expect(result.minutesSaved).toBe(0);
  });

  it('catches a commission percentage that cannot be right', () => {
    const doc = prepareDocument({
      template,
      checkSet: 'mandate',
      sources: { seller: { fullName: 'A B', idNumber: '8001015009087' }, property: { addressLine: 'x' }, mandate: { listPrice: '1', commissionPct: '60', startDate: '2026-09-07', endDate: '2026-12-07' } },
    });
    expect(doc.readyForReview).toBe(false);
    expect(doc.issues.some((i) => i.field === 'commissionPct' && i.severity === 'error')).toBe(true);
  });
});

describe('11:00 — an offer arrives', () => {
  it('routes it for signature and never signs it', async () => {
    const staff = await getStaff();
    const decision = route({ workKey: 'otp.prepare', staff, context: { valueZar: 4_100_000, relationshipOwnerId: agentId } });
    expect(decision.requiredApproval).toBe('SIGNATURE');
    expect(decision.ownerType).toBe('AI');
    expect(decision.approverName).toBeTruthy();
  });

  it('sends a high-value offer to Mandy, and a routine one to the agent', async () => {
    const staff = await getStaff();
    const routine = route({ workKey: 'otp.prepare', staff, context: { valueZar: 1_200_000 } });
    const large = route({ workKey: 'otp.prepare', staff, context: { valueZar: 9_500_000 } });
    expect(requiresCeo(routine)).toBe(false);
    expect(large.approverId).toBe(mandyId);
  });
});

describe('12:00 — a staff member misses a deadline', () => {
  it('chases the right person, and not the CEO', async () => {
    const prepared = await prepareEverything(mandyId, NOW);
    const overdue = prepared.items.find((i) => i.finding.title.includes('Send seller pack'));
    expect(overdue).toBeDefined();
    expect(overdue!.outcome).not.toBe('needs_ceo');
    expect(overdue!.finding.ownerId).toBe(agentId);
  });
});

describe('13:00 — an important client email arrives', () => {
  it('triages it correctly without a language model', async () => {
    const result = await communicationAgent.run(
      { subject: 'Geyser burst at the Wilderness cottage', body: 'Water is coming through the ceiling', knownContact: true },
      { forUserId: mandyId, actingUserId: mandyId, now: NOW },
    );
    expect(result.status).toBe('completed');
    expect(result.outputs.find((o) => o.label === 'Category')?.value).toBe('RENTAL');
    expect(result.outputs.find((o) => o.label === 'Decision')?.value).toBe('DELEGATE');
  });

  it('reads deadlines out of the message so nothing is forgotten', () => {
    const r = triage({ subject: 'Bond approval', body: 'The bank needs the documents by 2026-09-15.' });
    expect(r.deadlines[0]?.toISOString().slice(0, 10)).toBe('2026-09-15');
  });
});

describe('15:00 — a transaction stalls', () => {
  it('detects it and says what it is waiting on', async () => {
    const prepared = await prepareEverything(mandyId, NOW);
    const stalled = prepared.items.find((i) => i.finding.kind === 'STALLED_TRANSACTION');
    expect(stalled).toBeDefined();
    expect(stalled!.finding.detail).toContain('Bond approval letter');
    expect(stalled!.finding.severity).toBe('URGENT');
  });
});

describe('16:00 — "what still needs me?"', () => {
  it('gives a short answer, not a pile of admin', async () => {
    const prepared = await prepareEverything(mandyId, NOW);
    expect(prepared.needsCeo.length).toBeLessThanOrEqual(2);
    expect(prepared.headline.length).toBeLessThan(240);
  });

  it('keeps most of the day off her plate entirely', async () => {
    const prepared = await prepareEverything(mandyId, NOW);
    const handledWithoutHer = prepared.ready.length + prepared.delegated.length + prepared.awaitingApproval.length;
    expect(handledWithoutHer).toBeGreaterThan(prepared.needsCeo.length);
  });

  it('explains every item that did reach her', async () => {
    const prepared = await prepareEverything(mandyId, NOW);
    for (const item of prepared.needsCeo) {
      expect(item.detail.length, `${item.finding.title} arrived without a reason`).toBeGreaterThan(20);
    }
  });
});

describe('17:00 — "prepare everything for tomorrow"', () => {
  it('does the work and reports the time it removed', async () => {
    const prepared = await prepareEverything(mandyId, NOW);
    expect(prepared.available.recoveredMinutes).toBeGreaterThan(0);
    expect(prepared.headline).toMatch(/handled|delegated|prepared/);
  });

  it('closes the day with an account of what happened', async () => {
    const review = await endOfDay(mandyId, NOW);
    expect(review.summary).toMatch(/recovered/i);
    expect(review.atRisk.length).toBeGreaterThan(0);
  });
});

describe('the day, measured', () => {
  it('interrupts the CEO for less than a quarter of what it found', async () => {
    const prepared = await prepareEverything(mandyId, NOW);
    const share = prepared.needsCeo.length / Math.max(1, prepared.items.length);
    expect(share).toBeLessThan(0.25);
  });

  it('never leaves an item without an owner and a next action', async () => {
    const prepared = await prepareEverything(mandyId, NOW);
    for (const item of prepared.items) {
      expect(item.finding.suggestedAction, `${item.finding.title} had no next action`).toBeTruthy();
      const hasOwner = item.decision.ownerId != null || item.decision.ownerType !== 'USER' || item.decision.needsOwnershipDecision;
      expect(hasOwner, `${item.finding.title} had no owner and no ownership question`).toBe(true);
    }
  });
});
