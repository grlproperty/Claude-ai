/**
 * The central orchestrator ("AI CEO") for one business. It receives an
 * instruction, decides which workflow or agent owns it, starts the work,
 * and turns anything it cannot complete into a tracked task rather than
 * dropping it.
 */
const words = (s) => new Set(String(s).toLowerCase().match(/[a-z]{4,}/g) || []);

function trailingJson(text) {
  const i = text.indexOf('{');
  if (i < 0) return [text.trim(), null];
  try { return [text.slice(0, i).trim(), JSON.parse(text.slice(i))]; } catch { return [text.trim(), null]; }
}

export function makeOrchestrator(ctx) {
  const { db, registry } = ctx;
  const ceo = registry.agents.find((a) => a.is_orchestrator);

  function ruleRoute(text) {
    for (const r of ctx.tenant.cfg.routes || []) if (new RegExp(r.match, 'i').test(text)) return { kind: r.workflow ? 'workflow' : 'agent', id: r.workflow || r.agent, by: 'rule', direct: Boolean(r.direct) };
    const q = words(text); let best = null;
    for (const a of registry.agents) {
      const hay = words(`${a.name} ${a.role}`); let score = 0;
      for (const w of q) if (hay.has(w)) score++;
      if (score && (!best || score > best.score)) best = { score, a };
    }
    return best ? { kind: 'agent', id: best.a.id, by: 'keyword' } : { kind: 'none', by: 'none' };
  }

  async function llmRoute(text) {
    const schema = { type: 'object', additionalProperties: false, required: ['kind', 'id', 'input', 'reason'], properties: {
      kind: { type: 'string', enum: ['workflow', 'agent', 'none'] }, id: { type: 'string' }, reason: { type: 'string' },
      input: { type: 'object', additionalProperties: true } } };
    const catalogue = `Workflows:\n${ctx.workflows.list().map((w) => `- ${w.id}: ${w.name}. Required input fields: ${(w.required || []).join(', ')}`).join('\n')}\n\nAgents:\n${registry.agents.map((a) => `- ${a.id} ${a.name} (${a.department}; ${a.status}): ${a.role}`).join('\n')}`;
    const r = await ctx.llm.run(ceo, `${catalogue}\n\nInstruction from the owner:\n"""${text}"""\n\nChoose the one workflow or agent that owns this. Extract into "input" only values the owner actually stated — never fill a gap with a guess. Use kind "none" if nothing fits.`, { schema, effort: 'low' });
    return { ...r.json, by: 'claude' };
  }

  async function runAgent(agent, text, input, direct) {
    if (direct && !input) input = { question: text };
    if (agent.handler && ctx.handlers[agent.handler] && input) {
      const out = await ctx.handlers[agent.handler](ctx, { input });
      ctx.policy.request({ action: 'analysis.run', title: `${agent.name}: ${text.slice(0, 80)}`, agent: agent.id });
      return { mode: 'handler', out };
    }
    if (ctx.llm.available) {
      const knowledge = ctx.kb.search(text, { dept: agent.department_id, limit: 5 }).map((k) => ({ ...k, body: ctx.kb.read(k.path).body }));
      const r = await ctx.llm.run(agent, `Task from the orchestrator:\n${text}\n${input ? `\nStructured input:\n${JSON.stringify(input, null, 2)}` : ''}\n\nProduce an internal draft only. List anything you needed but were not given under "Missing information".`, { knowledge });
      ctx.policy.request({ action: 'draft.create', title: `${agent.name}: ${text.slice(0, 80)}`, agent: agent.id });
      return { mode: 'claude', out: { draft: r.text, knowledge_used: knowledge.map((k) => k.path) } };
    }
    return null;
  }

  return {
    ceo,
    async instruct(text, by = 'owner') {
      const [prose, json] = trailingJson(text);
      db.audit(by, 'instruction.received', ceo.id, { text: prose });
      let route = ruleRoute(prose);
      if (ctx.llm.available && route.by !== 'rule') { try { route = await llmRoute(text); } catch (e) { db.audit('system', 'route.fallback', ceo.id, { error: e.message }); } }
      const input = json || route.input || null;

      if (route.kind === 'workflow') {
        const miss = ctx.workflows.missing(route.id, input || {});
        if (miss.length) {
          const def = ctx.workflows.defs.get(route.id);
          const task = db.addTask({ title: `${def.name}: information needed before it can start`, detail: `Missing: ${miss.join(', ')}\nInstruction: ${prose}`, agent: def.steps[0].agent, priority: 2, by: ceo.id });
          return { routed: route, status: 'needs_information', missing: miss, task, summary: `${def.name} is the right workflow, but it cannot start without: ${miss.join(', ')}. Logged as ${task}.` };
        }
        const run = await ctx.workflows.start(route.id, input, by);
        return { routed: route, status: run.status, run: run.id, summary: `${ctx.workflows.defs.get(route.id).name} started as ${run.id} — now ${run.status}${run.error ? ` (${run.error})` : ''}.` };
      }

      if (route.kind === 'agent') {
        const agent = registry.get(route.id);
        const task = db.addTask({ title: prose.slice(0, 140), detail: prose, agent: agent.id, by: ceo.id });
        let done = null;
        try { done = await runAgent(agent, prose, input, route.direct); } catch (e) { db.setTask(task, 'blocked', { error: e.message }, ceo.id); return { routed: route, status: 'blocked', task, summary: `${agent.name} could not complete this: ${e.message}` }; }
        if (done) { db.setTask(task, 'done', done.out, agent.id); return { routed: route, status: 'done', task, result: done.out, summary: `${agent.name} (${agent.id}) completed this${done.mode === 'claude' ? ' as an internal draft' : ''}. Result stored on ${task}.` }; }
        const why = agent.status === 'planned' ? 'this agent is planned, not yet active' : 'it needs Claude connected (no API key set), or structured input';
        return { routed: route, status: 'queued', task, summary: `Assigned to ${agent.name} (${agent.id}) as ${task}. Not executed automatically: ${why}.` };
      }

      const task = db.addTask({ title: `Unrouted instruction: ${prose.slice(0, 100)}`, detail: prose, agent: ceo.id, priority: 2, by });
      return { routed: route, status: 'unrouted', task, summary: `No workflow or agent clearly owns this. Logged as ${task} for the orchestrator rather than guessed.` };
    },
    async decide(id, decision) {
      const ap = ctx.policy.decide(id, decision);
      const run = await ctx.workflows.onDecision(ap);
      return { approval: ap, run };
    },
  };
}
