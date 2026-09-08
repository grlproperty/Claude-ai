/**
 * Formatting helpers. South African conventions throughout, per the brand
 * guide: rand amounts with a space thousands separator, SA English spelling.
 */

export function formatZar(amount: number, opts: { decimals?: boolean } = {}): string {
  const formatted = new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  }).format(amount);

  // en-ZA emits "R\u00a04\u00a0250\u00a0000". The brand guide writes "R4 250 000":
  // no gap after the R, ordinary spaces between the groups so the text survives
  // being copied into Word, email and the deeds office's systems.
  return formatted.replace(/\u00a0/g, ' ').replace(/^(R\s*-?)\s+/, '$1');
}

/** Compact form for dashboard tiles: R4,2 m / R850 k. */
export function formatZarCompact(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `R${(amount / 1_000_000).toFixed(1).replace('.', ',')} m`;
  }
  if (Math.abs(amount) >= 1_000) return `R${Math.round(amount / 1_000)} k`;
  return formatZar(amount);
}

/** "3 h 20 m" — how the hours-recovered metric is read aloud. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem} m`;
  if (rem === 0) return `${h} h`;
  return `${h} h ${rem} m`;
}

export function formatRelative(date: Date, now = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const past = diffMs < 0;
  const units: Array<[string, number]> = [
    ['minute', 60_000],
    ['hour', 3_600_000],
    ['day', 86_400_000],
  ];
  let label = 'just now';
  for (const [name, ms] of units) {
    const n = Math.floor(abs / ms);
    if (n >= 1) label = `${n} ${name}${n === 1 ? '' : 's'}`;
  }
  if (label === 'just now') return label;
  return past ? `${label} ago` : `in ${label}`;
}
