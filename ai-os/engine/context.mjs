/** Builds the complete runtime for ONE business. Nothing here is shared across two. */
import { pathToFileURL } from 'node:url';
import { loadTenant } from './tenant.mjs';
import { openDb } from './db.mjs';
import { makeRegistry } from './registry.mjs';
import { makeKb } from './kb.mjs';
import { makeLlm } from './llm.mjs';
import { makePolicy } from './policy.mjs';
import { makeWorkflows } from './workflows.mjs';
import { makeOrchestrator } from './orchestrator.mjs';
import { makeReports } from './reports.mjs';

export async function createContext(id, opts = {}) {
  const tenant = loadTenant(id, opts);
  const ctx = { tenant, offline: Boolean(opts.offline), clock: opts.clock || (() => new Date()) };
  ctx.db = openDb(tenant, ctx.clock);
  ctx.registry = makeRegistry(ctx);
  ctx.kb = makeKb(ctx);
  if (!ctx.kb.count()) ctx.kb.reindex();
  ctx.llm = makeLlm(ctx);
  const mod = await import(pathToFileURL(tenant.path('handlers', 'index.mjs')).href);
  ctx.handlers = mod.handlers; ctx.metrics = mod.metrics; ctx.adapters = mod.adapters || {}; ctx.seed = mod.seed;
  ctx.policy = makePolicy(ctx);
  ctx.workflows = makeWorkflows(ctx);
  ctx.orchestrator = makeOrchestrator(ctx);
  ctx.reports = makeReports(ctx);
  ctx.close = () => ctx.db.close();
  return ctx;
}
