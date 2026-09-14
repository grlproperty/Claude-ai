import type { Db } from '../db.ts';
import { maskedIdentity } from '../identity.ts';
import type {
  PersonAddress,
  PersonContact,
  PersonDetail,
  PersonRelationship,
  PersonSummary,
} from './types.ts';
import type { BusinessArea, ClientType } from '../domain.ts';

/**
 * Reads over the people master database.
 *
 * None of these apply an agent restriction themselves: row level security
 * has already done that. The agentId filter here is management's view
 * selector (spec 10), which can only narrow what is already visible.
 */

export interface PeopleFilters {
  query?: string;
  businessArea?: BusinessArea | 'all';
  clientType?: ClientType | 'all';
  area?: string;
  agentId?: string | null;
  tagId?: string;
  permissionStatus?: string;
  archived?: 'active' | 'archived' | 'all';
  followUp?: 'overdue' | 'today' | 'none' | 'all';
  sort?: 'recent' | 'name' | 'last_contact' | 'follow_up';
  page?: number;
  pageSize?: number;
}

const SUMMARY_COLUMNS = `
  p.id,
  p.client_ref,
  p.first_name,
  p.surname,
  p.preferred_name,
  p.business_area,
  p.primary_agent_id,
  p.last_contact_at,
  p.next_follow_up_at,
  p.is_archived,
  coalesce(agent.display_name, agent.full_name) as primary_agent_name,
  coalesce(
    (select array_agg(ct.client_type order by ct.client_type)
       from person_client_types ct where ct.person_id = p.id),
    '{}'::text[]
  ) as client_types,
  (select c.value from person_contacts c
     where c.person_id = p.id and c.is_active
       and c.contact_type in ('mobile','whatsapp','alternative_mobile')
     order by c.is_primary desc, c.contact_type, c.created_at limit 1) as primary_mobile,
  (select c.value from person_contacts c
     where c.person_id = p.id and c.is_active and c.contact_type = 'email'
     order by c.is_primary desc, c.created_at limit 1) as primary_email,
  coalesce(
    (select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'colour', t.colour)
              order by t.sort_order)
       from record_tags rt join tags t on t.id = rt.tag_id
      where rt.entity_type = 'person' and rt.entity_id = p.id),
    '[]'::jsonb
  ) as tags
`;

interface SummaryRow {
  id: string;
  client_ref: string;
  first_name: string;
  surname: string;
  preferred_name: string | null;
  business_area: BusinessArea;
  primary_agent_id: string | null;
  primary_agent_name: string | null;
  client_types: ClientType[];
  primary_mobile: string | null;
  primary_email: string | null;
  last_contact_at: Date | null;
  next_follow_up_at: Date | null;
  is_archived: boolean;
  tags: { id: string; name: string; colour: string }[];
}

function toSummary(row: SummaryRow): PersonSummary {
  return {
    id: row.id,
    clientRef: row.client_ref,
    fullName: `${row.first_name} ${row.surname}`.trim(),
    displayName: row.preferred_name ?? row.first_name,
    businessArea: row.business_area,
    clientTypes: row.client_types ?? [],
    primaryAgentId: row.primary_agent_id,
    primaryAgentName: row.primary_agent_name,
    primaryMobile: row.primary_mobile,
    primaryEmail: row.primary_email,
    lastContactAt: row.last_contact_at?.toISOString() ?? null,
    nextFollowUpAt: row.next_follow_up_at?.toISOString() ?? null,
    isArchived: row.is_archived,
    tags: row.tags ?? [],
  };
}

