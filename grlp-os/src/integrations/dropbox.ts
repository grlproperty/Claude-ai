import { IntegrationNotConfiguredError, type EnvLike } from './registry';

/**
 * Dropbox: the document store GRLP already runs on.
 *
 * The master copies live in Dropbox and are edited there. This client reads
 * them; it does not write, because the authority over a legal template belongs
 * with the people who maintain it, not with this system.
 *
 * Access is a refresh token exchanged for short-lived access tokens, so nothing
 * long-lived is sent on each request.
 */

export interface DropboxConfig {
  appKey: string;
  appSecret: string;
  refreshToken: string;
  /** Team namespace to read as, when the account is a Dropbox Team. */
  rootNamespaceId?: string;
}

export const DROPBOX_ENV = ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN'] as const;

export function dropboxConfig(env: EnvLike = process.env): DropboxConfig | null {
  const missing = DROPBOX_ENV.filter((k) => !env[k]?.trim());
  if (missing.length) return null;
  return {
    appKey: env.DROPBOX_APP_KEY!.trim(),
    appSecret: env.DROPBOX_APP_SECRET!.trim(),
    refreshToken: env.DROPBOX_REFRESH_TOKEN!.trim(),
    rootNamespaceId: env.DROPBOX_ROOT_NAMESPACE_ID?.trim() || undefined,
  };
}

export function requireDropbox(env: EnvLike = process.env): DropboxConfig {
  const config = dropboxConfig(env);
  if (!config) {
    throw new IntegrationNotConfiguredError(
      'dropbox',
      DROPBOX_ENV.filter((k) => !env[k]?.trim()),
    );
  }
  return config;
}

export interface DropboxEntry {
  kind: 'file' | 'folder';
  name: string;
  pathLower: string;
  pathDisplay: string;
  id: string;
  /** Dropbox's content revision. Changes when the master copy is edited. */
  rev?: string;
  size?: number;
  serverModified?: Date;
}

/**
 * The seam that lets the importer be tested without Dropbox. Production uses
 * the HTTP client below; tests substitute a fixture.
 */
export interface DropboxClient {
  listFolder(path: string, opts?: { recursive?: boolean }): Promise<DropboxEntry[]>;
  /** Extracted plain text, for the formats Dropbox can render. */
  download(pathOrId: string): Promise<Buffer>;
  verify(): Promise<{ ok: boolean; detail?: string }>;
}

const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

export function createDropboxClient(config: DropboxConfig): DropboxClient {
  let accessToken: string | null = null;
  let expiresAt = 0;

  async function token(): Promise<string> {
    if (accessToken && Date.now() < expiresAt - 60_000) return accessToken;

    const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: config.refreshToken });
    const auth = Buffer.from(`${config.appKey}:${config.appSecret}`).toString('base64');
    const res = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`Dropbox refused the refresh token: HTTP ${res.status} ${await res.text()}`);

    const json = (await res.json()) as { access_token: string; expires_in: number };
    accessToken = json.access_token;
    expiresAt = Date.now() + json.expires_in * 1000;
    return accessToken;
  }

  function headers(extra: Record<string, string> = {}): Record<string, string> {
    const h: Record<string, string> = { ...extra };
    if (config.rootNamespaceId) {
      h['Dropbox-API-Path-Root'] = JSON.stringify({ '.tag': 'root', root: config.rootNamespaceId });
    }
    return h;
  }

  async function rpc<T>(endpoint: string, body: unknown): Promise<T> {
    const res = await fetch(`${API}${endpoint}`, {
      method: 'POST',
      headers: headers({ Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Dropbox ${endpoint} failed: HTTP ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  interface RawEntry {
    '.tag': string;
    name: string;
    path_lower?: string;
    path_display?: string;
    id: string;
    rev?: string;
    size?: number;
    server_modified?: string;
  }

  function toEntry(e: RawEntry): DropboxEntry {
    return {
      kind: e['.tag'] === 'folder' ? 'folder' : 'file',
      name: e.name,
      pathLower: e.path_lower ?? '',
      pathDisplay: e.path_display ?? '',
      id: e.id,
      rev: e.rev,
      size: e.size,
      serverModified: e.server_modified ? new Date(e.server_modified) : undefined,
    };
  }

  return {
    async listFolder(path, opts = {}) {
      const entries: DropboxEntry[] = [];
      let result = await rpc<{ entries: RawEntry[]; cursor: string; has_more: boolean }>('/files/list_folder', {
        path,
        recursive: opts.recursive ?? false,
        limit: 500,
      });
      entries.push(...result.entries.map(toEntry));

      while (result.has_more) {
        result = await rpc<{ entries: RawEntry[]; cursor: string; has_more: boolean }>('/files/list_folder/continue', {
          cursor: result.cursor,
        });
        entries.push(...result.entries.map(toEntry));
      }
      return entries;
    },

    async download(pathOrId) {
      const res = await fetch(`${CONTENT}/files/download`, {
        method: 'POST',
        headers: headers({
          Authorization: `Bearer ${await token()}`,
          'Dropbox-API-Arg': JSON.stringify({ path: pathOrId }),
        }),
      });
      if (!res.ok) throw new Error(`Dropbox download failed: HTTP ${res.status} ${await res.text()}`);
      return Buffer.from(await res.arrayBuffer());
    },

    async verify() {
      try {
        await rpc('/users/get_current_account', null);
        return { ok: true };
      } catch (e) {
        return { ok: false, detail: (e as Error).message };
      }
    },
  };
}

export function dropboxClient(env: EnvLike = process.env): DropboxClient {
  return createDropboxClient(requireDropbox(env));
}
