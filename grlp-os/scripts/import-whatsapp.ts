import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { importWhatsAppExport } from '../src/server/whatsapp-import';

/**
 * Imports WhatsApp chat exports.
 *
 *   npx tsx scripts/import-whatsapp.ts ~/exports --dry-run
 *   npx tsx scripts/import-whatsapp.ts ~/exports
 *   npx tsx scripts/import-whatsapp.ts ~/exports/"WhatsApp Chat with Thandiwe.txt"
 *
 * To produce an export: open the chat in WhatsApp, tap the contact or group name,
 * scroll to Export Chat, and choose "Without Media". Send it to yourself and save
 * the .txt file into a folder.
 *
 * Nothing is ever sent to WhatsApp. The system reads, organises and raises tasks;
 * replying stays with a person.
 */
async function main() {
  const [target] = process.argv.slice(2);
  const dryRun = process.argv.includes('--dry-run');

  if (!target) {
    console.error('Usage: npx tsx scripts/import-whatsapp.ts <file-or-folder> [--dry-run]');
    process.exit(1);
  }

  const files: string[] = target.toLowerCase().endsWith('.txt')
    ? [target]
    : (await readdir(target)).filter((f) => f.toLowerCase().endsWith('.txt')).map((f) => join(target, f));

  if (!files.length) {
    console.error(`No .txt exports found in ${target}.`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    console.log(`${files.length} export(s) to read.\n`);
    let waiting = 0;
    let tasks = 0;

    for (const file of files) {
      const result = await importWhatsAppExport({
        content: await readFile(file, 'utf8'),
        filename: basename(file),
        dryRun,
      });

      const flags = [
        result.waitingOnUs ? `WAITING ${result.waitingHours}h` : null,
        result.commitments ? `${result.commitments} undertaking(s)` : null,
        result.openQuestions ? `${result.openQuestions} question(s)` : null,
        result.linkedContact ? `→ ${result.linkedContact}` : null,
        result.linkedProperty ? `→ ${result.linkedProperty}` : null,
      ].filter(Boolean);

      console.log(`  ${result.title.slice(0, 34).padEnd(36)} ${String(result.messages).padStart(5)} msgs  ${flags.join('  ')}`);
      if (result.unparsedLines) console.log(`      ${result.unparsedLines} line(s) could not be read`);

      if (result.waitingOnUs) waiting += 1;
      tasks += result.tasksCreated;
    }

    console.log(`\n${waiting} conversation(s) waiting on a reply. ${tasks} task(s) raised.`);
    console.log('Nothing was sent. Replying is a person’s job — the system has no way to send on WhatsApp.');
    if (dryRun) console.log('Dry run — nothing was written.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
