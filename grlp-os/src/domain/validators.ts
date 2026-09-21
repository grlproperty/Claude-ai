/**
 * Field validators used by the document engine.
 *
 * These are real checks, not placeholders: a mandate or OTP that passes
 * validation has genuinely had its identity numbers, dates and amounts checked.
 * Anything a validator cannot verify is reported as unverified rather than
 * quietly passed.
 */

export interface ValidationIssue {
  field: string;
  severity: 'error' | 'warning';
  message: string;
}

export type Validator = (value: string, field: string) => ValidationIssue | null;

/**
 * South African identity number: 13 digits, YYMMDD + gender + citizenship +
 * a Luhn check digit. Used on mandates and offers to purchase.
 */
export function parseSaIdNumber(value: string): {
  valid: boolean;
  reason?: string;
  dateOfBirth?: Date;
  gender?: 'male' | 'female';
  citizen?: boolean;
} {
  const digits = value.replace(/\s/g, '');
  if (!/^\d{13}$/.test(digits)) return { valid: false, reason: 'must be 13 digits' };

  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  if (mm < 1 || mm > 12) return { valid: false, reason: 'the month is not valid' };

  // Two-digit years are ambiguous; assume a birth date in the last 100 years.
  const nowYear = new Date().getUTCFullYear();
  const century = yy + 2000 > nowYear ? 1900 : 2000;
  const year = century + yy;
  const date = new Date(Date.UTC(year, mm - 1, dd));
  if (date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) {
    return { valid: false, reason: 'the date of birth is not a real date' };
  }

  if (!luhnValid(digits)) return { valid: false, reason: 'the check digit does not match' };

  const genderSeq = Number(digits.slice(6, 10));
  const citizenDigit = digits[10];
  return {
    valid: true,
    dateOfBirth: date,
    gender: genderSeq >= 5000 ? 'male' : 'female',
    citizen: citizenDigit === '0',
  };
}

/** Luhn checksum over the full 13 digits, as used by Home Affairs. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export const VALIDATORS: Record<string, Validator> = {
  sa_id: (value, field) => {
    const r = parseSaIdNumber(value);
    return r.valid ? null : { field, severity: 'error', message: `Identity number is not valid — ${r.reason}.` };
  },

  required_text: (value, field) =>
    value.trim().length ? null : { field, severity: 'error', message: 'This field is empty.' },

  positive: (value, field) => {
    const n = Number(String(value).replace(/[R\s,]/g, '').replace(',', '.'));
    if (Number.isNaN(n)) return { field, severity: 'error', message: 'This is not a number.' };
    return n > 0 ? null : { field, severity: 'error', message: 'This must be greater than zero.' };
  },

  currency: (value, field) => {
    const n = Number(String(value).replace(/[R\s]/g, '').replace(/,/g, ''));
    return Number.isNaN(n) ? { field, severity: 'error', message: 'This is not a rand amount.' } : null;
  },

  date: (value, field) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? { field, severity: 'error', message: 'This is not a valid date.' } : null;
  },

  future_date: (value, field) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return { field, severity: 'error', message: 'This is not a valid date.' };
    return d.getTime() > Date.now() ? null : { field, severity: 'warning', message: 'This date is in the past.' };
  },

  email: (value, field) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
      ? null
      : { field, severity: 'error', message: 'This is not a valid email address.' },

  sa_phone: (value, field) => {
    const digits = value.replace(/[^\d+]/g, '');
    const ok = /^(\+27\d{9}|0\d{9})$/.test(digits);
    return ok ? null : { field, severity: 'warning', message: 'This does not look like a South African number.' };
  },

  percentage: (value, field) => {
    const n = Number(String(value).replace('%', '').trim());
    if (Number.isNaN(n)) return { field, severity: 'error', message: 'This is not a percentage.' };
    if (n < 0 || n > 100) return { field, severity: 'error', message: 'A percentage must be between 0 and 100.' };
    return null;
  },
};

export function runValidators(keys: string[], value: string, field: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const key of keys) {
    const v = VALIDATORS[key];
    if (!v) {
      issues.push({ field, severity: 'warning', message: `No validator named "${key}" is registered.` });
      continue;
    }
    const issue = v(value, field);
    if (issue) issues.push(issue);
  }
  return issues;
}
