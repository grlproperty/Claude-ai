import type { Db } from '../db.ts';
import { propertyAddressLine } from '../domain.ts';

/**
 * Duplicate detection for properties (spec 33).
 *
 * Erf and portion in a suburb identify one piece of land, so that is treated
 * as high confidence. An address that merely looks similar is offered as a
 * possibility for someone to judge.
 */

export interface PropertyDuplicateCandidate {
  erfNumber?: string | null;
  portionNumber?: string | null;
  streetAddress?: string | null;
  propertyName?: string | null;
  suburb?: string | null;
  city?: string | null;
  /** Owners, to catch the same property captured under two spellings. */
  ownerIds?: string[];
}

export interface PropertyDuplicateMatch {
  propertyId: string;
  propertyRef: string;
  addressLine: string;
  suburb: string | null;
  propertyStatus: string;
  mandateStatus: string;
  primaryAgentName: string | null;
  ownerNames: string[];
  isArchived: boolean;
  confidence: 'high' | 'possible';
  reasons: string[];
}

const ADDRESS_SIMILARITY_THRESHOLD = 0.5;

interface MatchRow {
  id: string;
  property_ref: string;
  property_name: string | null;
  street_address: string | null;
  erf_number: string | null;
  suburb: string | null;
  city: string | null;
  property_status: string;
  mandate_status: string;
  primary_agent_name: string | null;
  owner_names: string[];
  is_archived: boolean;
  match_erf_portion_suburb: boolean;
  match_exact_address: boolean;
  match_erf_suburb: boolean;
  match_name_address: boolean;
  match_owner: boolean;
  address_similarity: number;
}

export async function findPropertyDuplicates(
  db: Db,
  candidate: PropertyDuplicateCandidate,
  options: { excludeId?: string | null; limit?: number } = {},
): Promise<PropertyDuplicateMatch[]> {
  const hasAnything =
    Boolean(candidate.erfNumber) ||
    Boolean(candidate.streetAddress) ||
    Boolean(candidate.propertyName);
  if (!hasAnything) return [];

  const rows = await db.query<MatchRow>(
    `with candidate as (
        select app.normalise_name($1) as erf,
               app.normalise_name($2) as portion,
               app.normalise_name($3) as street,
               app.normalise_name($4) as name,
               app.normalise_name($5) as suburb,
               app.normalise_name(coalesce($3,'') || ' ' || coalesce($5,'')) as full_address,
               $6::uuid[] as owner_ids
      )
      select p.id, p.property_ref, p.property_name, p.street_address, p.erf_number,
             p.suburb, p.city, p.property_status, p.mandate_status, p.is_archived,
             coalesce(agent.display_name, agent.full_name) as primary_agent_name,
             coalesce((select array_agg(pe.first_name || ' ' || pe.surname)
                         from property_people pp join people pe on pe.id = pp.person_id
                        where pp.property_id = p.id and pp.role in ('owner','co_owner','landlord')),
                      '{}'::text[]) as owner_names,

             (c.erf is not null and c.suburb is not null
               and app.normalise_name(p.erf_number) = c.erf
               and app.normalise_name(p.suburb) = c.suburb
               and coalesce(app.normalise_name(p.portion_number), '') = coalesce(c.portion, ''))
               as match_erf_portion_suburb,
             (c.street is not null and c.suburb is not null
               and app.normalise_name(p.street_address) = c.street
               and app.normalise_name(p.suburb) = c.suburb) as match_exact_address,
             (c.erf is not null and c.suburb is not null
               and app.normalise_name(p.erf_number) = c.erf
               and app.normalise_name(p.suburb) = c.suburb) as match_erf_suburb,
             (c.name is not null and app.normalise_name(p.property_name) = c.name
               and c.street is not null and app.normalise_name(p.street_address) = c.street)
               as match_name_address,
             exists (select 1 from property_people pp
                      where pp.property_id = p.id
                        and pp.person_id = any(c.owner_ids)) as match_owner,
             coalesce(similarity(
               app.normalise_name(coalesce(p.street_address,'') || ' ' || coalesce(p.suburb,'')),
               coalesce(c.full_address, '')), 0) as address_similarity
        from properties p
        cross join candidate c
        left join users agent on agent.id = p.primary_agent_id
       where p.merged_into_id is null
         and ($7::uuid is null or p.id <> $7::uuid)
         and (
              (c.erf is not null and c.suburb is not null
                and app.normalise_name(p.erf_number) = c.erf
                and app.normalise_name(p.suburb) = c.suburb)
           or (c.street is not null and c.suburb is not null
                and app.normalise_name(p.street_address) = c.street
                and app.normalise_name(p.suburb) = c.suburb)
           or (c.full_address is not null
                and similarity(
                     app.normalise_name(coalesce(p.street_address,'') || ' ' || coalesce(p.suburb,'')),
                     c.full_address) >= $8)
           or (c.name is not null and app.normalise_name(p.property_name) = c.name)
           or (array_length(c.owner_ids, 1) > 0
                and c.suburb is not null and app.normalise_name(p.suburb) = c.suburb
                and exists (select 1 from property_people pp
                             where pp.property_id = p.id and pp.person_id = any(c.owner_ids)))
         )
       order by address_similarity desc, p.created_at desc
       limit $9`,
    [
      candidate.erfNumber ?? '',
      candidate.portionNumber ?? '',
      candidate.streetAddress ?? '',
      candidate.propertyName ?? '',
      candidate.suburb ?? '',
      candidate.ownerIds ?? [],
      options.excludeId ?? null,
      ADDRESS_SIMILARITY_THRESHOLD,
      options.limit ?? 10,
    ],
  );

  return rows
    .map((row): PropertyDuplicateMatch => {
      const reasons: string[] = [];
      if (row.match_erf_portion_suburb) reasons.push('Same erf and portion in the same suburb');
      else if (row.match_erf_suburb) reasons.push('Same erf number in the same suburb');
      if (row.match_exact_address) reasons.push('Same street address');
      else if (row.address_similarity >= ADDRESS_SIMILARITY_THRESHOLD) reasons.push('Similar address');
      if (row.match_name_address) reasons.push('Same property name and address');
      if (row.match_owner) reasons.push('Same owner in the same suburb');

      const high = row.match_erf_portion_suburb || row.match_exact_address;
      return {
        propertyId: row.id,
        propertyRef: row.property_ref,
        addressLine: propertyAddressLine({
          propertyName: row.property_name,
          streetAddress: row.street_address,
          suburb: row.suburb,
          city: row.city,
          erfNumber: row.erf_number,
        }),
        suburb: row.suburb,
        propertyStatus: row.property_status,
        mandateStatus: row.mandate_status,
        primaryAgentName: row.primary_agent_name,
        ownerNames: row.owner_names ?? [],
        isArchived: row.is_archived,
        confidence: high ? 'high' : 'possible',
        reasons: reasons.length > 0 ? reasons : ['Similar details'],
      };
    })
    .sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === 'high' ? -1 : 1));
}

