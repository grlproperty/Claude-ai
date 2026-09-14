import { normaliseZaPhone } from '../phone.ts';
import { validateSaIdNumber } from '../identity.ts';
import {
  SOURCE_SYSTEM_HINTS,
  fieldsFor,
  normaliseHeader,
  type ImportField,
  type SourceSystem,
} from './fields.ts';

/**
 * Proposing a mapping, and applying it (spec 62, 63).
 *
 * Two separate jobs, kept apart on purpose.
 *
 * Proposing is a guess: it looks at the column headings and suggests which
 * CRM field each one means. The guess is always shown to a person before
 * anything is read, and it says how confident it is, because a wrong guess
 * that looks certain is worse than an obvious blank.
 *
 * Applying is not a guess. It takes the confirmed mapping and turns the
 * file's text into typed values, reporting every value it could not make
 * sense of rather than dropping it. A row that loses a value silently is the
 * failure mode this whole stage exists to avoid.
 */

/** column heading -> CRM field key. A heading absent from this is ignored. */
export type Mapping = Record<string, string>;

export interface MappingSuggestion {
  header: string;
  fieldKey: string | null;
  confidence: 'exact' | 'likely' | 'guess' | 'none';
  reason: string;
}

/**
 * Suggests a field for every column.
 *
 * Matching is done on a squashed form of the heading ("First Name", "first
 * name" and "FIRSTNAME" are the same thing), first against the known export
 * quirks of the named source system, then against each field's aliases, then
 * by containment as a last resort. Anything matched by containment alone is
 * labelled a guess so it gets looked at.
 */
export function suggestMapping(
  headers: string[],
  entityType: 'person' | 'property',
  sourceSystem: SourceSystem = 'generic',
): MappingSuggestion[] {
  const fields = fieldsFor(entityType);
  const hints = SOURCE_SYSTEM_HINTS[sourceSystem]?.[entityType] ?? {};
  const taken = new Set<string>();

  const pass = (
    header: string,
  ): { fieldKey: string | null; confidence: MappingSuggestion['confidence']; reason: string } => {
    const squashed = normaliseHeader(header);
    if (squashed.length === 0) {
      return { fieldKey: null, confidence: 'none', reason: 'The column has no heading.' };
    }

    const hinted = hints[squashed];
    if (hinted && !taken.has(hinted)) {
      return {
        fieldKey: hinted,
        confidence: 'exact',
        reason: 'A column this export is known to use.',
      };
    }

    const exact = fields.find(
      (field) => !taken.has(field.key) && normaliseHeader(field.label) === squashed,
    );
    if (exact) {
      return { fieldKey: exact.key, confidence: 'exact', reason: 'The heading matches the field.' };
    }

    const aliased = fields.find(
      (field) => !taken.has(field.key) && field.aliases.includes(squashed),
    );
    if (aliased) {
      return {
        fieldKey: aliased.key,
        confidence: 'likely',
        reason: `"${header}" is a name this field is often given.`,
      };
    }

    // Containment, longest alias first so "alternativemobile" beats "mobile".
    let best: { field: ImportField; length: number } | null = null;
    for (const field of fields) {
      if (taken.has(field.key)) continue;
      for (const alias of field.aliases) {
        if (alias.length < 4) continue;
        if (squashed.includes(alias) && (!best || alias.length > best.length)) {
          best = { field, length: alias.length };
        }
      }
    }
    if (best) {
      return {
        fieldKey: best.field.key,
        confidence: 'guess',
        reason: 'Guessed from the heading. Please check this one.',
      };
    }

    return { fieldKey: null, confidence: 'none', reason: 'Not imported.' };
  };

  return headers.map((header) => {
    const result = pass(header);
    if (result.fieldKey) taken.add(result.fieldKey);
    return { header, ...result };
  });
}

export function suggestionsToMapping(suggestions: MappingSuggestion[]): Mapping {
  const mapping: Mapping = {};
  for (const suggestion of suggestions) {
    if (suggestion.fieldKey) mapping[suggestion.header] = suggestion.fieldKey;
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Applying a mapping
// ---------------------------------------------------------------------------

export interface MappedRow {
  values: Record<string, string | string[]>;
  problems: string[];
  /** True when the row has nothing that could identify a record. */
  empty: boolean;
}

/**
 * South African dates are written day-first, and a spreadsheet may hand over
 * an ISO date, a serial number already rendered, or "3 Mar 2024".
 *
 * 03/04/2024 is genuinely ambiguous. It is read day-first, because that is
 * what the office writes, and the preview shows the result so a person can
 * see it went in as 3 April rather than 4 March.
 */
export function parseImportDate(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dayFirst = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(value);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = Number(dayFirst[2]);
    let year = Number(dayFirst[3]);
    if (year < 100) year += year < 70 ? 2000 : 1900;
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const named = new Date(`${value} UTC`);
  if (!Number.isNaN(named.getTime())) return named.toISOString().slice(0, 10);

  return null;
}

/** Strips currency symbols, thousands separators and stray text. */
export function parseImportMoney(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;

  // Keep digits, one decimal point and a leading minus. A comma is a
  // thousands separator here, never a decimal comma: "1,500" is fifteen
  // hundred, and treating it as 1.5 would be a four-order-of-magnitude error.
  const cleaned = value
    .replace(/[Rr]|ZAR|\s/g, '')
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '');
  if (cleaned.length === 0) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed.toFixed(2);
}

export function parseImportCount(raw: string): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  const cleaned = value.replace(/,/g, '').replace(/[^\d.]/g, '');
  if (cleaned.length === 0) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return String(parsed);
}

