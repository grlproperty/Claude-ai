import { runValidators, type ValidationIssue } from './validators';
import { periodInWords, randFiguresAndWords, randInWords } from '../lib/amount-in-words';
import { formatZar } from '../lib/format';
import type { ApprovalLevel } from './types';

/**
 * The document preparation engine (§12, §16, §17).
 *
 * It populates an approved template version from the records the system already
 * holds, checks the result, and reports precisely what is missing. Three rules
 * govern it and are enforced by construction:
 *
 *   1. It never invents a value. A field it cannot source is reported missing
 *      and rendered as a visible gap, never left blank or guessed.
 *   2. It never writes or alters wording. Only `{{field}}` placeholders are
 *      substituted; the clauses are whatever the approved template says.
 *   3. It never marks a document ready when a required field or a consistency
 *      check has failed.
 */

/**
 * Transforms applied to a sourced value. These are how a contract's derived
 * wording — an amount written out in words, a period written as "7 (SEVEN)
 * WORKING DAYS" — is produced from the single value on record, so the figures
 * and the words can never disagree.
 */
export type FieldTransform = 'rand_words' | 'rand_figures_and_words' | 'period_words' | 'upper' | 'date_long';

export interface TemplateFieldSpec {
  key: string;
  label: string;
  dataType: 'string' | 'number' | 'date' | 'currency' | 'boolean' | 'id_number';
  required: boolean;
  validators: string[];
  /** Dot path into the source records, e.g. "property.addressLine". */
  sourcePath?: string | null;
  /** Required only when this condition holds. */
  conditionalOn?: { path: string; equals?: unknown; present?: boolean } | null;
  /** Derives this field's text from the sourced value. */
  transform?: FieldTransform;
  /** Unit for `period_words`, e.g. "working days". */
  transformUnit?: string;
  /** Used when the record has no value and the contract has a standing default. */
  defaultValue?: string;
  order: number;
}

export interface TemplateVersionSpec {
  templateKey: string;
  version: number;
  body: string;
  fields: TemplateFieldSpec[];
  requiredApproval: ApprovalLevel;
  signatoryRoles: string[];
  supersededAt?: Date | null;
  /**
   * When an authorised person approved this wording. A version that has not been
   * approved may not be used to produce a real document — the system will not
   * put unreviewed wording in front of a client.
   */
  approvedAt?: Date | null;
}

export interface ResolvedField {
  key: string;
  label: string;
  value: string | null;
  required: boolean;
  /** Where the value came from, so a reviewer can trace it. */
  sourcePath: string | null;
  missing: boolean;
}

export interface PreparedDocument {
  templateKey: string;
  templateVersion: number;
  body: string;
  fields: ResolvedField[];
  missingRequired: string[];
  issues: ValidationIssue[];
  /** True only when every required field resolved and no error-level issue remains. */
  readyForReview: boolean;
  requiredApproval: ApprovalLevel;
  signatoryRoles: string[];
  /** Human-readable summary for the approval card. */
  summary: string;
}

export class UnapprovedTemplateError extends Error {
  constructor(templateKey: string, version: number) {
    super(
      `Template ${templateKey} v${version} has not been approved. Its wording must be reviewed and approved by an ` +
        'authorised person before any document is produced from it.',
    );
    this.name = 'UnapprovedTemplateError';
  }
}

export class SupersededTemplateError extends Error {
  constructor(templateKey: string, version: number) {
    super(`Template ${templateKey} v${version} has been superseded and may not be used to prepare new documents.`);
    this.name = 'SupersededTemplateError';
  }
}

/** Reads a dot path out of the source bundle. Returns undefined, never throws. */
export function readPath(sources: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[part];
  }, sources);
}

function stringify(value: unknown, dataType: TemplateFieldSpec['dataType']): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (dataType === 'boolean') return value === true || value === 'true' || value === 'Yes' ? 'Yes' : 'No';
  if (typeof value === 'object') return null;

  // A rand amount in a contract reads "R4 250 000", never "4250000".
  if (dataType === 'currency') {
    const n = typeof value === 'number' ? value : Number(String(value).replace(/[R\s]/g, '').replace(/,/g, ''));
    if (Number.isFinite(n)) return formatZar(n, { decimals: !Number.isInteger(n) });
  }

  return String(value);
}

/**
 * Applies a field's transform. A transform that cannot be computed returns null
 * — the field is then reported missing rather than filled with something wrong,
 * because a contract with the wrong amount in words is worse than a blank one.
 */
