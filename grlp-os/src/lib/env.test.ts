import { describe, expect, it } from 'vitest';

import { assertEnv, checkEnv, describeEnv } from './env';

const complete = {
  DATABASE_URL: 'postgresql://grlp:pw@db:5432/grlp_os',
  SESSION_SECRET: 'w7Qd2vX9pLk4Rt8NmB3jFhY6sZaC1eUgKoIrVnTxMlPw',
};

describe('checkEnv', () => {
  it('passes on a complete configuration', () => {
    const report = checkEnv(complete);
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('fails when a required value is absent', () => {
    const report = checkEnv({ SESSION_SECRET: complete.SESSION_SECRET });
    expect(report.ok).toBe(false);
    expect(report.issues.map((i) => i.key)).toContain('DATABASE_URL');
  });

  it('treats whitespace as absent', () => {
    const report = checkEnv({ ...complete, DATABASE_URL: '   ' });
    expect(report.ok).toBe(false);
  });

  it('rejects a connection string for the wrong kind of database', () => {
    const report = checkEnv({ ...complete, DATABASE_URL: 'mysql://grlp:pw@db:3306/grlp_os' });
    expect(report.ok).toBe(false);
    expect(report.issues[0]?.message).toContain('PostgreSQL');
  });

  it('accepts both postgres:// and postgresql://', () => {
    expect(checkEnv({ ...complete, DATABASE_URL: 'postgres://grlp:pw@db:5432/grlp_os' }).ok).toBe(true);
  });

  it('rejects a session secret too short to be worth signing with', () => {
    const report = checkEnv({ ...complete, SESSION_SECRET: 'short' });
    expect(report.ok).toBe(false);
    expect(report.issues[0]?.message).toContain('openssl rand');
  });

  // A placeholder secret is the dangerous case: long enough to look deliberate,
  // identical on every installation that copied the same example.
  it('refuses a placeholder secret in production', () => {
    const report = checkEnv({
      ...complete,
      SESSION_SECRET: 'change-me-change-me-change-me-change-me',
      NODE_ENV: 'production',
    });
    expect(report.ok).toBe(false);
  });

  it('only warns about a placeholder secret outside production', () => {
    const report = checkEnv({
      ...complete,
      SESSION_SECRET: 'change-me-change-me-change-me-change-me',
      NODE_ENV: 'development',
    });
    expect(report.ok).toBe(true);
    expect(report.issues.map((i) => i.severity)).toEqual(['warning']);
  });

  it('names an integration as connected only when every credential is present', () => {
    const partial = checkEnv({
      ...complete,
      MAIL_IMAP_HOST: 'mail.grproperty.co.za',
      MAIL_SMTP_HOST: 'mail.grproperty.co.za',
      MAIL_USER: 'mandy@grproperty.co.za',
      // MAIL_PASSWORD deliberately absent
    });
    expect(partial.connected).not.toContain('Mailbox');
    expect(partial.degraded.some((d) => d.startsWith('Mailbox:'))).toBe(true);
  });

  it('reports what each absent integration costs, rather than only that it is absent', () => {
    const report = checkEnv(complete);
    expect(report.degraded).toContain(
      'Claude: drafting and free-text summarising are unavailable; everything else still runs',
    );
  });
});

describe('describeEnv', () => {
  it('tells a failing installation what to do next', () => {
    const text = describeEnv(checkEnv({}));
    expect(text).toContain('DATABASE_URL is not set.');
    expect(text).toContain('.env.example');
  });

  it('lists degraded features when the configuration is sound', () => {
    const text = describeEnv(checkEnv(complete));
    expect(text).toContain('No integrations connected.');
    expect(text).toContain('Dropbox');
  });
});

describe('assertEnv', () => {
  it('throws with the explanation attached', () => {
    expect(() => assertEnv({})).toThrow(/SESSION_SECRET is not set/);
  });

  it('is silent when the configuration is sound', () => {
    expect(() => assertEnv(complete)).not.toThrow();
  });
});
