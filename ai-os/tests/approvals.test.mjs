import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ACTIONS, LEVELS, makePolicy } from '../engine/policy.mjs';
import { ctxFor, example, pending } from './helpers.mjs';

test('green runs automatically; amber and red wait for a person', async () => {
  const c = await ctxFor('grlp');
  assert.equal(c.policy.request({ action: 'draft.create', title: 't', agent: 'GRLP-A039' }).status, 'done');
  assert.equal(c.policy.request({ action: 'social.publish', title: 't', agent: 'GRLP-A042' }).status, 'pending');
  const red = c.policy.request({ action: 'payment.send', title: 't', agent: 'GRLP-A148' });
  assert.equal(red.level, 'red'); assert.equal(pending(c).length, 2);
  c.close();
});

test('the sensitive actions in the brief are all red, and unknown actions are refused', async () => {
  for (const a of ['payment.send', 'bank.details.change', 'agreement.sign', 'contract.enter', 'legal.commitment', 'allegation.publish', 'legal.communication.send', 'record.delete', 'permission.change', 'employment.decision', 'tenant.approve', 'lease.change', 'valuation.issue']) assert.equal(ACTIONS[a], 'red', a);
  for (const a of ['social.publish', 'website.update', 'client.message.send', 'campaign.launch', 'editorial.publish', 'report.financial.release', 'document.customer.release']) assert.equal(ACTIONS[a], 'amber', a);
  const c = await ctxFor('grlp');
  assert.throws(() => c.policy.request({ action: 'wire.transfer', title: 't', agent: 'GRLP-A001' }), /Unknown action/);
  c.close();
});

test('an agent cannot request above its ceiling, and delegating does not lower the level', async () => {
  const c = await ctxFor('grlp');
  // a green-ceiling agent may not even ask for an amber action
  assert.throws(() => c.policy.request({ action: 'client.message.send', title: 't', agent: 'GRLP-A024' }), /not permitted/);
  assert.ok(c.db.auditLog().some((a) => a.action === 'action.denied'));
  // handing the same action to the orchestrator still produces a pending approval, never an automatic send
  const viaBoss = c.policy.request({ action: 'client.message.send', title: 't', agent: 'GRLP-A001' });
  assert.equal(viaBoss.status, 'pending');
  // no agent in either registry has a ceiling that lets it bypass: ceilings only gate REQUESTS
  assert.ok(c.registry.agents.every((a) => a.approval_ceiling in LEVELS));
  c.close();
});

test('only a named, authorised person can decide; agents cannot approve', async () => {
  const c = await ctxFor('grlp');
  const { approvalId } = c.policy.request({ action: 'social.publish', title: 't', agent: 'GRLP-A042' });
  for (const by of ['GRLP-A001', 'orchestrator', 'system', '', 'Somebody Else']) assert.throws(() => c.policy.decide(approvalId, { decision: 'approve', by }), /named person|not an authorised approver/);
  const ap = c.policy.decide(approvalId, { decision: 'approve', by: 'Kandy Grieve' });
  assert.equal(ap.status, 'approved'); assert.equal(ap.decided_by, 'Kandy Grieve');
  assert.throws(() => c.policy.decide(approvalId, { decision: 'approve', by: 'Kandy Grieve' }), /already approved/);
  c.close();
});

test('red needs the typed phrase; approved work goes to the outbox, not out of the door', async () => {
  const c = await ctxFor('grlp');
  const { approvalId } = c.policy.request({ action: 'payment.send', title: 'Pay supplier', payload: { amount: 1 }, agent: 'GRLP-A148' });
  assert.throws(() => c.policy.decide(approvalId, { decision: 'approve', by: 'Mandy Pelser' }), /AUTHORISE/);
  assert.throws(() => c.policy.decide(approvalId, { decision: 'approve', by: 'Mandy Pelser', confirm: 'authorise' }), /AUTHORISE/);
  const ap = c.policy.decide(approvalId, { decision: 'approve', by: 'Mandy Pelser', confirm: `AUTHORISE ${approvalId}` });
  assert.equal(ap.dispatch.adapter, 'outbox'); assert.ok(existsSync(ap.dispatch.file));
  assert.equal(JSON.parse(readFileSync(ap.dispatch.file, 'utf8')).approved_by, 'Mandy Pelser');
  c.close();
});

test('a business may tighten the policy but never loosen it', async () => {
  const c = await ctxFor('grlp');
  c.tenant.cfg.policyOverrides = { 'payment.send': 'amber' };
  assert.throws(() => makePolicy(c), /only tighten/);
  c.tenant.cfg.policyOverrides = { 'social.publish': 'red' };
  assert.equal(makePolicy(c).levelOf('social.publish'), 'red');
  c.tenant.cfg.policyOverrides = {};
  c.close();
});

test('rejecting stops the workflow and raises rework; nothing is dispatched', async () => {
  const c = await ctxFor('grlp'); c.seed(c);
  const run = await c.workflows.start('new-buyer-enquiry', example(c, 'new-buyer-enquiry'));
  const ap = pending(c)[0];
  const r = await c.orchestrator.decide(ap.id, { decision: 'reject', by: 'Mandy Pelser', note: 'Wrong tone' });
  assert.equal(r.run.status, 'rejected'); assert.equal(r.approval.dispatch, null);
  assert.ok(c.db.tasks("status='open'").some((t) => /Rework after rejection/.test(t.title)));
  assert.ok(!c.db.runSteps(run.id).some((s) => s.step_id === 'crm'), 'later steps did not run');
  c.close();
});

test('every decision is in the audit trail', async () => {
  const c = await ctxFor('feral-femme');
  const { approvalId } = c.policy.request({ action: 'social.publish', title: 't', agent: 'FF-A061' });
  c.policy.decide(approvalId, { decision: 'approve', by: 'Ayden Rosemary Brown' });
  const log = c.db.auditLog().map((a) => `${a.actor}:${a.action}`);
  assert.ok(log.includes('FF-A061:approval.requested')); assert.ok(log.includes('Ayden Rosemary Brown:approval.approved'));
  c.close();
});