export function applyTransform(raw: unknown, spec: TemplateFieldSpec): string | null {
  if (!spec.transform) return stringify(raw, spec.dataType);
  if (raw == null || raw === '') return null;

  try {
    switch (spec.transform) {
      case 'rand_words':
      case 'rand_figures_and_words': {
        const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[R\s]/g, '').replace(/,/g, ''));
        if (!Number.isFinite(n)) return null;
        return spec.transform === 'rand_words' ? randInWords(n) : randFiguresAndWords(n);
      }
      case 'period_words': {
        const n = typeof raw === 'number' ? raw : Number(String(raw));
        if (!Number.isFinite(n)) return null;
        return periodInWords(n, spec.transformUnit ?? 'days');
      }
      case 'upper':
        return String(raw).toUpperCase();
      case 'date_long': {
        const d = raw instanceof Date ? raw : new Date(String(raw));
        if (Number.isNaN(d.getTime())) return null;
        return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
      }
    }
  } catch {
    return null;
  }
}

function isRequired(field: TemplateFieldSpec, sources: unknown): boolean {
  if (!field.conditionalOn) return field.required;
  const actual = readPath(sources, field.conditionalOn.path);
  if (field.conditionalOn.present != null) {
    return field.conditionalOn.present ? actual != null && actual !== '' : actual == null || actual === '';
  }
  if ('equals' in field.conditionalOn) return actual === field.conditionalOn.equals;
  return field.required;
}

export interface ConsistencyCheck {
  key: string;
  /** Returns an issue when the combination of fields does not hang together. */
  run: (values: Record<string, string | null>, sources: unknown) => ValidationIssue | null;
}

/**
 * Cross-field checks. These catch the errors that field-level validation cannot:
 * a deposit larger than the offer, an occupation date before the sale.
 */
/**
 * Reads the first key that is present. Field names differ between templates —
 * the offer amount is "offerAmount" on one and "purchasePrice" on GRLP's — and a
 * check that silently reads a key nobody uses is worse than no check at all,
 * because it looks like cover.
 */
function pick(values: Record<string, string | null>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = values[key];
    if (value != null && value !== '') return value;
  }
  return null;
}

export const CONSISTENCY_CHECKS: Record<string, ConsistencyCheck[]> = {
  otp: [
    {
      key: 'deposit_not_greater_than_offer',
      run: (v) => {
        const offer = num(pick(v, 'offerAmount', 'purchasePrice'));
        const deposit = num(pick(v, 'depositAmount'));
        if (offer == null || deposit == null) return null;
        return deposit > offer
          ? { field: 'depositAmount', severity: 'error', message: 'The deposit is larger than the offer amount.' }
          : null;
      },
    },
    {
      key: 'bond_plus_deposit_covers_offer',
      run: (v) => {
        const offer = num(pick(v, 'offerAmount', 'purchasePrice'));
        const deposit = num(pick(v, 'depositAmount')) ?? 0;
        const bond = num(pick(v, 'bondAmount'));
        if (offer == null || bond == null) return null;
        const shortfall = offer - deposit - bond;
        return shortfall > 1
          ? {
              field: 'bondAmount',
              severity: 'warning',
              message: `Deposit and bond fall short of the offer by R${shortfall.toLocaleString('en-ZA')}. Confirm how the balance is funded.`,
            }
          : null;
      },
    },
    {
      key: 'occupation_after_signature',
      run: (v) => {
        const occupation = date(pick(v, 'occupationDate'));
        const signed = date(pick(v, 'offerDate'));
        if (!occupation || !signed) return null;
        return occupation < signed
          ? { field: 'occupationDate', severity: 'error', message: 'Occupation is dated before the offer.' }
          : null;
      },
    },
    {
      key: 'offer_lapses_after_it_is_made',
      run: (v) => {
        const made = date(pick(v, 'offerDate'));
        const lapses = date(pick(v, 'offerValidUntil', 'expiresAt'));
        if (!made || !lapses) return null;
        return lapses <= made
          ? { field: 'offerValidUntil', severity: 'error', message: 'The offer lapses on or before the date it is made.' }
          : null;
      },
    },
    {
      key: 'commission_within_normal_range',
      run: (v) => {
        const pct = num(pick(v, 'commissionPct'));
        if (pct == null) return null;
        if (pct <= 0 || pct > 12) {
          return { field: 'commissionPct', severity: 'error', message: 'The commission percentage is outside any plausible range.' };
        }
        return pct > 8
          ? { field: 'commissionPct', severity: 'warning', message: `${pct}% is above the usual range — confirm this is intended.` }
          : null;
      },
    },
    {
      key: 'buyer_is_not_seller',
      run: (v) => {
        const b = pick(v, 'buyerIdNumber');
        const s = pick(v, 'sellerIdNumber');
        if (!b || !s) return null;
        return b === s
          ? { field: 'buyerIdNumber', severity: 'error', message: 'The buyer and seller identity numbers are the same.' }
          : null;
      },
    },
  ],
  mandate: [
    {
      key: 'end_after_start',
      run: (v) => {
        const start = date(v['startDate']);
        const end = date(v['endDate']);
        if (!start || !end) return null;
        return end <= start
          ? { field: 'endDate', severity: 'error', message: 'The mandate ends on or before it starts.' }
          : null;
      },
    },
    {
      key: 'commission_within_normal_range',
      run: (v) => {
        const pct = num(pick(v, 'commissionPct'));
        if (pct == null) return null;
        if (pct <= 0 || pct > 12) {
          return { field: 'commissionPct', severity: 'error', message: 'The commission percentage is outside any plausible range.' };
        }
        return pct > 8
          ? { field: 'commissionPct', severity: 'warning', message: `${pct}% is above the usual range — confirm this is intended.` }
          : null;
      },
    },
  ],
};

