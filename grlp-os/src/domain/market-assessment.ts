import { formatZar } from '../lib/format';

/**
 * Market assessment / CMA engine (§13).
 *
 * The system does the analysis; the valuation opinion remains Mandy's. That
 * split is why every number here is traceable: each adjustment records what was
 * changed and why, so a reviewer can disagree with a step rather than having to
 * redo the work.
 *
 * Where an input is not available the engine says so and declines to adjust.
 * It never substitutes an assumed market trend or an assumed asking-to-sold
 * discount for data it does not have.
 */

export interface SubjectProperty {
  addressLine: string;
  propertyType?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  garages?: number | null;
  floorSizeSqm?: number | null;
  landSizeSqm?: number | null;
  condition?: string | null;
}

export interface ComparableInput {
  id: string;
  addressLine: string;
  price: number;
  /** True for a recorded sale, false for an asking price. They are not equivalent. */
  isSoldPrice: boolean;
  floorSizeSqm?: number | null;
  landSizeSqm?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  distanceKm?: number | null;
  saleDate?: Date | null;
  sourceName: string;
  sourceUrl?: string | null;
}

export interface Adjustment {
  reason: string;
  amountZar: number;
  basis: string;
}

export interface AdjustedComparable {
  id: string;
  addressLine: string;
  basePrice: number;
  adjustments: Adjustment[];
  adjustedPrice: number;
  pricePerSqm: number | null;
  isSoldPrice: boolean;
  saleDate: Date | null;
  excluded: boolean;
  exclusionReason?: string;
  flags: string[];
}

export interface AssessmentResult {
  status: 'PREPARED' | 'NEEDS_INPUT';
  recommendedLow: number | null;
  recommendedHigh: number | null;
  midpoint: number | null;
  pricePerSqm: number | null;
  comparables: AdjustedComparable[];
  usedCount: number;
  missingInputs: string[];
  flags: string[];
  confidence: 'low' | 'moderate' | 'good';
  workings: Workings;
  executiveSummary: string;
}

export interface Workings {
  method: string;
  steps: string[];
  adjustedValues: number[];
  median: number | null;
  medianAbsoluteDeviation: number | null;
  spreadPct: number | null;
}

/** Bigger homes cost less per square metre, so a raw rate over-corrects. */
const SIZE_ADJUSTMENT_DAMPING = 0.5;
const BEDROOM_ADJUSTMENT_PCT = 0.03;
const BATHROOM_ADJUSTMENT_PCT = 0.02;
/** Beyond this a comparable is reported but not used. */
const MAX_DISTANCE_KM = 15;
const MAX_AGE_MONTHS = 18;
/** Deviation beyond this many MADs from the median is treated as unusual. */
const OUTLIER_MAD_MULTIPLE = 2.5;
const MIN_COMPARABLES = 3;

export interface AssessInput {
  subject: SubjectProperty;
  comparables: ComparableInput[];
  /**
   * Annual market movement, as a decimal (0.06 = 6%). Supply only from an
   * authorised data source — without it, no time adjustment is made and the
   * assessment says so.
   */
  annualMarketTrend?: number | null;
  now?: Date;
}

