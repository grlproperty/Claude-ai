import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { env } from './env.ts';
import { AppError, ValidationError } from './errors.ts';

/**
 * Private file storage.
 *
 * Files never sit under the web root and are never served by a static
 * handler. Everything goes out through a route handler that checks the
 * permission on the owning record first and logs sensitive access.
 *
 * Two drivers. 'local' writes to a private directory and works out of the
 * box. 'supabase' is supported but needs credentials; without them the system
 * health screen reports NOT CONNECTED rather than pretending an upload
 * worked (spec 115, 150).
 */

export interface StorageStatus {
  driver: 'local' | 'supabase';
  connected: boolean;
  detail: string;
}

export interface StoredFile {
  storageKey: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  sha256: string;
}

/** What staff actually attach to a record. Anything else is refused. */
const ALLOWED: Record<string, { extensions: string[]; magic?: number[][] }> = {
  'image/jpeg': { extensions: ['.jpg', '.jpeg'], magic: [[0xff, 0xd8, 0xff]] },
  'image/png': { extensions: ['.png'], magic: [[0x89, 0x50, 0x4e, 0x47]] },
  'image/webp': { extensions: ['.webp'] },
  'image/heic': { extensions: ['.heic'] },
  'application/pdf': { extensions: ['.pdf'], magic: [[0x25, 0x50, 0x44, 0x46]] },
  'application/msword': { extensions: ['.doc'] },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    extensions: ['.docx'],
    magic: [[0x50, 0x4b, 0x03, 0x04]],
  },
  'application/vnd.ms-excel': { extensions: ['.xls'] },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    extensions: ['.xlsx'],
    magic: [[0x50, 0x4b, 0x03, 0x04]],
  },
  'text/csv': { extensions: ['.csv'] },
  'text/plain': { extensions: ['.txt'] },
};

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

function extensionOf(fileName: string): string {
  const index = fileName.lastIndexOf('.');
  return index === -1 ? '' : fileName.slice(index).toLowerCase();
}

/** Strips any directory, and any control character, a client may have sent. */
export function safeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base
    // Control characters, and the characters a file system treats as
    // special, are removed rather than escaped.
    // Matching control characters is the point here, so the usual
    // warning against them in a pattern does not apply.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
    .replace(/^\.+/, '')
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 200) : 'file';
}

/**
 * Validates an upload by declared type, extension and leading bytes, so a
 * script renamed to .pdf is refused rather than stored.
 */
export function validateUpload(
  fileName: string,
  contentType: string,
  bytes: Uint8Array,
  options: { imagesOnly?: boolean } = {},
): void {
  const name = safeFileName(fileName);
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  const rule = ALLOWED[type];

  if (!rule) {
    throw new ValidationError({
      file: [`${name} is a type this CRM does not accept. Use a PDF, image, Word or Excel file.`],
    });
  }
  if (options.imagesOnly && !IMAGE_TYPES.includes(type)) {
    throw new ValidationError({ file: [`${name} is not an image.`] });
  }
  if (!rule.extensions.includes(extensionOf(name))) {
    throw new ValidationError({
      file: [`${name} does not have the file extension its type suggests.`],
    });
  }
  if (bytes.byteLength === 0) {
    throw new ValidationError({ file: [`${name} is empty.`] });
  }
  const max = env.storage().maxUploadBytes;
  if (bytes.byteLength > max) {
    throw new ValidationError({
      file: [`${name} is larger than the ${Math.round(max / 1024 / 1024)} MB limit.`],
    });
  }
  if (rule.magic) {
    const matches = rule.magic.some((signature) =>
      signature.every((byte, index) => bytes[index] === byte),
    );
    if (!matches) {
      throw new ValidationError({
        file: [`${name} does not look like the type of file it claims to be.`],
      });
    }
  }
}

/** Keys are generated, never taken from the uploaded name. */
export function newStorageKey(folder: string, fileName: string): string {
  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, '').replace(/^\/+|\/+$/g, '');
  return `${safeFolder}/${randomUUID()}${extensionOf(safeFileName(fileName))}`;
}

export interface StorageDriver {
  readonly name: 'local' | 'supabase';
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
  status(): Promise<StorageStatus>;
}

/** Writes to a private directory. Paths are confined to that directory. */
class LocalStorageDriver implements StorageDriver {
  readonly name = 'local' as const;

  private root(): string {
    return resolve(process.cwd(), env.storage().localPath);
  }

