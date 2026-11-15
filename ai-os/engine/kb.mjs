/**
 * The business knowledge base: Markdown files under <business>/knowledge/,
 * indexed into that business's own database. Front matter carries ownership,
 * version, provenance and who may read it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export function parseFrontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const meta = {};
  if (m) for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, ''); }
  return { meta, body: m ? text.slice(m[0].length) : text };
}

function walk(dir) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...walk(p)); else if (f.endsWith('.md')) out.push(p);
  }
  return out;
}

export function makeKb(ctx) {
  const { db, tenant } = ctx;
  const root = tenant.path('knowledge');
  return {
    reindex() {
      db.sql.exec('DELETE FROM kb');
      const ins = db.q('INSERT INTO kb(path,title,body,folder,owner,version,status,access,source,updated) VALUES(?,?,?,?,?,?,?,?,?,?)');
      const files = walk(root);
      for (const f of files) {
        const { meta, body } = parseFrontMatter(readFileSync(f, 'utf8'));
        const rel = relative(root, f);
        ins.run(rel, meta.title || rel, body, rel.split('/')[0], meta.owner || 'unassigned', meta.version || '1', meta.status || 'unverified', meta.access || 'all', meta.source || '', meta.updated || '');
      }
      db.audit('system', 'kb.reindexed', tenant.id, { documents: files.length });
      return files.length;
    },
    /** Search. `dept` limits results to documents that department may read. */
    search(query, { dept = null, limit = 8 } = {}) {
      const terms = String(query).toLowerCase().match(/[a-z0-9]{2,}/g) || [];
      if (!terms.length) return [];
      const match = terms.map((t) => `"${t}"*`).join(' OR ');
      const rows = db.q("SELECT path,title,folder,owner,version,status,access,source,updated, snippet(kb,2,'[',']',' … ',24) AS excerpt, bm25(kb) AS score FROM kb WHERE kb MATCH ? ORDER BY score LIMIT 50").all(match);
      return rows.filter((r) => r.access === 'all' || !dept || r.access.split(',').map((s) => s.trim()).includes(dept)).slice(0, limit);
    },
    read(path) { const r = db.q('SELECT * FROM kb WHERE path=?').get(path); return r ? { ...r } : null; },
    count: () => db.q('SELECT count(*) n FROM kb').get().n,
  };
}
