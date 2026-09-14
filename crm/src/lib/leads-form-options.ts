import type { Db } from './db.ts';
import type { CurrentUser } from './session.ts';
import { listAgents, listTags } from './people/queries.ts';
import { listLeadLossReasons, listLeadSources } from './leads.ts';
import type { LeadFormOptions } from '@/app/(app)/leads/lead-form.tsx';

/** Everything the lead form needs to render its pickers. */
export async function loadLeadFormOptions(
  db: Db,
  user: CurrentUser,
): Promise<LeadFormOptions> {
  const [agents, tags, sources, lossReasons, people, properties] = await Promise.all([
    listAgents(db),
    listTags(db),
    listLeadSources(db),
    listLeadLossReasons(db),
    db.query<{ id: string; label: string }>(
      `select id, first_name || ' ' || surname || ' (' || client_ref || ')' as label
         from people where merged_into_id is null and not is_archived
        order by surname, first_name limit 500`,
    ),
    db.query<{ id: string; label: string }>(
      `select id,
              coalesce(nullif(concat_ws(', ', street_address, suburb), ''), property_ref)
                || ' (' || property_ref || ')' as label
         from properties where merged_into_id is null and not is_archived
        order by suburb nulls last, street_address nulls last limit 500`,
    ),
  ]);

  return {
    agents: user.permissions.has('DATA_VIEW_ALL')
      ? agents
      : agents.filter((agent) => agent.id === user.id),
    tags,
    sources,
    lossReasons,
    people,
    properties,
  };
}
