import type { Db } from '../db.ts';
import { fingerprintIdentity, fingerprintPassport } from '../identity.ts';
import { isLikelyEmail, normaliseZaPhone } from '../phone.ts';
import type { BusinessArea, ClientType } from '../domain.ts';

/**
 * Duplicate detection for people (spec 18, 19).
 *
 * Run before a person is created, before an import writes a row, and on
 * demand from the data quality screen. It never merges anything by itself:
 * it produces candidates, and a person decides.
 */

export interface DuplicateCandidate {
  firstName: string;
  surname: string;
  idNumber?: string | null;
  passportNumber?: string | null;
  passportCountry?: string | null;
  /** Telephone numbers and email addresses exactly as typed. */
  contactValues?: string[];
  suburb?: string | null;
}

export type DuplicateConfidence = 'high' | 'possible';

export interface DuplicateMatch {
  personId: string;
  clientRef: string;
  fullName: string;
  businessArea: BusinessArea;
  clientTypes: ClientType[];
  primaryAgentName: string | null;
  primaryMobile: string | null;
  primaryEmail: string | null;
  lastContactAt: string | null;
  isArchived: boolean;
  confidence: DuplicateConfidence;
  reasons: string[];
}

interface MatchRow {
  id: string;
  client_ref: string;
  first_name: string;
  surname: string;
  business_area: BusinessArea;
  client_types: ClientType[];
  primary_agent_name: string | null;
  primary_mobile: string | null;
  primary_email: string | null;
  last_contact_at: Date | null;
  is_archived: boolean;
  match_identity: boolean;
  match_phone: boolean;
  match_email: boolean;
  match_full_name: boolean;
  match_surname: boolean;
  match_suburb: boolean;
  name_similarity: number;
}

/** Names that are similar enough to be worth a human looking at. */
const NAME_SIMILARITY_THRESHOLD = 0.45;

