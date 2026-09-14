import type { Db } from './db.ts';
import type { CurrentUser } from './session.ts';
import { listTemplates, type Template } from './templates.ts';

/**
 * Everything the log form needs to offer, read as the current user so the
 * lists can only contain records they may already see.
 */
export interface CommunicationFormOptions {
  people: { id: string; label: string }[];
  properties: { id: string; label: string }[];
  agents: { id: string; name: string }[];
  templates: Template[];
}

export async function loadCommunicationFormOptions(
  db: Db,
  user: CurrentUser,
): Promise<CommunicationFormOptions> {
  const [people, properties, agents, templates] = await Promise.all([
    db.query<{ id: string; label: string }>(
      `select id, first_name || ' ' || surname || ' (' || client_ref || ')' as label
         from people
        where merged_into_id is null and not is_archived
        order by surname, first_name limit 500`,
    ),
    db.query<{ id: string; label: string }>(
      `select id,
              coalesce(nullif(concat_ws(', ', street_address, suburb), ''), property_ref)
                || ' (' || property_ref || ')' as label
         from properties
        where merged_into_id is null and not is_archived
        order by suburb, street_address limit 500`,
    ),
    user.permissions.has('DATA_VIEW_ALL')
      ? db.query<{ id: string; name: string }>(
          `select id, coalesce(display_name, full_name) as name
             from users where status = 'active' order by full_name`,
        )
      : Promise.resolve([]),
    listTemplates(db, {}),
  ]);

  return { people, properties, agents, templates };
}
