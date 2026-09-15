import { describe, expect, it } from 'vitest';
import PizZip from 'pizzip';
import { TemplateSyntaxError, auditMaster, generateDocx, placeholdersIn } from '../src/server/docx-generate';

/**
 * Builds a minimal but genuinely valid .docx, so the filling mechanism is tested
 * for real rather than mocked.
 */
function makeDocx(paragraphs: string[]): Buffer {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.folder('_rels')!.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join('');
  zip.folder('word')!.file(
    'document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
  );
  return zip.generate({ type: 'nodebuffer' });
}

function textOf(docx: Buffer): string {
  const xml = new PizZip(docx).files['word/document.xml']!.asText();
  return xml.replace(/<[^>]+>/g, '');
}

const master = () =>
  makeDocx([
    'OFFER TO PURCHASE',
    'The Purchaser {buyerFullName} (ID {buyerIdNumber})',
    'offers {purchasePrice} ({purchasePriceWords})',
    'Occupational interest: {occupationalInterest}',
  ]);

describe('filling GRLP’s own master', () => {
  it('substitutes the values and leaves the document otherwise untouched', () => {
    const { buffer } = generateDocx(master(), {
      buyerFullName: 'Thandiwe Ndlovu',
      buyerIdNumber: '9202204720083',
      purchasePrice: 'R4 250 000',
      purchasePriceWords: 'FOUR MILLION TWO HUNDRED AND FIFTY THOUSAND RAND',
      occupationalInterest: 'N/A',
    });

    const text = textOf(buffer);
    expect(text).toContain('Thandiwe Ndlovu');
    expect(text).toContain('R4 250 000');
    expect(text).toContain('FOUR MILLION TWO HUNDRED AND FIFTY THOUSAND RAND');
    // The wording around the fields is the master's, unchanged.
    expect(text).toContain('OFFER TO PURCHASE');
    expect(text).toContain('The Purchaser');
    expect(text).not.toContain('{buyerFullName}');
  });

  it('produces a file Word can open', () => {
    const { buffer } = generateDocx(master(), { buyerFullName: 'A B' });
    const zip = new PizZip(buffer);
    expect(zip.files['word/document.xml']).toBeDefined();
    expect(zip.files['[Content_Types].xml']).toBeDefined();
  });

  it('marks an unfilled placeholder rather than leaving a blank in a contract', () => {
    const { buffer, unfilled } = generateDocx(master(), { buyerFullName: 'A B' });
    expect(unfilled).toContain('purchasePrice');
    expect(textOf(buffer)).toContain('[[ MISSING: purchasePrice ]]');
  });

  it('lets the caller distinguish not-applicable from missing', () => {
    const { buffer } = generateDocx(master(), { buyerFullName: 'A B' }, { missingLabel: () => 'N/A' });
    expect(textOf(buffer)).toContain('N/A');
    expect(textOf(buffer)).not.toContain('MISSING');
  });

  it('refuses a legacy .doc with an explanation of what to do', () => {
    const legacy = Buffer.from('\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1 legacy word binary', 'binary');
    expect(() => generateDocx(legacy, {})).toThrow(TemplateSyntaxError);
    expect(() => generateDocx(legacy, {})).toThrow(/save as \.docx/);
  });
});

describe('checking a master before anyone relies on it', () => {
  it('lists the placeholders the master expects', () => {
    expect(placeholdersIn(master())).toEqual([
      'buyerFullName',
      'buyerIdNumber',
      'occupationalInterest',
      'purchasePrice',
      'purchasePriceWords',
    ]);
  });

  it('finds placeholders no field supplies, and fields the master never asks for', () => {
    const audit = auditMaster(master(), ['buyerFullName', 'buyerIdNumber', 'purchasePrice', 'purchasePriceWords', 'sellerFullName']);
    expect(audit.unknownPlaceholders).toEqual(['occupationalInterest']);
    expect(audit.fieldsNotInMaster).toEqual(['sellerFullName']);
  });

  it('reads a placeholder even when Word has split it across formatting runs', () => {
    const zip = new PizZip(makeDocx(['x']));
    zip.folder('word')!.file(
      'document.xml',
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{buyer</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>FullName}</w:t></w:r></w:p></w:body></w:document>`,
    );
    expect(placeholdersIn(zip.generate({ type: 'nodebuffer' }))).toEqual(['buyerFullName']);
  });
});
