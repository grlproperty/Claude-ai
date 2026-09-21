import { prisma } from './db';
import { extractText, extractableFrom } from './master-import';
import { dropboxClient, dropboxConfig, type DropboxClient, type DropboxEntry } from '../integrations/dropbox';

/**
 * Imports GRLP's knowledge base from Dropbox.
 *
 * The agency keeps a curated set of twenty folders its agents work from —
 * standard operating procedures, compliance, area information, checklists. This
 * pulls them into the database so the system can answer from what GRLP actually
 * does, and cite the document it came from.
 *
 * The same four rules as the master-copy importer: it reads only, text goes to
 * the database and never to this public repository, an unchanged document is
 * skipped, and a file it cannot read is recorded with an honest note rather than
 * silently dropped.
 */

export type KnowledgeCategory = 'SOP' | 'POLICY' | 'COMPLIANCE' | 'TEMPLATE_GUIDE' | 'TRAINING' | 'AREA_INFO' | 'REFERENCE';
export type AppliesTo = 'SALES' | 'RENTALS' | 'BOTH' | 'COMPANY';

/** The folders worth importing, and what kind of knowledge each holds. */
export const KNOWLEDGE_FOLDERS: Array<{ path: string; category: KnowledgeCategory; appliesTo: AppliesTo }> = [
  { path: '/GRLP Agents/1. Start Here', category: 'REFERENCE', appliesTo: 'COMPANY' },
  { path: '/GRLP Agents/2. Sales Workflow', category: 'SOP', appliesTo: 'SALES' },
  { path: '/GRLP Agents/3. Listing Workflow', category: 'SOP', appliesTo: 'SALES' },
  { path: '/GRLP Agents/4. Buyer Workflow', category: 'SOP', appliesTo: 'SALES' },
  { path: '/GRLP Agents/5. Seller Workflow', category: 'SOP', appliesTo: 'SALES' },
  { path: '/GRLP Agents/8. Checklists', category: 'SOP', appliesTo: 'BOTH' },
  { path: '/GRLP Agents/12. Municipal Information', category: 'AREA_INFO', appliesTo: 'BOTH' },
  { path: '/GRLP Agents/13. Market Assessment', category: 'TEMPLATE_GUIDE', appliesTo: 'SALES' },
  { path: '/GRLP Agents/14. Property Condition Reports', category: 'TEMPLATE_GUIDE', appliesTo: 'BOTH' },
  { path: '/GRLP Agents/16. Systems', category: 'REFERENCE', appliesTo: 'COMPANY' },
  { path: '/GRLP Agents/17. Training', category: 'TRAINING', appliesTo: 'COMPANY' },
  { path: '/GRLP Agents/18. Standard Operating Procedures', category: 'SOP', appliesTo: 'COMPANY' },
  { path: '/GRLP Agents/19. Legislative & Compliance', category: 'COMPLIANCE', appliesTo: 'COMPANY' },
  { path: '/GRLP Agents/20. FAQ', category: 'REFERENCE', appliesTo: 'COMPANY' },
  { path: '/PROPERTY/MANDY PROPERTY/08. Rentals/RENTALS/1. MASTERCOPIES 2026/SOP', category: 'SOP', appliesTo: 'RENTALS' },
];

/** Skipped: superseded copies, and per-person signed acknowledgements. */
const EXCLUDED = [
  /\bother old\b/i,
  /\bold\b/i,
  /\barchive\b/i,
  /before training/i,
  /signed by/i,
  /\bsigned -/i,
  /acknowledgement\//i,
];

/** Formats worth importing. Images and zoning maps carry no usable text. */
const IMPORTABLE = /\.(docx|pdf)$/i;