export function assess({ subject, comparables, annualMarketTrend = null, now = new Date() }: AssessInput): AssessmentResult {
  const missingInputs: string[] = [];
  const flags: string[] = [];

  if (!subject.floorSizeSqm) missingInputs.push('subject floor size');
  if (!subject.bedrooms) missingInputs.push('subject bedrooms');
  if (!subject.condition) missingInputs.push('subject condition');
  if (annualMarketTrend == null) {
    flags.push('No market trend figure was available, so no time adjustment has been applied to older sales.');
  }

  const adjusted = comparables.map((c) => adjustOne(c, subject, annualMarketTrend, now));
  const used = adjusted.filter((c) => !c.excluded);

  // Outliers are flagged, not silently dropped — a reviewer decides.
  const values = used.map((c) => c.adjustedPrice);
  const med = median(values);
  const mad = medianAbsoluteDeviation(values, med);
  if (med != null && mad != null && mad > 0) {
    for (const c of used) {
      if (Math.abs(c.adjustedPrice - med) > OUTLIER_MAD_MULTIPLE * mad) {
        c.flags.push('Unusual compared with the others — confirm before relying on it.');
      }
    }
  }

  const askingOnly = used.length > 0 && used.every((c) => !c.isSoldPrice);
  if (askingOnly) {
    flags.push(
      'Every comparable is an asking price, not a recorded sale. Asking prices sit above achieved prices by an amount this system cannot estimate without sold data.',
    );
  }

  const steps: string[] = [];
  steps.push(`${comparables.length} comparable${comparables.length === 1 ? '' : 's'} supplied; ${used.length} usable.`);
  for (const c of adjusted.filter((c) => c.excluded)) {
    steps.push(`Excluded ${c.addressLine}: ${c.exclusionReason}.`);
  }

  if (used.length < MIN_COMPARABLES) {
    missingInputs.push(`at least ${MIN_COMPARABLES} usable comparables (have ${used.length})`);
    return {
      status: 'NEEDS_INPUT',
      recommendedLow: null,
      recommendedHigh: null,
      midpoint: null,
      pricePerSqm: null,
      comparables: adjusted,
      usedCount: used.length,
      missingInputs,
      flags,
      confidence: 'low',
      workings: { method: 'Adjusted comparable sales', steps, adjustedValues: values, median: med, medianAbsoluteDeviation: mad, spreadPct: null },
      executiveSummary:
        `A defensible range cannot be produced for ${subject.addressLine} yet: ${used.length} usable comparable${used.length === 1 ? '' : 's'} ` +
        `against a minimum of ${MIN_COMPARABLES}. Everything else is prepared and waiting on that input.`,
    };
  }

  // A trimmed range is more robust than the raw min/max when one comparable is odd.
  const sorted = [...values].sort((a, b) => a - b);
  const low = quantile(sorted, 0.25);
  const high = quantile(sorted, 0.75);
  const midpoint = med!;
  const spreadPct = midpoint > 0 ? (high - low) / midpoint : null;

  steps.push(`Adjusted values: ${sorted.map((v) => formatZar(v)).join(', ')}.`);
  steps.push(`Median ${formatZar(midpoint)}; interquartile range ${formatZar(low)}–${formatZar(high)}.`);

  const pricePerSqm =
    subject.floorSizeSqm && subject.floorSizeSqm > 0 ? Math.round(midpoint / subject.floorSizeSqm) : null;
  if (pricePerSqm) steps.push(`Implied rate ${formatZar(pricePerSqm)}/m² over ${subject.floorSizeSqm} m².`);

  const recencyOk = used.filter((c) => monthsBetween(c, now) != null && monthsBetween(c, now)! <= 6).length;
  const confidence: AssessmentResult['confidence'] =
    used.length >= 5 && !askingOnly && spreadPct != null && spreadPct < 0.15 && recencyOk >= 2
      ? 'good'
      : used.length >= MIN_COMPARABLES && spreadPct != null && spreadPct < 0.3
        ? 'moderate'
        : 'low';

  return {
    status: 'PREPARED',
    recommendedLow: Math.round(low),
    recommendedHigh: Math.round(high),
    midpoint: Math.round(midpoint),
    pricePerSqm,
    comparables: adjusted,
    usedCount: used.length,
    missingInputs,
    flags,
    confidence,
    workings: {
      method: 'Adjusted comparable sales, interquartile range',
      steps,
      adjustedValues: sorted,
      median: midpoint,
      medianAbsoluteDeviation: mad,
      spreadPct,
    },
    executiveSummary: buildSummary({ subject, low, high, midpoint, used: used.length, confidence, flags, missingInputs, pricePerSqm }),
  };
}

