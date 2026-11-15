/**
 * Tenant loading and the isolation boundary.
 *
 * One process serves exactly one business. Every file path the engine touches
 * is resolved through the tenant object, which refuses anything outside that
 * business's own directory, its own data directory, or a mount it declared.
 * The engine itself holds no business data.
 */
import { readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const AIOS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ID_RE = /^[a-z][a-z0-9-]{1,30}$/;
const RESERVED = new Set(['engine', 'tests', 'docs', 'node_modules']);

export function inside(base, p) {
  const r = resolve(base, p);
  if (r !== base && !r.startsWith(base + sep)) {
    throw new Error(`Isolation violation: "${p}" resolves outside ${base}`);
  }
  return r;
}

export function listTenants() {
  return readdirSync(AIOS_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !RESERVED.has(d.name) && existsSync(join(AIOS_ROOT, d.name, 'tenant.json')))
    .map((d) => d.name);
}

function defaultDataDir(id, cfg) {
  return resolve(process.env[cfg.env.dataDir] || join(AIOS_ROOT, id, 'data'));
}

export function loadTenant(id, opts = {}) {
  if (!ID_RE.test(id) || RESERVED.has(id)) throw new Error(`Invalid business id "${id}"`);
  const root = join(AIOS_ROOT, id);
  const cfgFile = join(root, 'tenant.json');
  if (!existsSync(cfgFile)) throw new Error(`Unknown business "${id}". Known: ${listTenants().join(', ')}`);
  const cfg = JSON.parse(readFileSync(cfgFile, 'utf8'));
  if (cfg.id !== id) throw new Error(`tenant.json id "${cfg.id}" does not match directory "${id}"`);

  const dataDir = resolve(opts.dataDir || defaultDataDir(id, cfg));
  // A business may never keep its data inside another business's directory,
  // nor share a data directory with one.
  for (const other of listTenants()) {
    if (other === id) continue;
    const oRoot = join(AIOS_ROOT, other);
    const oCfg = JSON.parse(readFileSync(join(oRoot, 'tenant.json'), 'utf8'));
    const oData = defaultDataDir(other, oCfg);
    if (dataDir === oRoot || dataDir.startsWith(oRoot + sep) || dataDir === oData || dataDir.startsWith(oData + sep) || oData.startsWith(dataDir + sep)) {
      throw new Error(`Isolation violation: data directory for "${id}" overlaps business "${other}"`);
    }
  }
  mkdirSync(dataDir, { recursive: true });

  const mounts = {};
  for (const [name, m] of Object.entries(opts.mounts || cfg.mounts || {})) {
    const base = resolve(root, m.path);
    for (const other of listTenants()) {
      if (other !== id && (base === join(AIOS_ROOT, other) || base.startsWith(join(AIOS_ROOT, other) + sep))) {
        throw new Error(`Isolation violation: mount "${name}" points into business "${other}"`);
      }
    }
    mounts[name] = { base, mode: m.mode === 'rw' ? 'rw' : 'ro' };
  }

  return {
    id, cfg, root, dataDir,
    path: (...p) => inside(root, join(...p)),
    data: (...p) => inside(dataDir, join(...p)),
    mount(name, ...p) {
      if (!mounts[name]) throw new Error(`Business "${id}" has no mount "${name}"`);
      return inside(mounts[name].base, join(...p));
    },
    mountMode: (name) => mounts[name]?.mode,
    hasMount: (name) => Boolean(mounts[name]) && existsSync(mounts[name].base),
    secret: (key) => process.env[cfg.env[key]] || '',
  };
}
