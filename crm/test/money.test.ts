import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as money from '../src/lib/money.ts';
import { calculate } from '../src/lib/commission/calculator.ts';

/**
 * Money arithmetic (spec 62, 66).
 *
 * These tests exist because a commission is somebody's pay. Every figure
 * is checked against what a person with a calculator would write down, and
 * the cases chosen are the ones where floating point goes wrong.
 */

describe('exact amounts', () => {
  it('reads an amount however it was typed', () => {
    assert.equal(money.normalise('1250000'), '1250000.00');
    assert.equal(money.normalise('1250000.5'), '1250000.50');
    assert.equal(money.normalise('R 2 950 000'), '2950000.00');
    assert.equal(money.normalise('1,250,000.55'), '1250000.55');
    assert.equal(money.normalise(0), '0.00');
  });

  it('refuses something that is not an amount', () => {
    assert.throws(() => money.normalise('about a million'), money.MoneyError);
    assert.throws(() => money.normalise(''), money.MoneyError);
  });

  it('adds without the error a float would introduce', () => {
    // 0.1 + 0.2 is the canonical floating point failure.
    assert.equal(money.add('0.10', '0.20'), '0.30');
    assert.equal(money.add('1234567.89', '0.11'), '1234568.00');
    assert.equal(money.sum(['1.10', '2.20', '3.30']), '6.60');
  });

  it('rounds half away from zero, as an invoice does', () => {
    assert.equal(money.normalise('1.005'), '1.01');
    assert.equal(money.normalise('1.004'), '1.00');
    assert.equal(money.normalise('2.675'), '2.68');
  });

  it('works out a percentage to the cent', () => {
    assert.equal(money.percentOf('2950000', '5'), '147500.00');
    assert.equal(money.percentOf('2950000', '7.5'), '221250.00');
    // A rate with four decimals, which a mandate can genuinely carry.
    assert.equal(money.percentOf('1875000', '4.5625'), '85546.88');
    assert.equal(money.percentOf('100', '15'), '15.00');
  });

  it('multiplies by a fractional count of months', () => {
    assert.equal(money.multiply('12500', '1'), '12500.00');
    assert.equal(money.multiply('12500', '1.5'), '18750.00');
    assert.equal(money.multiply('8250', '0.75'), '6187.50');
  });

  it('never lets a subtraction run below zero where that makes no sense', () => {
    assert.equal(money.subtractToZero('100.00', '150.00'), '0.00');
    assert.equal(money.subtract('100.00', '150.00'), '-50.00');
  });
});

describe('sharing an amount out', () => {
  it('gives the parts back adding up to the whole', () => {
    const parts = money.apportion('100.00', ['33.333', '33.333', '33.334']);
    assert.equal(money.sum(parts), '100.00');
  });

  it('handles thirds of an odd amount without losing a cent', () => {
    const parts = money.apportion('147500.01', ['33.333', '33.333', '33.334']);
    assert.equal(money.sum(parts), '147500.01');
  });

  it('leaves shares alone when they deliberately do not total the whole', () => {
    // 40% of 1000 is 400 and nothing invents the missing 600.
    const parts = money.apportion('1000.00', ['40']);
    assert.deepEqual(parts, ['400.00']);
  });

  it('splits fifty-fifty exactly', () => {
    assert.deepEqual(money.apportion('147500.00', ['50', '50']), ['73750.00', '73750.00']);
  });
});

describe('the commission calculator', () => {
  it('works out a percentage of the price and shows its arithmetic', () => {
    const result = calculate({
      basis: 'percent_of_value',
      ratePercent: '5',
      baseAmount: '2950000',
      vatApplicable: true,
      vatRate: 15,
    });
    assert.equal(result.calculatedExclVat, '147500.00');
    assert.equal(result.vatAmount, '22125.00');
    assert.equal(result.grossInclVat, '169625.00');
    assert.equal(result.netExclVat, '147500.00');
    assert.equal(result.isOverridden, false);
    assert.ok(result.workings.some((line) => line.includes('5% of 2950000.00')));
  });

  it('charges no VAT when the office recorded that it does not apply', () => {
    const result = calculate({
      basis: 'percent_of_value',
      ratePercent: '5',
      baseAmount: '2950000',
      vatApplicable: false,
      vatRate: 15,
    });
    assert.equal(result.vatAmount, '0.00');
    assert.equal(result.grossInclVat, '147500.00');
    assert.ok(result.workings.some((line) => /No VAT/i.test(line)));
  });

  it("works a letting commission from the rent, not from a price", () => {
    const result = calculate({
      basis: 'months_of_rent',
      months: '1',
      baseAmount: '18500',
      vatApplicable: true,
      vatRate: 15,
    });
    assert.equal(result.calculatedExclVat, '18500.00');
    assert.equal(result.appliedTo, '18500.00');
  });

  it("uses a year's rent where the rule says so", () => {
    const result = calculate({
      basis: 'percent_of_annual_rent',
      ratePercent: '8',
      baseAmount: '18500',
      vatApplicable: true,
      vatRate: 15,
    });
    assert.equal(result.appliedTo, '222000.00');
    assert.equal(result.calculatedExclVat, '17760.00');
  });

  it('raises a small commission to the office minimum, and says so', () => {
    const result = calculate({
      basis: 'percent_of_value',
      ratePercent: '5',
      baseAmount: '100000',
      vatApplicable: true,
      vatRate: 15,
      minimumAmount: '25000',
    });
    assert.equal(result.calculatedExclVat, '25000.00');
    assert.ok(result.workings.some((line) => /minimum/i.test(line)));
  });

  it('keeps the calculated figure beside an override, rather than replacing it', () => {
    const result = calculate({
      basis: 'percent_of_value',
      ratePercent: '5',
      baseAmount: '2950000',
      vatApplicable: true,
      vatRate: 15,
      overrideExclVat: '120000',
    });
    assert.equal(result.calculatedExclVat, '147500.00');
    assert.equal(result.grossExclVat, '120000.00');
    assert.equal(result.isOverridden, true);
    assert.ok(result.workings.some((line) => /Overridden to 120000.00/.test(line)));
  });

  it('does not call an identical figure an override', () => {
    const result = calculate({
      basis: 'percent_of_value',
      ratePercent: '5',
      baseAmount: '2950000',
      vatApplicable: true,
      vatRate: 15,
      overrideExclVat: '147500.00',
    });
    assert.equal(result.isOverridden, false);
  });

  it('takes deductions off what is shared out but not off the VAT', () => {
    const result = calculate({
      basis: 'percent_of_value',
      ratePercent: '5',
      baseAmount: '2950000',
      vatApplicable: true,
      vatRate: 15,
      deductions: ['10000', '5000.50'],
    });
    assert.equal(result.deductionsTotal, '15000.50');
    assert.equal(result.netExclVat, '132499.50');
    // VAT is worked out on the whole commission, because it belongs to SARS.
    assert.equal(result.vatAmount, '22125.00');
  });
});

describe('rates read the way a person writes them', () => {
  it('drops the trailing zeros Postgres adds', () => {
    assert.equal(money.trimTrailingZeros('5.0000'), '5');
    assert.equal(money.trimTrailingZeros('4.5625'), '4.5625');
    assert.equal(money.trimTrailingZeros('1.500'), '1.5');
    assert.equal(money.trimTrailingZeros('0.00'), '0');
    assert.equal(money.trimTrailingZeros('12'), '12');
    assert.equal(money.trimTrailingZeros(null), '');
  });
});
