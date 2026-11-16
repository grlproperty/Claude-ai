import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadTenant, listTenants, AIOS_ROOT } from '../engine/tenant.mjs';
import { openDb } from '../engine/db.mjs';
import { ctxFor, tmp, example } from './helpers.mjs';

test('there are exactly two businesses and the engine holds no business data', () => {
  assert.deepEqual(listTenants().sort(), ['feral-femme', 'grlp']);
  for (const f of readdirSync(join(AIOS_ROOT, 'engine'))) {
    const t = readFileSync(join(AIOS_ROOT, 'engine', f), 'utf8');
    assert.doesNotMatch(t, /Garden Route|GRLP|Feral Femme|feral-femme|grproperty/i, `engine/${f} names a business`);
  }
});

test('a business cannot resolve a path inside the other business', () => {
  const g = loadTenant('grlp', { dataDir: tmp() });
  assert.throws(() => g.path('..', 'feral-femme', 'tenant.json'), /Isolation violation/);
  assert.throws(() => g.data('..', '..', 'etc', 'passwd'), /Isolation violation/);
  assert.throws(() => g.mount('site', 'data'), /no mount/);
  const f = loadTenant('feral-femme', { dataDir: tmp() });
  assert.throws(() => f.mount('site', '..', 'ai-os', 'grlp', 'tenant.json'), /Isolation violation/);
});

test('a business cannot use the other business\'s data directory, or mount it', () => {
  assert.throws(() => loadTenant('grlp', { dataDir: join(AIOS_ROOT, 'feral-femme', 'data') }), /overlaps business "feral-femme"/);
  assert.throws(() => loadTenant('feral-femme', { dataDir: join(AIOS_ROOT, 'grlp', 'data', 'x') }), /overlaps business "grlp"/);
  assert.throws(() => loadTenant('feral-femme', { dataDir: tmp(), mounts: { x: { path: '../grlp/knowledge' } } }), /points into business "grlp"/);
});

test('a database stamped for one business refuses to open as the other', () => {
  const dir = tmp();
  openDb(loadTenant('grlp', { dataDir: dir })).close();
  assert.throws(() => openDb(loadTenant('feral-femme', { dataDir: dir })), /belongs to "grlp"/);
});

test('each business uses its own credentials and port', () => {
  const g = loadTenant('grlp', { dataDir: tmp() }).cfg, f = loadTenant('feral-femme', { dataDir: tmp() }).cfg;
  for (const k of ['apiKey', 'dataDir', 'token']) assert.notEqual(g.env[k], f.env[k]);
  assert.notEqual(g.port, f.port);
  assert.ok(!g.approvers.some((a) => f.approvers.includes(a)), 'approver lists are separate');
});

test('knowledge, agents, records and prompts never cross', async () => {
  const g = await ctxFor('grlp'), f = await ctxFor('feral-femme');
  g.seed(g);
  await g.workflows.start('new-buyer-enquiry', example(g, 'new-buyer-enquiry'));
  await f.workflows.start('new-investigation', example(f, 'new-investigation'));
  // knowledge
  assert.ok(g.kb.search('maroon logo').length > 0);
  assert.equal(f.kb.search('maroon mandate PropCntrl').length, 0);
  assert.ok(f.kb.search('allegation sourcing').length > 0);
  assert.equal(g.kb.search('allegation greenwashing Bodoni').length, 0);
  // agents
  assert.ok(g.registry.agents.every((a) => a.id.startsWith('GRLP-')));
  assert.ok(f.registry.agents.every((a) => a.id.startsWith('FF-')));
  assert.equal(g.registry.get('FF-A001'), null);
  assert.throws(() => f.policy.request({ action: 'draft.create', title: 'x', agent: 'GRLP-A001' }), /Unknown agent/);
  // records
  assert.equal(f.db.list('buyer').length + f.db.list('listing').length, 0);
  assert.equal(g.db.list('investigation').length, 0);
  // everything either business wrote, searched for the other's name
  const dump = (c) => JSON.stringify([c.db.q('SELECT * FROM records').all(), c.db.q('SELECT * FROM audit').all(), c.db.q('SELECT * FROM approvals').all(), c.db.q('SELECT title, body FROM kb').all()]);
  assert.doesNotMatch(dump(g), /Feral Femme|feral-femme/i);
  assert.doesNotMatch(dump(f), /Garden Route|GRLP|grproperty/i);
  // system prompts
  assert.doesNotMatch(g.tenant.cfg.constitution.join(' ') + g.registry.instructions('GRLP-A039'), /Feral/i);
  assert.doesNotMatch(f.tenant.cfg.constitution.join(' ') + f.registry.instructions('FF-A034'), /Garden Route|GRLP/i);
  g.close(); f.close();
});

test('no business directory contains the other business\'s name', () => {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'data' ? [] : e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
  for (const [id, other] of [['grlp', /Feral Femme|feral-femme/i], ['feral-femme', /Garden Route|GRLP|grproperty/i]]) {
    for (const f of walk(join(AIOS_ROOT, id))) assert.doesNotMatch(readFileSync(f, 'utf8'), other, `${f} mentions the other business`);
  }
  assert.ok(existsSync(join(AIOS_ROOT, '.gitignore')));
});
