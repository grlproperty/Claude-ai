import { prisma } from './db';
import { ALL_DOCUMENTS, matchDocument, type MasterDocument } from '../domain/master-documents';
import { dropboxClient, dropboxConfig, type DropboxClient, type DropboxEntry } from '../integrations/dropbox';
import type { Prisma } from '@prisma/client';

/**
 * Imports GRLP's master copies from Dropbox into the template library.
 *
 * The rules that make this safe to run repeatedly:
 *
 *   1. It reads only. The masters are edited in Dropbox by the people
 *      responsible for them, and this system never writes back.
 *   2. Wording is stored in the database, never in the repository.
 *   3. An imported version is UNAPPROVED. The document engine refuses to
 *      generate from it until an authorised person approves the wording — so
 *      importing a master copy does not silently put it into circulation.
 *   4. A master that has not changed since the last import (same Dropbox
 *      revision) is skipped, and a changed one creates a new version rather
 *      than overwriting the approved one in use.
 */

export interface ImportedDocument {
  documentKey: string;
  variant?: string;
  templateKey: string;
  name: string;
  path: string;
  rev: string;
  status: 'created' | 'new_version' | 'unchanged' | 'no_text';
  extractionNote?: string;
  bytes: number;
}

export interface ImportResult {
  scanned: number;
  matched: number;
  unmatched: Array<{ name: string; path: string }>;
  imported: ImportedDocument[];
  /** Catalogue entries no master copy was found for. */
  missingFromDropbox: Array<{ key: string; name: string; process: string }>;
  unavailable?: string;
}

/** The folders GRLP keeps its master copies in. */
export const MASTER_FOLDERS = [
  '/GRLP Agents/2. Sales Workflow/SALES SHARED/MASTERCOPIES',
  '/PROPERTY/MANDY PROPERTY/08. Rentals/RENTALS/1. MASTERCOPIES 2026',
];

/** Folders whose contents are superseded and must not be imported. */
const EXCLUDED = [/\bother old\b/i, /\bold\b/i, /\barchive\b/i, /\bexamples?\b/i, /before training/i];

/** Formats whose text can be extracted. Legacy .doc cannot, and is reported. */
export function extractableFrom(name: string): 'docx' | 'pdf' | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.pdf')) return 'pdf';
  return null;
}

