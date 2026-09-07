import { describe, expect, it } from 'vitest';
import {
  INTEGRATIONS,
  IntegrationNotConfiguredError,
  checkAll,
  checkIntegration,
  isConfigured,
  requireIntegration,
} from './registry';

const NONE: NodeJS.ProcessEnv = {};

describe('the system does not claim integrations it does not have', () => {
  it('reports every integration as unconfigured on a bare environment', async () => {
    const states = await checkAll(NONE, { live: false });
    expect(states).toHaveLength(INTEGRATIONS.length);
    expect(states.every((s) => s.status === 'NOT_CONFIGURED')).toBe(true);
  });

  it('names exactly which variables are required', async () => {
    const s = await checkIntegration(INTEGRATIONS.find((i) => i.key === 'dropbox')!, NONE, { live: false });
    expect(s.detail).toContain('DROPBOX_APP_KEY');
    expect(s.detail).toContain('DROPBOX_REFRESH_TOKEN');
  });

  it('distinguishes half-configured from unconfigured', async () => {
    const s = await checkIntegration(INTEGRATIONS.find((i) => i.key === 'dropbox')!, { DROPBOX_APP_KEY: 'x' }, { live: false });
    expect(s.status).toBe('CREDENTIALS_MISSING');
    expect(s.missingEnv).toEqual(['DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN']);
  });

  it('makes no outbound call when credentials are absent', async () => {
    // A live check on a bare environment would throw if it were attempted.
    const anthropic = INTEGRATIONS.find((i) => i.key === 'anthropic')!;
    const s = await checkIntegration({ ...anthropic, verify: async () => { throw new Error('should not be called'); } }, NONE);
    expect(s.status).toBe('NOT_CONFIGURED');
  });

  it('reports an error rather than a connection when the provider refuses', async () => {
    const spec = { ...INTEGRATIONS[0]!, verify: async () => ({ ok: false, detail: 'HTTP 401' }) };
    const s = await checkIntegration(spec, { ANTHROPIC_API_KEY: 'bad' });
    expect(s.status).toBe('ERROR');
    expect(s.detail).toContain('401');
  });

  it('refuses to act through an unconnected integration, and says nothing happened', () => {
    try {
      requireIntegration('dropbox', NONE);
      throw new Error('should have refused');
    } catch (e) {
      expect(e).toBeInstanceOf(IntegrationNotConfiguredError);
      expect((e as Error).message).toContain('Nothing has been sent, saved or changed');
    }
  });

  it('tells the user what still works without each integration', () => {
    for (const spec of INTEGRATIONS) {
      expect(spec.degradedBehaviour.length, `${spec.key} has no degraded-behaviour note`).toBeGreaterThan(30);
    }
  });

  it('knows when something is configured', () => {
    expect(isConfigured('anthropic', NONE)).toBe(false);
    expect(isConfigured('anthropic', { ANTHROPIC_API_KEY: 'sk-x' })).toBe(true);
  });
});
