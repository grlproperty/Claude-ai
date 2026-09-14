import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// Deliberately expensive. scrypt is in Node's standard library, so there is
// no native build step to go wrong on whichever host GRLP ends up using.
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const KEY_LENGTH = 32;

/** Hashes a password. Plaintext is never stored, logged or returned. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS);
  return [
    'scrypt',
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/** Constant-time verification. Returns false rather than throwing on a malformed hash. */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4] as string, 'base64');
    expected = Buffer.from(parts[5] as string, 'base64');
  } catch {
    return false;
  }
  if (expected.length !== KEY_LENGTH) return false;

  const derived = await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N, r, p, maxmem: PARAMS.maxmem,
  });
  return timingSafeEqual(derived, expected);
}

const COMMON = new Set([
  'password', 'password1', 'password123', 'welcome1', 'qwerty', '12345678',
  'letmein', 'garden route', 'grlproperty', 'property1', 'changeme',
]);

/**
 * Password rules for an internal system: long enough to matter, without the
 * character-class theatre that pushes staff towards Password1!
 */
export function checkPasswordStrength(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 12) problems.push('Use at least 12 characters.');
  if (password.length > 200) problems.push('Use fewer than 200 characters.');
  if (/^\s|\s$/.test(password)) problems.push('Do not start or end with a space.');
  if (COMMON.has(password.toLowerCase().trim())) {
    problems.push('That password is too easy to guess. Please choose another.');
  }
  if (/^(.)\1+$/.test(password)) problems.push('Do not repeat a single character.');
  return problems;
}
