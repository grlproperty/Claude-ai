import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { importMasters, extractableFrom, MASTER_FOLDERS } from '../src/server/master-import';
import { matchDocument, ALL_DOCUMENTS, SALES_STAGES, RENTALS_STAGES, stagesFor } from '../src/domain/master-documents';
import type { DropboxClient, DropboxEntry } from '../src/integrations/dropbox';

/**
 * The importer is tested against a fake Dropbox holding the real filenames from
 * GRLP's master-copy folders, so matching, variant detection, de-duplication and
 * the refusal to pre-approve wording are all verified without credentials.
 */

const prisma = new PrismaClient();

/** Real filenames, taken from GRLP's Dropbox. */
const SALES_FILES = [
  '2. OFFER TO PURCHASE RESIDENTIAL GRLP.doc',
  '2. OFFER TO PURCHASE RESIDENTIAL GRLP.pdf',
  '2. OFFER TO PURCHASE SECTIONAL TITLE GRLP.doc',
  '2. OFFER TO PURCHASE VACANT LAND GRLP.doc',
  '2. OFFER TO PURCHASE ESTATE HOA GRLP.doc',
  'SOLE MANDATE GRLP MASTER COPY.docx',
  'PERMISSION TO LIST GRLP MASTER COPY.docx',
  'SCHEDULE 3 FICA NATURAL PERSON.pdf',
  'SCHEDULE 6 FICA TRUST GRLP.pdf',
  'Info required to draw up otp.docx',
  'OTP Checklist Purchaser.pdf',
  '3. CANCELLATION AGREEMENT.doc',
  'Keep your septic tank healthy.pdf',
];

const RENTALS_FILES = [
  '1. AGREEMENT OF LEASE Residential Master Copy- Reformatted MC.doc',
  '1. AGREEMENT OF LEASE Office Business Master Copy- Retyped.doc',
  'ADDENDUM TO AGREEMENT OF LEASE.docx',
  'LEASE SURETY AGREEMENT.docx',
  'RENTAL LISTING FORM.docx',
  'Tenant Warning Letter.docx',
  'termination letter.docx',
  'Key Control List.xlsx',
  'RENTAL_HOUSING_ACT.pdf',
];

function entry(folder: string, name: string, rev = 'rev1'): DropboxEntry {
  return {
    kind: 'file',
    name,
    pathLower: `${folder}/${name}`.toLowerCase(),
    pathDisplay: `${folder}/${name}`,
    id: `id:${name}`,
    rev,
    size: 1024,
    serverModified: new Date('2026-08-11T12:00:00Z'),
  };
}

class FakeDropbox implements DropboxClient {
  downloads: string[] = [];
  constructor(
    private files: Record<string, string[]>,
    private revs: Record<string, string> = {},
  ) {}
  async listFolder(path: string): Promise<DropboxEntry[]> {
    return (this.files[path] ?? []).map((n) => entry(path, n, this.revs[n] ?? 'rev1'));
  }
  async download(path: string): Promise<Buffer> {
    this.downloads.push(path);
    // A minimal valid .docx would be needed for real extraction; the importer
    // records the failure honestly rather than inventing text, which is what
    // these tests assert.
    return Buffer.from('not a real document');
  }
  async verify() {
    return { ok: true };
  }
}

const fake = (revs: Record<string, string> = {}) =>
  new FakeDropbox({ [MASTER_FOLDERS[0]!]: SALES_FILES, [MASTER_FOLDERS[1]!]: RENTALS_FILES }, revs);

beforeEach(async () => {
  await prisma.templateField.deleteMany({ where: { version: { template: { process: { not: null } } } } });
  await prisma.templateVersion.deleteMany({ where: { template: { process: { not: null } } } });
  await prisma.template.deleteMany({ where: { process: { not: null } } });
});

afterAll(async () => {
  await prisma.templateVersion.deleteMany({ where: { template: { process: { not: null } } } });
  await prisma.template.deleteMany({ where: { process: { not: null } } });
  await prisma.$disconnect();
});