export async function listPeople(
  db: Db,
  filters: PeopleFilters,
): Promise<{ rows: PersonSummary[]; total: number; page: number; pageSize: number }> {
  const where: string[] = ['p.merged_into_id is null'];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  switch (filters.archived ?? 'active') {
    case 'active':
      where.push('not p.is_archived');
      break;
    case 'archived':
      where.push('p.is_archived');
      break;
    default:
      break;
  }

  if (filters.businessArea && filters.businessArea !== 'all') {
    // "Sales & Rentals" people belong to both single-area views.
    const value = add(filters.businessArea);
    where.push(`(p.business_area = ${value} or (p.business_area = 'sales_rentals' and ${value} in ('sales','rentals')))`);
  }

  if (filters.clientType && filters.clientType !== 'all') {
    where.push(
      `exists (select 1 from person_client_types ct where ct.person_id = p.id and ct.client_type = ${add(filters.clientType)})`,
    );
  }

  if (filters.agentId) {
    const value = add(filters.agentId);
    where.push(`(p.primary_agent_id = ${value} or p.secondary_agent_id = ${value})`);
  }

  if (filters.tagId) {
    where.push(
      `exists (select 1 from record_tags rt where rt.entity_type = 'person' and rt.entity_id = p.id and rt.tag_id = ${add(filters.tagId)})`,
    );
  }

  if (filters.area && filters.area.trim().length > 0) {
    const value = add(`%${filters.area.trim().toLowerCase()}%`);
    where.push(
      `exists (select 1 from person_addresses a where a.person_id = p.id
                 and (lower(coalesce(a.suburb,'')) like ${value} or lower(coalesce(a.city,'')) like ${value}))`,
    );
  }

  switch (filters.followUp ?? 'all') {
    case 'overdue':
      where.push('p.next_follow_up_at is not null and p.next_follow_up_at < now()');
      break;
    case 'today':
      where.push("p.next_follow_up_at::date = (now() at time zone 'Africa/Johannesburg')::date");
      break;
    case 'none':
      where.push('p.next_follow_up_at is null');
      break;
    default:
      break;
  }

  if (filters.query && filters.query.trim().length > 0) {
    const raw = filters.query.trim();
    const like = add(`%${raw.toLowerCase()}%`);
    const name = add(raw);
    // A number is stored as +27825432681. Someone may type 0825432681,
    // +27 82 543 2681 or just the last few digits, so the national prefix
    // and the country code are stripped before matching the tail.
    const phone = add(raw.replace(/\D/g, '').replace(/^0/, '').replace(/^27/, ''));
    where.push(`(
      lower(p.client_ref) like ${like}
      or app.normalise_name(p.first_name || ' ' || p.surname) % app.normalise_name(${name})
      or lower(p.first_name || ' ' || p.surname) like ${like}
      or lower(coalesce(p.preferred_name,'')) like ${like}
      or exists (
        select 1 from person_contacts c
         where c.person_id = p.id and c.is_active
           and (lower(c.value) like ${like}
                or (length(${phone}) >= 6 and c.value_normalised like '%' || ${phone}))
      )
    )`);
  }

  const orderBy =
    filters.sort === 'name'
      ? 'p.surname, p.first_name'
      : filters.sort === 'last_contact'
        ? 'p.last_contact_at desc nulls last'
        : filters.sort === 'follow_up'
          ? 'p.next_follow_up_at asc nulls last'
          : 'p.created_at desc';

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 25));
  const whereSql = where.join(' and ');

  const totalRow = await db.one<{ n: number }>(
    `select count(*)::int as n from people p where ${whereSql}`,
    params,
  );

  const rows = await db.query<SummaryRow>(
    `select ${SUMMARY_COLUMNS}
       from people p
       left join users agent on agent.id = p.primary_agent_id
      where ${whereSql}
      order by ${orderBy}
      limit ${add(pageSize)} offset ${add((page - 1) * pageSize)}`,
    params,
  );

  return { rows: rows.map(toSummary), total: totalRow.n, page, pageSize };
}

