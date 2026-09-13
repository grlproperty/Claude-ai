/**
 * Formatting, in South African English throughout.
 *
 * Dates read as 11 September 2026, money as R 1 250 000, and the working
 * timezone is Africa/Johannesburg so "today" means today in George.
 */

export const TIMEZONE = 'Africa/Johannesburg';
const LOCALE = 'en-ZA';

function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = asDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TIMEZONE,
  }).format(date);
}

export function formatShortDate(value: string | Date | null | undefined): string {
  const date = asDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: TIMEZONE,
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = asDate(value);
  if (!date) return '';
  return `${formatDate(date)} at ${new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIMEZONE,
  }).format(date)}`;
}

/** For a date input's value attribute. */
export function toDateInput(value: string | Date | null | undefined): string {
  const date = asDate(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TIMEZONE,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** For a datetime-local input's value attribute. */
export function toDateTimeInput(value: string | Date | null | undefined): string {
  const date = asDate(value);
  if (!date) return '';
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIMEZONE,
  }).format(date);
  return `${toDateInput(date)}T${time}`;
}

/** "3 days ago", "in 2 weeks". Used beside a date, never instead of one. */
export function relativeTime(value: string | Date | null | undefined): string {
  const date = asDate(value);
  if (!date) return '';
  const diffMs = date.getTime() - Date.now();
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 3600_000],
    ['month', 30 * 24 * 3600_000],
    ['week', 7 * 24 * 3600_000],
    ['day', 24 * 3600_000],
    ['hour', 3600_000],
    ['minute', 60_000],
  ];
  const formatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return formatter.format(Math.round(diffMs / ms), unit);
  }
  return 'just now';
}

export function isOverdue(value: string | Date | null | undefined): boolean {
  const date = asDate(value);
  return date !== null && date.getTime() < Date.now();
}

/** R 1 250 000. Amounts are carried as decimal strings so nothing is rounded twice. */
export function formatMoney(
  value: string | number | null | undefined,
  options: { decimals?: boolean } = {},
): string {
  if (value === null || value === undefined || value === '') return '';
  const amount = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(amount)) return '';
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: options.decimals ? 2 : 0,
    maximumFractionDigits: options.decimals ? 2 : 0,
  })
    .format(amount)
    .replace(/[\u202F\u00A0\u2009]/g, '\u00A0');
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const amount = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(amount)) return '';
  return new Intl.NumberFormat(LOCALE).format(amount).replace(/[\u202F\u00A0\u2009]/g, '\u00A0');
}

export function formatPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const amount = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(amount)) return '';
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 3 }).format(amount)}%`;
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** Today's date in the working timezone, as yyyy-mm-dd. */
export function today(): string {
  return toDateInput(new Date());
}