/** Terms that make a document findable later. */
const TAG_TERMS = [
  'fica', 'popi', 'popia', 'paia', 'ppra', 'trust account', 'tpn', 'propcntrl', 'propctrl',
  'commission', 'mandate', 'lease', 'deposit', 'inspection', 'compliance certificate',
  'rental housing act', 'consumer protection', 'cooling-off', 'showhouse', 'referral',
  'onboarding', 'code of conduct', 'branding', 'market assessment', 'zoning', 'municipal',
];

export interface ImportedKnowledge {
  key: string;
  title: string;
  category: KnowledgeCategory;
  appliesTo: AppliesTo;
  path: string;
  status: 'created' | 'updated' | 'unchanged' | 'no_text' | 'skipped';
  words: number;
  tags: string[];
  note?: string;
}

export interface KnowledgeImportResult {
  scanned: number;
  imported: ImportedKnowledge[];
  skipped: number;
  totalWords: number;
  unavailable?: string;
}

export interface KnowledgeImportOptions {
  client?: DropboxClient;
  folders?: typeof KNOWLEDGE_FOLDERS;
  dryRun?: boolean;
  /** Cap per folder, to keep a first run manageable. */
  limitPerFolder?: number;
}

export async function importKnowledge(options: KnowledgeImportOptions = {}): Promise<KnowledgeImportResult> {
  const result: KnowledgeImportResult = { scanned: 0, imported: [], skipped: 0, totalWords: 0 };

  let client: DropboxClient;
  if (options.client) {
    client = options.client;
  } else if (!dropboxConfig()) {
    return {
      ...result,
      unavailable:
        'Dropbox is not connected. Set DROPBOX_APP_KEY, DROPBOX_APP_SECRET and DROPBOX_REFRESH_TOKEN. Nothing was read or written.',
    };
  } else {
    client = dropboxClient();
  }

  for (const folder of options.folders ?? KNOWLEDGE_FOLDERS) {
    let entries: DropboxEntry[];
    try {
      entries = await client.listFolder(folder.path, { recursive: true });
    } catch {
      // A folder that has moved or been renamed is reported, not fatal.
      result.imported.push({
        key: `missing:${folder.path}`,
        title: folder.path,
        category: folder.category,
        appliesTo: folder.appliesTo,
        path: folder.path,
        status: 'skipped',
        words: 0,
        tags: [],
        note: 'This folder could not be read. It may have been renamed or moved.',
      });
      continue;
    }

    let taken = 0;
    for (const entry of entries) {
      if (entry.kind !== 'file') continue;
      result.scanned += 1;

      if (!IMPORTABLE.test(entry.name) || EXCLUDED.some((rx) => rx.test(entry.pathDisplay))) {
        result.skipped += 1;
        continue;
      }
      if (options.limitPerFolder && taken >= options.limitPerFolder) {
        result.skipped += 1;
        continue;
      }
      taken += 1;

      const imported = options.dryRun
        ? describe(entry, folder)
        : await store(client, entry, folder);

      result.imported.push(imported);
      result.totalWords += imported.words;
    }
  }

  return result;
}

function keyFor(path: string): string {
  return path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-180);
}

function titleFor(name: string): string {
  return name.replace(/\.(docx|pdf)$/i, '').replace(/\s+/g, ' ').trim();
}

export function tagsFor(title: string, text: string): string[] {
  const haystack = `${title}\n${text}`.toLowerCase();
  return TAG_TERMS.filter((t) => haystack.includes(t));
}

function describe(entry: DropboxEntry, folder: (typeof KNOWLEDGE_FOLDERS)[number]): ImportedKnowledge {
  return {
    key: keyFor(entry.pathDisplay),
    title: titleFor(entry.name),
    category: folder.category,
    appliesTo: folder.appliesTo,
    path: entry.pathDisplay,
    status: 'created',
    words: 0,
    tags: [],
  };
}

