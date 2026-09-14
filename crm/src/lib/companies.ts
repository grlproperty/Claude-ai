import { z } from 'zod';
import { agentToKeep, type Ctx } from './actor.ts';
import type { Db } from './db.ts';
import { diff, recordAudit } from './audit.ts';
import { ConcurrencyError, NotFoundError } from './errors.ts';
import { BUSINESS_AREAS, PROVINCES, type BusinessArea } from './domain.ts';
import { optionalDate, optionalText, optionalUuid, requiredText } from './validate.ts';

/**
 * Companies, trusts and other entities (spec 30, 31).
 *
 * A great many GRLP clients buy, sell or let through an entity, and an entity
 * is not a person: it has its own registration number, its own registered
 * address, and — the part that matters for FICA — its own set of people
 * behind it. Modelling it as "a person with a company name" would lose all
 * three, so it is its own master record with its own reference, kept under
 * the same one-record rule (spec 1).
 */

export const ENTITY_TYPES = {
  pty_ltd: 'Private company (Pty) Ltd',
  close_corporation: 'Close corporation',
  trust: 'Trust',
  sole_proprietor: 'Sole proprietor',
  partnership: 'Partnership',
  npc: 'Non-profit company',
  body_corporate: 'Body corporate',
  public_company: 'Public company',
  foreign_entity: 'Foreign entity',
  other: 'Other',
} as const;
export type EntityType = keyof typeof ENTITY_TYPES;

export const COMPANY_ROLES = {
  director: 'Director',
  member: 'Member',
  trustee: 'Trustee',
  beneficiary: 'Beneficiary',
  shareholder: 'Shareholder',
  authorised_representative: 'Authorised representative',
  public_officer: 'Public officer',
  partner: 'Partner',
  signatory: 'Signatory',
  other: 'Other',
} as const;
export type CompanyRole = keyof typeof COMPANY_ROLES;

export const PROPERTY_COMPANY_ROLES = {
  owner: 'Owner',
  co_owner: 'Co-owner',
  seller: 'Seller',
  buyer: 'Buyer',
  landlord: 'Landlord',
  tenant: 'Tenant',
  previous_owner: 'Previous owner',
  developer: 'Developer',
  managing_agent: 'Managing agent',
  other: 'Other',
} as const;

const keys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]];

export const companyInputSchema = z.object({
  registeredName: requiredText('The registered name', 200),
  tradingName: optionalText,
  entityType: z.enum(keys(ENTITY_TYPES)).default('pty_ltd'),
  registrationNumber: optionalText,
  vatNumber: optionalText,
  taxNumber: optionalText,
  addressLine1: optionalText,
  addressLine2: optionalText,
  suburb: optionalText,
  city: optionalText,
  province: z
    .union([z.enum(PROVINCES as unknown as [string, ...string[]]), z.literal('')])
    .optional()
    .transform((value) => (value ? value : null)),
  postalCode: optionalText,
  businessArea: z.enum(keys(BUSINESS_AREAS)).default('sales'),
  primaryAgentId: optionalUuid,
  secondaryAgentId: optionalUuid,
  notes: optionalText,
});
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const companyPersonInputSchema = z.object({
  personId: z.uuid('Choose the person.'),
  role: z.enum(keys(COMPANY_ROLES)),
  isPrimaryContact: z.coerce.boolean().default(false),
  shareholdingPercent: optionalText,
  appointedOn: optionalDate,
  resignedOn: optionalDate,
  notes: optionalText,
});
export type CompanyPersonInput = z.infer<typeof companyPersonInputSchema>;

export interface CompanySummary {
  id: string;
  companyRef: string;
  registeredName: string;
  tradingName: string | null;
  entityType: EntityType;
  registrationNumber: string | null;
  businessArea: BusinessArea;
  primaryAgentId: string | null;
  primaryAgentName: string | null;
  addressLine: string | null;
  isArchived: boolean;
  peopleCount: number;
  propertyCount: number;
  ficaStatus: string | null;
}

