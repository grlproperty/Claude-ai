import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { KNOWLEDGE_FOLDERS, excerptAround, importKnowledge, searchKnowledge, tagsFor } from '../src/server/knowledge-import';
import { ALL_RULES, COMPANY_FACTS, GOVERNING_LEGISLATION, STATUTORY_DEADLINES, rulesAbout } from '../src/domain/operating-rules';
import type { DropboxClient, DropboxEntry } from '../src/integrations/dropbox';

const prisma = new PrismaClient();

/** Real filenames from GRLP's knowledge folders. */
const FILES: Record<string, string[]> = {
  '/GRLP Agents/18. Standard Operating Procedures': [
    'Listing SOP GRLP.docx',
    'Rentals SOP.docx',
    'Buyer Qualification.docx',
    'GRLP Commission negotiation Policy.pdf',
    'Other OLD/Listing SOP GRLP.docx',
    'POPI Act employee acknowledgement/POPI Compliance signed by Laurell Pelser.pdf',
    'Branding/Branding Manual Garden Route Lifestyle Property.docx',
  ],
  '/GRLP Agents/19. Legislative & Compliance': ['FICA Explained.pdf', 'Why do we have to FICA you.docx', 'Sharples.jpg'],
};

function entry(folder: string, name: string, rev = 'r1'): DropboxEntry {
  return {
    kind: 'file', name: name.split('/').pop()!,
    pathLower: `${folder}/${name}`.toLowerCase(), pathDisplay: `${folder}/${name}`,
    id: `id:${name}`, rev, size: 2048, serverModified: new Date('2026-07-31T09:00:00Z'),
  };
}

class Fake implements DropboxClient {
  downloaded: string[] = [];
  constructor(private revs: Record<string, string> = {}) {}
  async listFolder(path: string) {
    return (FILES[path] ?? []).map((n) => entry(path, n, this.revs[n] ?? 'r1'));
  }
  async download(path: string) {
    this.downloaded.push(path);
    return Buffer.from('not a real document');
  }
  async verify() {
    return { ok: true };
  }
}

const folders = KNOWLEDGE_FOLDERS.filter((f) => f.path in FILES);

beforeEach(() => prisma.knowledgeDocument.deleteMany({ where: { sourceProvider: 'dropbox' } }));
afterAll(async () => {
  await prisma.knowledgeDocument.deleteMany({ where: { sourceProvider: 'dropbox' } });
  await prisma.$disconnect();
});

describe('importing GRLP’s knowledge base', () => {
  it('reads nothing without credentials, and says so', async () => {
    const r = await importKnowledge();
    expect(r.unavailable).toMatch(/not connected/);
    expect(r.imported).toHaveLength(0);
  });

  it('imports the procedures and skips what is not knowledge', async () => {
    const r = await importKnowledge({ client: new Fake(), folders });
    const paths = r.imported.map((i) => i.path);
    expect(paths.some((p) => p.includes('Rentals SOP'))).toBe(true);
    // An image carries no procedure.
    expect(paths.some((p) => p.endsWith('.jpg'))).toBe(false);
  });

  it('ignores superseded copies and personal signed acknowledgements', async () => {
    const r = await importKnowledge({ client: new Fake(), folders });
    const paths = r.imported.map((i) => i.path);
    expect(paths.some((p) => p.includes('Other OLD'))).toBe(false);
    expect(paths.some((p) => p.includes('signed by Laurell'))).toBe(false);
  });

  it('records where each document came from', async () => {
    await importKnowledge({ client: new Fake(), folders });
    const doc = await prisma.knowledgeDocument.findFirstOrThrow({
      where: { title: { contains: 'Rentals SOP' }, sourceProvider: 'dropbox' },
    });
    expect(doc.sourceProvider).toBe('dropbox');
    expect(doc.sourcePath).toContain('Standard Operating Procedures');
    expect(doc.sourceRev).toBe('r1');
  });

  it('skips a document that has not changed', async () => {
    await importKnowledge({ client: new Fake(), folders });
    const second = await importKnowledge({ client: new Fake(), folders });
    expect(second.imported.every((i) => i.status === 'unchanged')).toBe(true);
  });

  it('updates a document that has been edited', async () => {
    await importKnowledge({ client: new Fake(), folders });
    const second = await importKnowledge({ client: new Fake({ 'Rentals SOP.docx': 'r2' }), folders });
    expect(second.imported.find((i) => i.path.includes('Rentals SOP'))?.status).not.toBe('unchanged');
  });

  it('changes nothing on a dry run', async () => {
    const before = await prisma.knowledgeDocument.count({ where: { sourceProvider: 'dropbox' } });
    await importKnowledge({ client: new Fake(), folders, dryRun: true });
    expect(await prisma.knowledgeDocument.count({ where: { sourceProvider: 'dropbox' } })).toBe(before);
  });

  it('reports a folder it cannot read rather than failing the whole import', async () => {
    const broken: DropboxClient = {
      async listFolder() { throw new Error('folder moved'); },
      async download() { return Buffer.from(''); },
      async verify() { return { ok: true }; },
    };
    const r = await importKnowledge({ client: broken, folders });
    expect(r.imported.every((i) => i.status === 'skipped')).toBe(true);
    expect(r.imported[0]?.note).toMatch(/renamed or moved/);
  });
});

