/**
 * The command centre for ONE business. Each business runs its own process on
 * its own port with its own token; there is no page, route or query that can
 * address the other business.
 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const csvCell = (v) => `"${String(v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v).replace(/"/g, '""')}"`;
const toCsv = (rows) => (rows.length ? [Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).map(csvCell).join(','))].join('\n') : '');

export function makeApp(ctx, { token = ctx.tenant.secret('token') } = {}) {
  const { db } = ctx;
  const authed = (req) => {
    if (!token) return true;
    const got = Buffer.from(String(req.headers['x-aios-token'] || '')); const want = Buffer.from(token);
    return got.length === want.length && timingSafeEqual(got, want);
  };
  const body = (req) => new Promise((res, rej) => { let s = ''; req.on('data', (c) => { s += c; if (s.length > 1e6) req.destroy(); }); req.on('end', () => { try { res(s ? JSON.parse(s) : {}); } catch { rej(new Error('Invalid JSON')); } }); });
  const send = (res, code, data, type = 'application/json') => { res.writeHead(code, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer' }); res.end(type === 'application/json' ? JSON.stringify(data) : data); };

  return async (req, res) => {
    const url = new URL(req.url, 'http://x'); const p = url.pathname;
    try {
      if (req.method === 'GET' && p === '/') return send(res, 200, readFileSync(join(HERE, 'dashboard.html'), 'utf8').replace('__NEEDS_TOKEN__', token ? 'true' : 'false'), 'text/html');
      if (!p.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
      if (!authed(req)) return send(res, 401, { error: 'Access token required' });
      // State-changing calls must be JSON from this page, not a cross-site form post.
      if (req.method === 'POST' && !String(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'JSON only' });

      if (req.method === 'GET') {
        if (p === '/api/state') return send(res, 200, ctx.reports.state(url.searchParams.get('period') || 'day'));
        if (p === '/api/kb') return send(res, 200, ctx.kb.search(url.searchParams.get('q') || ''));
        if (p === '/api/report') return send(res, 200, { markdown: ctx.reports.generate(url.searchParams.get('period') || 'day').markdown });
        if (p === '/api/run') return send(res, 200, { ...db.run(url.searchParams.get('id')), steps: db.runSteps(url.searchParams.get('id')) });
        if (p === '/api/agent') { const a = ctx.registry.get(url.searchParams.get('id')); return a ? send(res, 200, { ...a, instructions: ctx.registry.instructions(a.id) }) : send(res, 404, { error: 'No such agent' }); }
        if (p === '/api/export') {
          const what = url.searchParams.get('what');
          const rows = { tasks: () => db.tasks(), approvals: () => db.approvals(), audit: () => db.auditLog(5000), agents: () => ctx.registry.agents.map(({ scores, responsibilities, ...a }) => ({ ...a, ...scores })), runs: () => db.runs(1000).map(({ state, input, ...r }) => r) }[what];
          if (!rows) return send(res, 400, { error: 'what must be tasks, approvals, audit, agents or runs' });
          db.audit('owner', 'export', what);
          res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${ctx.tenant.id}-${what}-${db.now().slice(0, 10)}.csv"` });
          return res.end(toCsv(rows()));
        }
      }
      if (req.method === 'POST') {
        const b = await body(req);
        if (p === '/api/instruct') return send(res, 200, await ctx.orchestrator.instruct(String(b.text || ''), b.by || 'owner'));
        if (p === '/api/run') { const r = await ctx.workflows.start(b.workflow, b.input || {}, b.by || 'owner'); return send(res, 200, { id: r.id, status: r.status, error: r.error }); }
        if (p === '/api/resume') { const r = await ctx.workflows.resume(b.run, b.input || {}, b.by || 'owner'); return send(res, 200, { id: r.id, status: r.status, error: r.error }); }
        if (p === '/api/decide') { const r = await ctx.orchestrator.decide(b.id, b); return send(res, 200, { status: r.approval.status, dispatch: r.approval.dispatch, run: r.run && { id: r.run.id, status: r.run.status } }); }
        if (p === '/api/task') { db.setTask(b.id, b.status || 'done', { note: b.note || '' }, b.by || 'owner'); return send(res, 200, { ok: true }); }
        if (p === '/api/targets') { if (!ctx.tenant.cfg.approvers.includes(b.by)) return send(res, 403, { error: 'Only an authorised approver may change targets' }); db.setSetting('targets', { ...(db.getSetting('targets', {})), ...b.targets }, b.by); return send(res, 200, { ok: true }); }
      }
      return send(res, 404, { error: 'Not found' });
    } catch (e) {
      db.audit('system', 'request.error', p, { error: e.message });
      return send(res, 400, { error: e.message, missing: e.missing });
    }
  };
}

export function serve(ctx, { port, host = '127.0.0.1' }) {
  const token = ctx.tenant.secret('token');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !token) throw new Error(`Refusing to listen on ${host} without ${ctx.tenant.cfg.env.token} set — the command centre would be open to the network`);
  return new Promise((resolve) => {
    const server = createServer(makeApp(ctx));
    server.listen(port, host, () => { console.log(`${ctx.tenant.cfg.name} command centre: http://${host}:${port}  (${token ? 'token required' : 'local only, no token set'})`); resolve(server); });
  });
}
