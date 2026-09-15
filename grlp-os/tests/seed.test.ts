import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Guards the configuration the whole system routes on.
 *
 * A half-completed seed is the dangerous case: a template that exists but has no
 * fields produces an empty document without complaining, and a missing staff
 * member sends work to nobody. Both have happened, so both are checked.
 */

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

describe('the team is configured', () => {
  it('has exactly one CEO', async () => {
    expect(await prisma.user.count({ where: { isCeo: true, active: true } })).toBe(1);
  });

  it('has someone in every department work is routed to', async () => {
    for (const department of ['SALES', 'RENTALS', 'ACCOUNTS', 'MARKETING'] as const) {
      const count = await prisma.user.count({ where: { department, active: true } });
      expect(count, `nobody in ${department}`).toBeGreaterThan(0);
    }
  });

  it('uses the confirmed mail domain', async () => {
    const ceo = await prisma.user.findFirstOrThrow({ where: { isCeo: true } });
    expect(ceo.email).toMatch(/@grproperty\.co\.za$/);
  });
});

describe('templates are usable', () => {
  it('gives every template version its fields', async () => {
    const versions = await prisma.templateVersion.findMany({ include: { fields: true, template: true } });
    expect(versions.length).toBeGreaterThan(0);
    for (const v of versions) {
      expect(v.fields.length, `${v.template.key} v${v.version} has no fields`).toBeGreaterThan(0);
    }
  });

  it('ships wording unapproved, so nothing can be generated from it yet', async () => {
    const versions = await prisma.templateVersion.findMany();
    for (const v of versions) {
      expect(v.approvedAt, 'a template shipped pre-approved').toBeNull();
    }
  });

  it('has a field for every placeholder in the body', async () => {
    const versions = await prisma.templateVersion.findMany({ include: { fields: true, template: true } });
    for (const v of versions) {
      const keys = new Set(v.fields.map((f) => f.key));
      for (const match of v.body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
        expect(keys.has(match[1]!), `${v.template.key} has no field for {{${match[1]}}}`).toBe(true);
      }
    }
  });

  it('requires an identity number wherever a party is named', async () => {
    const fields = await prisma.templateField.findMany({ where: { dataType: 'id_number' } });
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) {
      expect(f.validators, `${f.key} is not validated as an SA ID`).toContain('sa_id');
    }
  });
});

describe('no invented records were seeded', () => {
  it('has no clients, properties, leads or transactions', async () => {
    const [contacts, properties, leads, transactions] = await Promise.all([
      prisma.contact.count(),
      prisma.property.count(),
      prisma.lead.count(),
      prisma.transaction.count(),
    ]);
    expect({ contacts, properties, leads, transactions }).toEqual({ contacts: 0, properties: 0, leads: 0, transactions: 0 });
  });
});
