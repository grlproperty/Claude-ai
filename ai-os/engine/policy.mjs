/**
 * The approval gate. Every action that leaves the system, commits the business
 * or touches money goes through request() — there is no other route.
 *
 * The level belongs to the ACTION, not to the agent that asks. Handing work to
 * a different agent therefore cannot lower the level, and a business may make
 * an action stricter in tenant.json but never looser.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export const LEVELS = { green: 0, amber: 1, red: 2 };

export const ACTIONS = {
  // GREEN — automatic, internal only
  'research.organise': 'green', 'draft.create': 'green', 'summary.internal': 'green', 'task.create': 'green',
  'analysis.run': 'green', 'report.internal': 'green', 'record.update': 'green',
  // AMBER — a human reviews before it is released
  'social.publish': 'amber', 'website.update': 'amber', 'client.message.send': 'amber', 'campaign.launch': 'amber',
  'editorial.publish': 'amber', 'editorial.review': 'amber', 'newsletter.send': 'amber', 'report.financial.release': 'amber', 'document.customer.release': 'amber',
  'source.verification.confirm': 'amber', 'product.release': 'amber',
  // RED — explicit, typed human authorisation
  'payment.send': 'red', 'bank.details.change': 'red', 'agreement.sign': 'red', 'contract.enter': 'red', 'legal.commitment': 'red',
  'allegation.publish': 'red', 'legal.communication.send': 'red', 'record.delete': 'red', 'permission.change': 'red',
  'employment.decision': 'red', 'tenant.approve': 'red', 'lease.change': 'red', 'valuation.issue': 'red',
  'regulatory.submission': 'red', 'price.change': 'red',
};

export function makePolicy(ctx) {
  const { db, tenant } = ctx;
  const overrides = tenant.cfg.policyOverrides || {};
  for (const [a, l] of Object.entries(overrides)) {
    if (!(a in ACTIONS)) throw new Error(`policyOverrides: unknown action "${a}"`);
    if (LEVELS[l] < LEVELS[ACTIONS[a]]) throw new Error(`policyOverrides may only tighten: "${a}" cannot drop from ${ACTIONS[a]} to ${l}`);
  }
  const levelOf = (action) => {
    if (!(action in ACTIONS)) throw new Error(`Unknown action "${action}" — unregistered actions are refused, not guessed`);
    return overrides[action] || ACTIONS[action];
  };
  const phrase = (id) => `AUTHORISE ${id}`;

  function dispatch(ap) {
    // v1 ships no live outbound connections. Approved work is written to the
    // business's own outbox for a person to send, unless an adapter has been
    // switched on in tenant.json after testing.
    const conf = (tenant.cfg.dispatch || {})[ap.action];
    const adapter = conf?.enabled ? ctx.adapters?.[conf.adapter] : null;
    if (adapter) return adapter(ctx, ap, conf);
    const file = tenant.data('outbox', `${ap.id}-${ap.action}.json`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ approval: ap.id, action: ap.action, title: ap.title, approved_by: ap.decided_by, payload: ap.payload }, null, 2));
    return { adapter: 'outbox', file, note: 'Approved. No live connection for this action yet — ready in the outbox to be sent by a person.' };
  }

  return {
    levelOf, phrase,
    /** Ask to perform an action. Green runs now; amber and red wait for a person. */
    request({ action, title, payload = {}, agent, runId = null, stepId = null }) {
      const level = levelOf(action);
      const spec = ctx.registry.get(agent);
      if (!spec) throw new Error(`Unknown agent "${agent}"`);
      if (LEVELS[level] > LEVELS[spec.approval_ceiling]) {
        db.audit(agent, 'action.denied', action, { reason: `agent ceiling is ${spec.approval_ceiling}; action is ${level}` });
        throw new Error(`${agent} is not permitted to request ${level} action "${action}"`);
      }
      if (level === 'green') {
        db.audit(agent, 'action.auto', action, { title });
        return { level, status: 'done' };
      }
      const id = db.nextId('AP');
      db.q('INSERT INTO approvals VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, level, action, title, db.J(payload), agent, 'pending', null, null, null, runId, stepId, null, db.now());
      db.audit(agent, 'approval.requested', id, { action, level, title });
      return { level, status: 'pending', approvalId: id };
    },
    /** A person decides. Agents cannot call this: `by` must be a named human role. */
    decide(id, { decision, by, note = '', confirm = '' }) {
      const ap = db.approval(id);
      if (!ap) throw new Error(`No approval ${id}`);
      if (ap.status !== 'pending') throw new Error(`${id} is already ${ap.status}`);
      if (!by || ctx.registry.get(by) || /^(orchestrator|system|agent)/i.test(by)) throw new Error('Approvals must be decided by a named person, never by an agent');
      const humans = tenant.cfg.approvers || [];
      if (humans.length && !humans.includes(by)) throw new Error(`"${by}" is not an authorised approver for ${tenant.cfg.name}`);
      if (!['approve', 'reject'].includes(decision)) throw new Error('decision must be approve or reject');
      if (decision === 'approve' && ap.level === 'red' && confirm !== phrase(id)) {
        throw new Error(`Red action: type "${phrase(id)}" exactly to authorise`);
      }
      const status = decision === 'approve' ? 'approved' : 'rejected';
      // Dispatch first: if the hand-off fails, the approval stays pending rather than half-done.
      const d = status === 'approved' ? dispatch({ ...ap, decided_by: by }) : null;
      db.q('UPDATE approvals SET status=?, decided_by=?, decided_at=?, note=?, dispatch=? WHERE id=?').run(status, by, db.now(), note, db.J(d), id);
      db.audit(by, `approval.${status}`, id, { action: ap.action, level: ap.level, note, dispatch: d });
      return { ...db.approval(id) };
    },
  };
}
