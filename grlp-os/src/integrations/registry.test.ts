import { describe, expect, it } from 'vitest';
import {
  INTEGRATIONS,
  IntegrationNotConfiguredError,
  checkAll,
  checkIntegration,
  isConfigured,
  requireIntegration,
  type EnvLike,
} from './registry';

const NONE: EnvLike = {};

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

describe('the WhatsApp Business live feed', () => {
  const spec = INTEGRATIONS.find((i) => i.key === 'whatsapp')!;
  const complete = {
    WHATSAPP_APP_SECRET: 'a'.repeat(32),
    WHATSAPP_VERIFY_TOKEN: 'b'.repeat(32),
    WHATSAPP_PHONE_NUMBER_ID: '845019283746152',
    WHATSAPP_BUSINESS_NUMBER: '+27740000000',
  };

  it('is connected once every value is set and coherent', async () => {
    expect((await checkIntegration(spec, complete)).status).toBe('CONNECTED');
  });

  it('is not configured on a bare environment', async () => {
    expect((await checkIntegration(spec, {})).status).toBe('NOT_CONFIGURED');
  });

  it('says which value is still missing', async () => {
    const state = await checkIntegration(spec, { ...complete, WHATSAPP_BUSINESS_NUMBER: '' });
    expect(state.status).toBe('CREDENTIALS_MISSING');
    expect(state.detail).toContain('WHATSAPP_BUSINESS_NUMBER');
  });

  // The setup mistake that produces a webhook which verifies, delivers, and
  // then matches nothing, with no error to explain why.
  it('catches the telephone number pasted into the phone-number-id field', async () => {
    const state = await checkIntegration(spec, { ...complete, WHATSAPP_PHONE_NUMBER_ID: '+27740000000' });
    expect(state.status).toBe('ERROR');
    expect(state.detail).toContain('API Setup');
  });

  it('catches the two identifiers being given the same value', async () => {
    const state = await checkIntegration(spec, {
      ...complete,
      WHATSAPP_PHONE_NUMBER_ID: '27740000000',
      WHATSAPP_BUSINESS_NUMBER: '27740000000',
    });
    expect(state.status).toBe('ERROR');
    expect(state.detail).toContain('different things');
  });

  it('catches a business number that is not a number', async () => {
    const state = await checkIntegration(spec, { ...complete, WHATSAPP_BUSINESS_NUMBER: 'GRLP' });
    expect(state.status).toBe('ERROR');
  });

  it('never claims a scope that could send', () => {
    expect(spec.scopes.join(' ')).toContain('receive only');
    expect(spec.scopes.some((s) => /send|write/i.test(s))).toBe(false);
  });

  // The settings page renders with live checks off, because most providers
  // would mean a network call. This one only reads the configuration, so the
  // mistake shows up where someone is actually looking at it.
  it('still catches a mistyped setting on a page that skips live checks', async () => {
    const state = await checkIntegration(
      spec,
      { ...complete, WHATSAPP_PHONE_NUMBER_ID: '+27740000000' },
      { live: false },
    );
    expect(state.status).toBe('ERROR');
  });
});