describe('the importer reads nothing without credentials', () => {
  it('says so plainly rather than failing obscurely', async () => {
    const result = await importMasters();
    expect(result.unavailable).toMatch(/not connected/);
    expect(result.unavailable).toMatch(/Nothing was read or written/);
    expect(result.imported).toHaveLength(0);
  });
});

describe('matching GRLP’s real filenames', () => {
  it('recognises each offer-to-purchase variant', () => {
    expect(matchDocument('2. OFFER TO PURCHASE RESIDENTIAL GRLP.doc')).toMatchObject({ variant: 'residential' });
    expect(matchDocument('2. OFFER TO PURCHASE SECTIONAL TITLE GRLP.doc')).toMatchObject({ variant: 'sectional title' });
    expect(matchDocument('2. OFFER TO PURCHASE VACANT LAND GRLP.doc')).toMatchObject({ variant: 'vacant land' });
    expect(matchDocument('2. OFFER TO PURCHASE ESTATE HOA GRLP.doc')).toMatchObject({ variant: 'estate hoa' });
  });

  it('recognises the lease variants', () => {
    expect(matchDocument('1. AGREEMENT OF LEASE Residential Master Copy- Reformatted MC.doc')).toMatchObject({
      document: expect.objectContaining({ key: 'lease_agreement' }),
      variant: 'residential',
    });
    expect(matchDocument('1. AGREEMENT OF LEASE Office Business Master Copy- Retyped.doc')?.variant).toBe('office business');
  });

  it('recognises the three FICA schedules by entity type', () => {
    expect(matchDocument('SCHEDULE 3 FICA NATURAL PERSON.pdf')?.variant).toBe('natural person');
    expect(matchDocument('SCHEDULE 6 FICA TRUST GRLP.pdf')?.variant).toBe('trust');
  });

  it('does not match a file that is not a GRLP document', () => {
    expect(matchDocument('Keep your septic tank healthy.pdf')).toBeNull();
    expect(matchDocument('RENTAL_HOUSING_ACT.pdf')).toBeNull();
  });
});

describe('importing', () => {
  it('catalogues the masters and reports what it could not match', async () => {
    const result = await importMasters({ client: fake() });
    expect(result.scanned).toBe(SALES_FILES.length + RENTALS_FILES.length);
    expect(result.matched).toBeGreaterThan(15);
    expect(result.unmatched.map((u) => u.name)).toContain('Keep your septic tank healthy.pdf');
  });

  it('writes a template per document and variant', async () => {
    await importMasters({ client: fake() });
    const otpVariants = await prisma.template.findMany({ where: { key: { startsWith: 'otp.' } } });
    expect(otpVariants.length).toBeGreaterThanOrEqual(4);
    expect(otpVariants.map((t) => t.variant)).toContain('residential');
    expect(otpVariants.every((t) => t.process === 'SALES')).toBe(true);
  });

  it('records where each master came from, so a change can be detected', async () => {
    await importMasters({ client: fake() });
    const version = await prisma.templateVersion.findFirstOrThrow({ where: { template: { key: 'sole_mandate' } } });
    expect(version.sourceProvider).toBe('dropbox');
    expect(version.sourcePath).toContain('SOLE MANDATE');
    expect(version.sourceRev).toBe('rev1');
  });

  it('never pre-approves imported wording', async () => {
    await importMasters({ client: fake() });
    const versions = await prisma.templateVersion.findMany({ where: { template: { process: { not: null } } } });
    expect(versions.length).toBeGreaterThan(0);
    for (const v of versions) expect(v.approvedAt, `${v.sourcePath} was imported pre-approved`).toBeNull();
  });

  it('skips a master that has not changed since the last import', async () => {
    await importMasters({ client: fake() });
    const second = await importMasters({ client: fake() });
    expect(second.imported.every((i) => i.status === 'unchanged')).toBe(true);
    const versions = await prisma.templateVersion.count({ where: { template: { key: 'sole_mandate' } } });
    expect(versions).toBe(1);
  });

  it('creates a new version when the master is edited, keeping the old one', async () => {
    await importMasters({ client: fake() });
    await importMasters({ client: fake({ 'SOLE MANDATE GRLP MASTER COPY.docx': 'rev2' }) });

    const versions = await prisma.templateVersion.findMany({
      where: { template: { key: 'sole_mandate' } },
      orderBy: { version: 'asc' },
    });
    expect(versions).toHaveLength(2);
    expect(versions[1]!.sourceRev).toBe('rev2');
  });

  it('says plainly when a legacy .doc could not be read, and catalogues it anyway', async () => {
    const result = await importMasters({ client: fake() });
    const otp = result.imported.find((i) => i.templateKey === 'otp.sectional_title');
    expect(otp?.status).toBe('no_text');
    expect(otp?.extractionNote).toMatch(/legacy Word/);
    expect(otp?.extractionNote).toMatch(/Save it as \.docx/);
    // It is still tracked, so nothing disappears silently.
    expect(await prisma.template.findUnique({ where: { key: 'otp.sectional_title' } })).not.toBeNull();
  });

  it('ignores superseded folders', async () => {
    const withOld: DropboxClient = {
      async listFolder(path: string) {
        return path === MASTER_FOLDERS[0]
          ? [entry(`${path}/Other OLD`, 'SOLE MANDATE GRLP MASTER COPY.docx'), entry(path, 'PERMISSION TO LIST GRLP MASTER COPY.docx')]
          : [];
      },
      async download() {
        return Buffer.from('');
      },
      async verify() {
        return { ok: true };
      },
    };

    const result = await importMasters({ client: withOld });
    expect(result.imported.map((i) => i.templateKey)).toEqual(['permission_to_list']);
  });

  it('reports catalogue entries with no master copy in Dropbox', async () => {
    const result = await importMasters({ client: fake() });
    expect(result.missingFromDropbox.length).toBeGreaterThan(0);
    expect(result.missingFromDropbox.every((m) => ALL_DOCUMENTS.some((d) => d.key === m.key))).toBe(true);
  });

  it('changes nothing on a dry run', async () => {
    const result = await importMasters({ client: fake(), dryRun: true });
    expect(result.imported.length).toBeGreaterThan(0);
    expect(await prisma.template.count({ where: { process: { not: null } } })).toBe(0);
  });
});