/** Pairs across the whole database, for the data quality screen (spec 21). */
export async function listPropertyDuplicatePairs(
  db: Db,
  options: { limit?: number } = {},
): Promise<
  {
    left: { id: string; propertyRef: string; addressLine: string; agentName: string | null };
    right: { id: string; propertyRef: string; addressLine: string; agentName: string | null };
    confidence: 'high' | 'possible';
    reasons: string[];
  }[]
> {
  const rows = await db.query<{
    left_id: string;
    left_ref: string;
    left_address: string | null;
    left_suburb: string | null;
    left_agent: string | null;
    right_id: string;
    right_ref: string;
    right_address: string | null;
    right_suburb: string | null;
    right_agent: string | null;
    match_erf: boolean;
    match_address: boolean;
  }>(
    `with live as (
        select p.id, p.property_ref, p.street_address, p.suburb, p.erf_number, p.portion_number,
               app.normalise_name(p.erf_number) as erf_norm,
               app.normalise_name(p.suburb) as suburb_norm,
               app.normalise_name(p.street_address) as street_norm,
               coalesce(u.display_name, u.full_name) as agent_name
          from properties p
          left join users u on u.id = p.primary_agent_id
         where p.merged_into_id is null and not p.is_archived
      ),
      pairs as (
        select a.id as left_id, b.id as right_id,
               (a.erf_norm is not null and a.erf_norm = b.erf_norm
                 and a.suburb_norm is not null and a.suburb_norm = b.suburb_norm) as match_erf,
               (a.street_norm is not null and a.street_norm = b.street_norm
                 and a.suburb_norm is not null and a.suburb_norm = b.suburb_norm) as match_address
          from live a join live b on a.id < b.id
         where (a.erf_norm is not null and a.erf_norm = b.erf_norm
                 and a.suburb_norm is not null and a.suburb_norm = b.suburb_norm)
            or (a.street_norm is not null and a.street_norm = b.street_norm
                 and a.suburb_norm is not null and a.suburb_norm = b.suburb_norm)
      )
      select pr.left_id, l.property_ref as left_ref, l.street_address as left_address,
             l.suburb as left_suburb, l.agent_name as left_agent,
             pr.right_id, r.property_ref as right_ref, r.street_address as right_address,
             r.suburb as right_suburb, r.agent_name as right_agent,
             pr.match_erf, pr.match_address
        from pairs pr
        join live l on l.id = pr.left_id
        join live r on r.id = pr.right_id
       where not exists (
               select 1 from duplicate_dismissals d
                where d.entity_type = 'property'
                  and d.left_id = pr.left_id and d.right_id = pr.right_id
                  and d.decision = 'not_duplicate')
       order by pr.match_erf desc, l.suburb
       limit $1`,
    [options.limit ?? 100],
  );

  return rows.map((row) => {
    const reasons: string[] = [];
    if (row.match_erf) reasons.push('Same erf number in the same suburb');
    if (row.match_address) reasons.push('Same street address');
    return {
      left: {
        id: row.left_id,
        propertyRef: row.left_ref,
        addressLine: propertyAddressLine({
          streetAddress: row.left_address,
          suburb: row.left_suburb,
        }),
        agentName: row.left_agent,
      },
      right: {
        id: row.right_id,
        propertyRef: row.right_ref,
        addressLine: propertyAddressLine({
          streetAddress: row.right_address,
          suburb: row.right_suburb,
        }),
        agentName: row.right_agent,
      },
      confidence: 'high' as const,
      reasons,
    };
  });
}