export interface CompanyDetail extends CompanySummary {
  vatNumber: string | null;
  taxNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  secondaryAgentId: string | null;
  secondaryAgentName: string | null;
  notes: string | null;
  archiveReason: string | null;
  mergedIntoId: string | null;
  createdAt: string;
  createdByName: string | null;
  updatedAt: string;
  rowVersion: number;
  people: {
    id: string;
    personId: string;
    personName: string;
    personRef: string;
    role: CompanyRole;
    isPrimaryContact: boolean;
    shareholdingPercent: string | null;
    appointedOn: string | null;
    resignedOn: string | null;
  }[];
  properties: {
    id: string;
    propertyId: string;
    propertyRef: string;
    propertyLabel: string | null;
    role: string;
    ownershipPercent: string | null;
  }[];
}

const SUMMARY_COLUMNS = `
  c.id, c.company_ref, c.registered_name, c.trading_name, c.entity_type,
  c.registration_number, c.business_area, c.primary_agent_id, c.is_archived,
  coalesce(a.display_name, a.full_name) as primary_agent_name,
  nullif(concat_ws(', ', c.address_line1, c.suburb, c.city), '') as address_line,
  (select count(*)::int from company_people cp
     where cp.company_id = c.id and cp.resigned_on is null) as people_count,
  (select count(*)::int from property_companies pc where pc.company_id = c.id)
    as property_count,
  (select f.status from fica_records f where f.company_id = c.id) as fica_status
`;

interface SummaryRow {
  id: string;
  company_ref: string;
  registered_name: string;
  trading_name: string | null;
  entity_type: EntityType;
  registration_number: string | null;
  business_area: BusinessArea;
  primary_agent_id: string | null;
  primary_agent_name: string | null;
  address_line: string | null;
  is_archived: boolean;
  people_count: number;
  property_count: number;
  fica_status: string | null;
}

function toSummary(row: SummaryRow): CompanySummary {
  return {
    id: row.id,
    companyRef: row.company_ref,
    registeredName: row.registered_name,
    tradingName: row.trading_name,
    entityType: row.entity_type,
    registrationNumber: row.registration_number,
    businessArea: row.business_area,
    primaryAgentId: row.primary_agent_id,
    primaryAgentName: row.primary_agent_name,
    addressLine: row.address_line,
    isArchived: row.is_archived,
    peopleCount: row.people_count,
    propertyCount: row.property_count,
    ficaStatus: row.fica_status,
  };
}

export async function listCompanies(
  db: Db,
  filters: {
    query?: string;
    entityType?: string;
    archived?: 'active' | 'archived' | 'all';
    agentId?: string | null;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<{ rows: CompanySummary[]; total: number; page: number; pageSize: number }> {
  const where: string[] = ['c.merged_into_id is null'];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  switch (filters.archived ?? 'active') {
    case 'active':
      where.push('not c.is_archived');
      break;
    case 'archived':
      where.push('c.is_archived');
      break;
    default:
      break;
  }
  if (filters.entityType && filters.entityType !== 'all') {
    where.push(`c.entity_type = ${add(filters.entityType)}`);
  }
  if (filters.agentId) {
    const value = add(filters.agentId);
    where.push(`(c.primary_agent_id = ${value} or c.secondary_agent_id = ${value})`);
  }
  if (filters.query && filters.query.trim().length > 0) {
    const like = add(`%${filters.query.trim().toLowerCase()}%`);
    where.push(`(
      lower(c.registered_name) like ${like}
      or lower(coalesce(c.trading_name, '')) like ${like}
      or lower(coalesce(c.registration_number, '')) like ${like}
      or lower(c.company_ref) like ${like}
    )`);
  }

  const whereSql = where.join(' and ');
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 25));

  const totalRow = await db.one<{ n: number }>(
    `select count(*)::int as n from companies c where ${whereSql}`,
    params,
  );
  const rows = await db.query<SummaryRow>(
    `select ${SUMMARY_COLUMNS}
       from companies c
       left join users a on a.id = c.primary_agent_id
      where ${whereSql}
      order by c.registered_name
      limit ${add(pageSize)} offset ${add((page - 1) * pageSize)}`,
    params,
  );

  return { rows: rows.map(toSummary), total: totalRow.n, page, pageSize };
}

