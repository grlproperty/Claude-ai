/**
 * Money, worked out exactly (spec 62, 66).
 *
 * Commission is the one place in the CRM where a cent lost to floating
 * point would be a real error in somebody's pay, so nothing here goes
 * through a JavaScript number. Amounts arrive from Postgres as decimal
 * strings, stay decimal strings, and are calculated on integer minor
 * units using BigInt. Rounding is stated, not implicit: half away from
 * zero, which is what an invoice does.
 */

export class MoneyError extends Error {}

const CENTS = 2;

/** Splits a decimal string into a sign and its digits, refusing anything else. */
function partsOf(value: string): { negative: boolean; whole: string; fraction: string } {
  // Spaces, the non-breaking kinds a formatted amount carries, thousands
  // separators and a leading R are all tolerated, because a figure often
  // arrives pasted from somewhere else.
  const cleaned = value
    .trim()
    .replace(/[\s\u00a0\u202f\u2009,]/g, '')
    .replace(/^R/i, '');
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(cleaned);
  const whole = match?.[2] ?? '';
  const fraction = match?.[3] ?? '';
  if (!match || (whole === '' && fraction === '')) {
    throw new MoneyError(`"${value}" is not an amount.`);
  }
  return { negative: match[1] === '-', whole: whole === '' ? '0' : whole, fraction };
}

/**
 * A decimal string as an integer scaled by 10^scale, rounded half away
 * from zero if it carries more digits than the scale allows.
 */
export function scaled(value: string | number, scale: number): bigint {
  const { negative, whole, fraction } = partsOf(String(value));
  const kept = fraction.slice(0, scale).padEnd(scale, '0');
  const magnitude = BigInt(whole + kept);

  // The first digit dropped decides the rounding, which is why this is
  // done on the string rather than after any division.
  const dropped = fraction.slice(scale);
  const roundUp = dropped !== '' && Number(dropped[0]) >= 5;
  const rounded = roundUp ? magnitude + 1n : magnitude;
  return negative ? -rounded : rounded;
}

/** Cents, as an exact integer. */
export function toCents(value: string | number): bigint {
  return scaled(value, CENTS);
}

/** Back to the decimal string the database and the screen both want. */
export function fromCents(cents: bigint): string {
  const negative = cents < 0n;
  const digits = (negative ? -cents : cents).toString().padStart(CENTS + 1, '0');
  const whole = digits.slice(0, digits.length - CENTS);
  const fraction = digits.slice(digits.length - CENTS);
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

/** Divides two integers, rounding half away from zero. */
function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new MoneyError('Cannot divide by zero.');
  const negative = numerator < 0n !== denominator < 0n;
  const a = numerator < 0n ? -numerator : numerator;
  const b = denominator < 0n ? -denominator : denominator;
  const quotient = a / b;
  const remainder = a % b;
  const rounded = remainder * 2n >= b ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export function add(...values: (string | number)[]): string {
  return fromCents(values.reduce((total, value) => total + toCents(value), 0n));
}

export function subtract(a: string | number, b: string | number): string {
  return fromCents(toCents(a) - toCents(b));
}

/** Never below zero, for figures that cannot sensibly be negative. */
export function subtractToZero(a: string | number, b: string | number): string {
  const result = toCents(a) - toCents(b);
  return fromCents(result < 0n ? 0n : result);
}

/**
 * A percentage of an amount.
 *
 * The percentage keeps four decimal places, because a rate like 4.5625%
 * is a real mandate term, and the division happens once at the end so no
 * rounding is applied twice.
 */
export function percentOf(amount: string | number, percent: string | number): string {
  const cents = toCents(amount);
  const rate = scaled(percent, 4);
  return fromCents(divideRounded(cents * rate, 1_000_000n));
}

/** An amount multiplied by a count that may itself be fractional. */
export function multiply(amount: string | number, factor: string | number): string {
  const cents = toCents(amount);
  const times = scaled(factor, 3);
  return fromCents(divideRounded(cents * times, 1_000n));
}

export function sum(values: (string | number)[]): string {
  return values.length === 0 ? '0.00' : add(...values);
}

export function compare(a: string | number, b: string | number): number {
  const left = toCents(a);
  const right = toCents(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isZero(value: string | number): boolean {
  return toCents(value) === 0n;
}

export function max(a: string | number, b: string | number): string {
  return compare(a, b) >= 0 ? fromCents(toCents(a)) : fromCents(toCents(b));
}

/** A tidy decimal string, whatever shape the input was in. */
export function normalise(value: string | number): string {
  return fromCents(toCents(value));
}

/**
 * A rate or a count written the way a person would write it.
 *
 * Postgres hands back numeric(8,4) as "5.0000", which is correct and
 * unreadable. This drops the trailing zeros without touching the value, so
 * 5.0000 shows as 5 and 4.5625 still shows in full.
 */
export function trimTrailingZeros(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value).trim();
  if (!text.includes('.')) return text;
  return text.replace(/\.?0+$/, '') || '0';
}

/**
 * Shares one amount out by percentage without losing or inventing a cent.
 *
 * Each share is rounded on its own and whatever the rounding left over is
 * given to the largest share, so the parts always add back up to the
 * whole. Anybody who has ever reconciled a commission statement knows why
 * this matters.
 *
 * The residue is only redistributed when the percentages come to exactly
 * 100: shares that deliberately total less than the whole are left alone
 * rather than quietly inflated to fill it.
 */
export function apportion(
  amount: string | number,
  percents: (string | number)[],
): string[] {
  if (percents.length === 0) return [];
  const total = toCents(amount);
  const shares = percents.map((percent) => toCents(percentOf(amount, percent)));
  const allocated = shares.reduce((running, share) => running + share, 0n);
  const drift = total - allocated;
  const wholeShared = percents.reduce((running, percent) => running + scaled(percent, 4), 0n);

  if (drift !== 0n && wholeShared === 1_000_000n) {
    // The residue goes to the biggest share, which is the convention least
    // likely to surprise the person reading the statement.
    let largest = 0;
    for (let index = 1; index < shares.length; index += 1) {
      if ((shares[index] ?? 0n) > (shares[largest] ?? 0n)) largest = index;
    }
    shares[largest] = (shares[largest] ?? 0n) + drift;
  }

  return shares.map((share) => fromCents(share));
}
