import { readFile, writeFile } from 'node:fs/promises';
import PizZip from 'pizzip';
import { generateDocx } from '../../src/server/docx-generate';
import { prepareDocument, type TemplateVersionSpec } from '../../src/domain/documents';
import { OTP_RESIDENTIAL_FIELDS } from '../../src/domain/otp-fields';

/**
 * Builds a demonstration .docx from a placeholder text file and a records file,
 * so the filled output can be looked at.
 *
 *   npx tsx tests/e2e/make-demo-otp.ts <wording.txt> <records.json> <out.docx>
 *
 * In production the master is GRLP's own .docx with its letterhead; this makes a
 * plain one from the wording supplied, purely to show the fill.
 */
function buildDocx(text: string): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.folder('_rels')!.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = text
    .split('\n')
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${escape(line)}</w:t></w:r></w:p>`)
    .join('');

  zip.folder('word')!.file(
    'document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function main() {
  const [wordingPath, recordsPath, outPath] = process.argv.slice(2);
  if (!wordingPath || !recordsPath || !outPath) {
    console.error('Usage: npx tsx tests/e2e/make-demo-otp.ts <wording.txt> <records.json> <out.docx>');
    process.exit(1);
  }

  const wording = await readFile(wordingPath, 'utf8');
  const sources = JSON.parse(await readFile(recordsPath, 'utf8')) as Record<string, unknown>;

  const template: TemplateVersionSpec = {
    templateKey: 'otp.residential',
    version: 1,
    approvedAt: new Date(),
    requiredApproval: 'SIGNATURE',
    signatoryRoles: ['purchaser', 'seller', 'agent'],
    body: wording,
    fields: OTP_RESIDENTIAL_FIELDS,
  };

  const prepared = prepareDocument({ template, sources, checkSet: 'otp' });
  const values = Object.fromEntries(prepared.fields.map((f) => [f.key, f.value]));

  // The text file uses {{field}}; a Word master uses {field}.
  const master = buildDocx(wording.replace(/\{\{\s*([\w.]+)\s*\}\}/g, '{$1}'));
  const required = new Set(prepared.fields.filter((f) => f.required).map((f) => f.key));

  const { buffer, unfilled } = generateDocx(master, values, {
    missingLabel: (key) => (required.has(key) ? `[[ MISSING: ${key} ]]` : 'N/A'),
  });

  await writeFile(outPath, buffer);
  console.log(`Wrote ${outPath} (${buffer.length} bytes).`);
  console.log(`${prepared.fields.filter((f) => f.value != null).length} of ${prepared.fields.length} fields filled.`);
  console.log(`Required outstanding: ${prepared.missingRequired.length}. Unfilled placeholders: ${unfilled.length} (not applicable).`);
  console.log(prepared.readyForReview ? 'Ready for review and signature.' : 'NOT ready.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