export async function getCompany(db: Db, id: string): Promise<CompanyDetail | null> {
  const row = await db.maybeOne<
    SummaryRow & {
      vat_number: string | null;
      tax_number: string | null;
      address_line1: string | null;
      address_line2: string | null;
      suburb: string | null;
      city: string | null;
      province: string | null;
      postal_code: string | null;
      secondary_agent_id: string | null;
      secondary_agent_name: string | null;
      notes: string | null;
      archive_reason: string | null;
      merged_into_id: string | null;
      created_at: Date;
      created_by_name: string | null;
      updated_at: Date;
      row_version: number;
    }
  >(
    `select ${SUMMARY_COLUMNS},
            c.vat_number, c.tax_number, c.address_line1, c.address_line2, c.suburb,
            c.city, c.province, c.postal_code, c.secondary_agent_id, c.notes,
            c.archive_reason, c.merged_into_id, c.created_at, c.updated_at, c.row_version,
            coalesce(s.display_name, s.full_name) as secondary_agent_name,
            coalesce(cb.display_name, cb.full_name) as created_by_name
       from companies c
       left join users a on a.id = c.primary_agent_id
       left join users s on s.id = c.secondary_agent_id
       left join users cb on cb.id = c.created_by
      where c.id = $1`,
    [id],
  );
  if (!row) return null;

  const [people, properties] = await Promise.all([
    db.query<{
      id: string;
      person_id: string;
      person_name: string;
      person_ref: string;
      role: CompanyRole;
      is_primary_contact: boolean;
      shareholding_percent: string | null;
      appointed_on: Date | null;
      resigned_on: Date | null;
    }>(
      `select cp.id, cp.person_id, cp.role, cp.is_primary_contact, cp.shareholding_percent,
              cp.appointed_on, cp.resigned_on,
              pe.first_name || ' ' || pe.surname as person_name,
              pe.client_ref as person_ref
         from company_people cp
         join people pe on pe.id = cp.person_id
        where cp.company_id = $1
        order by cp.is_primary_contact desc, cp.role, pe.surname`,
      [id],
    ),
    db.query<{
      id: string;
      property_id: string;
      property_ref: string;
      property_label: string | null;
      role: string;
      ownership_percent: string | null;
    }>(
      `select pc.id, pc.property_id, pc.role, pc.ownership_percent,
              pr.property_ref,
              nullif(concat_ws(', ', pr.street_address, pr.suburb), '') as property_label
         from property_companies pc
         join properties pr on pr.id = pc.property_id
        where pc.company_id = $1
        order by pr.suburb, pr.street_address`,
      [id],
    ),
  ]);

  return {
    ...toSummary(row),
    vatNumber: row.vat_number,
    taxNumber: row.tax_number,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    suburb: row.suburb,
    city: row.city,
    province: row.province,
    postalCode: row.postal_code,
    secondaryAgentId: row.secondary_agent_id,
    secondaryAgentName: row.secondary_agent_name,
    notes: row.notes,
    archiveReason: row.archive_reason,
    mergedIntoId: row.merged_into_id,
    createdAt: row.created_at.toISOString(),
    createdByName: row.created_by_name,
    updatedAt: row.updated_at.toISOString(),
    rowVersion: row.row_version,
    people: people.map((entry) => ({
      id: entry.id,
      personId: entry.person_id,
      personName: entry.person_name,
      personRef: entry.person_ref,
      role: entry.role,
      isPrimaryContact: entry.is_primary_contact,
      shareholdingPercent: entry.shareholding_percent,
      appointedOn: entry.appointed_on?.toISOString().slice(0, 10) ?? null,
      resignedOn: entry.resigned_on?.toISOString().slice(0, 10) ?? null,
    })),
    properties: properties.map((entry) => ({
      id: entry.id,
      propertyId: entry.property_id,
      propertyRef: entry.property_ref,
      propertyLabel: entry.property_label,
      role: entry.role,
      ownershipPercent: entry.ownership_percent,
    })),
  };
}

const AUDITED = [
  'registered_name', 'trading_name', 'entity_type', 'registration_number', 'vat_number',
  'business_area', 'primary_agent_id', 'secondary_agent_id', 'is_archived',
] as const;

