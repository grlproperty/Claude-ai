/**
 * Checks every source this site cites against the live web.
 *
 * The site's defence for naming a company is that each finding links to the
 * document it came from. A citation that has rotted is therefore not a broken
 * link, it is an unsupported allegation about a named business — so this runs
 * on a schedule rather than waiting for someone to notice.
 *
 * Two questions are asked, not one:
 *
 *   1. Does the source still resolve?
 *   2. For the Record Checker, does the page still name the company it is cited
 *      for? A source that has been reorganised often still answers 200 while no
 *      longer carrying the matter, and that reads as fine from a link checker.
 *
 * Hosts that refuse robots are the reason this cannot be a naive link checker:
 * a plain sweep reports around a fifth of these URLs as failures when they open
 * perfectly in a browser. A 403 or 429 is recorded as unverifiable, never as
 * dead, because treating them as failures trains everyone to ignore the report.
 *
 *   node scripts/check-sources.mjs [--json]
 *
 * Exits non-zero only when something is genuinely dead or unsupported.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const JSON_OUT = process.argv.includes('--json');

// Some hosts answer a datacentre Chrome with 400 and the same request from
// Safari with 200, so a rejection is retried once with the second identity
// before anything is called dead.
const AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
];
// 401 and 402 sit here beside the obvious walls: fda.gov answers 401 to a robot
// and renders normally in a browser. 202 is the shape a challenge interstitial
// takes — a real article does not answer "Accepted".
const WALL = new Set([401, 402, 403, 429, 202]);
const CHALLENGE = /just a moment|cf-browser|enable javascript|captcha|attention required/i;
const TIMEOUT = 25000;
const PER_HOST_GAP = 1500; // a sweep that hammers one host earns its own 429s
const CONCURRENCY = 6;

const flat = (s) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Every URL cited under content/, with where it came from. */
async function collect() {
  const found = new Map(); // url -> { files:Set, expect:Set }
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { await walk(p); continue; }
      if (!['.json', '.md'].includes(extname(e.name))) continue;
      const text = await readFile(p, 'utf8');
      const rel = p.slice(ROOT.length + 1);

      for (const m of text.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) {
        const url = m[0].replace(/[.,;]+$/, '');
        if (url.includes('feral-femme.co')) continue; // our own pages
        if (!found.has(url)) found.set(url, { files: new Set(), expect: new Set() });
        found.get(url).files.add(rel);
      }

      // the Record Checker names companies, so its citations carry an
      // expectation about what the page should still say
      if (e.name === 'record.json') {
        const { findings = [] } = JSON.parse(text);
        for (const f of findings) {
          for (const url of [f.url, ...(f.more ?? []).map((x) => x.url)].filter(Boolean)) {
            if (!found.has(url)) found.set(url, { files: new Set([rel]), expect: new Set() });
            // "Gravy Analytics / Venntel", "Coca-Cola, Nestlé & others" -> any one is enough
            for (const part of f.name.split(/[/,&]| and /)) {
              const token = flat(part).replace(/\bothers?\b/g, '').replace(/[^a-z0-9 ]/g, '').trim();
              if (token.length > 3) found.get(url).expect.add(token);
            }
          }
        }
      }
    }
  };
  await walk(CONTENT);
  return found;
}

