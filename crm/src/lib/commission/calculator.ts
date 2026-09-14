import * as money from '../money.ts';
import type { CommissionBasis } from './types.ts';

// ---------------------------------------------------------------------
// The calculator
// ---------------------------------------------------------------------

export interface CalculationInput {
  basis: CommissionBasis;
  ratePercent?: string | null;
  fixedAmount?: string | null;
  months?: string | null;
  /** The sale price, or the monthly rent where the basis is months of rent. */
  baseAmount: string;
  vatApplicable: boolean;
  vatRate: string | number;
  minimumAmount?: string | null;
  deductions?: (string | number)[];
  /** An amount somebody typed in place of what the rule works out. */
  overrideExclVat?: string | null;
}

export interface Calculation {
  /** What the percentage or the months were applied to. */
  appliedTo: string;
  calculatedExclVat: string;
  grossExclVat: string;
  isOverridden: boolean;
  vatAmount: string;
  grossInclVat: string;
  deductionsTotal: string;
  netExclVat: string;
  /** Plain words for what was done, shown beside the figures. */
  workings: string[];
}

/**
 * Works out one commission, showing its arithmetic.
 *
 * The workings are part of the output on purpose: an agent querying their
 * statement should be able to read how the figure was reached rather than
 * being told to trust it.
 */
export function calculate(input: CalculationInput): Calculation {
  const workings: string[] = [];

  // What the rate applies to. Months of rent multiply the monthly figure;
  // a percentage of annual rent needs twelve months of it.
  let appliedTo = money.normalise(input.baseAmount);
  let calculated: string;

  switch (input.basis) {
    case 'percent_of_value': {
      const rate = input.ratePercent ?? '0';
      calculated = money.percentOf(appliedTo, rate);
      workings.push(`${money.trimTrailingZeros(rate)}% of ${appliedTo}`);
      break;
    }
    case 'fixed_amount': {
      calculated = money.normalise(input.fixedAmount ?? '0');
      workings.push(`A fixed ${calculated}, not related to the price`);
      break;
    }
    case 'months_of_rent': {
      const months = input.months ?? '0';
      calculated = money.multiply(appliedTo, months);
      workings.push(`${money.trimTrailingZeros(months)} × the monthly rent of ${appliedTo}`);
      break;
    }
    case 'percent_of_annual_rent': {
      appliedTo = money.multiply(input.baseAmount, 12);
      const rate = input.ratePercent ?? '0';
      calculated = money.percentOf(appliedTo, rate);
      workings.push(`${money.trimTrailingZeros(rate)}% of a year's rent (${appliedTo})`);
      break;
    }
  }

  if (input.minimumAmount && money.compare(calculated, input.minimumAmount) < 0) {
    workings.push(`Raised to the office minimum of ${money.normalise(input.minimumAmount)}`);
    calculated = money.normalise(input.minimumAmount);
  }

  const isOverridden =
    input.overrideExclVat !== null &&
    input.overrideExclVat !== undefined &&
    input.overrideExclVat !== '' &&
    money.compare(input.overrideExclVat, calculated) !== 0;

  const grossExclVat = isOverridden
    ? money.normalise(input.overrideExclVat as string)
    : calculated;
  if (isOverridden) {
    workings.push(`Overridden to ${grossExclVat}, instead of the ${calculated} the rule works out`);
  }

  const vatAmount = input.vatApplicable ? money.percentOf(grossExclVat, input.vatRate) : '0.00';
  if (input.vatApplicable) {
    workings.push(`VAT at ${money.trimTrailingZeros(input.vatRate)}% adds ${vatAmount}`);
  } else {
    workings.push('No VAT, because the office recorded this commission as not carrying it');
  }
  const grossInclVat = money.add(grossExclVat, vatAmount);

  const deductionsTotal = money.sum(input.deductions ?? []);
  // VAT belongs to SARS, so it is never in anybody's share and never
  // reduced by a deduction.
  const netExclVat = money.subtractToZero(grossExclVat, deductionsTotal);
  if (!money.isZero(deductionsTotal)) {
    workings.push(`Less ${deductionsTotal} of deductions, leaving ${netExclVat} to share out`);
  }

  return {
    appliedTo,
    calculatedExclVat: calculated,
    grossExclVat,
    isOverridden,
    vatAmount,
    grossInclVat,
    deductionsTotal,
    netExclVat,
    workings,
  };
}
