import { describe, expect, it } from 'vitest';
import { assess, median, quantile, type ComparableInput, type SubjectProperty } from './market-assessment';

const NOW = new Date('2026-09-07T00:00:00Z');

const subject: SubjectProperty = {
  addressLine: '14 Protea Street, Sedgefield',
  propertyType: 'house',
  bedrooms: 3,
  bathrooms: 2,
  floorSizeSqm: 180,
  landSizeSqm: 900,
  condition: 'good',
};

function comp(over: Partial<ComparableInput> & { id: string; price: number }): ComparableInput {
  return {
    addressLine: `${over.id} Street`,
    isSoldPrice: true,
    floorSizeSqm: 180,
    bedrooms: 3,
    bathrooms: 2,
    distanceKm: 2,
    saleDate: new Date('2026-06-01T00:00:00Z'),
    sourceName: 'Deeds record',
    ...over,
  };
}

describe('market assessment', () => {
  it('produces a range with traceable workings', () => {
    const r = assess({
      subject,
      comparables: [
        comp({ id: 'a', price: 4_000_000 }),
        comp({ id: 'b', price: 4_200_000 }),
        comp({ id: 'c', price: 4_400_000 }),
        comp({ id: 'd', price: 4_300_000 }),
        comp({ id: 'e', price: 4_100_000 }),
      ],
      now: NOW,
    });

    expect(r.status).toBe('PREPARED');
    expect(r.recommendedLow).toBeLessThan(r.midpoint!);
    expect(r.recommendedHigh).toBeGreaterThan(r.midpoint!);
    expect(r.midpoint).toBe(4_200_000);
    expect(r.pricePerSqm).toBe(Math.round(4_200_000 / 180));
    // Every step a reviewer would want to check is written down.
    expect(r.workings.steps.join(' ')).toMatch(/Median/);
    expect(r.workings.adjustedValues).toHaveLength(5);
  });

  it('refuses to produce a range from too few comparables, and says what it needs', () => {
    const r = assess({ subject, comparables: [comp({ id: 'a', price: 4_000_000 })], now: NOW });
    expect(r.status).toBe('NEEDS_INPUT');
    expect(r.recommendedLow).toBeNull();
    expect(r.missingInputs.join(' ')).toMatch(/at least 3 usable comparables/);
    expect(r.executiveSummary).toMatch(/cannot be produced/);
  });

  it('adjusts for size, and shows the arithmetic', () => {
    const r = assess({
      subject,
      comparables: [
        comp({ id: 'small', price: 3_600_000, floorSizeSqm: 150 }),
        comp({ id: 'b', price: 4_200_000 }),
        comp({ id: 'c', price: 4_300_000 }),
      ],
      now: NOW,
    });
    const small = r.comparables.find((c) => c.id === 'small')!;
    const sizeAdj = small.adjustments.find((a) => a.reason.includes('m²'));
    expect(sizeAdj).toBeDefined();
    // Subject is 30 m² larger; comp rate 24 000/m²; damped by half → +360 000.
    expect(sizeAdj!.amountZar).toBe(360_000);
    expect(small.adjustedPrice).toBe(3_960_000);
    expect(sizeAdj!.basis).toContain('damping');
  });

  it('adjusts for bedrooms and bathrooms', () => {
    const r = assess({
      subject,
      comparables: [comp({ id: 'a', price: 4_000_000, bedrooms: 2, bathrooms: 1 }), comp({ id: 'b', price: 4_200_000 }), comp({ id: 'c', price: 4_300_000 })],
      now: NOW,
    });
    const a = r.comparables.find((c) => c.id === 'a')!;
    expect(a.adjustments.find((x) => x.reason.includes('bedroom'))?.amountZar).toBe(120_000);
    expect(a.adjustments.find((x) => x.reason.includes('bathroom'))?.amountZar).toBe(80_000);
  });

  it('excludes comparables that are too far away or too old, and says why', () => {
    const r = assess({
      subject,
      comparables: [
        comp({ id: 'far', price: 4_000_000, distanceKm: 40 }),
        comp({ id: 'old', price: 4_000_000, saleDate: new Date('2023-01-01T00:00:00Z') }),
        comp({ id: 'b', price: 4_200_000 }),
        comp({ id: 'c', price: 4_300_000 }),
        comp({ id: 'd', price: 4_100_000 }),
      ],
      now: NOW,
    });
    expect(r.usedCount).toBe(3);
    expect(r.comparables.find((c) => c.id === 'far')?.exclusionReason).toMatch(/km away/);
    expect(r.comparables.find((c) => c.id === 'old')?.exclusionReason).toMatch(/months ago/);
    expect(r.workings.steps.join(' ')).toMatch(/Excluded/);
  });

  it('flags an unusual comparable rather than dropping it silently', () => {
    const r = assess({
      subject,
      comparables: [
        comp({ id: 'a', price: 4_000_000 }),
        comp({ id: 'b', price: 4_100_000 }),
        comp({ id: 'c', price: 4_200_000 }),
        comp({ id: 'wild', price: 9_000_000 }),
      ],
      now: NOW,
    });
    const wild = r.comparables.find((c) => c.id === 'wild')!;
    expect(wild.excluded).toBe(false);
    expect(wild.flags.join(' ')).toMatch(/Unusual/);
  });
});