async function probe(url, expect, agent = 0) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      redirect: 'follow',
      headers: {
        'user-agent': AGENTS[agent],
        accept: 'text/html,application/pdf,*/*',
        'accept-language': 'en-GB,en;q=0.9',
      },
    });

    if (WALL.has(r.status)) return { state: 'blocked', status: r.status };
    if ([404, 410, 451].includes(r.status)) return { state: 'dead', status: r.status };
    if (r.status >= 500) return { state: 'flaky', status: r.status };
    // a refusal that is not an outright "gone" may be this identity, not the URL
    if (r.status >= 400) {
      if (agent + 1 < AGENTS.length) return probe(url, expect, agent + 1);
      return { state: 'dead', status: r.status };
    }

    const type = r.headers.get('content-type') ?? '';
    const moved = r.url !== url ? r.url : null;

    if (!expect?.size) return { state: 'ok', status: r.status, moved };
    // a PDF is the document itself; that it downloads is the whole check
    if (type.includes('pdf')) return { state: 'ok', status: r.status, moved, note: 'pdf' };

    const raw = await r.text();
    // A challenge page answers 200 and contains nothing. Reporting that as
    // "no longer names the company" would be a lie about the source.
    if (CHALLENGE.test(raw) || raw.length < 1500)
      return { state: 'blocked', status: `${r.status} challenge` };

    const body = flat(raw)
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
      .replace(/<[^>]+>/g, ' ');
    const hit = [...expect].some((t) => body.includes(t));
    return hit
      ? { state: 'ok', status: r.status, moved }
      : { state: 'unsupported', status: r.status, moved, expect: [...expect] };
  } catch (e) {
    const code = e.cause?.code ?? e.name;
    // a name that does not resolve is gone; a timeout may just be slow
    if (['ENOTFOUND', 'ECONNREFUSED', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(code))
      return { state: 'dead', status: code };
    return { state: 'flaky', status: code };
  } finally {
    clearTimeout(timer);
  }
}

/** Runs the queue with a gap between hits on any single host. */
async function sweep(entries) {
  const lastHit = new Map();
  const queue = [...entries];
  const results = new Map();

  const worker = async () => {
    while (queue.length) {
      const [url, meta] = queue.shift();
      let host = '';
      try { host = new URL(url).host; } catch { /* malformed, let probe report it */ }
      const wait = (lastHit.get(host) ?? 0) + PER_HOST_GAP - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastHit.set(host, Date.now());
      results.set(url, { ...(await probe(url, meta.expect)), meta });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return results;
}

const cited = await collect();
if (!JSON_OUT) console.log(`Checking ${cited.size} cited sources…\n`);

let results = await sweep([...cited]);

// One retry for anything that failed: a single 500 or timeout is usually the
// network, and an alert that cries wolf gets muted.
const retry = [...results].filter(([, r]) => ['flaky', 'dead'].includes(r.state));
if (retry.length) {
  if (!JSON_OUT) console.log(`Re-checking ${retry.length} that did not answer…\n`);
  await new Promise((r) => setTimeout(r, 5000));
  for (const [url, r] of await sweep(retry.map(([u]) => [u, cited.get(u)]))) {
    results.set(url, r);
  }
}

const by = (s) => [...results].filter(([, r]) => r.state === s);
const dead = by('dead');
const unsupported = by('unsupported');
const blocked = by('blocked');
const flaky = by('flaky');
const moved = [...results].filter(([, r]) => r.moved && r.state === 'ok');

if (JSON_OUT) {
  const shape = (list) =>
    list.map(([url, r]) => ({
      url,
      status: String(r.status),
      files: [...r.meta.files],
      ...(r.expect ? { expected: r.expect } : {}),
    }));
  console.log(
    JSON.stringify(
      { checked: results.size, dead: shape(dead), unsupported: shape(unsupported),
        flaky: shape(flaky), blocked: blocked.length, moved: moved.length },
      null,
      2
    )
  );
} else {
  const show = (title, list) => {
    if (!list.length) return;
    console.log(`${title}`);
    for (const [url, r] of list) {
      console.log(`  ${String(r.status).padEnd(12)} ${url}`);
      console.log(`  ${''.padEnd(12)} cited in ${[...r.meta.files].join(', ')}`);
      if (r.expect) console.log(`  ${''.padEnd(12)} page no longer names: ${r.expect.join(' / ')}`);
    }
    console.log('');
  };
  show('DEAD — the source is gone:', dead);
  show('UNSUPPORTED — loads, but no longer names the company it is cited for:', unsupported);
  show('NO ANSWER — twice, may be temporary:', flaky);
  console.log(
    `${results.size} checked · ${dead.length} dead · ${unsupported.length} unsupported · ` +
      `${flaky.length} no answer · ${blocked.length} unverifiable (robot wall) · ${moved.length} redirected`
  );
}

process.exit(dead.length + unsupported.length ? 1 : 0);
