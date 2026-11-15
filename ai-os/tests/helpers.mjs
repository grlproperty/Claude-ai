import { mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext } from '../engine/context.mjs';
import { AIOS_ROOT } from '../engine/tenant.mjs';

export const tmp = (p = 'aios-') => mkdtempSync(join(tmpdir(), p));
/** A throwaway runtime for one business: temp database, rules-only, never touches real data. */
export const ctxFor = (id, opts = {}) => createContext(id, { dataDir: tmp(`${id}-`), offline: true, ...opts });
export const example = (ctx, wf) => structuredClone(ctx.workflows.defs.get(wf).example);
export const pending = (ctx) => ctx.db.approvals("status='pending'");
/** Approve whatever is pending until the run finishes; returns the levels met along the way. */
export async function approveAll(ctx, by, runId) {
  const levels = [];
  for (let i = 0; i < 10 && ctx.db.run(runId).status === 'waiting_approval'; i++) {
    const ap = pending(ctx).find((a) => a.run_id === runId); levels.push(`${ap.action}:${ap.level}`);
    await ctx.orchestrator.decide(ap.id, { decision: 'approve', by, confirm: ap.level === 'red' ? ctx.policy.phrase(ap.id) : '' });
  }
  return levels;
}
export const siteCopy = () => { const d = tmp('site-'); cpSync(join(AIOS_ROOT, '..', 'content'), d, { recursive: true }); return d; };