export async function extractText(buffer: Buffer, format: 'docx' | 'pdf'): Promise<string> {
  if (format === 'docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }
  const pdfParse = (await import('pdf-parse')).default;
  const result = await pdfParse(buffer);
  return result.text.trim();
}

export interface ImportOptions {
  client?: DropboxClient;
  folders?: string[];
  /** Report what would be imported without writing anything. */
  dryRun?: boolean;
}

export async function importMasters(options: ImportOptions = {}): Promise<ImportResult> {
  const result: ImportResult = { scanned: 0, matched: 0, unmatched: [], imported: [], missingFromDropbox: [] };

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

  const folders = options.folders ?? MASTER_FOLDERS;
  const seen = new Set<string>();

  for (const folder of folders) {
    const entries = await client.listFolder(folder, { recursive: true });

    for (const entry of entries) {
      if (entry.kind !== 'file') continue;
      if (EXCLUDED.some((rx) => rx.test(entry.pathDisplay))) continue;
      result.scanned += 1;

      const match = matchDocument(entry.name);
      if (!match) {
        result.unmatched.push({ name: entry.name, path: entry.pathDisplay });
        continue;
      }
      result.matched += 1;

      const templateKey = templateKeyFor(match.document, match.variant);
      // Where a master exists as both .doc and .docx/.pdf, prefer the one whose
      // text can actually be read.
      const format = extractableFrom(entry.name);
      const existingPick = seen.has(templateKey);
      if (existingPick && !format) continue;

      const imported = options.dryRun
        ? await describeOnly(entry, match.document, match.variant, templateKey, format)
        : await upsertTemplate({ client, entry, document: match.document, variant: match.variant, templateKey, format });

      if (format) seen.add(templateKey);

      const previous = result.imported.findIndex((i) => i.templateKey === templateKey);
      if (previous >= 0 && format) result.imported[previous] = imported;
      else if (previous < 0) result.imported.push(imported);
    }
  }

  const importedKeys = new Set(result.imported.map((i) => i.documentKey));
  result.missingFromDropbox = ALL_DOCUMENTS.filter((d) => d.matches.length > 0 && !importedKeys.has(d.key)).map((d) => ({
    key: d.key,
    name: d.name,
    process: d.process,
  }));

  return result;
}

function templateKeyFor(document: MasterDocument, variant?: string): string {
  return variant ? `${document.key}.${variant.replace(/\s+/g, '_')}` : document.key;
}

async function describeOnly(
  entry: DropboxEntry,
  document: MasterDocument,
  variant: string | undefined,
  templateKey: string,
  format: 'docx' | 'pdf' | null,
): Promise<ImportedDocument> {
  return {
    documentKey: document.key,
    variant,
    templateKey,
    name: document.name,
    path: entry.pathDisplay,
    rev: entry.rev ?? '',
    status: format ? 'created' : 'no_text',
    extractionNote: format ? undefined : legacyNote(entry.name),
    bytes: entry.size ?? 0,
  };
}

function legacyNote(name: string): string {
  return (
    `The wording could not be read automatically: "${name}" is a legacy Word (.doc) file, a format with no reliable ` +
    'text extraction. Save it as .docx in Dropbox and re-import, or paste the wording in directly. ' +
    'The document is catalogued and tracked either way.'
  );
}

async function upsertTemplate(args: {
  client: DropboxClient;
  entry: DropboxEntry;
  document: MasterDocument;
  variant?: string;
  templateKey: string;
  format: 'docx' | 'pdf' | null;
}): Promise<ImportedDocument> {
  const { client, entry, document, variant, templateKey, format } = args;

  const template = await prisma.template.upsert({
    where: { key: templateKey },
    update: { name: displayName(document, variant), process: document.process, stageKey: document.stageKey, variant: variant ?? null },
    create: {
      key: templateKey,
      name: displayName(document, variant),
      kind: kindFor(document),
      process: document.process,
      stageKey: document.stageKey,
      variant: variant ?? null,
      description: document.notes,
    },
  });

  const latest = await prisma.templateVersion.findFirst({
    where: { templateId: template.id },
    orderBy: { version: 'desc' },
  });

  // Unchanged master: nothing to do. This is what makes re-importing cheap.
  if (latest?.sourceRev && entry.rev && latest.sourceRev === entry.rev) {
    return {
      documentKey: document.key,
      variant,
      templateKey,
      name: template.name,
      path: entry.pathDisplay,
      rev: entry.rev,
      status: 'unchanged',
      bytes: entry.size ?? 0,
    };
  }

  let body = '';
  let extractionNote: string | undefined;

  if (format) {
    try {
      body = await extractText(await client.download(entry.pathDisplay), format);
      if (!body) extractionNote = 'The file was read but contained no extractable text.';
    } catch (e) {
      extractionNote = `The file could not be read: ${(e as Error).message}`;
    }
  } else {
    extractionNote = legacyNote(entry.name);
  }

  const version = (latest?.version ?? 0) + 1;
  await prisma.templateVersion.create({
    data: {
      templateId: template.id,
      version,
      body: body || `[ Wording not imported. ${extractionNote ?? ''} ]`,
      requiredApproval: document.key === 'otp' ? 'SIGNATURE' : 'APPROVAL',
      signatoryRoles: signatoriesFor(document),
      // Imported wording is never pre-approved. A person approves it before
      // the document engine will produce anything from it.
      approvedAt: null,
      approvedById: null,
      sourceProvider: 'dropbox',
      sourcePath: entry.pathDisplay,
      sourceRev: entry.rev ?? null,
      sourceModifiedAt: entry.serverModified ?? null,
      extractionNote,
    } satisfies Prisma.TemplateVersionUncheckedCreateInput,
  });

  return {
    documentKey: document.key,
    variant,
    templateKey,
    name: template.name,
    path: entry.pathDisplay,
    rev: entry.rev ?? '',
    status: body ? (latest ? 'new_version' : 'created') : 'no_text',
    extractionNote,
    bytes: entry.size ?? 0,
  };
}

function displayName(document: MasterDocument, variant?: string): string {
  return variant ? `${document.name} — ${variant}` : document.name;
}

function kindFor(document: MasterDocument): 'MANDATE' | 'OTP' | 'FICA' | 'LEASE' | 'INSPECTION' | 'COMMISSION' | 'COMPLIANCE_CERTIFICATE' | 'CORRESPONDENCE' | 'OTHER' {
  if (document.key === 'otp') return 'OTP';
  if (document.key.includes('mandate') || document.key === 'permission_to_list') return 'MANDATE';
  if (document.key.includes('fica')) return 'FICA';
  if (document.key.includes('lease')) return 'LEASE';
  if (document.key.includes('inspection') || document.key.includes('condition')) return 'INSPECTION';
  if (document.key.includes('commission')) return 'COMMISSION';
  if (document.key.startsWith('coc_') || document.key.includes('clearance')) return 'COMPLIANCE_CERTIFICATE';
  if (document.key.includes('letter')) return 'CORRESPONDENCE';
  return 'OTHER';
}

function signatoriesFor(document: MasterDocument): string[] {
  switch (document.key) {
    case 'otp':
      return ['purchaser', 'seller', 'agent'];
    case 'sole_mandate':
    case 'permission_to_list':
      return ['seller', 'agent'];
    case 'lease_agreement':
      return ['tenant', 'landlord', 'agent'];
    case 'rental_mandate':
      return ['landlord', 'agent'];
    default:
      return [];
  }
}
