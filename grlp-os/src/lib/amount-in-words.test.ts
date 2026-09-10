import { describe, expect, it } from 'vitest';
import { numberInWords, periodInWords, randFiguresAndWords, randInWords } from './amount-in-words';

describe('amounts in words, as a South African contract writes them', () => {
  it('writes a typical purchase price', () => {
    expect(randInWords(4_250_000)).toBe('FOUR MILLION TWO HUNDRED AND FIFTY THOUSAND RAND');
  });

  it('writes a deposit', () => {
    expect(randInWords(425_000)).toBe('FOUR HUNDRED AND TWENTY-FIVE THOUSAND RAND');
  });

  it('puts "and" before a final group under a hundred, and not otherwise', () => {
    expect(numberInWords(1_000_050)).toBe('ONE MILLION AND FIFTY');
    expect(numberInWords(1_000_200)).toBe('ONE MILLION TWO HUNDRED');
    expect(numberInWords(1_250_000)).toBe('ONE MILLION TWO HUNDRED AND FIFTY THOUSAND');
  });

  it('handles the awkward numbers', () => {
    expect(numberInWords(0)).toBe('ZERO');
    expect(numberInWords(15)).toBe('FIFTEEN');
    expect(numberInWords(21)).toBe('TWENTY-ONE');
    expect(numberInWords(100)).toBe('ONE HUNDRED');
    expect(numberInWords(101)).toBe('ONE HUNDRED AND ONE');
    expect(numberInWords(999_999)).toBe('NINE HUNDRED AND NINETY-NINE THOUSAND NINE HUNDRED AND NINETY-NINE');
  });

  it('includes cents only when there are cents', () => {
    expect(randInWords(1_500)).toBe('ONE THOUSAND FIVE HUNDRED RAND');
    expect(randInWords(1_500.5)).toBe('ONE THOUSAND FIVE HUNDRED RAND AND FIFTY CENTS');
  });

  it('writes figures and words together the way the contract does', () => {
    const out = randFiguresAndWords(4_250_000);
    expect(out).toMatch(/R\s?4\s250\s000/);
    expect(out).toContain('(FOUR MILLION TWO HUNDRED AND FIFTY THOUSAND RAND)');
  });

  it('writes periods the same way', () => {
    expect(periodInWords(7, 'working days')).toBe('7 (SEVEN) WORKING DAYS');
    expect(periodInWords(21, 'days')).toBe('21 (TWENTY-ONE) DAYS');
  });

  it('refuses an amount it cannot write correctly rather than guessing', () => {
    expect(() => numberInWords(Number.NaN)).toThrow(/not a number/);
    expect(() => numberInWords(1e13)).toThrow(/larger than/);
  });
});