describe('the engine does not invent data it does not have', () => {
  it('makes no time adjustment without a market trend, and says so', () => {
    const r = assess({
      subject,
      comparables: [comp({ id: 'a', price: 4_000_000 }), comp({ id: 'b', price: 4_200_000 }), comp({ id: 'c', price: 4_300_000 })],
      now: NOW,
    });
    expect(r.comparables.every((c) => !c.adjustments.some((a) => a.reason.includes('months ago')))).toBe(true);
    expect(r.flags.join(' ')).toMatch(/No market trend/);
  });

  it('applies a time adjustment when a real trend figure is supplied', () => {
    const r = assess({
      subject,
      comparables: [comp({ id: 'a', price: 4_000_000 }), comp({ id: 'b', price: 4_200_000 }), comp({ id: 'c', price: 4_300_000 })],
      annualMarketTrend: 0.06,
      now: NOW,
    });
    const a = r.comparables.find((c) => c.id === 'a')!;
    const timeAdj = a.adjustments.find((x) => x.reason.includes('months ago'))!;
    expect(timeAdj.amountZar).toBeGreaterThan(0);
    expect(timeAdj.basis).toContain('6.0% a year');
  });

  it('warns loudly when only asking prices are available', () => {
    const r = assess({
      subject,
      comparables: [
        comp({ id: 'a', price: 4_000_000, isSoldPrice: false }),
        comp({ id: 'b', price: 4_200_000, isSoldPrice: false }),
        comp({ id: 'c', price: 4_300_000, isSoldPrice: false }),
      ],
      now: NOW,
    });
    expect(r.flags.join(' ')).toMatch(/asking price/i);
    expect(r.flags.join(' ')).toMatch(/cannot estimate/);
    expect(r.confidence).not.toBe('good');
  });

  it('reports missing subject details instead of assuming them', () => {
    const r = assess({
      subject: { addressLine: 'Unknown plot' },
      comparables: [comp({ id: 'a', price: 4_000_000 }), comp({ id: 'b', price: 4_200_000 }), comp({ id: 'c', price: 4_300_000 })],
      now: NOW,
    });
    expect(r.missingInputs).toContain('subject floor size');
    expect(r.missingInputs).toContain('subject condition');
    expect(r.pricePerSqm).toBeNull();
  });

  it('always states that the pricing opinion belongs to a person', () => {
    const r = assess({
      subject,
      comparables: [comp({ id: 'a', price: 4_000_000 }), comp({ id: 'b', price: 4_200_000 }), comp({ id: 'c', price: 4_300_000 })],
      now: NOW,
    });
    expect(r.executiveSummary).toMatch(/not a valuation/);
  });
});

describe('confidence reflects the evidence', () => {
  const five = (prices: number[]) => prices.map((p, i) => comp({ id: String(i), price: p, saleDate: new Date('2026-08-01T00:00:00Z') }));

  it('is good with several recent, tight, sold comparables', () => {
    const r = assess({ subject, comparables: five([4_000_000, 4_050_000, 4_100_000, 4_150_000, 4_200_000]), now: NOW });
    expect(r.confidence).toBe('good');
  });

  it('drops when the evidence is scattered', () => {
    const r = assess({ subject, comparables: five([3_000_000, 4_000_000, 5_000_000, 6_500_000, 2_500_000]), now: NOW });
    expect(r.confidence).toBe('low');
  });
});

describe('statistics helpers', () => {
  it('computes a median for odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('interpolates quantiles', () => {
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(quantile([], 0.5)).toBe(0);
  });
});
