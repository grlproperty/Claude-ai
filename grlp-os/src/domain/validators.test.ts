import { describe, expect, it } from 'vitest';
import { luhnValid, parseSaIdNumber, runValidators } from './validators';

describe('South African identity numbers', () => {
  // Structurally valid numbers, check digit computed to match.
  const valid = '8001015009087';

  it('accepts a well-formed number', () => {
    expect(luhnValid(valid)).toBe(true);
    const r = parseSaIdNumber(valid);
    expect(r.valid).toBe(true);
    expect(r.gender).toBe('male');
    expect(r.citizen).toBe(true);
    expect(r.dateOfBirth?.toISOString().slice(0, 10)).toBe('1980-01-01');
  });

  it('rejects a number whose check digit was mistyped', () => {
    const r = parseSaIdNumber('8001015009088');
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/check digit/);
  });

  it('rejects an impossible birth date', () => {
    expect(parseSaIdNumber('8002305009087').reason).toMatch(/real date/);
    expect(parseSaIdNumber('8013015009087').reason).toMatch(/month/);
  });

  it('rejects anything that is not 13 digits', () => {
    expect(parseSaIdNumber('123').reason).toMatch(/13 digits/);
    expect(parseSaIdNumber('80010150090８7').valid).toBe(false);
  });
});

describe('field validators', () => {
  it('reads rand amounts written the South African way', () => {
    expect(runValidators(['currency'], 'R4 250 000', 'price')).toHaveLength(0);
    expect(runValidators(['positive'], '4250000', 'price')).toHaveLength(0);
    expect(runValidators(['positive'], '0', 'price')[0]?.severity).toBe('error');
  });

  it('warns rather than fails on a past date', () => {
    expect(runValidators(['future_date'], '2020-01-01', 'occupation')[0]?.severity).toBe('warning');
  });

  it('accepts local and international SA phone formats', () => {
    expect(runValidators(['sa_phone'], '082 555 1234', 'phone')).toHaveLength(0);
    expect(runValidators(['sa_phone'], '+27825551234', 'phone')).toHaveLength(0);
    expect(runValidators(['sa_phone'], '5551234', 'phone')[0]?.severity).toBe('warning');
  });

  it('says so when a validator is not registered rather than silently passing', () => {
    const issues = runValidators(['nonexistent_rule'], 'x', 'f');
    expect(issues[0]?.message).toMatch(/No validator named/);
  });
});