export async function findPersonDuplicates(
  db: Db,
  candidate: DuplicateCandidate,
  options: { excludeId?: string | null; limit?: number } = {},
): Promise<DuplicateMatch[]> {
  const values = candidate.contactValues ?? [];
  const phones = values
    .map((value) => normaliseZaPhone(value))
    .filter((value): value is string => value !== null && value.replace(/\D/g, '').length >= 9);
  const emails = values
    .filter((value) => isLikelyEmail(value))
    .map((value) => value.trim().toLowerCase());

  const idFingerprint = candidate.idNumber ? fingerprintIdentity(candidate.idNumber) : '';
  const passportFingerprint = candidate.passportNumber
    ? fingerprintPassport(candidate.passportNumber, candidate.passportCountry ?? null)
    : '';

  const fullName = `${candidate.firstName} ${candidate.surname}`.trim();
  if (fullName.length === 0 && phones.length === 0 && emails.length === 0 && !idFingerprint) {
    return [];
  }

  const rows = await db.query<MatchRow>(
    `with candidate as (
        select nullif($1, '')::text  as id_fp,
               nullif($2, '')::text  as passport_fp,
               $3::text[]            as phones,
               $4::text[]            as emails,
               app.normalise_name($5) as full_name,
               app.normalise_name($6) as surname,
               app.normalise_name($7) as suburb
      )
      select p.id, p.client_ref, p.first_name, p.surname, p.business_area, p.is_archived,
             p.last_contact_at,
             coalesce(agent.display_name, agent.full_name) as primary_agent_name,
             coalesce((select array_agg(ct.client_type order by ct.client_type)
                         from person_client_types ct where ct.person_id = p.id),
                      '{}'::text[]) as client_types,
             (select c.value from person_contacts c
               where c.person_id = p.id and c.is_active
                 and c.contact_type in ('mobile','whatsapp','alternative_mobile')
               order by c.is_primary desc limit 1) as primary_mobile,
             (select c.value from person_contacts c
               where c.person_id = p.id and c.is_active and c.contact_type = 'email'
               order by c.is_primary desc limit 1) as primary_email,

             (c.id_fp is not null and p.id_fingerprint = c.id_fp)
               or (c.passport_fp is not null and p.passport_fingerprint = c.passport_fp)
               as match_identity,
             exists (select 1 from person_contacts pc
                      where pc.person_id = p.id and pc.is_active
                        and pc.contact_type <> 'email'
                        and pc.value_normalised = any(c.phones)) as match_phone,
             exists (select 1 from person_contacts pc
                      where pc.person_id = p.id and pc.is_active
                        and pc.contact_type = 'email'
                        and pc.value_normalised = any(c.emails)) as match_email,
             (c.full_name is not null
               and app.normalise_name(p.first_name || ' ' || p.surname) = c.full_name)
               as match_full_name,
             (c.surname is not null and app.normalise_name(p.surname) = c.surname) as match_surname,
             exists (select 1 from person_addresses a
                      where a.person_id = p.id and c.suburb is not null
                        and app.normalise_name(a.suburb) = c.suburb) as match_suburb,
             coalesce(
               similarity(app.normalise_name(p.first_name || ' ' || p.surname),
                          coalesce(c.full_name, '')), 0) as name_similarity
        from people p
        cross join candidate c
        left join users agent on agent.id = p.primary_agent_id
       where p.merged_into_id is null
         and ($8::uuid is null or p.id <> $8::uuid)
         and (
              (c.id_fp is not null and p.id_fingerprint = c.id_fp)
           or (c.passport_fp is not null and p.passport_fingerprint = c.passport_fp)
           or exists (select 1 from person_contacts pc
                       where pc.person_id = p.id and pc.is_active
                         and pc.value_normalised = any(c.phones || c.emails))
           or (c.full_name is not null
               and similarity(app.normalise_name(p.first_name || ' ' || p.surname), c.full_name) >= $9)
           or (c.surname is not null and c.suburb is not null
               and app.normalise_name(p.surname) = c.surname
               and exists (select 1 from person_addresses a
                            where a.person_id = p.id
                              and app.normalise_name(a.suburb) = c.suburb))
         )
       order by name_similarity desc, p.created_at desc
       limit $10`,
    [
      idFingerprint,
      passportFingerprint,
      phones,
      emails,
      fullName,
      candidate.surname ?? '',
      candidate.suburb ?? '',
      options.excludeId ?? null,
      NAME_SIMILARITY_THRESHOLD,
      options.limit ?? 10,
    ],
  );

  return rows.map(toMatch).sort((a, b) => rank(b) - rank(a));
}

function toMatch(row: MatchRow): DuplicateMatch {
  const reasons: string[] = [];
  // High confidence: something that identifies one specific person.
  if (row.match_identity) reasons.push('Same identity number on file');
  if (row.match_phone) reasons.push('Same telephone number');
  if (row.match_email) reasons.push('Same email address');

  // Possible: enough to be worth a look, not enough to be sure.
  if (row.match_full_name) reasons.push('Same first name and surname');
  else if (row.name_similarity >= NAME_SIMILARITY_THRESHOLD) reasons.push('Similar name');
  if (row.match_surname && row.match_suburb) reasons.push('Same surname in the same suburb');
  else if (row.match_suburb) reasons.push('Same suburb');

  const high = row.match_identity || row.match_phone || row.match_email;

  return {
    personId: row.id,
    clientRef: row.client_ref,
    fullName: `${row.first_name} ${row.surname}`.trim(),
    businessArea: row.business_area,
    clientTypes: row.client_types ?? [],
    primaryAgentName: row.primary_agent_name,
    primaryMobile: row.primary_mobile,
    primaryEmail: row.primary_email,
    lastContactAt: row.last_contact_at?.toISOString() ?? null,
    isArchived: row.is_archived,
    confidence: high ? 'high' : 'possible',
    reasons: reasons.length > 0 ? reasons : ['Similar details'],
  };
}

function rank(match: DuplicateMatch): number {
  return match.confidence === 'high' ? 100 + match.reasons.length : match.reasons.length;
}

