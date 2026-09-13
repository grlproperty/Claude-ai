import { createHmac } from 'node:crypto';
import { env } from './env.ts';

/**
 * South African identity numbers (spec 15).
 *
 * The number itself is held in person_identity, behind its own policy. The
 * master record keeps only what the rest of the CRM legitimately needs:
 *
 *   fingerprint  a one-way HMAC, so two records can be recognised as the
 *                same person without the number being readable
 *   last three   so the masked form can be shown to everyone else
 *
 * Nothing here ever puts a number into a URL, a log or an export.
 */

export function normaliseIdNumber(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalisePassportNumber(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** A South African ID is 13 digits: YYMMDD SSSS C A Z, with a Luhn check digit. */
export function validateSaIdNumber(value: string): { valid: boolean; reason?: string } {
  const digits = normaliseIdNumber(value);
  if (digits.length === 0) return { valid: true };
  if (digits.length !== 13) {
    return { valid: false, reason: 'A South African ID number has 13 digits.' };
  }

  const year = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  if (month < 1 || month > 12) {
    return { valid: false, reason: 'The date of birth inside that ID number is not a real date.' };
  }
  // Century is ambiguous in the number itself, so both are checked.
  const validDay = [1900 + year, 2000 + year].some((fullYear) => {
    const date = new Date(Date.UTC(fullYear, month - 1, day));
    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  });
  if (!validDay) {
    return { valid: false, reason: 'The date of birth inside that ID number is not a real date.' };
  }

  const citizenship = digits[10];
  if (citizenship !== '0' && citizenship !== '1') {
    return { valid: false, reason: 'That ID number is not in a valid format.' };
  }

  if (!luhnValid(digits)) {
    return { valid: false, reason: 'That ID number fails its check digit. Please re-enter it.' };
  }
  return { valid: true };
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Date of birth implied by an ID number, or null when it cannot be trusted. */
export function birthDateFromSaId(value: string): string | null {
  const digits = normaliseIdNumber(value);
  if (digits.length !== 13 || !validateSaIdNumber(digits).valid) return null;
  const yy = Number(digits.slice(0, 2));
  const currentYear = new Date().getUTCFullYear() % 100;
  const century = yy > currentYear ? 1900 : 2000;
  return `${century + yy}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
}

/**
 * A keyed, one-way fingerprint. Two records with the same identity number
 * produce the same fingerprint, so duplicates are found; the fingerprint
 * cannot be turned back into the number.
 */
export function fingerprintIdentity(value: string): string {
  const normalised = normaliseIdNumber(value);
  if (normalised.length === 0) return '';
  return createHmac('sha256', env.identityPepper()).update(`sa-id:${normalised}`).digest('hex');
}

export function fingerprintPassport(value: string, country: string | null): string {
  const normalised = normalisePassportNumber(value);
  if (normalised.length === 0) return '';
  return createHmac('sha256', env.identityPepper())
    .update(`passport:${(country ?? '').toUpperCase()}:${normalised}`)
    .digest('hex');
}

export function lastThree(value: string): string | null {
  const normalised = value.replace(/[^A-Za-z0-9]/g, '');
  return normalised.length >= 3 ? normalised.slice(-3) : null;
}

/**
 * What everyone without PERSON_ID_VIEW sees. The full number never reaches
 * the browser for those users: this is produced on the server from the three
 * digits stored on the master record.
 */
export function maskedIdentity(last3: string | null, length = 13): string {
  if (!last3) return 'Not recorded';
  return '*'.repeat(Math.max(0, length - 3)) + last3;
}
