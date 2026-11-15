/**
 * Generates each business's registry (JSON, CSV, one instruction file per
 * agent) and its implementation roadmap from registry/source.mjs.
 * Run for every business, or pass one business id as the argument.
 */
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { AIOS_ROOT, listTenants } from './tenant.mjs';

const CEIL = { g: 'green', a: 'amber', r: 'red' };
const PERM = {
  green: 'May carry out internal, low-risk work automatically (research, drafts, summaries, tasks, analysis, internal reports). May not request anything that leaves the business.',
  amber: 'May prepare customer-facing or public work and submit it for human review. Nothing is released until a named person approves it.',
  red: 'May prepare a request for an action that commits the business or moves money. It proceeds only on explicit, typed human authorisation.',
};
const COST = (c) => (c <= 2 ? 'Low' : c === 3 ? 'Medium' : 'High');
const WAVE = { 1: 'Wave 1 — first working system (built)', 2: 'Wave 2 — core operations', 3: 'Wave 3 — marketing department', 4: 'Wave 4 — needs a connected application', 5: 'Wave 5 — expansion' };
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

for (const id of process.argv[2] ? [process.argv[2]] : listTenants()) {
  const root = join(AIOS_ROOT, id);
  const cfg = JSON.parse(readFileSync(join(root, 'tenant.json'), 'utf8'));
  const src = (await import(pathToFileURL(join(root, 'registry', 'source.mjs')).href)).default;
  const aid = (n) => `${src.prefix}-A${String(n).padStart(3, '0')}`;
  const orchestratorN = src.departments[0].head;
  const agents = [];
  for (const d of src.departments) for (const [n, name, role, ceil, wave, value, time, revenue, complexity, handler, flag] of d.agents) {
    const isHead = n === d.head, isOrch = n === orchestratorN;
    agents.push({
      id: aid(n), number: n, name, department_id: d.id, department: d.name,
      level: isOrch ? 'Level 2 — Central orchestrator' : isHead ? 'Level 3 — Department head' : 'Level 4 — Specialist',
      is_orchestrator: isOrch, reports_to: isOrch ? `Human owner (${cfg.approvers.join(' / ')})` : isHead ? aid(orchestratorN) : aid(d.head),
      role, responsibilities: [role, ...(isHead && !isOrch ? [`Assigns and checks the work of the ${d.name} agents and reports to the orchestrator.`] : [])],
      inputs: d.inputs, outputs: d.outputs, tools: d.tools,
      approval_ceiling: CEIL[ceil], permissions: PERM[CEIL[ceil]], kpis: d.kpis, escalation: d.escalate,
      audit: 'Every step, request and result is written to this business\'s audit log with the agent ID and time.',
      status: handler ? 'live' : flag === 'planned' ? 'planned' : 'llm-ready', handler: handler || null,
      wave, scores: { business_value: value, time_saved: time, revenue_potential: revenue, complexity },
      priority: (value + time + revenue) * 2 - complexity * 2, monthly_cost_band: COST(complexity),
      instructions_file: `registry/instructions/${aid(n)}.md`,
    });
  }
  const dup = agents.map((a) => a.id).filter((x, i, arr) => arr.indexOf(x) !== i);
  if (dup.length) throw new Error(`${id}: duplicate agent ids ${dup}`);

  const out = join(root, 'registry');
  rmSync(join(out, 'instructions'), { recursive: true, force: true });
  mkdirSync(join(out, 'instructions'), { recursive: true });
  writeFileSync(join(out, 'agents.json'), JSON.stringify({ business: cfg.name, generated_from: 'registry/source.mjs', departments: src.departments.map((d) => ({ id: d.id, name: d.name, head: aid(d.head), rules: d.rules || [] })), agents }, null, 1));
  const cols = ['id', 'name', 'department', 'level', 'reports_to', 'role', 'inputs', 'outputs', 'tools', 'approval_ceiling', 'permissions', 'kpis', 'escalation', 'status', 'wave', 'priority', 'monthly_cost_band'];
  writeFileSync(join(out, 'agents.csv'), [cols.join(','), ...agents.map((a) => cols.map((c) => csv(a[c])).join(','))].join('\n') + '\n');

  for (const a of agents) {
    const d = src.departments.find((x) => x.id === a.department_id);
    writeFileSync(join(out, 'instructions', `${a.id}.md`), `# ${a.name} — ${a.id}

You are the **${a.name}** of ${cfg.name}. You work only for ${cfg.name} and know nothing of any other business.

- **Department:** ${a.department} (${a.department_id})
- **Level:** ${a.level}
- **Reports to:** ${a.reports_to}
- **Status:** ${a.status}${a.handler ? ` (coded handler \`${a.handler}\`)` : ''}

## Role
${a.role}

## Responsibilities
${a.responsibilities.map((r) => `- ${r}`).join('\n')}

## Inputs you need
${a.inputs}. If a required input is missing, stop and list what is missing. Do not fill gaps with assumptions.

## Outputs you produce
${a.outputs}.

## Tools
${a.tools}.

## Permissions and approval
Ceiling: **${a.approval_ceiling.toUpperCase()}**. ${a.permissions}
You never approve your own work or another agent's, and passing work to another agent does not change the approval it needs.

## Escalate to a person when
${a.escalation}.

## How your performance is measured
${a.kpis}.

## Department rules
${(d.rules || ['Follow the business rules below.']).map((r) => `- ${r}`).join('\n')}

## Audit
${a.audit}
`);
  }

  const byWave = {};
  for (const a of [...agents].sort((x, y) => x.wave - y.wave || y.priority - x.priority)) (byWave[a.wave] ??= []).push(a);
  const count = (s) => agents.filter((a) => a.status === s).length;
  writeFileSync(join(root, 'docs', '04-implementation-roadmap.md'), `# ${cfg.name} — implementation roadmap

Generated from \`registry/source.mjs\` by \`npm run build\`. Do not edit by hand.

**${agents.length} agent roles** in ${src.departments.length} departments: **${count('live')} live** (coded and tested), **${count('llm-ready')} ready** (instruction profile written; works as soon as Claude is connected for this business), **${count('planned')} planned** (needs a connected application first).

Scores are 1–5. Priority = 2 × (business value + time saved + revenue potential) − 2 × complexity. They are the architect's estimates, to be corrected by management; nothing here is a measured result. Cost band is indicative monthly Claude usage for that role at expected volume: Low under about R150, Medium R150–R600, High above R600 (assumptions in \`../../docs/cost-and-resource-plan.md\`).

${Object.entries(byWave).map(([w, list]) => `## ${WAVE[w]}

| Agent | Department | Status | Value | Time | Revenue | Complexity | Priority | Cost |
|---|---|---|---|---|---|---|---|---|
${list.map((a) => `| ${a.name} (${a.id}) | ${a.department_id} | ${a.status} | ${a.scores.business_value} | ${a.scores.time_saved} | ${a.scores.revenue_potential} | ${a.scores.complexity} | ${a.priority} | ${a.monthly_cost_band} |`).join('\n')}`).join('\n\n')}
`);

  writeFileSync(join(root, 'docs', '03-agent-registry.md'), `# ${cfg.name} — agent registry

Generated from \`registry/source.mjs\` by \`npm run build\`. Do not edit by hand.

The registry is data, in three forms:

- **\`registry/agents.csv\`** — the spreadsheet: one row per agent, opens in Excel or Google Sheets.
- **\`registry/agents.json\`** — what the system itself reads.
- **\`registry/instructions/${src.prefix}-Annn.md\`** — one instruction file per agent.

Every agent has: unique name and ID, department, level, who it reports to, role, responsibilities, instructions, required inputs, expected outputs, tools, permissions, performance measures, escalation rules, approval ceiling, audit rule, status, wave and priority.

## Departments
| | Department | Head | Roles | Live | Ready | Planned |
|---|---|---|---|---|---|---|
${src.departments.map((d) => { const l = agents.filter((a) => a.department_id === d.id); const n = (s) => l.filter((a) => a.status === s).length; return `| ${d.id} | ${d.name} | ${l.find((a) => a.number === d.head).name} (${aid(d.head)}) | ${l.length} | ${n('live')} | ${n('llm-ready')} | ${n('planned')} |`; }).join('\n')}
| | **Total** | | **${agents.length}** | **${count('live')}** | **${count('llm-ready')}** | **${count('planned')}** |

**Status.** *Live*: a coded, tested handler does the job today. *Ready* (llm-ready): the instruction profile is written and the orchestrator can run it as soon as this business's Claude key is set. *Planned*: needs an application connected first.

**Ceiling.** The highest level of action an agent may *request*: green (internal only), amber (may submit customer-facing or public work for review), red (may prepare a request that needs typed authorisation). No agent approves anything, and handing work to another agent never lowers the approval it needs.

The role slots in the owner's brief keep their original numbers. Higher numbers are the one-person-marketing-team roles that had no existing equivalent; see \`marketing-team.md\`.

## Live agents
| Agent | Department | What it does today |
|---|---|---|
${agents.filter((a) => a.status === 'live').map((a) => `| ${a.name} (${a.id}) | ${a.department_id} | ${a.role} |`).join('\n')}
`);
  console.log(`${id}: ${agents.length} agents (${count('live')} live, ${count('llm-ready')} ready, ${count('planned')} planned)`);
}
