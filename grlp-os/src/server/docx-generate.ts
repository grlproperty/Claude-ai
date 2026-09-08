import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

/**
 * Produces the finished document as a Word file.
 *
 * The point of doing it this way: the .docx that comes out is GRLP's own master
 * with the fields filled in. Letterhead, clause numbering, initialling blocks and
 * signature pages are the agency's, untouched — the system substitutes values and
 * changes nothing else. A generated look-alike would be a different document, and
 * for something a client signs that is not good enough.
 *
 * The master must be a .docx with `{fieldName}` placeholders where the blanks are.
 * Legacy .doc cannot be used: it is a different, binary format.
 */

export class TemplateSyntaxError extends Error {
  constructor(
    message: string,
    readonly problems: string[],
  ) {
    super(message);
    this.name = 'TemplateSyntaxError';
  }
}

export interface GenerateResult {
  buffer: Buffer;
  /** Placeholders in the .docx that the field set had no value for. */
  unfilled: string[];
}

/**
 * Fills a .docx master. Anything the field set does not supply is rendered with
 * the same markers the text engine uses, so a gap looks the same in Word as it
 * does on screen.
 */
export function generateDocx(master: Buffer, values: Record<string, string | null>, options: { missingLabel?: (key: string) => string } = {}): GenerateResult {
  let zip: PizZip;
  try {
    zip = new PizZip(master);
  } catch {
    throw new TemplateSyntaxError(
      'That file is not a .docx. Legacy Word (.doc) is a different, binary format — open it in Word and save as .docx.',
      [],
    );
  }

  const unfilled: string[] = [];
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // A placeholder with no value is never left blank and never invented.
    nullGetter: (part: { value?: string; module?: string }) => {
      const key = part.value ?? 'unknown';
      unfilled.push(key);
      return options.missingLabel ? options.missingLabel(key) : `[[ MISSING: ${key} ]]`;
    },
  });

  try {
    doc.render(values);
  } catch (e) {
    const error = e as { properties?: { errors?: Array<{ properties?: { explanation?: string } }> }; message?: string };
    const problems = (error.properties?.errors ?? []).map((x) => x.properties?.explanation ?? 'unknown problem');
    throw new TemplateSyntaxError(
      `The master could not be filled: ${error.message ?? 'unknown error'}. This usually means a placeholder is malformed — an unclosed brace, or a placeholder split across formatting runs in Word.`,
      problems,
    );
  }

  return {
    buffer: doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' }) as Buffer,
    unfilled: [...new Set(unfilled)],
  };
}

/** Lists the placeholders a master expects, so it can be checked against the field set. */
export function placeholdersIn(master: Buffer): string[] {
  const zip = new PizZip(master);
  const found = new Set<string>();

  for (const path of Object.keys(zip.files)) {
    if (!/^word\/(document|header\d*|footer\d*)\.xml$/.test(path)) continue;
    const xml = zip.files[path]!.asText();
    // Strip tags first: Word splits text across runs, so a placeholder can be
    // broken up by formatting markup that has nothing to do with its meaning.
    const text = xml.replace(/<[^>]+>/g, '');
    for (const m of text.matchAll(/\{([\w.]+)\}/g)) found.add(m[1]!);
  }

  return [...found].sort();
}

/**
 * Checks a master against a field set before anyone relies on it: placeholders
 * with no matching field, and required fields the master never asks for.
 */
export function auditMaster(master: Buffer, fieldKeys: string[]): { unknownPlaceholders: string[]; fieldsNotInMaster: string[] } {
  const placeholders = placeholdersIn(master);
  const known = new Set(fieldKeys);
  return {
    unknownPlaceholders: placeholders.filter((p) => !known.has(p)),
    fieldsNotInMaster: fieldKeys.filter((k) => !placeholders.includes(k)),
  };
}
