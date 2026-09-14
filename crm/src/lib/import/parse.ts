import { createHash } from 'node:crypto';
import { parseCsvRows } from '../csv.ts';
import { ValidationError } from '../errors.ts';

/**
 * Turning a file into rows (spec 60).
 *
 * Everything a person might reasonably hand the CRM: a CSV, a semicolon CSV
 * from a South African Excel install, a real .xlsx, or text pasted into a box
 * because the file is on a phone. The result is always the same shape, so
 * nothing downstream has to care which it was.
 *
 * What comes out is untrusted text and is treated as such. Cells keep exactly
 * the characters they had — nothing is "helpfully" coerced here, because the
 * preview is meant to show a person what the file actually says. Cleaning
 * happens at mapping, where it can be reported.
 */

export interface ParsedSheet {
  headers: string[];
  /** One entry per data row, keyed by header. Always strings. */
  rows: Record<string, string>[];
  /** sha256 of the bytes read, for recognising a repeat of the same file. */
  contentHash: string;
  /** Named so a wizard can say which sheet of a workbook it read. */
  sheetName: string | null;
  /** Anything odd but survivable, to show rather than hide. */
  warnings: string[];
}

const MAX_COLUMNS = 200;

export function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** True for a filename or media type that looks like a real spreadsheet. */
export function looksLikeXlsx(name: string, mediaType?: string | null): boolean {
  if (/\.xlsx$/i.test(name) || /\.xlsm$/i.test(name)) return true;
  return Boolean(
    mediaType &&
      /spreadsheetml|officedocument\.spreadsheet|application\/vnd\.ms-excel\.sheet/i.test(
        mediaType,
      ),
  );
}

/**
 * Builds unique, non-empty column names.
 *
 * A file with two columns called "Notes", or with a blank header, is common
 * enough that refusing it would be unhelpful; the names are made distinct so
 * the mapping can address them, and the change is reported.
 */
function resolveHeaders(raw: string[], warnings: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.slice(0, MAX_COLUMNS).map((value, index) => {
    let name = value.trim();
    if (name.length === 0) {
      name = `Column ${index + 1}`;
      warnings.push(`Column ${index + 1} had no heading, so it is called "${name}".`);
    }
    const count = seen.get(name.toLowerCase()) ?? 0;
    seen.set(name.toLowerCase(), count + 1);
    if (count > 0) {
      const distinct = `${name} (${count + 1})`;
      warnings.push(`There is more than one column called "${name}"; the later one is "${distinct}".`);
      return distinct;
    }
    return name;
  });
}

function toRecords(
  headers: string[],
  dataRows: string[][],
  warnings: string[],
): Record<string, string>[] {
  const records: Record<string, string>[] = [];

  for (const [index, cells] of dataRows.entries()) {
    if (cells.every((cell) => cell.trim().length === 0)) continue;

    if (cells.length > headers.length) {
      warnings.push(
        `Line ${index + 2} has more values than there are columns; the extra ones were ignored.`,
      );
    }

    const record: Record<string, string> = {};
    for (const [column, header] of headers.entries()) {
      record[header] = (cells[column] ?? '').trim();
    }
    records.push(record);
  }

  return records;
}

export function parseCsvSheet(text: string, bytes: Uint8Array): ParsedSheet {
  const warnings: string[] = [];
  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    throw new ValidationError({ _form: ['That file has nothing in it.'] }, 'That file has nothing in it.');
  }

  const headers = resolveHeaders(rows[0]!, warnings);
  return {
    headers,
    rows: toRecords(headers, rows.slice(1), warnings),
    contentHash: hashBytes(bytes),
    sheetName: null,
    warnings,
  };
}

/**
 * Reads the first worksheet of a workbook.
 *
 * Cell values arrive from exceljs as whatever they are — numbers, dates, rich
 * text, formula results — so each is rendered to the text a person would see
 * in the cell. A formula's cached result is used, never its expression: the
 * expression is not data, and putting it through as text would be a lie about
 * what the spreadsheet said.
 */
export async function parseXlsxSheet(bytes: Uint8Array): Promise<ParsedSheet> {
  const warnings: string[] = [];
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();

  try {
    // exceljs types this as Node's Buffer; a Uint8Array is what it actually
    // reads, and is what a web Request hands us.
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new ValidationError(
      { _form: ['That file could not be read as a spreadsheet.'] },
      'That file could not be read as a spreadsheet.',
    );
  }

  const sheet = workbook.worksheets.find((candidate) => candidate.rowCount > 0);
  if (!sheet) {
    throw new ValidationError(
      { _form: ['That workbook has no sheet with anything in it.'] },
      'That workbook has no sheet with anything in it.',
    );
  }
  if (workbook.worksheets.length > 1) {
    warnings.push(
      `The workbook has ${workbook.worksheets.length} sheets; only "${sheet.name}" was read.`,
    );
  }

  const grid: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    // row.values is 1-based with a hole at index 0.
    const values = Array.isArray(row.values) ? row.values : [];
    for (let column = 1; column <= Math.max(values.length - 1, 0); column += 1) {
      cells.push(cellToText(values[column]));
    }
    grid.push(cells);
  });

  if (grid.length === 0) {
    throw new ValidationError({ _form: ['That sheet is empty.'] }, 'That sheet is empty.');
  }

  const headers = resolveHeaders(grid[0]!, warnings);
  return {
    headers,
    rows: toRecords(headers, grid.slice(1), warnings),
    contentHash: hashBytes(bytes),
    sheetName: sheet.name,
    warnings,
  };
}

/** What a person would see in the cell, as text. */
function cellToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) {
    // Dates come back in UTC; the date part is what a spreadsheet meant.
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    // A formula cell: use the cached result, never the expression.
    if ('result' in record) return cellToText(record.result);
    if ('formula' in record || 'sharedFormula' in record) return '';

    // Rich text keeps its runs separately.
    if (Array.isArray(record.richText)) {
      return (record.richText as { text?: unknown }[])
        .map((run) => String(run.text ?? ''))
        .join('')
        .trim();
    }

    // A hyperlink cell carries both the text and the target.
    if ('text' in record) return cellToText(record.text);
    if ('hyperlink' in record) return String(record.hyperlink);

    // An error cell ("#DIV/0!") is not data.
    if ('error' in record) return '';
  }

  return String(value).trim();
}

export async function parseSheet(input: {
  bytes: Uint8Array;
  filename?: string | null;
  mediaType?: string | null;
}): Promise<ParsedSheet> {
  const name = input.filename ?? '';
  if (looksLikeXlsx(name, input.mediaType)) {
    return parseXlsxSheet(input.bytes);
  }

  // Anything else is read as text. A stray .xls (the old binary format) or a
  // zip carries NUL bytes near the start, which no text file does, so it is
  // refused with a useful message rather than importing gibberish.
  if (input.bytes.subarray(0, 512).includes(0)) {
    throw new ValidationError(
      {
        _form: [
          'That looks like a binary file rather than a CSV. Save it as CSV or as .xlsx and try again.',
        ],
      },
      'That looks like a binary file rather than a CSV.',
    );
  }

  const text = new TextDecoder('utf-8', { fatal: false }).decode(input.bytes);
  return parseCsvSheet(text, input.bytes);
}
