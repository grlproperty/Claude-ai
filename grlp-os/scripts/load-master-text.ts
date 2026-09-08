import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { getDocument, matchDocument } from '../src/domain/master-documents';

/**
 * Loads a master document's wording from a local file.
 *
 *   npx tsx scripts/load-master-text.ts <template-key> <path-to-text-file>
 *
 * This exists for the masters the importer cannot read — legacy .doc files, and
 * anything scanned. The text is read from a path you supply and written to the
 * database; it is never stored in this repository, which is public.
 *
 * As with the importer, the loaded version is UNAPPROVED.
 */
async function main() {
  const [templateKey, path] = process.argv.slice(2);
  if (!templateKey || !path) {
    console.error('Usage: npx tsx scripts/load-master-text.ts <template-key> <path-to-text-file>');
    console.error('Example: npx tsx scripts/load-master-text.ts otp.residential ~/otp-residential.txt');
    process.exit(1);
  }

  const baseKey = templateKey.split('.')[0]!;
  const document = getDocument(baseKey);
  if (!document) {
    console.error(`"${baseKey}" is not in the document catalogue. Known keys are in src/domain/master-documents.ts.`);
    process.exit(1);
  }

  const body = (await readFile(path, 'utf8')).trim();
  if (!body) {
    console.error('That file is empty. Nothing was written.');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const variant = templateKey.includes('.') ? templateKey.split('.').slice(1).join(' ').replace(/_/g, ' ') : null;
    const template = await prisma.template.upsert({
      where: { key: templateKey },
      update: {},
      create: {
        key: templateKey,
        name: variant ? `${document.name} — ${variant}` : document.name,
        kind: baseKey === 'otp' ? 'OTP' : baseKey.includes('lease') ? 'LEASE' : baseKey.includes('mandate') ? 'MANDATE' : 'OTHER',
        process: document.process,
        stageKey: document.stageKey,
        variant,
      },
    });

    const latest = await prisma.templateVersion.findFirst({
      where: { templateId: template.id },
      orderBy: { version: 'desc' },
    });

    const version = await prisma.templateVersion.create({
      data: {
        templateId: template.id,
        version: (latest?.version ?? 0) + 1,
        body,
        requiredApproval: baseKey === 'otp' ? 'SIGNATURE' : 'APPROVAL',
        signatoryRoles: baseKey === 'otp' ? ['purchaser', 'seller', 'agent'] : baseKey.includes('lease') ? ['tenant', 'landlord', 'agent'] : ['seller', 'agent'],
        approvedAt: null,
        sourceProvider: 'manual',
        sourcePath: path,
        extractionNote: 'Loaded from a local file because the master is in a format with no reliable text extraction.',
      },
    });

    console.log(`Loaded ${body.length} characters into ${templateKey} as version ${version.version}.`);
    console.log('It is UNAPPROVED: the document engine will refuse to generate from it until a person approves the wording.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