interface DetailRow extends SummaryRow {
  title: string | null;
  middle_name: string | null;
  id_last3: string | null;
  id_fingerprint: string | null;
  passport_last3: string | null;
  passport_fingerprint: string | null;
  passport_country: string | null;
  passport_expiry: Date | null;
  secondary_agent_id: string | null;
  secondary_agent_name: string | null;
  office_id: string | null;
  office_name: string | null;
  team_id: string | null;
  team_name: string | null;
  first_contact_at: Date | null;
  last_contact_method: string | null;
  last_contacted_by_name: string | null;
  notes: string | null;
  merged_into_id: string | null;
  merged_into_ref: string | null;
  archived_at: Date | null;
  archive_reason: string | null;
  created_at: Date;
  created_by_name: string | null;
  updated_at: Date;
  updated_by_name: string | null;
  row_version: number;
}

/**
 * One person, with everything the profile page needs.
 *
 * The identity number is masked here unless the caller both holds
 * PERSON_ID_VIEW and explicitly asked to reveal it, which the page records
 * as a sensitive access before calling.
 */
export async function getPerson(
  db: Db,
  id: string,
  options: { revealedIdNumber?: string | null; revealedPassport?: string | null } = {},
): Promise<PersonDetail | null> {
  const row = await db.maybeOne<DetailRow>(
    `select ${SUMMARY_COLUMNS},
            p.title, p.middle_name,
            p.id_last3, p.id_fingerprint, p.passport_last3, p.passport_fingerprint,
            p.passport_country, p.passport_expiry,
            p.secondary_agent_id,
            coalesce(second.display_name, second.full_name) as secondary_agent_name,
            p.office_id, o.name as office_name,
            p.team_id, t.name as team_name,
            p.first_contact_at, p.last_contact_method,
            coalesce(lc.display_name, lc.full_name) as last_contacted_by_name,
            p.notes, p.merged_into_id, m.client_ref as merged_into_ref,
            p.archived_at, p.archive_reason,
            p.created_at, coalesce(cb.display_name, cb.full_name) as created_by_name,
            p.updated_at, coalesce(ub.display_name, ub.full_name) as updated_by_name,
            p.row_version
       from people p
       left join users agent  on agent.id  = p.primary_agent_id
       left join users second on second.id = p.secondary_agent_id
       left join users lc     on lc.id     = p.last_contacted_by
       left join users cb     on cb.id     = p.created_by
       left join users ub     on ub.id     = p.updated_by
       left join offices o    on o.id      = p.office_id
       left join teams t      on t.id      = p.team_id
       left join people m     on m.id      = p.merged_into_id
      where p.id = $1`,
    [id],
  );
  if (!row) return null;

  const [contacts, addresses, relationships] = await Promise.all([
    listContacts(db, id),
    listAddresses(db, id),
    listRelationships(db, id),
  ]);

  return {
    ...toSummary(row),
    title: row.title,
    firstName: row.first_name,
    middleName: row.middle_name,
    surname: row.surname,
    preferredName: row.preferred_name,
    idIsRecorded: row.id_fingerprint !== null,
    idDisplay: options.revealedIdNumber ?? maskedIdentity(row.id_last3, 13),
    passportIsRecorded: row.passport_fingerprint !== null,
    passportDisplay: options.revealedPassport ?? maskedIdentity(row.passport_last3, 9),
    passportCountry: row.passport_country,
    passportExpiry: row.passport_expiry?.toISOString().slice(0, 10) ?? null,
    secondaryAgentId: row.secondary_agent_id,
    secondaryAgentName: row.secondary_agent_name,
    officeId: row.office_id,
    officeName: row.office_name,
    teamId: row.team_id,
    teamName: row.team_name,
    firstContactAt: row.first_contact_at?.toISOString() ?? null,
    lastContactMethod: row.last_contact_method,
    lastContactedByName: row.last_contacted_by_name,
    notes: row.notes,
    mergedIntoId: row.merged_into_id,
    mergedIntoRef: row.merged_into_ref,
    archivedAt: row.archived_at?.toISOString() ?? null,
    archiveReason: row.archive_reason,
    createdAt: row.created_at.toISOString(),
    createdByName: row.created_by_name,
    updatedAt: row.updated_at.toISOString(),
    updatedByName: row.updated_by_name,
    rowVersion: row.row_version,
    contacts,
    addresses,
    relationships,
  };
}