describe('the process map matches GRLP’s own checklists', () => {
  it('gates the rentals process exactly where GRLP gates it', () => {
    const gated = RENTALS_STAGES.filter((s) => s.gate);
    // Four "SIGNED OFF BY SUPERIOR" gates in the rental document checklist.
    expect(gated).toHaveLength(4);
    expect(gated[0]!.gate!.blocksWhat).toMatch(/advertising/);
    expect(gated[1]!.gate!.blocksWhat).toMatch(/drawing up the lease/);
    expect(gated[2]!.gate!.blocksWhat).toMatch(/moving in/);
  });

  it('runs sales from appraisal through to commission', () => {
    const keys = stagesFor('SALES').map((s) => s.key);
    expect(keys[0]).toBe('sales.appraisal');
    expect(keys.at(-1)).toBe('sales.registration');
    expect(SALES_STAGES.every((s, i) => s.order === i + 1)).toBe(true);
  });

  it('gives every document an owner and a stage that exists', () => {
    const stageKeys = new Set([...SALES_STAGES, ...RENTALS_STAGES].map((s) => s.key));
    for (const doc of ALL_DOCUMENTS) {
      expect(stageKeys.has(doc.stageKey), `${doc.key} points at an unknown stage`).toBe(true);
      expect(doc.completedBy, `${doc.key} has no owner`).toBeTruthy();
    }
  });

  it('does not claim the AI can complete a document only a person can sign', () => {
    for (const key of ['property_disclosure', 'landlord_fica', 'tenant_fica', 'coc_electrical', 'credit_check_report']) {
      const doc = ALL_DOCUMENTS.find((d) => d.key === key)!;
      expect(doc.aiPopulates, `${key} is marked as AI-populated`).toBe(false);
    }
  });
});

describe('text extraction', () => {
  it('knows which formats it can read', () => {
    expect(extractableFrom('a.docx')).toBe('docx');
    expect(extractableFrom('a.pdf')).toBe('pdf');
    expect(extractableFrom('a.doc')).toBeNull();
    expect(extractableFrom('a.xlsx')).toBeNull();
  });
});
