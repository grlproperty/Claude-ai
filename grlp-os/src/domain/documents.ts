import { runValidators, type ValidationIssue } from './validators';
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
  if (dataType === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return null;
  return String(value);
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
export const CONSISTENCY_CHECKS: Record<string, ConsistencyCheck[]> = {
  otp: [
    {
      key: 'deposit_not_greater_than_offer',
      run: (v) => {
        const offer = num(v['offerAmount']);
        const deposit = num(v['depositAmount']);
        if (offer == null || deposit == null) return null;
        return deposit > offer
          ? { field: 'depositAmount', severity: 'error', message: 'The deposit is larger than the offer amount.' }
          : null;
      },
    },
    {
      key: 'bond_plus_deposit_covers_offer',
      run: (v) => {
        const offer = num(v['offerAmount']);
        const deposit = num(v['depositAmount']) ?? 0;
        const bond = num(v['bondAmount']);
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
        const occupation = date(v['occupationDate']);
        const signed = date(v['offerDate']);
        if (!occupation || !signed) return null;
        return occupation < signed
          ? { field: 'occupationDate', severity: 'error', message: 'Occupation is dated before the offer.' }
          : null;
      },
    },
    {
      key: 'buyer_is_not_seller',
      run: (v) => {
        const b = v['buyerIdNumber'];
        const s = v['sellerIdNumber'];
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
        const pct = num(v['commissionPct']);
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
    const raw = spec.key in overrides ? overrides[spec.key] : spec.sourcePath ? readPath(sources, spec.sourcePath) : undefined;
    const value = stringify(raw, spec.dataType);

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
 * Substitutes `{{key}}` placeholders only. A missing value becomes a visible
 * marker so a reviewer's eye lands on the gap — the alternative, a blank line in
 * a contract, is how mistakes reach clients.
 */
export function populate(body: string, values: Record<string, string | null>, fields: ResolvedField[]): string {
  const labels = new Map(fields.map((f) => [f.key, f.label]));
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (value != null && value !== '') return value;
    return `[[ MISSING: ${labels.get(key) ?? key} ]]`;
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