function matchEnum(field: ImportField, raw: string): string | null {
  const squashed = normaliseHeader(raw);
  if (squashed.length === 0) return null;

  if (field.values && Object.keys(field.values).includes(raw.trim())) return raw.trim();
  if (field.valueAliases?.[squashed]) return field.valueAliases[squashed]!;

  if (field.values) {
    const byKey = Object.keys(field.values).find((key) => normaliseHeader(key) === squashed);
    if (byKey) return byKey;
    const byLabel = Object.entries(field.values).find(
      ([, label]) => normaliseHeader(label) === squashed,
    );
    if (byLabel) return byLabel[0];
  }
  return null;
}

export function applyMapping(
  raw: Record<string, string>,
  mapping: Mapping,
  entityType: 'person' | 'property',
): MappedRow {
  const fields = fieldsFor(entityType);
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const values: Record<string, string | string[]> = {};
  const problems: string[] = [];

  for (const [header, fieldKey] of Object.entries(mapping)) {
    const field = byKey.get(fieldKey);
    if (!field) continue;

    const cell = (raw[header] ?? '').trim();
    if (cell.length === 0) continue;

    switch (field.kind) {
      case 'phone': {
        const normalised = normaliseZaPhone(cell);
        if (!normalised) {
          problems.push(`${field.label}: "${cell}" is not a number we can use.`);
        } else {
          values[fieldKey] = normalised;
        }
        break;
      }

      case 'email': {
        // Deliberately permissive: the point is to catch what is obviously
        // not an address, not to adjudicate the RFC.
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cell)) {
          problems.push(`${field.label}: "${cell}" does not look like an email address.`);
        } else {
          values[fieldKey] = cell.toLowerCase();
        }
        break;
      }

      case 'idNumber': {
        const digits = cell.replace(/\D/g, '');
        const check = validateSaIdNumber(digits);
        if (!check.valid) {
          // Reported, not dropped and not guessed at. An ID number that does
          // not check out is usually a typo worth a person's eyes.
          problems.push(`${field.label}: ${check.reason ?? 'that number is not valid'}.`);
        } else {
          values[fieldKey] = digits;
        }
        break;
      }

      case 'date': {
        const parsed = parseImportDate(cell);
        if (!parsed) {
          problems.push(`${field.label}: "${cell}" could not be read as a date.`);
        } else {
          values[fieldKey] = parsed;
        }
        break;
      }

      case 'money': {
        const parsed = parseImportMoney(cell);
        if (!parsed) {
          problems.push(`${field.label}: "${cell}" could not be read as an amount.`);
        } else {
          values[fieldKey] = parsed;
        }
        break;
      }

      case 'count': {
        const parsed = parseImportCount(cell);
        if (!parsed) {
          problems.push(`${field.label}: "${cell}" could not be read as a number.`);
        } else {
          values[fieldKey] = parsed;
        }
        break;
      }

      case 'enum': {
        const matched = matchEnum(field, cell);
        if (!matched) {
          problems.push(
            `${field.label}: "${cell}" is not one of the values we recognise, so it was left unset.`,
          );
        } else {
          values[fieldKey] = matched;
        }
        break;
      }

      case 'list': {
        const parts = cell
          .split(/[,;/|]+/)
          .map((part) => part.trim())
          .filter((part) => part.length > 0);
        const matched: string[] = [];
        for (const part of parts) {
          const value = matchEnum(field, part);
          if (value) {
            if (!matched.includes(value)) matched.push(value);
          } else {
            problems.push(`${field.label}: "${part}" is not a value we recognise.`);
          }
        }
        if (matched.length > 0) values[fieldKey] = matched;
        break;
      }

      case 'longText':
      case 'text':
      default:
        values[fieldKey] = cell;
        break;
    }
  }

  const identifying = fields.filter((field) => field.identifying).map((field) => field.key);
  const empty = !identifying.some((key) => {
    const value = values[key];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });

  return { values, problems, empty };
}

/** Which fields the confirmed mapping will actually fill. */
export function mappedFieldKeys(mapping: Mapping): string[] {
  return [...new Set(Object.values(mapping))];
}

/**
 * Whether a mapping is usable at all: without something to identify a record
 * by, every row would be an unmatchable new entry with no name on it.
 */
export function mappingProblems(
  mapping: Mapping,
  entityType: 'person' | 'property',
): string[] {
  const problems: string[] = [];
  const keys = new Set(mappedFieldKeys(mapping));

  if (entityType === 'person') {
    if (!keys.has('surname') && !keys.has('firstName')) {
      problems.push('Map at least a first name or a surname, or the records will have no name.');
    }
    if (!keys.has('mobile') && !keys.has('email') && !keys.has('idNumber')) {
      problems.push(
        'Without a mobile number, an email address or an ID number, duplicates cannot be spotted.',
      );
    }
  } else {
    if (
      !keys.has('streetAddress') &&
      !keys.has('erfNumber') &&
      !keys.has('propertyName')
    ) {
      problems.push(
        'Map an erf number, a street address or a property name, or the properties cannot be told apart.',
      );
    }
  }

  return problems;
}
