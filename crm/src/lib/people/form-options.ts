import type { Db } from '../db.ts';
import type { CurrentUser } from '../session.ts';
import { listAgents, listTags } from './queries.ts';

/** Everything the person form needs to render its pickers. */
export async function loadPersonFormOptions(
  db: Db,
  user: CurrentUser,
): Promise<{
  agents: { id: string; name: string }[];
  tags: { id: string; name: string; colour: string }[];
  offices: { id: string; name: string }[];
  teams: { id: string; name: string; officeId: string }[];
  canViewIdentity: boolean;
}> {
  const [agents, tags, offices, teams] = await Promise.all([
    listAgents(db),
    listTags(db),
    db.query<{ id: string; name: string }>(
      'select id, name from offices where is_active order by name',
    ),
    db.query<{ id: string; name: string; officeId: string }>(
      'select id, name, office_id as "officeId" from teams where is_active order by name',
    ),
  ]);

  return {
    // An agent without company-wide access cannot assign work to anyone else,
    // so the picker offers only themselves.
    agents: user.permissions.has('DATA_VIEW_ALL')
      ? agents
      : agents.filter((agent) => agent.id === user.id),
    tags,
    offices,
    teams,
    canViewIdentity: user.permissions.has('PERSON_ID_VIEW'),
  };
}
