import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { tagsFor } from '../src/server/knowledge-import';

/**
 * Loads knowledge documents from a local JSON file, for content gathered outside
 * the Dropbox integration.
 *
 *   npx tsx scripts/load-knowledge.ts <documents.json>
 *
 * The file is an array of { title, category, appliesTo, sourcePath, text }.
 * It is read from a path you supply and never stored in this repository.
 */
interface Incoming {
  title: string;
  category: string;
  appliesTo?: string;
  sourcePath: string;
  text: string;
}

async function main() {
  const [path] = process.argv.slice(2);
  if (!path) {
    console.error('Usage: npx tsx scripts/load-knowledge.ts <documents.json>');
    process.exit(1);
  }

  const docs = JSON.parse(await readFile(path, 'utf8')) as Incoming[];
  const prisma = new PrismaClient();

  try {
    for (const doc of docs) {
      const key = doc.sourcePath.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-180);
      const words = doc.text.split(/\s+/).filter(Boolean).length;
      const tags = tagsFor(doc.title, doc.text);

      await prisma.knowledgeDocument.upsert({
        where: { key },
        update: { title: doc.title, text: doc.text, wordCount: words, tags },
        create: {
          key,
          title: doc.title,
          category: doc.category as never,
          appliesTo: doc.appliesTo ?? 'BOTH',
          sourceProvider: 'manual',
          sourcePath: doc.sourcePath,
          text: doc.text,
          wordCount: words,
          tags,
        },
      });
      console.log(`  ${doc.title.padEnd(42)} ${words} words  [${tags.join(', ') || 'no tags'}]`);
    }
    console.log(`\nLoaded ${docs.length} document(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
