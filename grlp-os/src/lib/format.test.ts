import { describe, expect, it } from 'vitest';
import { formatDuration, formatZar, formatZarCompact } from './format';

describe('South African formatting', () => {
  it('writes rand the way the brand guide does: no gap after the R, spaces between groups', () => {
    expect(formatZar(250_000)).toBe('R250 000');
    expect(formatZar(4_250_000)).toBe('R4 250 000');
  });

  it('uses ordinary spaces, so the text survives being copied into Word', () => {
    expect(formatZar(4_250_000)).not.toMatch(/\u00a0/);
  });

  it('shows cents when asked', () => {
    expect(formatZar(1234.5, { decimals: true })).toBe('R1 234,50');
  });

  it('compacts millions for dashboard tiles', () => {
    expect(formatZarCompact(4_200_000)).toBe('R4,2 m');
    expect(formatZarCompact(850_000)).toBe('R850 k');
  });

  it('reads durations the way the hours-recovered metric is spoken', () => {
    expect(formatDuration(200)).toBe('3 h 20 m');
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(38)).toBe('38 m');
    expect(formatDuration(-5)).toBe('0 m');
  });
});
