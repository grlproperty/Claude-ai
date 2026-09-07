import { PrismaClient } from '@prisma/client';

/**
 * Creates and removes the temporary records used to verify the interface with
 * data in it. This is a verification fixture, not seed data — nothing here is
 * installed by `npm run seed`.
 *
 *   npx tsx tests/e2e/fixture.ts create
 *   npx tsx tests/e2e/fixture.ts remove
 */
const prisma = new PrismaClient();
const TAG = 'UIFIXTURE';
const NOW = new Date();
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

async function create() {
  const kandy = await prisma.user.findUniqueOrThrow({ where: { email: 'kandy@gardenroutelifestyleproperty.co.za' } });
  const mandy = await prisma.user.findUniqueOrThrow({ where: { email: 'mandy@gardenroutelifestyleproperty.co.za' } });

  const seller = await prisma.contact.create({ data: { kind: 'SELLER', firstName: `${TAG}-M`, lastName: 'Botha', idNumber: '8001015009087' } });
  const buyer = await prisma.contact.create({ data: { kind: 'BUYER', firstName: `${TAG}-T`, lastName: 'Mokoena' } });
  const enquirer = await prisma.contact.create({ data: { kind: 'LEAD', firstName: `${TAG}-R`, lastName: 'Adams' } });

  const property = await prisma.property.create({
    data: { reference: `${TAG}-114`, addressLine: '14 Protea Street', town: 'Sedgefield', propertyType: 'house', bedrooms: 3, bathrooms: 2, floorSizeSqm: 180, askingPrice: 4_250_000, status: 'LISTED', agentId: kandy.id },
  });

  await prisma.lead.create({ data: { stage: 'NEW', source: 'website', contactId: enquirer.id, propertyId: property.id, ownerId: kandy.id, createdAt: hoursAgo(31) } });
  await prisma.viewing.create({ data: { propertyId: property.id, contactId: buyer.id, scheduledAt: daysAgo(8), completedAt: daysAgo(8), feedback: 'Liked the garden' } });
  await prisma.task.create({ data: { title: `${TAG} Send seller pack`, status: 'PENDING', ownerId: kandy.id, dueAt: daysAgo(3), estimatedMinutes: 30, department: 'SALES' } });
  await prisma.communication.create({
    data: { channel: 'EMAIL', direction: 'INBOUND', externalId: `${TAG}-1`, subject: 'Following up on the Sedgefield house', fromName: 'T Mokoena', receivedAt: daysAgo(3), category: 'CLIENT', ownerId: kandy.id },
  });

  const offer = await prisma.offer.create({ data: { propertyId: property.id, buyerId: buyer.id, sellerId: seller.id, status: 'ACCEPTED', amount: 4_100_000 } });
  const tx = await prisma.transaction.create({ data: { propertyId: property.id, offerId: offer.id, stage: 'BOND_APPLICATION', lastMovementAt: daysAgo(24) } });
  await prisma.transactionChecklistItem.create({ data: { transactionId: tx.id, label: 'Bond approval letter', stage: 'BOND_APPLICATION', required: true } });
  await prisma.mandate.create({ data: { propertyId: property.id, sellerId: seller.id, type: 'SOLE', status: 'ACTIVE', endDate: new Date(NOW.getTime() + 12 * 86_400_000), listPrice: 4_250_000, commissionPct: 6 } });

  await prisma.escalation.create({
    data: {
      level: 'L3_CEO',
      title: 'Seller wants to withdraw a signed sole mandate',
      issue: 'The seller at 14 Protea Street has asked to cancel a sole mandate with 71 days left to run.',
      context: 'Listed three weeks ago at R4 250 000. Two viewings, no offers. The seller cites a family relocation.',
      actionsTaken: ['Confirmed the mandate dates', 'Asked the seller for the reason in writing', 'Held the marketing spend'],
      options: [
        { key: 'release', label: 'Release the mandate', consequence: 'Goodwill kept, no commission', reversible: false },
        { key: 'hold', label: 'Hold to term', consequence: 'Mandate stands, relationship strain', reversible: true },
        { key: 'convert', label: 'Convert to an open mandate', consequence: 'Some chance retained', reversible: true },
      ],
      recommendation: 'Convert to an open mandate',
      recommendationReason: 'It keeps a route to commission without forcing an unwilling seller to term.',
      decisionRequired: 'Release, hold, or convert?',
      assigneeId: mandy.id,
      createdAt: daysAgo(4),
      dueAt: new Date(NOW.getTime() + 2 * 86_400_000),
    },
  });

  console.log('Fixture created.');
}

async function remove() {
  // Anything the executor produced while the fixture was in place goes too.
  await prisma.auditLog.deleteMany({ where: { entityId: { startsWith: TAG } } });
  await prisma.aiAction.deleteMany({ where: { action: { startsWith: 'resolve:' } } });
  await prisma.task.deleteMany({ where: { createdByAi: true } });
  await prisma.escalation.deleteMany({ where: { title: { contains: 'sole mandate' } } });
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
  console.log('Fixture removed.');
}

const cmd = process.argv[2];
(cmd === 'create' ? create() : cmd === 'remove' ? remove() : Promise.reject(new Error('Usage: fixture.ts create|remove')))
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
