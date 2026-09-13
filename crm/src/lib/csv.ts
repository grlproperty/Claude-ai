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
