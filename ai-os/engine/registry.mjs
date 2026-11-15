/** The agent registry for one business, read from <business>/registry/agents.json. */
import { readFileSync, existsSync } from 'node:fs';

export function makeRegistry(ctx) {
  const file = ctx.tenant.path('registry', 'agents.json');
  if (!existsSync(file)) throw new Error(`No registry for ${ctx.tenant.id}. Run: npm run build`);
  const { agents, departments } = JSON.parse(readFileSync(file, 'utf8'));
  const byId = new Map(agents.map((a) => [a.id, a]));
  return {
    agents, departments,
    get: (id) => byId.get(id) || null,
    inDept: (d) => agents.filter((a) => a.department_id === d),
    instructions(id) {
      const f = ctx.tenant.path('registry', 'instructions', `${id}.md`);
      return existsSync(f) ? readFileSync(f, 'utf8') : '';
    },
  };
}
