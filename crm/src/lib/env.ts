/**
 * Environment configuration.
 *
 * Everything is read once, on the server only. Nothing in here is ever
 * imported from a client component, and no value is exposed to the browser.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not configured. Copy .env.example to .env.local and set it before starting the CRM.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  databaseUrl: () => required('DATABASE_URL'),
  adminDatabaseUrl: () => process.env.DATABASE_ADMIN_URL ?? required('DATABASE_URL'),
  sessionSecret: () => required('SESSION_SECRET'),

  /** Only company addresses may sign in. Configurable for a future domain change. */
  allowedEmailDomains: (): string[] =>
    (process.env.ALLOWED_EMAIL_DOMAINS ?? 'grproperty.co.za')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean),

  sessionHours: () => Number(process.env.SESSION_HOURS ?? 12),
  isProduction: () => process.env.NODE_ENV === 'production',

  storage: () => ({
    driver: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 'supabase',
    localPath: process.env.STORAGE_LOCAL_PATH ?? './storage',
    supabaseUrl: optional('SUPABASE_URL'),
    supabaseServiceKey: optional('SUPABASE_SERVICE_ROLE_KEY'),
    supabaseBucket: process.env.SUPABASE_STORAGE_BUCKET ?? 'grlp-private',
    maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024),
  }),

  /**
   * Pepper for the one-way fingerprint of identity numbers. The fingerprint
   * is what makes duplicate detection on an ID possible without the ID being
   * readable, so this value is as sensitive as the numbers themselves.
   */
  identityPepper: () => required('IDENTITY_PEPPER'),
};
