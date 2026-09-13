import type { Db } from './db.ts';
import type { CurrentUser } from './session.ts';
import { listAgents } from './people/queries.ts';

export interface PipelineFormOptions {
  agents: { id: string; name: string }[];
  people: { id: string; label: string }[];
  properties: { id: string; label: string }[];
  leads: { id: string; label: string }[];
  transactions: { id: string; label: string }[];
}

/**
 * The pickers shared by tasks, appointments, viewings, valuations, offers,
 * transactions and rental applications. Row level security has already
 * narrowed each list to what this user may link to.
 */
export async function loadPipelineFormOptions(
  db: Db,
  user: CurrentUser,
): Promise<PipelineFormOptions> {
  const [agents, people, properties, leads, transactions] = await Promise.all([
    listAgents(db),
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
    user.permissions.has('LEADS_VIEW')
      ? db.query<{ id: string; label: string }>(
          `select l.id,
                  coalesce(pe.first_name || ' ' || pe.surname, 'Unlinked enquiry')
                    || ' — ' || l.lead_type as label
             from leads l left join people pe on pe.id = l.person_id
            where not l.is_archived order by l.created_at desc limit 300`,
        )
      : Promise.resolve([]),
    user.permissions.has('SALES_VIEW')
      ? db.query<{ id: string; label: string }>(
          `select t.id, t.transaction_ref || ' — ' ||
                  coalesce(nullif(concat_ws(', ', p.street_address, p.suburb), ''), p.property_ref)
                    as label
             from transactions t join properties p on p.id = t.property_id
            order by t.created_at desc limit 300`,
        )
      : Promise.resolve([]),
  ]);

  return {
    agents: user.permissions.has('DATA_VIEW_ALL')
      ? agents
      : agents.filter((agent) => agent.id === user.id),
    people,
    properties,
    leads,
    transactions,
  };
}
