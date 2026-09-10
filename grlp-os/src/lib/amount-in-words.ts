/**
 * Rand amounts in words, as South African contracts require them.
 *
 * Every offer to purchase writes each amount twice — once in figures and once in
 * words — and where the two disagree it is the words that generally govern. It is
 * also the part agents most often get wrong by hand, so the system does it.
 *
 * Convention followed: "and" before the final tens/units group, as in
 * "FOUR MILLION TWO HUNDRED AND FIFTY THOUSAND RAND".
 */

const UNITS = [
  'ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
  'SEVENTEEN', 'EIGHTEEN', 'NINETEEN',
];

const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

const SCALES: Array<[number, string]> = [
  [1_000_000_000, 'BILLION'],
  [1_000_000, 'MILLION'],
  [1_000, 'THOUSAND'],
];

/** 0–999 in words. */
function underThousand(n: number): string {
  if (n < 20) return UNITS[n]!;
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)]!;
    const rest = n % 10;
    return rest ? `${tens}-${UNITS[rest]}` : tens;
  }
  const hundreds = `${UNITS[Math.floor(n / 100)]} HUNDRED`;
  const rest = n % 100;
  return rest ? `${hundreds} AND ${underThousand(rest)}` : hundreds;
}

export function numberInWords(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('That is not a number.');
  if (value < 0) return `MINUS ${numberInWords(-value)}`;

  const whole = Math.floor(value);
  if (whole === 0) return 'ZERO';
  if (whole >= 1_000_000_000_000) throw new RangeError('That amount is larger than this converter handles.');

  const parts: string[] = [];
  let remainder = whole;

  for (const [scale, name] of SCALES) {
    if (remainder >= scale) {
      parts.push(`${underThousand(Math.floor(remainder / scale))} ${name}`);
      remainder %= scale;
    }
  }

  if (remainder > 0) {
    // "AND" before the final group, but only when something precedes it and the
    // group is under a hundred: "ONE MILLION AND FIFTY", "ONE MILLION TWO HUNDRED".
    const joiner = parts.length && remainder < 100 ? 'AND ' : '';
    parts.push(`${joiner}${underThousand(remainder)}`);
  }

  return parts.join(' ');
}

/**
 * The full contract form: "FOUR MILLION TWO HUNDRED AND FIFTY THOUSAND RAND".
 * Cents are included only when there are any, as contracts do.
 */
export function randInWords(amount: number): string {
  const whole = Math.floor(Math.abs(amount));
  const cents = Math.round((Math.abs(amount) - whole) * 100);
  const sign = amount < 0 ? 'MINUS ' : '';
  const base = `${sign}${numberInWords(whole)} RAND`;
  return cents ? `${base} AND ${numberInWords(cents)} CENTS` : base;
}

/** "R4 250 000 (FOUR MILLION TWO HUNDRED AND FIFTY THOUSAND RAND)" */
export function randFiguresAndWords(amount: number): string {
  const figures = new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return `${figures} (${randInWords(amount)})`;
}

/** Periods are written the same way: "7 (SEVEN) WORKING DAYS". */
export function periodInWords(count: number, unit: string): string {
  return `${count} (${numberInWords(count)}) ${unit.toUpperCase()}`;
}
