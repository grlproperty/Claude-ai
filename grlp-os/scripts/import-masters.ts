import { PrismaClient } from '@prisma/client';
import { importMasters, MASTER_FOLDERS } from '../src/server/master-import';

/**
 * Imports GRLP's master copies from Dropbox into the template library.
 *
 *   npx tsx scripts/import-masters.ts --dry-run
 *   npx tsx scripts/import-masters.ts
 *
 * Reads only. Wording goes into the database, never into this repository, and
 * every imported version is unapproved until a person approves it.
 */
async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();

  try {
    console.log(`Reading:\n${MASTER_FOLDERS.map((f) => `  ${f}`).join('\n')}\n`);
    const result = await importMasters({ dryRun });

    if (result.unavailable) {
      console.error(result.unavailable);
      console.error('\nDropbox needs an app with files.content.read and a refresh token.');
      process.exit(1);
    }

    console.log(`Scanned ${result.scanned} files; matched ${result.matched}.\n`);

    const byStatus = new Map<string, typeof result.imported>();
    for (const item of result.imported) {
      byStatus.set(item.status, [...(byStatus.get(item.status) ?? []), item]);
    }

    for (const [status, items] of byStatus) {
      console.log(`${status.replace(/_/g, ' ').toUpperCase()} (${items.length})`);
      for (const i of items) console.log(`  ${i.templateKey.padEnd(34)} ${i.name}`);
      console.log('');
    }

    const noText = result.imported.filter((i) => i.status === 'no_text');
    if (noText.length) {
      console.log(`${noText.length} master(s) could not be read. These are catalogued but cannot generate documents:`);
      for (const i of noText) console.log(`  ${i.path}`);
      console.log('  Fix: open each in Word and save as .docx, then re-run this import.\n');
    }

    if (result.unmatched.length) {
      console.log(`${result.unmatched.length} file(s) matched no catalogue entry (ignored, not an error):`);
      for (const u of result.unmatched.slice(0, 15)) console.log(`  ${u.name}`);
      console.log('');
    }

    if (result.missingFromDropbox.length) {
      console.log('Catalogued documents with no master copy found:');
      for (const m of result.missingFromDropbox) console.log(`  [${m.process}] ${m.name}`);
      console.log('');
    }

    console.log(
      dryRun
        ? 'Dry run — nothing was written.'
        : 'Imported. Every version is UNAPPROVED: the document engine will refuse to generate until an authorised person approves the wording.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
