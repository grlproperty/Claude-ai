import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Db } from '../db.ts';
import { ValidationError } from '../errors.ts';
import { getSetting, getNumberSetting } from '../settings.ts';

/**
 * Fetching an import from a web address (spec 66, 102).
 *
 * This is the most dangerous thing in the whole CRM, because it is the one
 * place where a URL somebody types causes the server to make a request. Left
 * naive, it is a server-side request forgery hole: the server sits inside a
 * private network, so http://169.254.169.254/ or http://127.0.0.1:5432/ are
 * reachable from it and are not reachable from the person's browser. An
 * attacker who can make the server fetch a URL and show them the body can
 * read cloud credentials.
 *
 * So the rules here are deliberately unfriendly, and all of them are
 * enforced server-side:
 *
 *   1. Switched off unless an administrator has listed the hosts it may
 *      reach. An empty list means the feature does not work at all, which is
 *      the right default.
 *   2. https only. No http, and certainly no file:, gopher: or data:.
 *      No credentials in the URL.
 *   3. The host is resolved and every address it resolves to is checked
 *      against the private, loopback, link-local and reserved ranges. A
 *      name that resolves to 127.0.0.1 is refused, which is what stops the
 *      allow-list being defeated by a hostname an attacker controls.
 *   4. Redirects are refused outright rather than followed, because a
 *      permitted host redirecting to a forbidden one would otherwise walk
 *      straight past every check above.
 *   5. A size cap and a timeout, so a hostile endpoint cannot exhaust memory
 *      or hold a connection open.
 */

export interface UrlFetchResult {
  bytes: Uint8Array;
  mediaType: string | null;
  filename: string | null;
  finalUrl: string;
}

const FETCH_TIMEOUT_MS = 15_000;

/** Refuses anything that is not a plain, credential-free https URL. */
export function parseImportUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ValidationError({ sourceUrl: ['That is not a valid web address.'] }, 'That is not a valid web address.');
  }

  if (url.protocol !== 'https:') {
    throw new ValidationError(
      { sourceUrl: ['Only https addresses can be imported from.'] },
      'Only https addresses can be imported from.',
    );
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new ValidationError(
      { sourceUrl: ['Remove the username and password from the address.'] },
      'Remove the username and password from the address.',
    );
  }
  if (url.hostname.length === 0) {
    throw new ValidationError({ sourceUrl: ['That address has no host.'] }, 'That address has no host.');
  }

  return url;
}

/**
 * True for an address that must never be fetched: loopback, private,
 * link-local (which includes the cloud metadata service), carrier-grade NAT,
 * multicast, and the IPv6 equivalents including IPv4-mapped addresses.
 */
export function isForbiddenAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 0) return true;

  if (version === 4) {
    const parts = address.split('.').map(Number);
    const [a = 0, b = 0] = parts;
    if (a === 0) return true; // this network
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 192 && b === 0) return true; // protocol assignments
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast and reserved
    return false;
  }

  const lower = address.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80')) return true; // link-local
  if (/^f[cd]/.test(lower)) return true; // unique local
  if (lower.startsWith('ff')) return true; // multicast
  // An IPv4-mapped address (::ffff:127.0.0.1) is an IPv4 address wearing a hat.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isForbiddenAddress(mapped[1]!);
  return false;
}

/** The configured allow-list, lower-cased. Empty means the feature is off. */
export async function allowedImportHosts(db: Db): Promise<string[]> {
  const raw = await getSetting<unknown>(db, 'import.url_allowed_hosts', []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/** An exact host match, or a subdomain of an allowed host. */
export function hostIsAllowed(hostname: string, allowed: string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

export async function assertUrlIsFetchable(db: Db, raw: string): Promise<URL> {
  const url = parseImportUrl(raw);

  const allowed = await allowedImportHosts(db);
  if (allowed.length === 0) {
    throw new ValidationError(
      {
        sourceUrl: [
          'Importing from a web address is switched off. An administrator can list the ' +
            'permitted hosts in import settings.',
        ],
      },
      'Importing from a web address is switched off.',
    );
  }
  if (!hostIsAllowed(url.hostname, allowed)) {
    throw new ValidationError(
      { sourceUrl: [`${url.hostname} is not on the list of hosts imports may fetch from.`] },
      `${url.hostname} is not on the list of hosts imports may fetch from.`,
    );
  }

  // A literal address still has to clear the range checks; the allow-list is
  // not a way to reach 127.0.0.1.
  if (isIP(url.hostname) !== 0) {
    if (isForbiddenAddress(url.hostname)) {
      throw new ValidationError(
        { sourceUrl: ['That address is inside a private network and cannot be fetched.'] },
        'That address is inside a private network and cannot be fetched.',
      );
    }
    return url;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new ValidationError(
      { sourceUrl: [`${url.hostname} could not be found.`] },
      `${url.hostname} could not be found.`,
    );
  }

  if (addresses.length === 0) {
    throw new ValidationError(
      { sourceUrl: [`${url.hostname} could not be found.`] },
      `${url.hostname} could not be found.`,
    );
  }

  // EVERY address, not the first: a name that resolves to both a public and a
  // private address must be refused, or the choice of which one to connect to
  // decides whether the protection held.
  for (const entry of addresses) {
    if (isForbiddenAddress(entry.address)) {
      throw new ValidationError(
        {
          sourceUrl: [
            `${url.hostname} points at an address inside a private network, so it cannot be fetched.`,
          ],
        },
        `${url.hostname} points at an address inside a private network.`,
      );
    }
  }

  return url;
}

export async function fetchImportUrl(db: Db, raw: string): Promise<UrlFetchResult> {
  const url = await assertUrlIsFetchable(db, raw);
  const maxBytes = await getNumberSetting(db, 'import.max_bytes', 10 * 1024 * 1024);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      // Never follow a redirect. A permitted host that redirects to a
      // forbidden one would otherwise defeat every check above, and
      // re-validating each hop is more moving parts than this is worth.
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: 'text/csv, text/plain, application/vnd.ms-excel, */*' },
      cache: 'no-store',
    });
  } catch (error) {
    clearTimeout(timer);
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new ValidationError(
      { sourceUrl: [aborted ? 'That address took too long to answer.' : 'That address could not be reached.'] },
      aborted ? 'That address took too long to answer.' : 'That address could not be reached.',
    );
  }
  clearTimeout(timer);

  if (response.status >= 300 && response.status < 400) {
    throw new ValidationError(
      {
        sourceUrl: [
          'That address redirects elsewhere. Use the address of the file itself.',
        ],
      },
      'That address redirects elsewhere.',
    );
  }
  if (!response.ok) {
    throw new ValidationError(
      { sourceUrl: [`That address answered with ${response.status}.`] },
      `That address answered with ${response.status}.`,
    );
  }

  // Trust the declared length only to refuse early; the real cap is applied
  // to what actually arrives.
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ValidationError(
      { sourceUrl: ['That file is larger than imports allow.'] },
      'That file is larger than imports allow.',
    );
  }

  const buffer = await readCapped(response, maxBytes);

  return {
    bytes: buffer,
    mediaType: response.headers.get('content-type'),
    filename: filenameFromResponse(response, url),
    finalUrl: url.toString(),
  };
}

/** Reads the body, stopping the moment it exceeds the cap. */
async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ValidationError(
        { sourceUrl: ['That file is larger than imports allow.'] },
        'That file is larger than imports allow.',
      );
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function filenameFromResponse(response: Response, url: URL): string | null {
  const disposition = response.headers.get('content-disposition');
  if (disposition) {
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  const last = url.pathname.split('/').filter(Boolean).pop();
  return last ?? null;
}
