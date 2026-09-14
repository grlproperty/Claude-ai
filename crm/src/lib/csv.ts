/**
 * Writing CSV safely (spec 102).
 *
 * Two separate problems are solved here and they are easy to confuse.
 *
 * The first is ordinary CSV quoting, so a comma or a line break inside a
 * value does not become a new column or a new row.
 *
 * The second is formula injection. A spreadsheet treats a cell beginning with
 * =, +, -, @, or a leading tab or carriage return as a formula, so a value
 * like =HYPERLINK(...) typed into a person's name field becomes executable the
 * moment somebody opens the export in Excel. The fix is to prefix such a value
 * with an apostrophe, which spreadsheets strip on display but never execute.
 * A South African phone number beginning with + is the common false positive,
 * and it is still worth escaping: the number reads correctly in the cell.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';

  let text = value instanceof Date ? value.toISOString() : String(value);

  // Neutralise a formula before quoting, never after.
  if (FORMULA_START.test(text)) text = `'${text}`;

  if (/["\n\r,;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(
  columns: { key: string; header: string }[],
  rows: Record<string, unknown>[],
): string {
  const lines = [columns.map((column) => escapeCsvValue(column.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvValue(row[column.key])).join(','));
  }
  // A trailing newline, and CRLF, because this is opened in Excel more often
  // than anywhere else.
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * A filename that cannot escape the directory it is offered from, and cannot
 * carry a header break into the Content-Disposition it will be put in.
 */
export function safeFilename(name: string, extension: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w .-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.\s]+|[-.\s]+$/g, '')
    .slice(0, 80);
  return `${cleaned.length > 0 ? cleaned : 'export'}.${extension}`;
}

// ---------------------------------------------------------------------------
// Reading CSV
// ---------------------------------------------------------------------------

/**
 * Splits one CSV row, honouring quotes and doubled quotes inside them.
 *
 * The delimiter is passed in rather than guessed per row. Accepting a comma
 * AND a semicolon at the same time looks convenient and is a data-loss bug:
 * "Buyer;Tenant" in a comma-separated file is one value, and splitting it
 * would shift every column after it.
 */
export function splitCsvRow(row: string, delimiter = ','): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < row.length; index += 1) {
    const character = row[index]!;
    if (inQuotes) {
      if (character === '"') {
        if (row[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += character;
      }
    } else if (character === '"') {
      inQuotes = true;
    } else if (character === delimiter) {
      cells.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  cells.push(current);
  return cells;
}

/**
 * Works out which delimiter a file uses.
 *
 * South African Excel installs write semicolons, and some systems write tabs,
 * so the heading row is examined and whichever candidate yields the most
 * columns wins. A comma breaks the tie, being the common case.
 */
export function detectDelimiter(headerLine: string): string {
  let best = ',';
  let bestCount = 0;
  for (const candidate of [',', ';', '\t', '|']) {
    const count = splitCsvRow(headerLine, candidate).length;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

/**
 * Reads a whole CSV document into rows of cells.
 *
 * Unlike splitting on newlines, this keeps a quoted value containing a line
 * break in one cell, which matters because a pasted address or a note
 * routinely contains one and splitting it would silently shift every column
 * after it.
 */
export function parseCsvRows(text: string, delimiter?: string): string[][] {
  // Strip a byte order mark, which Excel writes and which would otherwise
  // become part of the first column's name.
  const body = text.replace(/^\uFEFF/, '');

  // Split into physical lines first, respecting quotes, so the delimiter can
  // be decided from the heading row before any row is split into cells.
  const lines: string[] = [];
  let line = '';
  let inQuotes = false;

  for (let index = 0; index < body.length; index += 1) {
    const character = body[index]!;

    if (character === '"') {
      // A doubled quote inside a quoted value stays part of the value.
      if (inQuotes && body[index + 1] === '"') {
        line += '""';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      line += character;
      continue;
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && body[index + 1] === '\n') index += 1;
      if (line.trim().length > 0) lines.push(line);
      line = '';
      continue;
    }

    line += character;
  }
  if (line.trim().length > 0) lines.push(line);

  if (lines.length === 0) return [];
  const separator = delimiter ?? detectDelimiter(lines[0]!);
  return lines.map((entry) => splitCsvRow(entry, separator));
}
