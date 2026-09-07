import { describe, expect, it } from 'vitest';
import { formatDuration, formatZar, formatZarCompact } from './format';

describe('South African formatting', () => {
  it('groups rand with a space, not a comma', () => {
    expect(formatZar(250_000)).toMatch(/R\s?250\s000/);
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