function adjustOne(
  c: ComparableInput,
  subject: SubjectProperty,
  trend: number | null,
  now: Date,
): AdjustedComparable {
  const adjustments: Adjustment[] = [];
  const flags: string[] = [];
  let excluded = false;
  let exclusionReason: string | undefined;

  if (c.distanceKm != null && c.distanceKm > MAX_DISTANCE_KM) {
    excluded = true;
    exclusionReason = `${c.distanceKm} km away, beyond the ${MAX_DISTANCE_KM} km radius`;
  }
  const ageMonths = monthsBetween(c, now);
  if (!excluded && ageMonths != null && ageMonths > MAX_AGE_MONTHS) {
    excluded = true;
    exclusionReason = `sold ${Math.round(ageMonths)} months ago, beyond the ${MAX_AGE_MONTHS}-month window`;
  }
  if (c.price <= 0) {
    excluded = true;
    exclusionReason = 'the price is not usable';
  }

  const compRate = c.floorSizeSqm && c.floorSizeSqm > 0 ? c.price / c.floorSizeSqm : null;

  // Size — the largest single driver, damped because rate falls with size.
  if (compRate != null && subject.floorSizeSqm && c.floorSizeSqm) {
    const deltaSqm = subject.floorSizeSqm - c.floorSizeSqm;
    if (Math.abs(deltaSqm) >= 5) {
      const amount = deltaSqm * compRate * SIZE_ADJUSTMENT_DAMPING;
      adjustments.push({
        reason: `Subject is ${Math.abs(Math.round(deltaSqm))} m² ${deltaSqm > 0 ? 'larger' : 'smaller'}`,
        amountZar: Math.round(amount),
        basis: `${Math.abs(Math.round(deltaSqm))} m² × ${formatZar(Math.round(compRate))}/m² × ${SIZE_ADJUSTMENT_DAMPING} damping`,
      });
    }
  } else if (!c.floorSizeSqm) {
    flags.push('No floor size for this comparable, so no size adjustment was made.');
  }

  if (subject.bedrooms != null && c.bedrooms != null && subject.bedrooms !== c.bedrooms) {
    const delta = subject.bedrooms - c.bedrooms;
    adjustments.push({
      reason: `${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'bedroom' : 'bedrooms'} ${delta > 0 ? 'more' : 'fewer'}`,
      amountZar: Math.round(c.price * BEDROOM_ADJUSTMENT_PCT * delta),
      basis: `${(BEDROOM_ADJUSTMENT_PCT * 100).toFixed(0)}% per bedroom`,
    });
  }

  if (subject.bathrooms != null && c.bathrooms != null && subject.bathrooms !== c.bathrooms) {
    const delta = subject.bathrooms - c.bathrooms;
    adjustments.push({
      reason: `${Math.abs(delta)} ${Math.abs(delta) === 1 ? 'bathroom' : 'bathrooms'} ${delta > 0 ? 'more' : 'fewer'}`,
      amountZar: Math.round(c.price * BATHROOM_ADJUSTMENT_PCT * delta),
      basis: `${(BATHROOM_ADJUSTMENT_PCT * 100).toFixed(0)}% per bathroom`,
    });
  }

  // Time — applied only with a real trend figure.
  if (trend != null && ageMonths != null && ageMonths > 1) {
    const amount = c.price * trend * (ageMonths / 12);
    adjustments.push({
      reason: `Sold ${Math.round(ageMonths)} months ago`,
      amountZar: Math.round(amount),
      basis: `${(trend * 100).toFixed(1)}% a year, pro-rated`,
    });
  }

  if (!c.isSoldPrice) flags.push('Asking price, not an achieved sale.');

  const adjustedPrice = c.price + adjustments.reduce((sum, a) => sum + a.amountZar, 0);

  return {
    id: c.id,
    addressLine: c.addressLine,
    basePrice: c.price,
    adjustments,
    adjustedPrice: Math.round(adjustedPrice),
    pricePerSqm: compRate != null ? Math.round(compRate) : null,
    isSoldPrice: c.isSoldPrice,
    saleDate: c.saleDate ?? null,
    excluded,
    exclusionReason,
    flags,
  };
}

function buildSummary(args: {
  subject: SubjectProperty;
  low: number;
  high: number;
  midpoint: number;
  used: number;
  confidence: AssessmentResult['confidence'];
  flags: string[];
  missingInputs: string[];
  pricePerSqm: number | null;
}): string {
  const { subject, low, high, midpoint, used, confidence, flags, missingInputs, pricePerSqm } = args;
  const parts = [
    `${subject.addressLine}: on ${used} adjusted comparable${used === 1 ? '' : 's'}, the indicated range is ` +
      `${formatZar(Math.round(low))} to ${formatZar(Math.round(high))}, around ${formatZar(Math.round(midpoint))}` +
      (pricePerSqm ? ` (${formatZar(pricePerSqm)}/m²)` : '') +
      `. Confidence: ${confidence}.`,
  ];
  if (missingInputs.length) parts.push(`Still needed: ${missingInputs.join('; ')}.`);
  if (flags.length) parts.push(flags.join(' '));
  parts.push('The range is an analysis of comparable evidence, not a valuation. The pricing opinion is Mandy’s.');
  return parts.join(' ');
}

function monthsBetween(c: { saleDate?: Date | null }, now: Date): number | null {
  if (!c.saleDate) return null;
  return (now.getTime() - c.saleDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function medianAbsoluteDeviation(values: number[], med: number | null): number | null {
  if (!values.length || med == null) return null;
  return median(values.map((v) => Math.abs(v - med)));
}

/** Linear-interpolated quantile over a pre-sorted array. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const lower = sorted[base]!;
  const upper = sorted[base + 1];
  return upper != null ? lower + rest * (upper - lower) : lower;
}
