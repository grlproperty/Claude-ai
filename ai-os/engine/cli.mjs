#!/usr/bin/env node
/**
 * Command line for ONE business:  node engine/cli.mjs <business> <command> ...
 * (or the npm script for that business; see the README)
 */
import { createContext } from './context.mjs';
import { listTenants } from './tenant.mjs';

const [biz, cmd = 'help', ...rest] = process.argv.slice(2);
const flags = {}; const args = [];
for (let i = 0; i < rest.length; i++) { if (rest[i].startsWith('--')) { const k = rest[i].slice(2); flags[k] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true; } else args.push(rest[i]); }
const out = (x) => console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 2));

const HELP = `Usage: node engine/cli.mjs <business> <command>     businesses: ${listTenants().join(', ')}

  status                              what is running, pending and connected
  instruct "<what you need done>"     give the orchestrator an instruction (append {json} for structured input)
  workflows                           list workflows and the input each needs
  run <workflow> '<json>'             start a workflow
  resume <run> '<json>'               supply missing information to a blocked run, or retry a failed one
  approvals                           list pending approvals
  approve <id> --by "<name>" [--confirm "AUTHORISE <id>"] [--note "..."]
  reject  <id> --by "<name>" --note "<reason>"
  tasks | done <task>                 open tasks | mark a task done
  runs [<run>]                        workflow history | one run step by step
  report day|week|month               generate a management report
  kb "<question>" | kb-reindex        search | rebuild the knowledge base index
  agents [--dept D04] [--status live] the agent registry
  targets [--set '<json>' --by "<name>"]   view or change targets
  audit [--limit 50]                  the audit trail
  backup                              write a consistent copy of the database to data/backups/
  seed-sample                         load clearly-labelled SAMPLE records for testing
  serve [--port N] [--host 127.0.0.1] start this business's command centre`;

if (!biz || biz === 'help' || cmd === 'help') { out(HELP); process.exit(0); }
const ctx = await createContext(biz);
const { db } = ctx;
try {
  switch (cmd) {
    case 'status': { const s = ctx.reports.state('day'); out({ business: s.business.name, mode: s.business.mode, agents: s.agents.by_status, knowledge_documents: ctx.kb.count(), pending_approvals: s.approvals.length, open_tasks: s.tasks.length, warnings: s.warnings.length, priorities: s.priorities }); break; }
    case 'instruct': out(await ctx.orchestrator.instruct(args.join(' '), flags.by || 'owner')); break;
    case 'workflows': out(ctx.workflows.list().map((w) => ({ id: w.id, name: w.name, required: w.required, steps: w.steps.length, example: w.example }))); break;
    case 'run': { const r = await ctx.workflows.start(args[0], JSON.parse(args[1] || '{}'), flags.by || 'owner'); out({ run: r.id, status: r.status, error: r.error, steps: db.runSteps(r.id).map((s) => `${s.status.padEnd(18)} ${s.name}`) }); break; }
    case 'resume': { const r = await ctx.workflows.resume(args[0], JSON.parse(args[1] || '{}'), flags.by || 'owner'); out({ run: r.id, status: r.status, error: r.error }); break; }
    case 'approvals': out(db.approvals("status='pending'").map((a) => ({ id: a.id, level: a.level, action: a.action, title: a.title, requested_by: a.requested_by, payload: a.payload, ...(a.level === 'red' ? { to_authorise_type: ctx.policy.phrase(a.id) } : {}) }))); break;
    case 'approve': case 'reject': { const r = await ctx.orchestrator.decide(args[0], { decision: cmd, by: flags.by, note: flags.note || '', confirm: flags.confirm || '' }); out({ approval: r.approval.id, status: r.approval.status, dispatch: r.approval.dispatch, run: r.run ? { id: r.run.id, status: r.run.status } : null }); break; }
    case 'tasks': out(db.tasks("status IN ('open','blocked')").map((t) => `${t.id}  P${t.priority}  ${t.due || '          '}  ${t.agent_id}  ${t.title}`).join('\n') || 'No open tasks.'); break;
    case 'done': db.setTask(args[0], 'done', { note: flags.note || '' }, flags.by || 'owner'); out(`${args[0]} marked done`); break;
    case 'runs': out(args[0] ? { ...db.run(args[0]), steps: db.runSteps(args[0]) } : db.runs(30).map((r) => `${r.id}  ${r.status.padEnd(17)} ${r.workflow_id}  ${r.error || ''}`).join('\n') || 'No runs yet.'); break;
    case 'report': { const r = ctx.reports.generate(args[0] || 'day'); out(r.markdown); out(`\nSaved to ${r.file}`); break; }
    case 'kb': out(ctx.kb.search(args.join(' '), { dept: flags.dept || null }).map((h) => ({ title: h.title, path: h.path, owner: h.owner, version: h.version, status: h.status, source: h.source, excerpt: h.excerpt }))); break;
    case 'kb-reindex': out(`${ctx.kb.reindex()} documents indexed`); break;
    case 'agents': out(ctx.registry.agents.filter((a) => (!flags.dept || a.department_id === flags.dept) && (!flags.status || a.status === flags.status)).map((a) => `${a.id}  ${a.status.padEnd(9)} ${a.approval_ceiling.padEnd(5)} ${a.department_id}  ${a.name}`).join('\n')); break;
    case 'targets': if (flags.set) { if (!flags.by) throw new Error('--by "<name>" is required to change targets'); db.setSetting('targets', { ...(db.getSetting('targets', {})), ...JSON.parse(flags.set) }, flags.by); } out({ ...ctx.tenant.cfg.targets, ...(db.getSetting('targets', {})) }); break;
    case 'audit': out(db.auditLog(Number(flags.limit) || 50).map((a) => `${a.at.slice(0, 19)}  ${String(a.actor).padEnd(14)} ${a.action.padEnd(22)} ${a.target}`).join('\n')); break;
    case 'backup': { const { mkdirSync } = await import('node:fs'); mkdirSync(ctx.tenant.data('backups'), { recursive: true }); const f = ctx.tenant.data('backups', `aios-${db.now().replace(/[:.]/g, '-')}.db`); db.sql.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`); db.audit(flags.by || 'owner', 'backup.created', f); out(`Backup written to ${f}`); break; }
    case 'seed-sample': out(ctx.seed(ctx)); break;
    case 'serve': { const { serve } = await import('./server.mjs'); await serve(ctx, { port: Number(flags.port) || ctx.tenant.cfg.port, host: flags.host || '127.0.0.1' }); break; }
    default: out(HELP); process.exitCode = 1;
  }
} catch (e) { console.error(`Error: ${e.message}`); process.exitCode = 1; }
if (cmd !== 'serve') ctx.close();