function num(v: string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/[R%\s]/g, '').replace(/,/g, ''));
  return Number.isNaN(n) ? null : n;
}

function date(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface PrepareInput {
  template: TemplateVersionSpec;
  /** Records to populate from: { property, seller, buyer, offer, mandate, … }. */
  sources: Record<string, unknown>;
  /** Values a person supplied directly; these win over sourced values. */
  overrides?: Record<string, string>;
  /** Which consistency check set to apply, e.g. "otp" or "mandate". */
  checkSet?: string;
}

export function prepareDocument({ template, sources, overrides = {}, checkSet }: PrepareInput): PreparedDocument {
  if (template.supersededAt) throw new SupersededTemplateError(template.templateKey, template.version);
  if (!template.approvedAt) throw new UnapprovedTemplateError(template.templateKey, template.version);

  const fields: ResolvedField[] = [];
  const values: Record<string, string | null> = {};
  const issues: ValidationIssue[] = [];

  for (const spec of [...template.fields].sort((a, b) => a.order - b.order)) {
    const required = isRequired(spec, sources);
    const sourced = spec.key in overrides ? overrides[spec.key] : spec.sourcePath ? readPath(sources, spec.sourcePath) : undefined;
    const raw = sourced ?? spec.defaultValue;
    // An override is already text and must not be re-transformed.
    const value = spec.key in overrides ? stringify(raw, spec.dataType) : applyTransform(raw, spec);

    values[spec.key] = value;
    fields.push({
      key: spec.key,
      label: spec.label,
      value,
      required,
      sourcePath: spec.sourcePath ?? null,
      missing: required && value == null,
    });

    if (value != null && spec.validators.length) {
      issues.push(...runValidators(spec.validators, value, spec.key));
    }
  }

  for (const check of checkSet ? (CONSISTENCY_CHECKS[checkSet] ?? []) : []) {
    const issue = check.run(values, sources);
    if (issue) issues.push(issue);
  }

  const missingRequired = fields.filter((f) => f.missing).map((f) => f.key);
  const body = populate(template.body, values, fields);
  const hasErrors = issues.some((i) => i.severity === 'error');
  const readyForReview = missingRequired.length === 0 && !hasErrors;

  return {
    templateKey: template.templateKey,
    templateVersion: template.version,
    body,
    fields,
    missingRequired,
    issues,
    readyForReview,
    requiredApproval: template.requiredApproval,
    signatoryRoles: template.signatoryRoles,
    summary: summarise({ missingRequired, issues, fields, readyForReview }),
  };
}

/**
 * Substitutes `{{key}}` placeholders only.
 *
 * The distinction that matters to a reviewer: a *required* field with no value is
 * a gap, and is marked so their eye cannot pass over it. An *optional* field with
 * no value is not a gap — the clause does not apply — and is written "N/A", the
 * way the master's "delete if not applicable" instruction is normally satisfied.
 * Marking the two the same way would send a reviewer hunting for information
 * that does not exist.
 */
export const MISSING_MARKER = 'MISSING';
export const NOT_APPLICABLE = 'N/A';

export function populate(body: string, values: Record<string, string | null>, fields: ResolvedField[]): string {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (value != null && value !== '') return value;

    const field = byKey.get(key);
    if (!field) return `[[ ${MISSING_MARKER}: ${key} ]]`;
    return field.required ? `[[ ${MISSING_MARKER}: ${field.label} ]]` : NOT_APPLICABLE;
  });
}

/** Any placeholder in the body with no matching field is a template defect. */
export function findUnmappedPlaceholders(template: TemplateVersionSpec): string[] {
  const known = new Set(template.fields.map((f) => f.key));
  const found = new Set<string>();
  for (const m of template.body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    const key = m[1]!;
    if (!known.has(key)) found.add(key);
  }
  return [...found];
}

function summarise(args: {
  missingRequired: string[];
  issues: ValidationIssue[];
  fields: ResolvedField[];
  readyForReview: boolean;
}): string {
  const { missingRequired, issues, fields, readyForReview } = args;
  const filled = fields.filter((f) => f.value != null).length;
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  const parts = [`${filled}/${fields.length} fields populated`];
  if (missingRequired.length) {
    parts.push(`${missingRequired.length} required field${missingRequired.length === 1 ? '' : 's'} still needed`);
  }
  if (errors.length) parts.push(`${errors.length} error${errors.length === 1 ? '' : 's'} to resolve`);
  if (warnings.length) parts.push(`${warnings.length} to confirm`);
  parts.push(readyForReview ? 'ready for review' : 'not yet ready');
  return parts.join('; ') + '.';
}