export async function listContacts(db: Db, personId: string): Promise<PersonContact[]> {
  const rows = await db.query<{
    id: string;
    contact_type: string;
    value: string;
    value_normalised: string | null;
    is_primary: boolean;
    is_active: boolean;
    notes: string | null;
  }>(
    `select id, contact_type, value, value_normalised, is_primary, is_active, notes
       from person_contacts where person_id = $1
      order by is_active desc, is_primary desc, contact_type, created_at`,
    [personId],
  );
  return rows.map((r) => ({
    id: r.id,
    contactType: r.contact_type,
    value: r.value,
    valueNormalised: r.value_normalised,
    isPrimary: r.is_primary,
    isActive: r.is_active,
    notes: r.notes,
  }));
}

export async function listAddresses(db: Db, personId: string): Promise<PersonAddress[]> {
  const rows = await db.query<{
    id: string;
    address_type: string;
    line1: string | null;
    line2: string | null;
    suburb: string | null;
    city: string | null;
    province: string | null;
    postal_code: string | null;
    is_primary: boolean;
    notes: string | null;
  }>(
    `select id, address_type, line1, line2, suburb, city, province, postal_code, is_primary, notes
       from person_addresses where person_id = $1 order by is_primary desc, address_type`,
    [personId],
  );
  return rows.map((r) => ({
    id: r.id,
    addressType: r.address_type,
    line1: r.line1,
    line2: r.line2,
    suburb: r.suburb,
    city: r.city,
    province: r.province,
    postalCode: r.postal_code,
    isPrimary: r.is_primary,
    notes: r.notes,
  }));
}

/** Relationships are shown from both sides of the link. */
export async function listRelationships(db: Db, personId: string): Promise<PersonRelationship[]> {
  const rows = await db.query<{
    id: string;
    relationship_type: string;
    other_id: string;
    other_name: string;
    other_ref: string;
    direction: 'from' | 'to';
    start_date: Date | null;
    end_date: Date | null;
    notes: string | null;
  }>(
    `select r.id, r.relationship_type, other.id as other_id,
            other.first_name || ' ' || other.surname as other_name,
            other.client_ref as other_ref,
            'from'::text as direction, r.start_date, r.end_date, r.notes
       from person_relationships r
       join people other on other.id = r.related_person_id
      where r.person_id = $1
      union all
     select r.id, r.relationship_type, other.id,
            other.first_name || ' ' || other.surname,
            other.client_ref, 'to'::text, r.start_date, r.end_date, r.notes
       from person_relationships r
       join people other on other.id = r.person_id
      where r.related_person_id = $1
      order by 2, 4`,
    [personId],
  );
  return rows.map((r) => ({
    id: r.id,
    relationshipType: r.relationship_type,
    otherPersonId: r.other_id,
    otherPersonName: r.other_name,
    otherPersonRef: r.other_ref,
    direction: r.direction,
    startDate: r.start_date?.toISOString().slice(0, 10) ?? null,
    endDate: r.end_date?.toISOString().slice(0, 10) ?? null,
    notes: r.notes,
  }));
}

/** Reads the identity number itself. Only ever called after a permission check. */
export async function readIdentity(
  db: Db,
  personId: string,
): Promise<{ idNumber: string | null; passportNumber: string | null } | null> {
  const row = await db.maybeOne<{ id_number: string | null; passport_number: string | null }>(
    'select id_number, passport_number from person_identity where person_id = $1',
    [personId],
  );
  if (!row) return null;
  return { idNumber: row.id_number, passportNumber: row.passport_number };
}

export async function listAgents(db: Db): Promise<{ id: string; name: string }[]> {
  return db.query<{ id: string; name: string }>(
    `select id, coalesce(display_name, full_name) as name
       from users where status = 'active' order by full_name`,
  );
}

export async function listTags(db: Db): Promise<{ id: string; name: string; colour: string }[]> {
  return db.query<{ id: string; name: string; colour: string }>(
    'select id, name, colour from tags where is_active order by sort_order, name',
  );
}
