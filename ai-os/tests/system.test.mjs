import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { makeApp, serve } from '../engine/server.mjs';
import { ctxFor, example, approveAll } from './helpers.mjs';

for (const [id, min, required] of [['grlp', 137, 137], ['feral-femme', 112, 112]]) {
  test(`${id}: registry is complete and consistent`, async () => {
    const c = await ctxFor(id); const A = c.registry.agents;
    assert.ok(A.length >= min); assert.equal(new Set(A.map((a) => a.id)).size, A.length);
    for (let n = 1; n <= required; n++) assert.ok(A.some((a) => a.number === n), `agent ${n} from the brief is registered`);
    for (const a of A) {
      for (const k of ['id', 'name', 'department', 'role', 'inputs', 'outputs', 'tools', 'permissions', 'kpis', 'escalation', 'audit', 'approval_ceiling', 'status', 'reports_to']) assert.ok(a[k], `${a.id} has ${k}`);
      assert.ok(existsSync(c.tenant.path(a.instructions_file)), `${a.id} has an instruction file`);
      if (a.status === 'live') assert.equal(typeof c.handlers[a.handler], 'function', `${a.id} is marked live, so its handler "${a.handler}" must exist`);
      if (!a.is_orchestrator) assert.ok(c.registry.get(a.reports_to), `${a.id} reports to a real agent`);
    }
    assert.equal(A.filter((a) => a.is_orchestrator).length, 1);
    assert.ok(A.filter((a) => a.status === 'live').length >= 3);
    assert.equal(readFileSync(c.tenant.path('registry', 'agents.csv'), 'utf8').trim().split('\n').length, A.length + 1);
    // every workflow step is owned by a registered agent whose ceiling covers its gate
    for (const w of c.workflows.list()) for (const s of w.steps) if (s.gate) assert.ok(['amber', 'red'].includes(c.registry.get(s.agent).approval_ceiling), `${w.id}/${s.id}`);
    c.close();
  });

  test(`${id}: knowledge base is searchable, owned, versioned and permissioned`, async () => {
    const c = await ctxFor(id);
    assert.ok(c.kb.count() >= 12);
    for (const r of c.db.q('SELECT path, owner, version, status, source FROM kb').all()) { assert.notEqual(r.owner, 'unassigned', r.path); assert.ok(r.version && r.source, r.path); assert.match(r.status, /^(verified|assumption|to-confirm)$/); }
    const restricted = c.db.q("SELECT path, title, access FROM kb WHERE access != 'all' LIMIT 1").get();
    const term = restricted.title.split(' ')[0];
    assert.ok(c.kb.search(term, { dept: restricted.access.split(',')[0] }).some((h) => h.path === restricted.path));
    assert.ok(!c.kb.search(term, { dept: 'D99' }).some((h) => h.path === restricted.path), 'a department without access does not see it');
    c.close();
  });

  test(`${id}: reports have all ten sections for day, week and month`, async () => {
    const c = await ctxFor(id); if (id === 'grlp') c.seed(c);
    const wf = id === 'grlp' ? 'new-buyer-enquiry' : 'new-investigation';
    await c.workflows.start(wf, example(c, wf));
    for (const p of ['day', 'week', 'month']) {
      const r = c.reports.generate(p);
      for (const h of ['1. Completed', '2. Needs attention today', '3. Outstanding tasks', '4. Important deadlines', '5. New opportunities', '6. Problems detected', '7. Agent performance', '8. Pending approvals (1)', '9. Suggested improvements', '10. Three highest-priority actions']) assert.ok(r.markdown.includes(`## ${h}`), `${p}: ${h}`);
      assert.ok(existsSync(r.file));
    }
    assert.throws(() => c.reports.gather('year'));
    const s = c.reports.state('day'); assert.ok(s.tiles.length >= 11); assert.equal(s.approvals.length, 1); assert.ok(s.priorities.length >= 1);
    c.close();
  });
}

test('a failing step fails the run, raises a task and can be retried', async () => {
  const c = await ctxFor('grlp'); const real = c.handlers['lead.qualify']; let fail = true;
  c.handlers['lead.qualify'] = (...a) => { if (fail) throw new Error('scoring service unavailable'); return real(...a); };
  const run = await c.workflows.start('new-buyer-enquiry', example(c, 'new-buyer-enquiry'));
  assert.equal(run.status, 'failed'); assert.match(run.error, /scoring service unavailable/);
  assert.ok(c.db.tasks("status='open'").some((t) => /failed at/.test(t.title)));
  assert.ok(c.reports.gather('day').warnings.some((w) => w.severity === 'high'));
  fail = false; assert.equal((await c.workflows.resume(run.id)).status, 'waiting_approval');
  c.handlers['lead.qualify'] = real; c.close();
});

test('command centre API: token, JSON-only writes, approvals and exports', async () => {
  const c = await ctxFor('grlp'); c.seed(c);
  const server = createServer(makeApp(c, { token: 's3cret' })); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`; const H = { 'x-aios-token': 's3cret', 'content-type': 'application/json' };
  assert.equal((await fetch(`${base}/api/state`)).status, 401);
  assert.equal((await fetch(`${base}/api/state`, { headers: { 'x-aios-token': 'wrong!' } })).status, 401);
  assert.equal((await fetch(`${base}/`)).status, 200, 'the page itself carries no data');
  assert.equal((await fetch(`${base}/api/run`, { method: 'POST', headers: { 'x-aios-token': 's3cret', 'content-type': 'text/plain' }, body: '{}' })).status, 415);
  const post = async (p, b) => { const r = await fetch(base + p, { method: 'POST', headers: H, body: JSON.stringify(b) }); return { status: r.status, ...(await r.json()) }; };
  const run = await post('/api/run', { workflow: 'new-buyer-enquiry', input: example(c, 'new-buyer-enquiry') }); assert.equal(run.status, 'waiting_approval');
  const st = await (await fetch(`${base}/api/state?period=week`, { headers: H })).json(); assert.equal(st.approvals.length, 1);
  assert.equal((await post('/api/decide', { id: st.approvals[0].id, decision: 'approve', by: 'GRLP-A001' })).status, 400);
  assert.equal((await post('/api/decide', { id: st.approvals[0].id, decision: 'approve', by: 'Kandy Grieve' })).run.status, 'completed');
  assert.equal((await post('/api/targets', { targets: { sales: 5 }, by: 'Nobody' })).status, 403);
  await post('/api/targets', { targets: { sales: 5 }, by: 'Mandy Pelser' }); assert.equal(c.reports.state('day').targets.sales, 5);
  const csv = await (await fetch(`${base}/api/export?what=audit`, { headers: H })).text(); assert.match(csv.split('\n')[0], /id,at,actor,action/);
  assert.equal((await fetch(`${base}/api/export?what=secrets`, { headers: H })).status, 400);
  server.close(); c.close();
});

test('the command centre refuses to listen on the network without a token', async () => {
  const c = await ctxFor('feral-femme');
  assert.throws(() => serve(c, { port: 0, host: '0.0.0.0' }), /without FF_DASHBOARD_TOKEN/);
  c.close();
});

test('Claude is used only when that business has its own key; otherwise rules-only', async () => {
  const c = await ctxFor('grlp'); assert.equal(c.llm.available, false); assert.equal(await c.llm.run(c.registry.get('GRLP-A039'), 'x'), null);
  assert.equal(c.tenant.cfg.env.apiKey, 'GRLP_ANTHROPIC_API_KEY'); c.close();
});