describe('finding the right passage', () => {
  it('tags a document by what it is actually about', () => {
    const tags = tagsFor('Rentals SOP', 'All money must flow through the GRLP trust account. Credit checks via TPN. FICA required.');
    expect(tags).toContain('trust account');
    expect(tags).toContain('tpn');
    expect(tags).toContain('fica');
  });

  it('quotes the passage that explains the term, not the first passing mention', () => {
    const text =
      'Roles: Accounts handles trust account management. ' +
      'X'.repeat(900) +
      ' All client money flows through the GRLP trust account. The trust account is reconciled monthly and the trust account may never be a personal account.';
    const excerpt = excerptAround(text, 'trust account');
    expect(excerpt).toContain('All client money flows through');
    expect(excerpt).not.toContain('Roles: Accounts handles');
  });

  it('skips a lone heading mention in favour of the body', () => {
    // One mention each, so only the position rule can separate them.
    const text = 'Deposit policy.' + 'Y'.repeat(1200) + ' The deposit is refunded within 14 days.';
    expect(excerptAround(text, 'deposit')).toContain('refunded within 14 days');
  });

  it('returns the opening when the term is absent', () => {
    expect(excerptAround('A short document about nothing in particular.', 'zebra')).toContain('A short document');
  });

  it('searches the loaded procedures and cites the source', async () => {
    await prisma.knowledgeDocument.create({
      data: {
        key: 'test-rentals-sop', title: 'Rentals SOP', category: 'SOP', appliesTo: 'RENTALS',
        sourceProvider: 'dropbox', sourcePath: '/GRLP Agents/18. Standard Operating Procedures/Rentals SOP.docx',
        text: 'All money must flow through the GRLP trust account — no personal accounts allowed.',
        wordCount: 14, tags: ['trust account'],
      },
    });
    const hits = await searchKnowledge('trust account', 5);
    expect(hits.length).toBeGreaterThan(0);
    // Ranked by substance, so a real procedure outranks a fragment.
    expect(hits.every((h) => h.sourcePath.length > 0)).toBe(true);
    const mine = hits.find((h) => h.excerpt.includes('no personal accounts'));
    expect(mine, 'the loaded document was not found').toBeDefined();
    expect(mine!.sourcePath).toContain('Rentals SOP');
  });
});

describe('the operating rules taken from GRLP’s SOPs', () => {
  it('knows the statutory deadlines that are not GRLP’s to choose', () => {
    const text = STATUTORY_DEADLINES.map((r) => r.rule).join(' ');
    expect(text).toContain('within 7 days');
    expect(text).toContain('within 14 days');
    expect(STATUTORY_DEADLINES.every((r) => r.statute)).toBe(true);
  });

  it('cites a source for every rule, so any of them can be checked', () => {
    for (const rule of ALL_RULES) {
      expect(rule.source.length, `"${rule.rule}" has no source`).toBeGreaterThan(3);
    }
  });

  it('answers what GRLP does about a subject', () => {
    expect(rulesAbout('trust').some((r) => r.rule.includes('trust account'))).toBe(true);
    expect(rulesAbout('deposit').length).toBeGreaterThan(2);
    expect(rulesAbout('unicorn')).toHaveLength(0);
  });

  it('names the legislation rather than inventing a basis', () => {
    const acts = GOVERNING_LEGISLATION.map((a) => a.short);
    expect(acts).toContain('FICA');
    expect(acts).toContain('POPIA');
    expect(acts).toContain('Rental Housing Act');
    expect(GOVERNING_LEGISLATION.every((a) => /\d{4}/.test(a.act))).toBe(true);
  });

  it('holds the company details that must be right on every document', () => {
    expect(COMPANY_FACTS.registrationNumber).toBe('2020 / 697392 / 07');
    expect(COMPANY_FACTS.fidelityFundCertificate).toBe('149966');
    expect(COMPANY_FACTS.defaultCommissionPct).toBe(6.5);
    expect(COMPANY_FACTS.offices).toHaveLength(2);
  });
});