async function store(
  client: DropboxClient,
  entry: DropboxEntry,
  folder: (typeof KNOWLEDGE_FOLDERS)[number],
): Promise<ImportedKnowledge> {
  const key = keyFor(entry.pathDisplay);
  const title = titleFor(entry.name);
  const existing = await prisma.knowledgeDocument.findUnique({ where: { key } });

  if (existing && entry.rev && existing.sourceRev === entry.rev) {
    return {
      key, title, category: folder.category, appliesTo: folder.appliesTo, path: entry.pathDisplay,
      status: 'unchanged', words: existing.wordCount, tags: existing.tags,
    };
  }

  const format = extractableFrom(entry.name);
  let text = '';
  let note: string | undefined;

  if (!format) {
    note = `${entry.name} is not a format this can read.`;
  } else {
    try {
      text = await extractText(await client.download(entry.pathDisplay), format);
      if (!text) note = 'The file was read but held no extractable text — it is most likely a scan.';
    } catch (e) {
      note = `The file could not be read: ${(e as Error).message}`;
    }
  }

  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const tags = tagsFor(title, text);

  await prisma.knowledgeDocument.upsert({
    where: { key },
    update: {
      title, category: folder.category, appliesTo: folder.appliesTo,
      sourceProvider: 'dropbox',
      sourcePath: entry.pathDisplay, sourceRev: entry.rev ?? null,
      sourceModifiedAt: entry.serverModified ?? null,
      text, extractionNote: note, wordCount: words, tags,
    },
    create: {
      key, title, category: folder.category, appliesTo: folder.appliesTo,
      sourceProvider: 'dropbox', sourcePath: entry.pathDisplay, sourceRev: entry.rev ?? null,
      sourceModifiedAt: entry.serverModified ?? null,
      text, extractionNote: note, wordCount: words, tags,
    },
  });

  return {
    key, title, category: folder.category, appliesTo: folder.appliesTo, path: entry.pathDisplay,
    status: text ? (existing ? 'updated' : 'created') : 'no_text',
    words, tags, note,
  };
}

/**
 * Answers "what does GRLP do about X?" from the imported knowledge, returning
 * the passage and the document it came from so an answer can always be checked.
 */
export interface KnowledgeHit {
  title: string;
  category: string;
  sourcePath: string;
  excerpt: string;
}

export async function searchKnowledge(query: string, limit = 5): Promise<KnowledgeHit[]> {
  const term = query.trim();
  if (!term) return [];

  const docs = await prisma.knowledgeDocument.findMany({
    where: {
      OR: [
        { title: { contains: term, mode: 'insensitive' } },
        { text: { contains: term, mode: 'insensitive' } },
        { tags: { has: term.toLowerCase() } },
      ],
    },
    take: limit,
    orderBy: { wordCount: 'desc' },
  });

  return docs.map((d) => ({
    title: d.title,
    category: d.category,
    sourcePath: d.sourcePath,
    excerpt: excerptAround(d.text, term),
  }));
}

/**
 * A readable passage around the match.
 *
 * It picks the passage where the term appears most often rather than the first
 * mention, because the first mention is usually a heading or a passing reference
 * in a list of roles, while the passage that actually explains the thing
 * mentions it several times.
 */
export function excerptAround(text: string, term: string, radius = 260): string {
  const haystack = text.toLowerCase();
  const needle = term.toLowerCase();

  const positions: number[] = [];
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length)) {
    positions.push(at);
  }
  if (!positions.length) return text.slice(0, radius * 2).trim();

  // Score each occurrence by how many others sit near it, then break ties by
  // preferring one past the opening of the document. A procedure names its
  // subject in the heading and the list of roles before it explains anything,
  // so the first mention is reliably the least useful one.
  const window = radius * 2;
  const opening = text.length * 0.15;
  let best = positions[0]!;
  let bestScore = -1;
  for (const at of positions) {
    const nearby = positions.filter((p) => Math.abs(p - at) <= window).length;
    const score = nearby * 2 + (at > opening ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = at;
    }
  }

  const start = Math.max(0, best - radius);
  const end = Math.min(text.length, best + needle.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}
