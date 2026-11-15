import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { checkSource, classifyClaims, voiceCheck, factCheck, datasetStatus } from '../feral-femme/handlers/lib.mjs';
import { ctxFor, example, pending, approveAll, siteCopy } from './helpers.mjs';

const BY = 'Ayden Rosemary Brown';
const src = { publisher: 'NY Attorney General', title: 'Press release', url: 'https://ag.ny.gov/x', date: '2024-02', type: 'primary' };

test('source checks are structural and say so', () => {
  assert.ok(checkSource(src, [{ name: 'NY Attorney General', url: 'https://ag.ny.gov/' }]).ok);
  assert.match(checkSource(src, []).authority, /person must vet/);
  const bad = checkSource({ publisher: '', url: 'http://x', date: 'last year', type: 'blog' }, []);
  assert.equal(bad.problems.length, 5);
});

test('evidence classification blocks unsourced claims and allegations worded as fact', () => {
  const ok = classifyClaims([{ text: 'The regulator alleged the label misled buyers.', classification: 'allegation', sources: [1] }, { text: 'We read this as a pattern.', classification: 'editorial_interpretation' }], [src]);
  assert.ok(ok.ok);
  const p = (c) => classifyClaims([c], [src]).problems.join(' | ');
  assert.match(p({ text: 'The company misled buyers.', classification: 'allegation', sources: [1] }), /must say who alleges/);
  assert.match(p({ text: 'The company misled buyers.', classification: 'established_fact' }), /no traceable source/);
  assert.match(p({ text: 'The regulator sued the company, alleging fraud.', classification: 'established_fact', sources: [1] }), /classified as established fact/);
  assert.match(p({ text: 'Something.', classification: 'rumour', sources: [1] }), /classification must be one of/);
  assert.match(p({ text: 'Something.', classification: 'finding', sources: [7] }), /does not exist/);
  assert.match(classifyClaims([{ text: '62% of products failed.', classification: 'finding', sources: [1] }], [{ ...src, date: '' }]).problems.join(), /named body and a dated publication/);
});

