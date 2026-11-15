/** Daily, weekly and monthly management reports, and the dashboard state. */
import { writeFileSync, mkdirSync } from 'node:fs';

const DAYS = { day: 1, week: 7, month: 30 };
const LEVEL_RANK = { red: 0, amber: 1 };

export function makeReports(ctx) {
  const { db, registry } = ctx;
  const since = (period) => new Date(ctx.clock().getTime() - DAYS[period] * 864e5).toISOString();
  const today = () => ctx.clock().toISOString().slice(0, 10);
  const name = (id) => registry.get(id)?.name || id;

  function gather(period = 'day') {
    if (!DAYS[period]) throw new Error('period must be day, week or month');
    const from = since(period);
    const m = ctx.metrics;
    const pending = db.approvals("status='pending'").sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
    const open = db.tasks("status IN ('open','blocked')");
    const done = db.tasks("status='done' AND updated_at>=?", from);
    const runs = db.runs(500).filter((r) => r.started_at >= from);
    const stuck = db.runs(500).filter((r) => ['failed', 'blocked'].includes(r.status));
    const steps = db.q('SELECT agent_id, status, count(*) n FROM run_steps WHERE at>=? GROUP BY agent_id, status').all(from);
    const perf = {};
    for (const s of steps) { perf[s.agent_id] ??= { agent: s.agent_id, name: name(s.agent_id), steps: 0, failed: 0, open: 0, done: 0 }; perf[s.agent_id].steps += s.n; if (s.status === 'failed') perf[s.agent_id].failed += s.n; }
    for (const t of open) { perf[t.agent_id] ??= { agent: t.agent_id, name: name(t.agent_id), steps: 0, failed: 0, open: 0, done: 0 }; perf[t.agent_id].open++; }
    for (const t of done) { perf[t.agent_id] ??= { agent: t.agent_id, name: name(t.agent_id), steps: 0, failed: 0, open: 0, done: 0 }; perf[t.agent_id].done++; }
    const denied = db.auditLog(500, from).filter((a) => a.action === 'action.denied');
    const deadlines = m.deadlines(ctx);
    const warnings = [
      ...stuck.map((r) => ({ severity: r.status === 'failed' ? 'high' : 'medium', text: `Workflow ${r.id} (${r.workflow_id}) is ${r.status}: ${r.error}` })),
      ...denied.map((a) => ({ severity: 'high', text: `${name(a.actor)} attempted an action above its permission: ${a.target}` })),
      ...m.warnings(ctx),
    ];
    const stale = pending.filter((a) => ctx.clock() - new Date(a.created_at) > 2 * 864e5);
    const improvements = [
      ...(ctx.llm.available ? [] : [`Claude is not connected for ${ctx.tenant.cfg.name} (set ${ctx.tenant.cfg.env.apiKey}). Drafting agents are queued rather than working.`]),
      ...(stale.length ? [`${stale.length} approval(s) have waited more than two days — approvals are the current bottleneck.`] : []),
      ...Object.values(perf).filter((p) => p.failed).map((p) => `${p.name} failed ${p.failed} step(s) this period — review its inputs or instructions.`),
      ...open.filter((t) => registry.get(t.agent_id)?.status === 'planned').slice(0, 3).map((t) => `Work is queuing for ${name(t.agent_id)}, which is still planned — consider activating it.`),
      ...m.improvements(ctx),
    ];
    const due = open.filter((t) => t.due && t.due <= today());
    const priorities = [
      ...pending.filter((a) => a.level === 'red').map((a) => `Authorise or reject ${a.id}: ${a.title}`),
      ...warnings.filter((w) => w.severity === 'high').map((w) => w.text),
      ...due.map((t) => `${t.due < today() ? 'Overdue' : 'Due today'}: ${t.title} (${t.id})`),
      ...pending.filter((a) => a.level === 'amber').map((a) => `Review ${a.id}: ${a.title}`),
      ...deadlines.filter((d) => !open.some((t) => t.title === d.text)).slice(0, 3).map((d) => `${d.date}: ${d.text}`),
      ...open.filter((t) => t.priority <= 2 && !due.includes(t)).map((t) => `${t.title} (${t.id})`),
    ].slice(0, 3);
    return {
      period, from, generated: ctx.clock().toISOString(),
      completed: { tasks: done, runs: runs.filter((r) => r.status === 'completed'), decisions: db.approvals("status IN ('approved','rejected') AND decided_at>=?", from) },
      attention: [...pending.map((a) => `${a.level.toUpperCase()} approval ${a.id}: ${a.title}`), ...due.map((t) => `Due: ${t.title}`), ...m.attention(ctx)],
      outstanding: open, deadlines, opportunities: m.opportunities(ctx), warnings,
      performance: Object.values(perf).sort((a, b) => b.steps - a.steps), pending, improvements, priorities,
    };
  }

  function markdown(g) {
    const title = { day: 'Daily management report', week: 'Weekly performance report', month: 'Monthly business review' }[g.period];
    const L = (items, f = (x) => x, none = 'Nothing to report.') => (items.length ? items.map((i) => `- ${f(i)}`).join('\n') : none);
    return `# ${ctx.tenant.cfg.name} — ${title}
Generated ${g.generated.slice(0, 16).replace('T', ' ')} UTC by ${ctx.orchestrator.ceo.name} (${ctx.orchestrator.ceo.id}). Period from ${g.from.slice(0, 10)}. Mode: ${ctx.llm.available ? `Claude (${ctx.llm.model})` : 'rules-only'}.

## 1. Completed
${L([...g.completed.runs.map((r) => `Workflow ${r.id} (${r.workflow_id}) completed`), ...g.completed.tasks.map((t) => `${t.title} — ${name(t.agent_id)}`), ...g.completed.decisions.map((a) => `${a.id} ${a.status} by ${a.decided_by}: ${a.title}`)])}

## 2. Needs attention today
${L(g.attention)}

## 3. Outstanding tasks (${g.outstanding.length})
${L(g.outstanding.slice(0, 15), (t) => `[P${t.priority}] ${t.title} — ${name(t.agent_id)} (${t.id}, ${t.status})`)}

## 4. Important deadlines
${L(g.deadlines, (d) => `${d.date} — ${d.text}`)}

## 5. New opportunities
${L(g.opportunities)}

## 6. Problems detected
${L(g.warnings, (w) => `(${w.severity}) ${w.text}`, 'None detected.')}

## 7. Agent performance
${g.performance.length ? `| Agent | Steps run | Failed | Tasks done | Tasks open |\n|---|---|---|---|---|\n${g.performance.map((p) => `| ${p.name} (${p.agent}) | ${p.steps} | ${p.failed} | ${p.done} | ${p.open} |`).join('\n')}` : 'No agent activity in this period.'}

## 8. Pending approvals (${g.pending.length})
${L(g.pending, (a) => `${a.level.toUpperCase()} ${a.id} — ${a.title} (requested by ${name(a.requested_by)})`, 'None.')}

## 9. Suggested improvements
${L(g.improvements, (x) => x, 'None this period.')}

## 10. Three highest-priority actions
${g.priorities.length ? g.priorities.map((p, i) => `${i + 1}. ${p}`).join('\n') : 'No urgent actions.'}
`;
  }

  return {
    gather,
    generate(period = 'day') {
      const g = gather(period); const md = markdown(g);
      const file = ctx.tenant.data('reports', `${period}-${g.generated.slice(0, 10)}.md`);
      mkdirSync(ctx.tenant.data('reports'), { recursive: true });
      writeFileSync(file, md);
      ctx.policy.request({ action: 'report.internal', title: `${period} report`, agent: ctx.orchestrator.ceo.id });
      return { markdown: md, file, data: g };
    },
    /** Everything the command centre shows. */
    state(period = 'day') {
      const g = gather(period);
      const act = db.q('SELECT agent_id, count(*) n, max(at) last FROM run_steps GROUP BY agent_id').all();
      const actMap = Object.fromEntries(act.map((a) => [a.agent_id, a]));
      const usage = db.q('SELECT coalesce(sum(input_tokens),0) i, coalesce(sum(output_tokens),0) o, count(*) calls FROM usage WHERE at>=?').get(g.from);
      return {
        business: { id: ctx.tenant.id, name: ctx.tenant.cfg.name, tagline: ctx.tenant.cfg.tagline, brand: ctx.tenant.cfg.brand, mode: ctx.llm.available ? `Claude · ${ctx.llm.model}` : 'Rules-only (Claude not connected)' },
        period, generated: g.generated,
        priorities: g.priorities, attention: g.attention, warnings: g.warnings, deadlines: g.deadlines, opportunities: g.opportunities,
        approvals: g.pending.map((a) => ({ ...a, requested_by_name: name(a.requested_by), phrase: a.level === 'red' ? ctx.policy.phrase(a.id) : null })),
        tasks: g.outstanding.map((t) => ({ ...t, agent_name: name(t.agent_id) })),
        runs: db.runs(25).map((r) => ({ id: r.id, workflow: r.workflow_id, status: r.status, started: r.started_at, error: r.error, steps: db.runSteps(r.id).map((s) => ({ name: s.name, agent: name(s.agent_id), status: s.status, error: s.error })) })),
        workflows: ctx.workflows.list(),
        agents: { total: registry.agents.length, by_status: registry.agents.reduce((o, a) => ((o[a.status] = (o[a.status] || 0) + 1), o), {}),
          list: registry.agents.map((a) => ({ id: a.id, name: a.name, department: a.department, status: a.status, ceiling: a.approval_ceiling, wave: a.wave, steps: actMap[a.id]?.n || 0, last: actMap[a.id]?.last || null })) },
        usage, performance: g.performance,
        ...ctx.metrics.dashboard(ctx, g.from, period),
        targets: db.getSetting('targets', ctx.tenant.cfg.targets || null),
        approvers: ctx.tenant.cfg.approvers,
      };
    },
  };
}
