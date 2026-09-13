import type { Db } from '../db.ts';
import type { CurrentUser } from '../session.ts';
import { listAgents, listTags } from '../people/queries.ts';

export interface PropertyFormOptions {
  agents: { id: string; name: string }[];
  tags: { id: string; name: string; colour: string }[];
  offices: { id: string; name: string }[];
  teams: { id: string; name: string; officeId: string }[];
  selectedTagIds?: string[];
}

/** Everything the property form needs to render its pickers. */
export async function loadPropertyFormOptions(
  db: Db,
  user: CurrentUser,
): Promise<PropertyFormOptions> {
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
    // Without company-wide access an agent cannot hand a property to somebody
    // else, so the picker only offers themselves.
    agents: user.permissions.has('DATA_VIEW_ALL')
      ? agents
      : agents.filter((agent) => agent.id === user.id),
    tags,
    offices,
    teams,
  };
}

/** People this user may link to a property. */
export async function listLinkablePeople(
  db: Db,
): Promise<{ id: string; label: string }[]> {
  return db.query<{ id: string; label: string }>(
    `select id, first_name || ' ' || surname || ' (' || client_ref || ')' as label
       from people
      where merged_into_id is null and not is_archived
      order by surname, first_name
      limit 500`,
  );
}