  private pathFor(key: string): string {
    const root = this.root();
    const target = resolve(root, key);
    // A key can never escape the storage root, whatever it contains.
    if (target !== root && !target.startsWith(root + sep)) {
      throw new AppError('bad_storage_key', 'That file could not be located.', 400);
    }
    return target;
  }

  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    // 0600: readable only by the account running the CRM.
    await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
  }

  async get(key: string): Promise<Uint8Array> {
    try {
      return new Uint8Array(await readFile(this.pathFor(key)));
    } catch {
      throw new AppError('file_missing', 'That file is no longer available.', 404);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.pathFor(key));
    } catch {
      /* already gone */
    }
  }

  async status(): Promise<StorageStatus> {
    const root = this.root();
    try {
      await mkdir(root, { recursive: true, mode: 0o700 });
      const info = await stat(root);
      if (!info.isDirectory()) {
        return { driver: 'local', connected: false, detail: `${root} is not a directory.` };
      }
      // Prove it is writable rather than assuming it.
      const probe = join(root, `.write-check-${randomUUID()}`);
      await writeFile(probe, 'ok', { mode: 0o600 });
      await unlink(probe);
      return { driver: 'local', connected: true, detail: `Private directory ${root}` };
    } catch (error) {
      return {
        driver: 'local',
        connected: false,
        detail: `${root} could not be written to: ${(error as Error).message}`,
      };
    }
  }
}

/**
 * Supabase Storage. Kept behind the same interface so switching driver is a
 * configuration change rather than a rewrite. With no credentials every
 * operation refuses in plain language and status() reports NOT CONNECTED.
 */
class SupabaseStorageDriver implements StorageDriver {
  readonly name = 'supabase' as const;

  private config(): { url: string; key: string; bucket: string } {
    const config = env.storage();
    if (!config.supabaseUrl || !config.supabaseServiceKey) {
      throw new AppError(
        'storage_not_connected',
        'File storage is not connected. Ask management to finish the storage setup before uploading.',
        503,
      );
    }
    return {
      url: config.supabaseUrl.replace(/\/+$/, ''),
      key: config.supabaseServiceKey,
      bucket: config.supabaseBucket,
    };
  }

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { url, key: serviceKey, bucket } = this.config();
    const response = await fetch(`${url}/storage/v1/object/${bucket}/${key}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${serviceKey}`,
        'content-type': contentType,
        'x-upsert': 'false',
      },
      body: bytes as unknown as BodyInit,
    });
    if (!response.ok) {
      throw new AppError(
        'storage_failed',
        'That file could not be stored. Nothing was saved. Please try again.',
        502,
        `supabase ${response.status}: ${await response.text()}`,
      );
    }
  }

  async get(key: string): Promise<Uint8Array> {
    const { url, key: serviceKey, bucket } = this.config();
    const response = await fetch(`${url}/storage/v1/object/${bucket}/${key}`, {
      headers: { authorization: `Bearer ${serviceKey}` },
    });
    if (!response.ok) {
      throw new AppError('file_missing', 'That file is no longer available.', 404);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async remove(key: string): Promise<void> {
    const { url, key: serviceKey, bucket } = this.config();
    await fetch(`${url}/storage/v1/object/${bucket}/${key}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${serviceKey}` },
    });
  }

  async status(): Promise<StorageStatus> {
    const config = env.storage();
    if (!config.supabaseUrl || !config.supabaseServiceKey) {
      return {
        driver: 'supabase',
        connected: false,
        detail: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set.',
      };
    }
    const base = config.supabaseUrl.replace(/\/+$/, '');
    try {
      const response = await fetch(`${base}/storage/v1/bucket/${config.supabaseBucket}`, {
        headers: { authorization: `Bearer ${config.supabaseServiceKey}` },
      });
      return response.ok
        ? { driver: 'supabase', connected: true, detail: `Bucket ${config.supabaseBucket}` }
        : {
            driver: 'supabase',
            connected: false,
            detail: `Supabase replied ${response.status} for bucket ${config.supabaseBucket}.`,
          };
    } catch (error) {
      return {
        driver: 'supabase',
        connected: false,
        detail: `Supabase could not be reached: ${(error as Error).message}`,
      };
    }
  }
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (!driver) {
    driver =
      env.storage().driver === 'supabase' ? new SupabaseStorageDriver() : new LocalStorageDriver();
  }
  return driver;
}

/** Validates, stores and returns everything the database needs to record. */
export async function storeUpload(
  folder: string,
  file: { name: string; type: string; bytes: Uint8Array },
  options: { imagesOnly?: boolean } = {},
): Promise<StoredFile> {
  validateUpload(file.name, file.type, file.bytes, options);
  const fileName = safeFileName(file.name);
  const contentType = file.type.split(';')[0]?.trim().toLowerCase() ?? '';
  const storageKey = newStorageKey(folder, fileName);
  await storage().put(storageKey, file.bytes, contentType);
  return {
    storageKey,
    fileName,
    contentType,
    byteSize: file.bytes.byteLength,
    sha256: createHash('sha256').update(file.bytes).digest('hex'),
  };
}

/** Reads a browser upload into memory, refusing anything over the limit first. */
export async function readUpload(
  file: File,
): Promise<{ name: string; type: string; bytes: Uint8Array }> {
  const max = env.storage().maxUploadBytes;
  if (file.size > max) {
    throw new ValidationError({
      file: [
        `${safeFileName(file.name)} is larger than the ${Math.round(max / 1024 / 1024)} MB limit.`,
      ],
    });
  }
  return {
    name: file.name,
    type: file.type,
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}
