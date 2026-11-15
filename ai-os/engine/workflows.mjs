/**
 * The automation engine. A workflow is a JSON file of ordered steps; each step
 * names the responsible agent and the handler that does the work. A step with
 * a `gate` stops the run until a person decides.
 */
import { readFileSync, readdirSync } from 'node:fs';

const pick = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
const fill = (tpl, state) => String(tpl).replace(/\{\{([\w.]+)\}\}/g, (_, p) => pick(state, p) ?? '?');

export function makeWorkflows(ctx) {
  const { db } = ctx;
  const dir = ctx.tenant.path('workflows');
  const defs = new Map(readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => { const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')); return [d.id, d]; }));
  for (const d of defs.values()) for (const s of d.steps) {
    if (!ctx.registry.get(s.agent)) throw new Error(`Workflow ${d.id} step ${s.id}: unknown agent ${s.agent}`);
    if (!ctx.handlers[s.run]) throw new Error(`Workflow ${d.id} step ${s.id}: no handler "${s.run}"`);
    if (s.gate) ctx.policy.levelOf(s.gate.action);
  }
  const save = (run) => db.q('UPDATE runs SET status=?, state=?, next_step=?, finished_at=?, error=? WHERE id=?').run(run.status, db.J(run.state), run.next_step, run.finished_at || null, run.error || null, run.id);
  const logStep = (run, i, s, status, output, error) => db.q('INSERT INTO run_steps VALUES(?,?,?,?,?,?,?,?,?)').run(run.id, i, s.id, s.name, s.agent, status, db.J(output), error || null, db.now());

  async function advance(runId) {
    const run = db.run(runId);
    const def = defs.get(run.workflow_id);
    run.status = 'running';
    for (let i = run.next_step; i < def.steps.length; i++) {
      const s = def.steps[i];
      let out;
      try {
        out = (await ctx.handlers[s.run](ctx, run.state, { run, step: s })) ?? {};
      } catch (e) {
        logStep(run, i, s, 'failed', null, e.message);
        if (s.onError === 'continue') { run.state[s.id] = { error: e.message }; continue; }
        Object.assign(run, { status: 'failed', next_step: i, error: `${s.name}: ${e.message}` });
        save(run);
        db.addTask({ title: `Workflow ${run.id} failed at "${s.name}"`, detail: e.message, agent: s.agent, priority: 1, runId, by: 'orchestrator' });
        return db.run(runId);
      }
      run.state[s.id] = out;
      if (out.halt) {
        logStep(run, i, s, 'blocked', out);
        Object.assign(run, { status: 'blocked', next_step: i, error: out.halt });
        save(run);
        db.addTask({ title: `${def.name} ${run.id} is waiting: ${out.halt}`, detail: JSON.stringify(out.missing || out.problems || []), agent: s.agent, priority: 2, runId, by: 'orchestrator' });
        return db.run(runId);
      }
      if (s.gate) {
        const req = ctx.policy.request({ action: out.gate_action || s.gate.action, title: fill(s.gate.title, run.state), payload: out, agent: s.agent, runId, stepId: s.id });
        if (req.status === 'pending') {
          logStep(run, i, s, 'awaiting_approval', { ...out, approvalId: req.approvalId });
          Object.assign(run, { status: 'waiting_approval', next_step: i + 1 });
          run.state[s.id].approvalId = req.approvalId;
          save(run);
          return db.run(runId);
        }
      }
      logStep(run, i, s, 'done', out);
    }
    Object.assign(run, { status: 'completed', next_step: def.steps.length, finished_at: db.now(), error: null });
    save(run);
    db.audit('orchestrator', 'workflow.completed', run.id, { workflow: def.id });
    return db.run(runId);
  }

  return {
    defs,
    list: () => [...defs.values()].map((d) => ({ id: d.id, name: d.name, trigger: d.trigger, required: d.required, example: d.example, steps: d.steps.map((s) => ({ id: s.id, name: s.name, agent: s.agent, gate: s.gate ? { action: s.gate.action, level: ctx.policy.levelOf(s.gate.action) } : null })) })),
    missing(id, input) { const d = defs.get(id); if (!d) throw new Error(`No workflow "${id}"`); return (d.required || []).filter((f) => pick(input, f) == null || pick(input, f) === ''); },
    async start(id, input = {}, by = 'owner') {
      const miss = this.missing(id, input);
      if (miss.length) throw Object.assign(new Error(`${defs.get(id).name} needs: ${miss.join(', ')}`), { missing: miss });
      const runId = db.nextId('RUN');
      db.q('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?)').run(runId, id, 'running', db.J(input), db.J({ input, run: { id: runId } }), 0, db.now(), null, null);
      db.audit(by, 'workflow.started', runId, { workflow: id });
      return advance(runId);
    },
    /** Supply missing information to a blocked run, or retry a failed one. */
    async resume(runId, patch = {}, by = 'owner') {
      const run = db.run(runId);
      if (!run) throw new Error(`No run ${runId}`);
      if (!['blocked', 'failed'].includes(run.status)) throw new Error(`${runId} is ${run.status}; only blocked or failed runs can be resumed`);
      run.state.input = { ...run.state.input, ...patch };
      db.q('UPDATE runs SET state=? WHERE id=?').run(db.J(run.state), runId);
      db.audit(by, 'workflow.resumed', runId, { fields: Object.keys(patch) });
      return advance(runId);
    },
    /** Called after a person decides an approval that belongs to a run. */
    async onDecision(ap) {
      if (!ap.run_id) return null;
      const run = db.run(ap.run_id);
      if (run.status !== 'waiting_approval') return run;
      if (ap.status === 'approved') {
        const def = defs.get(run.workflow_id); const i = run.next_step - 1;
        logStep(run, i, def.steps[i], 'done', { approved_by: ap.decided_by, approval: ap.id });
        return advance(run.id);
      }
      db.q("UPDATE runs SET status='rejected', finished_at=?, error=? WHERE id=?").run(db.now(), `Rejected by ${ap.decided_by}: ${ap.note || 'no reason given'}`, run.id);
      db.addTask({ title: `Rework after rejection (${ap.id}): ${ap.title}`, detail: ap.note || '', agent: ap.requested_by, priority: 2, runId: run.id, by: ap.decided_by });
      return db.run(run.id);
    },
  };
}
