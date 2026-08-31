/**
 * Preview server for dist/. Serves clean URLs the way a static host does —
 * /research/ resolves to /research/index.html — so what you see locally matches
 * what ships. Nothing is compiled here; run `npm run build` first.
 *
 *   npm run dev  →  http://localhost:4321
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

async function resolveFile(pathname) {
  // normalize + the prefix check keeps `..` from escaping dist/.
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const target = join(DIST, safe);
  if (!target.startsWith(DIST)) return null;

  for (const candidate of [target, join(target, 'index.html'), `${target}.html`]) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let file = await resolveFile(url.pathname);
  let status = 200;

  if (!file) {
    status = 404;
    file = await resolveFile('/404/');
  }

  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found. Run `npm run build` first.');
    return;
  }

  const body = await readFile(file);
  res.writeHead(status, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(body);
}).listen(PORT, () => {
  console.log(`FERAL FEMME — preview at http://localhost:${PORT}`);
});