export async function createCompany(
  db: Db,
  ctx: Ctx,
  input: CompanyInput,
): Promise<{ id: string; companyRef: string }> {
  const primaryAgentId = agentToKeep(ctx.actor, input.primaryAgentId);

  const row = await db.one<{ id: string; company_ref: string }>(
    `insert into companies
       (registered_name, trading_name, entity_type, registration_number, vat_number,
        tax_number, address_line1, address_line2, suburb, city, province, postal_code,
        business_area, primary_agent_id, secondary_agent_id, notes, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
     returning id, company_ref`,
    [
      input.registeredName, input.tradingName, input.entityType, input.registrationNumber,
      input.vatNumber, input.taxNumber, input.addressLine1, input.addressLine2, input.suburb,
      input.city, input.province, input.postalCode, input.businessArea, primaryAgentId,
      input.secondaryAgentId, input.notes, ctx.actor.id,
    ],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'company.created',
    entityType: 'company',
    entityId: row.id,
    entityLabel: input.registeredName,
    context: { companyRef: row.company_ref, entityType: input.entityType },
  });

  return { id: row.id, companyRef: row.company_ref };
}

export async function updateCompany(
  db: Db,
  ctx: Ctx,
  id: string,
  input: CompanyInput,
  expectedVersion: number,
): Promise<void> {
  const before = await db.maybeOne<Record<string, unknown> & { row_version: number }>(
    'select * from companies where id = $1',
    [id],
  );
  if (!before) throw new NotFoundError('That company');
  if (before.row_version !== expectedVersion) throw new ConcurrencyError();

  const primaryAgentId = agentToKeep(
    ctx.actor,
    input.primaryAgentId,
    before.primary_agent_id as string | null,
  );

  const updated = await db.query<Record<string, unknown>>(
    `update companies set
        registered_name=$2, trading_name=$3, entity_type=$4, registration_number=$5,
        vat_number=$6, tax_number=$7, address_line1=$8, address_line2=$9, suburb=$10,
        city=$11, province=$12, postal_code=$13, business_area=$14,
        primary_agent_id=$15, secondary_agent_id=$16, notes=$17, updated_by=$18
      where id=$1 and row_version=$19
      returning *`,
    [
      id, input.registeredName, input.tradingName, input.entityType, input.registrationNumber,
      input.vatNumber, input.taxNumber, input.addressLine1, input.addressLine2, input.suburb,
      input.city, input.province, input.postalCode, input.businessArea, primaryAgentId,
      input.secondaryAgentId, input.notes, ctx.actor.id, expectedVersion,
    ],
  );
  const after = updated[0];
  if (!after) throw new ConcurrencyError();

  const changes = diff(before, after, AUDITED);
  if (Object.keys(changes).length > 0) {
    await recordAudit(db, ctx.actor, ctx.meta, {
      action: 'company.updated',
      entityType: 'company',
      entityId: id,
      entityLabel: input.registeredName,
      changes,
    });
  }
}

export async function archiveCompany(
  db: Db,
  ctx: Ctx,
  id: string,
  reason: string,
): Promise<void> {
  if (reason.trim().length === 0) {
    throw new NotFoundError('A reason for archiving');
  }
  const changed = await db.count(
    `update companies
        set is_archived = true, archived_at = now(), archived_by = $2,
            archive_reason = $3, updated_by = $2
      where id = $1 and not is_archived`,
    [id, ctx.actor.id, reason.trim()],
  );
  if (changed === 0) throw new NotFoundError('That company');

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'company.archived',
    entityType: 'company',
    entityId: id,
    context: { reason: reason.trim() },
  });
}

// ---------------------------------------------------------------------------
// Who is behind it
// ---------------------------------------------------------------------------

export async function linkPersonToCompany(
  db: Db,
  ctx: Ctx,
  companyId: string,
  input: CompanyPersonInput,
): Promise<void> {
  // Only one primary contact per entity, so an existing one steps aside.
  if (input.isPrimaryContact) {
    await db.query(
      'update company_people set is_primary_contact = false where company_id = $1',
      [companyId],
    );
  }

  await db.query(
    `insert into company_people
       (company_id, person_id, role, is_primary_contact, shareholding_percent,
        appointed_on, resigned_on, notes, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
     on conflict (company_id, person_id, role) do update set
       is_primary_contact = excluded.is_primary_contact,
       shareholding_percent = excluded.shareholding_percent,
       appointed_on = excluded.appointed_on,
       resigned_on = excluded.resigned_on,
       notes = excluded.notes,
       updated_by = excluded.updated_by`,
    [
      companyId, input.personId, input.role, input.isPrimaryContact,
      input.shareholdingPercent, input.appointedOn, input.resignedOn, input.notes,
      ctx.actor.id,
    ],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'company.person_linked',
    entityType: 'company',
    entityId: companyId,
    context: { personId: input.personId, role: input.role },
  });
}

