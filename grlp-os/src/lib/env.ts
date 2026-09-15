/**
 * Environment checks.
 *
 * The failures worth catching are the quiet ones: a system that starts happily
 * with no SESSION_SECRET and issues sessions nobody can trust, or one pointed at
 * a database that is not there. Those are found here, at startup, with a message
 * that says what to do — not at 3pm when somebody cannot sign in.
 */

export interface EnvIssue {
  key: string;
  severity: 'fatal' | 'warning';
  message: string;
}

export interface EnvReport {
  ok: boolean;
  issues: EnvIssue[];
  /** Integrations that are configured, for the startup log. */
  connected: string[];
  /** Features unavailable because their credentials are absent. */
  degraded: string[];
}

/** Required for the system to run at all. */
const REQUIRED: Array<{ key: string; check?: (v: string) => string | null }> = [
  {
    key: 'DATABASE_URL',
    check: (v) =>
      /^postgres(ql)?:\/\//.test(v) ? null : 'must be a PostgreSQL connection string starting postgresql://',
  },
  {
    key: 'SESSION_SECRET',
    check: (v) =>
      v.length >= 32
        ? null
        : 'must be at least 32 characters — generate one with: openssl rand -base64 48',
  },
];

/** Optional, but the system is less useful without them. */
const OPTIONAL: Array<{ keys: string[]; name: string; without: string }> = [
  {
    keys: ['ANTHROPIC_API_KEY'],
    name: 'Claude',
    without: 'drafting and free-text summarising are unavailable; everything else still runs',
  },
  {
    keys: ['MAIL_IMAP_HOST', 'MAIL_SMTP_HOST', 'MAIL_USER', 'MAIL_PASSWORD'],
    name: 'Mailbox',
    without: 'no mail is read or sent; the follow-up engine prepares and stops',
  },
  {
    keys: ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN'],
    name: 'Dropbox',
    without: 'master copies and the knowledge base cannot be imported',
  },
  {
    keys: ['WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'],
    name: 'WhatsApp live feed',
    without: 'conversations come in from chat exports only',
  },
];

/** A secret that is obviously a placeholder is worse than a missing one. */
const PLACEHOLDERS = [/change[-_ ]?me/i, /^your[-_]/i, /dev-only/i, /^xxx+$/i, /placeholder/i, /^secret$/i];

export function checkEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): EnvReport {
  const issues: EnvIssue[] = [];

  for (const { key, check } of REQUIRED) {
    const value = env[key]?.trim();
    if (!value) {
      issues.push({ key, severity: 'fatal', message: `${key} is not set.` });
      continue;
    }
    const problem = check?.(value);
    if (problem) issues.push({ key, severity: 'fatal', message: `${key} ${problem}.` });
  }

  const secret = env.SESSION_SECRET?.trim();
  if (secret && PLACEHOLDERS.some((rx) => rx.test(secret))) {
    issues.push({
      key: 'SESSION_SECRET',
      severity: env.NODE_ENV === 'production' ? 'fatal' : 'warning',
      message: 'SESSION_SECRET still looks like an example value. Generate a real one before anyone signs in.',
    });
  }

  const connected: string[] = [];
  const degraded: string[] = [];
  for (const { keys, name, without } of OPTIONAL) {
    const missing = keys.filter((k) => !env[k]?.trim());
    if (missing.length === 0) connected.push(name);
    else degraded.push(`${name}: ${without}`);
  }

  return { ok: !issues.some((i) => i.severity === 'fatal'), issues, connected, degraded };
}

/** The startup message. Written to be read by whoever is deploying it. */
export function describeEnv(report: EnvReport): string {
  const lines: string[] = [];

  if (!report.ok) {
    lines.push('The system cannot start:');
    for (const i of report.issues.filter((x) => x.severity === 'fatal')) lines.push(`  ✗ ${i.message}`);
    lines.push('');
    lines.push('Copy .env.example to .env and fill in the required values.');
    return lines.join('\n');
  }

  for (const i of report.issues.filter((x) => x.severity === 'warning')) lines.push(`  ! ${i.message}`);
  lines.push(report.connected.length ? `Connected: ${report.connected.join(', ')}.` : 'No integrations connected.');
  for (const d of report.degraded) lines.push(`  · ${d}`);
  return lines.join('\n');
}

/** Throws on a fatal problem, so a misconfigured container stops rather than limps. */
export function assertEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): void {
  const report = checkEnv(env);
  if (!report.ok) throw new Error(describeEnv(report));
}