/**
 * Pairs across the whole database that look like the same person, for the
 * data quality screen (spec 21). Only pairs nobody has already dismissed.
 */
export async function listPersonDuplicatePairs(
  db: Db,
  options: { limit?: number; confidence?: DuplicateConfidence | 'all' } = {},
): Promise<
  {
    left: { id: string; clientRef: string; fullName: string; agentName: string | null };
    right: { id: string; clientRef: string; fullName: string; agentName: string | null };
    confidence: DuplicateConfidence;
    reasons: string[];
  }[]
> {
  const rows = await db.query<{
    left_id: string;
    left_ref: string;
    left_name: string;
    left_agent: string | null;
    right_id: string;
    right_ref: string;
    right_name: string;
    right_agent: string | null;
    match_identity: boolean;
    match_contact: boolean;
    match_name: boolean;
  }>(
    `with live as (
        select p.id, p.client_ref, p.first_name, p.surname, p.id_fingerprint,
               app.normalise_name(p.first_name || ' ' || p.surname) as name_norm,
               coalesce(u.display_name, u.full_name) as agent_name
          from people p
          left join users u on u.id = p.primary_agent_id
         where p.merged_into_id is null and not p.is_archived
      ),
      contact_pairs as (
        select distinct a.person_id as left_id, b.person_id as right_id
          from person_contacts a
          join person_contacts b
            on a.value_normalised = b.value_normalised
           and a.person_id < b.person_id
         where a.is_active and b.is_active and a.value_normalised is not null
      ),
      identity_pairs as (
        select a.id as left_id, b.id as right_id
          from live a join live b
            on a.id_fingerprint = b.id_fingerprint and a.id < b.id
         where a.id_fingerprint is not null
      ),
      name_pairs as (
        select a.id as left_id, b.id as right_id
          from live a join live b on a.id < b.id
         where a.name_norm = b.name_norm and a.name_norm is not null
      ),
      all_pairs as (
        select left_id, right_id, true as m_identity, false as m_contact, false as m_name from identity_pairs
        union all
        select left_id, right_id, false, true, false from contact_pairs
        union all
        select left_id, right_id, false, false, true from name_pairs
      ),
      grouped as (
        select left_id, right_id,
               bool_or(m_identity) as match_identity,
               bool_or(m_contact)  as match_contact,
               bool_or(m_name)     as match_name
          from all_pairs group by left_id, right_id
      )
      select g.left_id, l.client_ref as left_ref,
             l.first_name || ' ' || l.surname as left_name, l.agent_name as left_agent,
             g.right_id, r.client_ref as right_ref,
             r.first_name || ' ' || r.surname as right_name, r.agent_name as right_agent,
             g.match_identity, g.match_contact, g.match_name
        from grouped g
        join live l on l.id = g.left_id
        join live r on r.id = g.right_id
       where not exists (
               select 1 from duplicate_dismissals d
                where d.entity_type = 'person'
                  and d.left_id = g.left_id and d.right_id = g.right_id
                  and d.decision = 'not_duplicate')
       order by g.match_identity desc, g.match_contact desc, l.surname
       limit $1`,
    [options.limit ?? 100],
  );

  return rows
    .map((row) => {
      const reasons: string[] = [];
      if (row.match_identity) reasons.push('Same identity number on file');
      if (row.match_contact) reasons.push('Shared telephone number or email address');
      if (row.match_name) reasons.push('Same first name and surname');
      const confidence: DuplicateConfidence =
        row.match_identity || row.match_contact ? 'high' : 'possible';
      return {
        left: {
          id: row.left_id,
          clientRef: row.left_ref,
          fullName: row.left_name,
          agentName: row.left_agent,
        },
        right: {
          id: row.right_id,
          clientRef: row.right_ref,
          fullName: row.right_name,
          agentName: row.right_agent,
        },
        confidence,
        reasons,
      };
    })
    .filter((pair) => options.confidence === undefined || options.confidence === 'all'
      ? true
      : pair.confidence === options.confidence);
}