test('voice check rejects sensational writing and passes restrained writing', () => {
  assert.ok(voiceCheck('The regulator found the claim unsupported. The company disputes this.', 'What "natural" means on a label').passed);
  const v = voiceCheck('This shocking report exposed the truth!', 'You won\'t believe what they found').violations.join('|');
  assert.match(v, /shocking/); assert.match(v, /exposed/); assert.match(v, /Exclamation/); assert.match(v, /you won't believe/);
  assert.ok(voiceCheck('The medieval period', '').passed, 'matches whole words only (no "evil" in "medieval")');
});

test('fact check: every figure and publisher must be on the verification sheet', () => {
  const claims = [{ text: 'The regulator fined the firm $4 million in 2025.', classification: 'finding', sources: [1] }];
  assert.ok(factCheck('The regulator fined the firm $4 million in 2025, according to the NY Attorney General.', claims, [src]).passed);
  assert.match(factCheck('The NY Attorney General fined the firm $9 million.', claims, [src]).violations[0], /Figure "9"/);
  assert.match(factCheck('The firm was fined $4 million in 2025.', claims, [src]).violations[0], /not credited by name/);
});

test('dataset review cycle', () => {
  assert.equal(datasetStatus({ reviewed: '2026-01-01', reviewCycleDays: 120 }, 'a.json', '2026-11-15').status, 'overdue');
  assert.equal(datasetStatus({ reviewed: '2026-08-31', reviewCycleDays: 120 }, 'a.json', '2026-11-15').status, 'current');
  assert.equal(datasetStatus({}, 'a.json', '2026-11-15').status, 'no review cycle declared');
});

test('workflow: new investigation passes four human gates, and an allegation needs red authorisation', async () => {
  const c = await ctxFor('feral-femme');
  const run = await c.workflows.start('new-investigation', example(c, 'new-investigation'));
  assert.equal(run.status, 'waiting_approval');
  assert.equal(pending(c)[0].action, 'source.verification.confirm', 'no draft exists before a person has verified the sources');
  assert.equal(run.state.draft, undefined);
  const levels = await approveAll(c, BY, run.id);
  assert.deepEqual(levels, ['source.verification.confirm:amber', 'editorial.review:amber', 'allegation.publish:red', 'social.publish:amber']);
  const done = c.db.run(run.id); assert.equal(done.status, 'completed'); assert.equal(c.db.runSteps(run.id).filter((s) => s.status === 'done').length, 16);
  const md = done.state.draft.markdown;
  assert.match(md, /^---\ntitle: "SAMPLE/); assert.match(md, /topic: "Food & Agriculture"/); assert.match(md, /NY Attorney General/); assert.match(md, /What is not established/); assert.match(md, /DRAFT SKELETON/);
  assert.match(done.state.visual.disclosure, /Not documentary photography/);
  assert.match(done.state.final.before_approving[0], /skeleton/);
  assert.equal(done.state.publish.status, 'approved — file in outbox, to be added to content/field-notes by a person');
  assert.equal(c.db.list('archive_entry')[0].approvals.length, 4);
  c.close();
});

test('workflow: a note with no allegation needs only amber approval to publish', async () => {
  const c = await ctxFor('feral-femme'); const i = example(c, 'new-investigation');
  i.claims = [{ text: 'The New York Attorney General published a press release about JBS USA in February 2024.', classification: 'established_fact', sources: [1] }];
  const run = await c.workflows.start('new-investigation', i);
  assert.ok((await approveAll(c, BY, run.id)).includes('editorial.publish:amber'));
  c.close();
});

test('workflow: bad evidence is stopped before any draft is written', async () => {
  const c = await ctxFor('feral-femme'); const base = example(c, 'new-investigation');
  const a = await c.workflows.start('new-investigation', { ...base, industry: 'Lifestyle' }); assert.equal(a.status, 'blocked'); assert.match(a.error, /industry/);
  const b = await c.workflows.start('new-investigation', { ...base, sources: [] }); assert.match(b.error, /no public sources/);
  const d = await c.workflows.start('new-investigation', { ...base, sources: [{ ...base.sources[0], date: '' }] }); assert.match(d.error, /sources incomplete/);
  const e = await c.workflows.start('new-investigation', { ...base, claims: [{ text: 'JBS misled consumers.', classification: 'established_fact' }] }); assert.match(e.error, /evidence classification failed/);
  const f = await c.workflows.start('new-investigation', { ...base, title: 'SAMPLE — The shocking truth about meat' });
  await approveAll(c, BY, f.id); assert.match(c.db.run(f.id).error, /voice check failed/);
  assert.equal(c.db.list('field_note').length, 0);
  c.close();
});

test('rejecting the verification sheet stops the investigation', async () => {
  const c = await ctxFor('feral-femme');
  const run = await c.workflows.start('new-investigation', example(c, 'new-investigation'));
  const r = await c.orchestrator.decide(pending(c)[0].id, { decision: 'reject', by: BY, note: 'Line 1: the source does not say "misled"' });
  assert.equal(r.run.status, 'rejected'); assert.equal(c.db.run(run.id).state.draft, undefined);
  c.close();
});

test('site-file adapter: off by default; when enabled it writes the approved note and never overwrites', async () => {
  const site = siteCopy();
  const c = await ctxFor('feral-femme', { mounts: { site: { path: site, mode: 'rw' } } });
  c.tenant.cfg.dispatch['allegation.publish'].enabled = true;
  const run = await c.workflows.start('new-investigation', example(c, 'new-investigation')); await approveAll(c, BY, run.id);
  const file = c.db.run(run.id).state.publish.file;
  assert.ok(file.startsWith(site) && existsSync(file)); assert.match(readFileSync(file, 'utf8'), /^---\ntitle: "SAMPLE/);
  assert.equal(readdirSync(`${site}/field-notes`).length, 19);
  c.tenant.cfg.dispatch['allegation.publish'].enabled = false; c.close();
  const ro = await ctxFor('feral-femme', { mounts: { site: { path: site, mode: 'ro' } } });
  ro.tenant.cfg.dispatch['allegation.publish'].enabled = true;
  const r2 = await ro.workflows.start('new-investigation', example(ro, 'new-investigation'));
  await assert.rejects(() => approveAll(ro, BY, r2.id), /read-only/);
  assert.equal(pending(ro).length, 1, 'a failed hand-off leaves the approval pending, not half-done');
  ro.tenant.cfg.dispatch['allegation.publish'].enabled = false; ro.close();
});

test('workflow: digital product — no invented prices, catalogue respected', async () => {
  const c = await ctxFor('feral-femme'); const base = example(c, 'digital-product');
  const run = await c.workflows.start('digital-product', base);
  assert.equal(pending(c)[0].action, 'product.release'); assert.match(pending(c)[0].payload.before_approving[0], /NOT READY TO SELL/);
  await approveAll(c, BY, run.id); assert.equal(c.db.run(run.id).status, 'completed');
  const noPrice = await c.workflows.start('digital-product', { ...base, price: null }); assert.match(noPrice.error, /no price decided/);
  const odd = await c.workflows.start('digital-product', { ...base, price: 45 });
  assert.equal(pending(c).find((a) => a.run_id === odd.id).level, 'red', 'a price outside the catalogue needs explicit authorisation');
  const noDemand = await c.workflows.start('digital-product', { ...base, demand_evidence: [] }); assert.match(noDemand.error, /research incomplete/);
  c.close();
});

test('integrity sweep reads the real site datasets and audits published notes', async () => {
  const c = await ctxFor('feral-femme', { clock: () => new Date('2027-03-10T08:00:00Z') });
  const s = (await c.workflows.start('integrity-sweep')).state;
  assert.equal(s.datasets.datasets.length, 10); assert.ok(s.datasets.datasets.some((d) => d.status === 'overdue'));
  assert.ok(c.db.tasks("status='open'").some((t) => /Review dataset/.test(t.title)));
  assert.equal(s.notes.notes, 18); assert.deepEqual(s.notes.problems, []);
  const before = c.db.tasks("status='open'").length; await c.workflows.start('integrity-sweep'); assert.equal(c.db.tasks("status='open'").length, before, 'no duplicate tasks');
  c.close();
});

test('orchestrator answers standards questions from the knowledge base', async () => {
  const c = await ctxFor('feral-femme');
  const r = await c.orchestrator.instruct('What is our corrections policy?');
  assert.equal(r.routed.id, 'FF-A005'); assert.match(JSON.stringify(r.result), /research-standards\.md/);
  const n = await c.orchestrator.instruct('Open a new investigation into fast fashion audits'); assert.equal(n.status, 'needs_information');
  c.close();
});