export async function unlinkPersonFromCompany(
  db: Db,
  ctx: Ctx,
  companyId: string,
  linkId: string,
): Promise<void> {
  const removed = await db.count(
    'delete from company_people where id = $1 and company_id = $2',
    [linkId, companyId],
  );
  if (removed === 0) throw new NotFoundError('That link');

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'company.person_unlinked',
    entityType: 'company',
    entityId: companyId,
    context: { linkId },
  });
}

export async function linkCompanyToProperty(
  db: Db,
  ctx: Ctx,
  input: {
    propertyId: string;
    companyId: string;
    role: string;
    ownershipPercent?: string | null;
    notes?: string | null;
  },
): Promise<void> {
  await db.query(
    `insert into property_companies
       (property_id, company_id, role, ownership_percent, notes, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$6)
     on conflict (property_id, company_id, role) do update set
       ownership_percent = excluded.ownership_percent,
       notes = excluded.notes,
       updated_by = excluded.updated_by`,
    [
      input.propertyId, input.companyId, input.role, input.ownershipPercent ?? null,
      input.notes ?? null, ctx.actor.id,
    ],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.company_linked',
    entityType: 'property',
    entityId: input.propertyId,
    context: { companyId: input.companyId, role: input.role },
  });
}

/** The companies a person is involved in, for their profile. */
export async function companiesForPerson(
  db: Db,
  personId: string,
): Promise<
  {
    linkId: string;
    companyId: string;
    companyRef: string;
    registeredName: string;
    entityType: EntityType;
    role: CompanyRole;
    isPrimaryContact: boolean;
    resignedOn: string | null;
  }[]
> {
  const rows = await db.query<{
    link_id: string;
    company_id: string;
    company_ref: string;
    registered_name: string;
    entity_type: EntityType;
    role: CompanyRole;
    is_primary_contact: boolean;
    resigned_on: Date | null;
  }>(
    `select cp.id as link_id, c.id as company_id, c.company_ref, c.registered_name,
            c.entity_type, cp.role, cp.is_primary_contact, cp.resigned_on
       from company_people cp
       join companies c on c.id = cp.company_id
      where cp.person_id = $1 and c.merged_into_id is null
      order by cp.resigned_on nulls first, c.registered_name`,
    [personId],
  );

  return rows.map((row) => ({
    linkId: row.link_id,
    companyId: row.company_id,
    companyRef: row.company_ref,
    registeredName: row.registered_name,
    entityType: row.entity_type,
    role: row.role,
    isPrimaryContact: row.is_primary_contact,
    resignedOn: row.resigned_on?.toISOString().slice(0, 10) ?? null,
  }));
}

/** The companies linked to a property, for its profile. */
export async function companiesForProperty(
  db: Db,
  propertyId: string,
): Promise<
  {
    linkId: string;
    companyId: string;
    companyRef: string;
    registeredName: string;
    role: string;
    ownershipPercent: string | null;
    ficaStatus: string | null;
  }[]
> {
  const rows = await db.query<{
    link_id: string;
    company_id: string;
    company_ref: string;
    registered_name: string;
    role: string;
    ownership_percent: string | null;
    fica_status: string | null;
  }>(
    `select pc.id as link_id, c.id as company_id, c.company_ref, c.registered_name,
            pc.role, pc.ownership_percent,
            (select f.status from fica_records f where f.company_id = c.id) as fica_status
       from property_companies pc
       join companies c on c.id = pc.company_id
      where pc.property_id = $1
      order by pc.role, c.registered_name`,
    [propertyId],
  );

  return rows.map((row) => ({
    linkId: row.link_id,
    companyId: row.company_id,
    companyRef: row.company_ref,
    registeredName: row.registered_name,
    role: row.role,
    ownershipPercent: row.ownership_percent,
    ficaStatus: row.fica_status,
  }));
}
