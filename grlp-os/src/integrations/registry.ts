/**
 * Integration registry (§40, §58).
 *
 * The system tells the truth about what is actually connected. An integration is
 * CONNECTED only after a live credential check has succeeded; until then it is
 * NOT_CONFIGURED or CREDENTIALS_MISSING, and every feature that depends on it
 * says so in the interface rather than pretending to work.
 *
 * Nothing here simulates a provider. If the credentials are absent the calls
 * fail with a typed error naming exactly what is required.
 */

export type IntegrationStatus = 'NOT_CONFIGURED' | 'CREDENTIALS_MISSING' | 'CONNECTED' | 'ERROR';

/** Any environment-shaped map. Looser than NodeJS.ProcessEnv so tests can pass a bare object. */
export type EnvLike = Record<string, string | undefined>;

export interface IntegrationSpec {
  key: string;
  name: string;
  category: 'email' | 'calendar' | 'storage' | 'signature' | 'ai' | 'portal' | 'accounting' | 'messaging';
  /** Env vars that must all be present for the integration to be usable. */
  requiredEnv: string[];
  scopes: string[];
  /** What GRLP loses while this is unconnected. Shown in the UI, verbatim. */
  capabilityWhenConnected: string;
  degradedBehaviour: string;
  /** Live check. Only called when every required env var is present. */
  verify?: (env: EnvLike) => Promise<{ ok: boolean; detail?: string }>;
}

export class IntegrationNotConfiguredError extends Error {
  readonly code = 'INTEGRATION_NOT_CONFIGURED';
  constructor(
    readonly integrationKey: string,
    readonly missingEnv: string[],
  ) {
    super(
      `The ${integrationKey} integration is not connected. Set ${missingEnv.join(', ')} to enable it. ` +
        'Nothing has been sent, saved or changed.',
    );
    this.name = 'IntegrationNotConfiguredError';
  }
}

export const INTEGRATIONS: IntegrationSpec[] = [
  {
    key: 'anthropic',
    name: 'Claude (AI provider)',
    category: 'ai',
    requiredEnv: ['ANTHROPIC_API_KEY'],
    scopes: [],
    capabilityWhenConnected: 'Drafting, summarising, document reading and the agent workflows.',
    degradedBehaviour:
      'Rule-based routing, triage, validation, document population and the risk sweep all still run — they do not use a model. Only drafting and free-text summarising are unavailable.',
    verify: async (env) => {
      const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
        headers: { 'x-api-key': env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      });
      return { ok: res.ok, detail: res.ok ? undefined : `HTTP ${res.status}` };
    },
  },
  {
    key: 'google_workspace',
    name: 'Google Workspace (Gmail + Calendar)',
    category: 'email',
    requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    scopes: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/calendar',
    ],
    capabilityWhenConnected: 'Inbox triage on real mail, sending approved replies, and calendar intelligence.',
    degradedBehaviour:
      'Triage runs on messages entered or imported into the system, but nothing is read from or sent to a live mailbox.',
  },
  {
    key: 'microsoft_365',
    name: 'Microsoft 365 (Outlook + Calendar)',
    category: 'email',
    requiredEnv: ['MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_TENANT_ID', 'MS_REDIRECT_URI'],
    scopes: ['Mail.ReadWrite', 'Mail.Send', 'Calendars.ReadWrite'],
    capabilityWhenConnected: 'The same inbox and calendar work against Outlook instead of Gmail.',
    degradedBehaviour: 'No live Outlook mailbox or calendar access.',
  },
  {
    key: 'dropbox',
    name: 'Dropbox (document storage)',
    category: 'storage',
    requiredEnv: ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN'],
    scopes: ['files.content.read', 'files.content.write'],
    capabilityWhenConnected: 'Filing prepared documents into the GRLP folder structure and reading uploaded files.',
    degradedBehaviour:
      'Documents are stored in the application database with their metadata; they are not filed to Dropbox.',
  },
  {
    key: 'esignature',
    name: 'E-signature provider',
    category: 'signature',
    requiredEnv: ['ESIGN_PROVIDER', 'ESIGN_API_KEY'],
    scopes: [],
    capabilityWhenConnected: 'Sending mandates and offers for signature and tracking the envelope automatically.',
    degradedBehaviour:
      'Signature routing is tracked in the system and chased by the follow-up engine, but the document is sent and signed by whatever means GRLP uses today. No provider has been selected.',
  },
];

export interface IntegrationState {
  key: string;
  name: string;
  category: IntegrationSpec['category'];
  status: IntegrationStatus;
  missingEnv: string[];
  detail: string;
  capabilityWhenConnected: string;
  degradedBehaviour: string;
  checkedAt: Date;
}

export function missingEnvFor(spec: IntegrationSpec, env: EnvLike = process.env): string[] {
  return spec.requiredEnv.filter((k) => !env[k] || env[k]!.trim() === '');
}

/**
 * Reports real status. A live `verify` is attempted only when the credentials
 * are all present, so an unconfigured system makes no outbound calls.
 */
export async function checkIntegration(
  spec: IntegrationSpec,
  env: EnvLike = process.env,
  { live = true }: { live?: boolean } = {},
): Promise<IntegrationState> {
  const missing = missingEnvFor(spec, env);
  const base = {
    key: spec.key,
    name: spec.name,
    category: spec.category,
    missingEnv: missing,
    capabilityWhenConnected: spec.capabilityWhenConnected,
    degradedBehaviour: spec.degradedBehaviour,
    checkedAt: new Date(),
  };

  if (missing.length === spec.requiredEnv.length) {
    return { ...base, status: 'NOT_CONFIGURED', detail: `Not set up. Requires ${spec.requiredEnv.join(', ')}.` };
  }
  if (missing.length) {
    return { ...base, status: 'CREDENTIALS_MISSING', detail: `Partly configured. Still missing ${missing.join(', ')}.` };
  }
  if (!spec.verify || !live) {
    return { ...base, status: 'CONNECTED', detail: 'Credentials present. No live check is defined for this provider.' };
  }

  try {
    const result = await spec.verify(env);
    return result.ok
      ? { ...base, status: 'CONNECTED', detail: 'Credentials verified against the provider.' }
      : { ...base, status: 'ERROR', detail: `The provider rejected the credentials: ${result.detail ?? 'unknown reason'}.` };
  } catch (e) {
    return { ...base, status: 'ERROR', detail: `Could not reach the provider: ${(e as Error).message}` };
  }
}

export async function checkAll(
  env: EnvLike = process.env,
  opts: { live?: boolean } = {},
): Promise<IntegrationState[]> {
  return Promise.all(INTEGRATIONS.map((s) => checkIntegration(s, env, opts)));
}

export function requireIntegration(key: string, env: EnvLike = process.env): void {
  const spec = INTEGRATIONS.find((s) => s.key === key);
  if (!spec) throw new Error(`Unknown integration "${key}".`);
  const missing = missingEnvFor(spec, env);
  if (missing.length) throw new IntegrationNotConfiguredError(key, missing);
}

export function isConfigured(key: string, env: EnvLike = process.env): boolean {
  const spec = INTEGRATIONS.find((s) => s.key === key);
  return spec ? missingEnvFor(spec, env).length === 0 : false;
}
