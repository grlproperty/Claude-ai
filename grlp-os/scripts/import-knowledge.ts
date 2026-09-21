import { PrismaClient } from '@prisma/client';
import { importKnowledge, KNOWLEDGE_FOLDERS } from '../src/server/knowledge-import';

/**
 * Imports GRLP's knowledge base from Dropbox.
 *
 *   npx tsx scripts/import-knowledge.ts --dry-run
 *   npx tsx scripts/import-knowledge.ts --limit 40
 *
 * Reads only. Text is stored in the database, never in this repository.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.indexOf('--limit');
  const limitPerFolder = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : undefined;

  const prisma = new PrismaClient();
  try {
    console.log(`Reading ${KNOWLEDGE_FOLDERS.length} knowledge folders.\n`);
    const result = await importKnowledge({ dryRun, limitPerFolder });

    if (result.unavailable) {
      console.error(result.unavailable);
      process.exit(1);
    }

    const byStatus = new Map<string, number>();
    for (const i of result.imported) byStatus.set(i.status, (byStatus.get(i.status) ?? 0) + 1);

    console.log(`Scanned ${result.scanned} files, skipped ${result.skipped} (images, superseded copies, signed acknowledgements).\n`);
    for (const [status, count] of byStatus) console.log(`  ${status.replace(/_/g, ' ').padEnd(12)} ${count}`);
    console.log(`\n${result.totalWords.toLocaleString('en-ZA')} words of GRLP's own procedures now searchable.`);

    const unreadable = result.imported.filter((i) => i.status === 'no_text');
    if (unreadable.length) {
      console.log(`\n${unreadable.length} document(s) could not be read (most likely scans):`);
      for (const i of unreadable.slice(0, 10)) console.log(`  ${i.path}`);
    }

    if (dryRun) console.log('\nDry run — nothing was written.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
