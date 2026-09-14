import type { Db } from '../db.ts';
import { propertyAddressLine } from '../domain.ts';
import type { MarketingStatus } from '../domain.ts';
import type {
  PropertyDetail,
  PropertyMarketing,
  PropertyPersonLink,
  PropertySummary,
} from './types.ts';

/**
 * Reads over the property master database. Row level security has already
 * confined these to what the caller may see; agentId here is management's
 * view selector, which can only narrow that further (spec 10).
 */

export interface PropertyFilters {
  query?: string;
  area?: string;
  propertyType?: string;
  businessArea?: string;
  propertyStatus?: string;
  salesStatus?: string;
  rentalStatus?: string;
  mandateStatus?: string;
  agentId?: string | null;
  tagId?: string;
  minPrice?: string;
  maxPrice?: string;
  mandateExpiring?: 'soon' | 'expired' | 'all';
  archived?: 'active' | 'archived' | 'all';
  sort?: 'recent' | 'address' | 'price_high' | 'price_low' | 'mandate_expiry';
  page?: number;
  pageSize?: number;
}

const SUMMARY_COLUMNS = `
  p.id, p.property_ref, p.property_name, p.street_address, p.erf_number, p.portion_number,
  p.suburb, p.city, p.property_type, p.bedrooms, p.bathrooms,
  p.business_area, p.property_status, p.sales_status, p.rental_status,
  p.mandate_status, p.mandate_type, p.sale_outcome, p.mandate_expiry,
  p.current_asking_price, p.monthly_rental,
  p.primary_agent_id, p.is_archived,
  coalesce(agent.display_name, agent.full_name) as primary_agent_name,
  coalesce(
    (select array_agg(pe.first_name || ' ' || pe.surname order by pe.surname)
       from property_people pp
       join people pe on pe.id = pp.person_id
      where pp.property_id = p.id and pp.role in ('owner','co_owner','landlord')
        and pp.end_date is null),
    '{}'::text[]
  ) as owner_names,
  (select ph.id from property_photos ph
     where ph.property_id = p.id and ph.is_cover and not ph.is_archived limit 1) as cover_photo_id,
  coalesce(
    (select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'colour', t.colour)
              order by t.sort_order)
       from record_tags rt join tags t on t.id = rt.tag_id
      where rt.entity_type = 'property' and rt.entity_id = p.id),
    '[]'::jsonb
  ) as tags
`;

interface SummaryRow {
  id: string;
  property_ref: string;
  property_name: string | null;
  street_address: string | null;
  erf_number: string | null;
  portion_number: string | null;
  suburb: string | null;
  city: string | null;
  property_type: string;
  bedrooms: string | null;
  bathrooms: string | null;
  business_area: string;
  property_status: string;
  sales_status: string;
  rental_status: string;
  mandate_status: string;
  mandate_type: string | null;
  sale_outcome: string;
  mandate_expiry: Date | null;
  current_asking_price: string | null;
  monthly_rental: string | null;
  primary_agent_id: string | null;
  primary_agent_name: string | null;
  owner_names: string[];
  cover_photo_id: string | null;
  is_archived: boolean;
  tags: { id: string; name: string; colour: string }[];
}

function toSummary(row: SummaryRow): PropertySummary {
  return {
    id: row.id,
    propertyRef: row.property_ref,
    addressLine: propertyAddressLine({
      propertyName: row.property_name,
      streetAddress: row.street_address,
      suburb: row.suburb,
      city: row.city,
      erfNumber: row.erf_number,
    }),
    propertyName: row.property_name,
    streetAddress: row.street_address,
    erfNumber: row.erf_number,
    portionNumber: row.portion_number,
    suburb: row.suburb,
    city: row.city,
    propertyType: row.property_type as PropertySummary['propertyType'],
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    businessArea: row.business_area as PropertySummary['businessArea'],
    propertyStatus: row.property_status as PropertySummary['propertyStatus'],
    salesStatus: row.sales_status as PropertySummary['salesStatus'],
    rentalStatus: row.rental_status as PropertySummary['rentalStatus'],
    mandateStatus: row.mandate_status as PropertySummary['mandateStatus'],
    mandateType: row.mandate_type as PropertySummary['mandateType'],
    saleOutcome: row.sale_outcome as PropertySummary['saleOutcome'],
    mandateExpiry: row.mandate_expiry?.toISOString().slice(0, 10) ?? null,
    currentAskingPrice: row.current_asking_price,
    monthlyRental: row.monthly_rental,
    primaryAgentId: row.primary_agent_id,
    primaryAgentName: row.primary_agent_name,
    ownerNames: row.owner_names ?? [],
    isArchived: row.is_archived,
    tags: row.tags ?? [],
    coverPhotoId: row.cover_photo_id,
  };
}

export async function listProperties(
  db: Db,
  filters: PropertyFilters,
): Promise<{ rows: PropertySummary[]; total: number; page: number; pageSize: number }> {
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
    const value = add(filters.businessArea);
    where.push(
      `(p.business_area = ${value} or (p.business_area = 'sales_rentals' and ${value} in ('sales','rentals')))`,
    );
  }
  for (const [column, value] of [
    ['property_type', filters.propertyType],
    ['property_status', filters.propertyStatus],
    ['sales_status', filters.salesStatus],
    ['rental_status', filters.rentalStatus],
    ['mandate_status', filters.mandateStatus],
  ] as const) {
    if (value && value !== 'all') where.push(`p.${column} = ${add(value)}`);
  }

  if (filters.agentId) {
    const value = add(filters.agentId);
    where.push(`(p.primary_agent_id = ${value} or p.secondary_agent_id = ${value})`);
  }
  if (filters.tagId) {
    where.push(
      `exists (select 1 from record_tags rt where rt.entity_type = 'property' and rt.entity_id = p.id and rt.tag_id = ${add(filters.tagId)})`,
    );
  }
  if (filters.area && filters.area.trim().length > 0) {
    const value = add(`%${filters.area.trim().toLowerCase()}%`);
    where.push(`(lower(coalesce(p.suburb,'')) like ${value} or lower(coalesce(p.city,'')) like ${value})`);
  }
  if (filters.minPrice) where.push(`p.current_asking_price >= ${add(filters.minPrice)}`);
  if (filters.maxPrice) where.push(`p.current_asking_price <= ${add(filters.maxPrice)}`);

  switch (filters.mandateExpiring ?? 'all') {
    case 'soon':
      where.push(
        "p.mandate_status = 'mandate_active' and p.mandate_expiry is not null and p.mandate_expiry <= current_date + interval '60 days'",
      );
      break;
    case 'expired':
      where.push("p.mandate_expiry is not null and p.mandate_expiry < current_date");
      break;
    default:
      break;
  }

  if (filters.query && filters.query.trim().length > 0) {
    const raw = filters.query.trim();
    const like = add(`%${raw.toLowerCase()}%`);
    const name = add(raw);
    where.push(`(
      lower(p.property_ref) like ${like}
      or lower(coalesce(p.street_address,'')) like ${like}
      or lower(coalesce(p.property_name,'')) like ${like}
      or lower(coalesce(p.erf_number,'')) like ${like}
      or lower(coalesce(p.township,'')) like ${like}
      or lower(coalesce(p.suburb,'')) like ${like}
      or app.normalise_name(coalesce(p.street_address,'') || ' ' || coalesce(p.suburb,''))
           % app.normalise_name(${name})
    )`);
  }

  const orderBy =
    filters.sort === 'address'
      ? 'p.suburb nulls last, p.street_address nulls last'
      : filters.sort === 'price_high'
        ? 'p.current_asking_price desc nulls last'
        : filters.sort === 'price_low'
          ? 'p.current_asking_price asc nulls last'
          : filters.sort === 'mandate_expiry'
            ? 'p.mandate_expiry asc nulls last'
            : 'p.created_at desc';

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 25));
  const whereSql = where.join(' and ');

  const totalRow = await db.one<{ n: number }>(
    `select count(*)::int as n from properties p where ${whereSql}`,
    params,
  );
  const rows = await db.query<SummaryRow>(
    `select ${SUMMARY_COLUMNS}
       from properties p
       left join users agent on agent.id = p.primary_agent_id
      where ${whereSql}
      order by ${orderBy}
      limit ${add(pageSize)} offset ${add((page - 1) * pageSize)}`,
    params,
  );

  return { rows: rows.map(toSummary), total: totalRow.n, page, pageSize };
}

interface DetailRow extends SummaryRow {
  township: string | null;
  province: string | null;
  postal_code: string | null;
  garages: number | null;
  parking: number | null;
  land_size_sqm: string | null;
  building_size_sqm: string | null;
  original_asking_price: string | null;
  estimated_value: string | null;
  mandate_start: Date | null;
  secondary_agent_id: string | null;
  secondary_agent_name: string | null;
  office_id: string | null;
  office_name: string | null;
  team_id: string | null;
  team_name: string | null;
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

export async function getProperty(db: Db, id: string): Promise<PropertyDetail | null> {
  const row = await db.maybeOne<DetailRow>(
    `select ${SUMMARY_COLUMNS},
            p.township, p.province, p.postal_code, p.garages, p.parking,
            p.land_size_sqm, p.building_size_sqm,
            p.original_asking_price, p.estimated_value, p.mandate_start,
            p.secondary_agent_id,
            coalesce(second.display_name, second.full_name) as secondary_agent_name,
            p.office_id, o.name as office_name,
            p.team_id, t.name as team_name,
            p.notes, p.merged_into_id, m.property_ref as merged_into_ref,
            p.archived_at, p.archive_reason,
            p.created_at, coalesce(cb.display_name, cb.full_name) as created_by_name,
            p.updated_at, coalesce(ub.display_name, ub.full_name) as updated_by_name,
            p.row_version
       from properties p
       left join users agent  on agent.id  = p.primary_agent_id
       left join users second on second.id = p.secondary_agent_id
       left join users cb     on cb.id     = p.created_by
       left join users ub     on ub.id     = p.updated_by
       left join offices o    on o.id      = p.office_id
       left join teams t      on t.id      = p.team_id
       left join properties m on m.id      = p.merged_into_id
      where p.id = $1`,
    [id],
  );
  if (!row) return null;

  const [people, marketing] = await Promise.all([
    listPropertyPeople(db, id),
    getMarketing(db, id),
  ]);

  return {
    ...toSummary(row),
    township: row.township,
    province: row.province,
    postalCode: row.postal_code,
    garages: row.garages === null ? null : String(row.garages),
    parking: row.parking === null ? null : String(row.parking),
    landSizeSqm: row.land_size_sqm,
    buildingSizeSqm: row.building_size_sqm,
    originalAskingPrice: row.original_asking_price,
    estimatedValue: row.estimated_value,
    mandateStart: row.mandate_start?.toISOString().slice(0, 10) ?? null,
    secondaryAgentId: row.secondary_agent_id,
    secondaryAgentName: row.secondary_agent_name,
    officeId: row.office_id,
    officeName: row.office_name,
    teamId: row.team_id,
    teamName: row.team_name,
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
    people,
    marketing,
  };
}

export async function listPropertyPeople(db: Db, propertyId: string): Promise<PropertyPersonLink[]> {
  const rows = await db.query<{
    id: string;
    person_id: string;
    person_name: string;
    person_ref: string;
    person_mobile: string | null;
    person_email: string | null;
    role: string;
    ownership_percent: string | null;
    is_primary_contact: boolean;
    start_date: Date | null;
    end_date: Date | null;
    notes: string | null;
  }>(
    `select pp.id, pp.person_id,
            pe.first_name || ' ' || pe.surname as person_name,
            pe.client_ref as person_ref,
            (select c.value from person_contacts c
              where c.person_id = pe.id and c.is_active
                and c.contact_type in ('mobile','whatsapp','alternative_mobile')
              order by c.is_primary desc limit 1) as person_mobile,
            (select c.value from person_contacts c
              where c.person_id = pe.id and c.is_active and c.contact_type = 'email'
              order by c.is_primary desc limit 1) as person_email,
            pp.role, pp.ownership_percent, pp.is_primary_contact,
            pp.start_date, pp.end_date, pp.notes
       from property_people pp
       join people pe on pe.id = pp.person_id
      where pp.property_id = $1
      order by pp.is_primary_contact desc, pp.role, pe.surname`,
    [propertyId],
  );
  return rows.map((r) => ({
    id: r.id,
    personId: r.person_id,
    personName: r.person_name,
    personRef: r.person_ref,
    personMobile: r.person_mobile,
    personEmail: r.person_email,
    role: r.role,
    ownershipPercent: r.ownership_percent,
    isPrimaryContact: r.is_primary_contact,
    startDate: r.start_date?.toISOString().slice(0, 10) ?? null,
    endDate: r.end_date?.toISOString().slice(0, 10) ?? null,
    notes: r.notes,
  }));
}

export async function getMarketing(
  db: Db,
  propertyId: string,
): Promise<PropertyMarketing | null> {
  const row = await db.maybeOne<{
    headline: string | null;
    short_description: string | null;
    full_description: string | null;
    key_selling_points: string | null;
    features: string | null;
    directions: string | null;
    on_show_info: string | null;
    marketing_notes: string | null;
    marketing_status: string;
  }>('select * from property_marketing where property_id = $1', [propertyId]);
  if (!row) return null;
  return {
    headline: row.headline,
    shortDescription: row.short_description,
    fullDescription: row.full_description,
    keySellingPoints: row.key_selling_points,
    features: row.features,
    directions: row.directions,
    onShowInfo: row.on_show_info,
    marketingNotes: row.marketing_notes,
    marketingStatus: row.marketing_status as MarketingStatus,
  };
}

export interface PropertyHistory {
  statuses: {
    statusKind: string;
    oldValue: string | null;
    newValue: string | null;
    reason: string | null;
    changedAt: string;
    changedByName: string | null;
  }[];
  prices: {
    priceKind: string;
    oldPrice: string | null;
    newPrice: string | null;
    reason: string | null;
    changedAt: string;
    changedByName: string | null;
  }[];
  mandates: {
    mandateType: string | null;
    mandateStatus: string | null;
    mandateStart: string | null;
    mandateExpiry: string | null;
    reason: string | null;
    recordedAt: string;
    recordedByName: string | null;
  }[];
  assignments: {
    agentName: string | null;
    assignment: string;
    assignedAt: string;
    unassignedAt: string | null;
    reason: string | null;
  }[];
}

export async function getPropertyHistory(db: Db, propertyId: string): Promise<PropertyHistory> {
  const [statuses, prices, mandates, assignments] = await Promise.all([
    db.query<{
      status_kind: string;
      old_value: string | null;
      new_value: string | null;
      reason: string | null;
      changed_at: Date;
      changed_by_name: string | null;
    }>(
      `select h.status_kind, h.old_value, h.new_value, h.reason, h.changed_at,
              coalesce(u.display_name, u.full_name) as changed_by_name
         from property_status_history h
         left join users u on u.id = h.changed_by
        where h.property_id = $1 order by h.changed_at desc limit 100`,
      [propertyId],
    ),
    db.query<{
      price_kind: string;
      old_price: string | null;
      new_price: string | null;
      reason: string | null;
      changed_at: Date;
      changed_by_name: string | null;
    }>(
      `select h.price_kind, h.old_price, h.new_price, h.reason, h.changed_at,
              coalesce(u.display_name, u.full_name) as changed_by_name
         from property_price_history h
         left join users u on u.id = h.changed_by
        where h.property_id = $1 order by h.changed_at desc limit 100`,
      [propertyId],
    ),
    db.query<{
      mandate_type: string | null;
      mandate_status: string | null;
      mandate_start: Date | null;
      mandate_expiry: Date | null;
      reason: string | null;
      recorded_at: Date;
      recorded_by_name: string | null;
    }>(
      `select h.mandate_type, h.mandate_status, h.mandate_start, h.mandate_expiry, h.reason,
              h.recorded_at, coalesce(u.display_name, u.full_name) as recorded_by_name
         from property_mandate_history h
         left join users u on u.id = h.recorded_by
        where h.property_id = $1 order by h.recorded_at desc limit 50`,
      [propertyId],
    ),
    db.query<{
      agent_name: string | null;
      assignment: string;
      assigned_at: Date;
      unassigned_at: Date | null;
      reason: string | null;
    }>(
      `select coalesce(a.display_name, a.full_name) as agent_name, h.assignment,
              h.assigned_at, h.unassigned_at, h.reason
         from property_agent_assignments h
         left join users a on a.id = h.agent_id
        where h.property_id = $1 order by h.assigned_at desc limit 50`,
      [propertyId],
    ),
  ]);

  return {
    statuses: statuses.map((r) => ({
      statusKind: r.status_kind,
      oldValue: r.old_value,
      newValue: r.new_value,
      reason: r.reason,
      changedAt: r.changed_at.toISOString(),
      changedByName: r.changed_by_name,
    })),
    prices: prices.map((r) => ({
      priceKind: r.price_kind,
      oldPrice: r.old_price,
      newPrice: r.new_price,
      reason: r.reason,
      changedAt: r.changed_at.toISOString(),
      changedByName: r.changed_by_name,
    })),
    mandates: mandates.map((r) => ({
      mandateType: r.mandate_type,
      mandateStatus: r.mandate_status,
      mandateStart: r.mandate_start?.toISOString().slice(0, 10) ?? null,
      mandateExpiry: r.mandate_expiry?.toISOString().slice(0, 10) ?? null,
      reason: r.reason,
      recordedAt: r.recorded_at.toISOString(),
      recordedByName: r.recorded_by_name,
    })),
    assignments: assignments.map((r) => ({
      agentName: r.agent_name,
      assignment: r.assignment,
      assignedAt: r.assigned_at.toISOString(),
      unassignedAt: r.unassigned_at?.toISOString() ?? null,
      reason: r.reason,
    })),
  };
}

export async function listMarketingChannels(
  db: Db,
  propertyId: string,
): Promise<
  {
    id: string;
    channel: string;
    isPublished: boolean;
    publishedAt: string | null;
    removedAt: string | null;
    sourceUrl: string | null;
    notes: string | null;
  }[]
> {
  const rows = await db.query<{
    id: string;
    channel: string;
    is_published: boolean;
    published_at: Date | null;
    removed_at: Date | null;
    source_url: string | null;
    notes: string | null;
  }>('select * from property_marketing_channels where property_id = $1 order by channel', [
    propertyId,
  ]);
  return rows.map((r) => ({
    id: r.id,
    channel: r.channel,
    isPublished: r.is_published,
    publishedAt: r.published_at?.toISOString().slice(0, 10) ?? null,
    removedAt: r.removed_at?.toISOString().slice(0, 10) ?? null,
    sourceUrl: r.source_url,
    notes: r.notes,
  }));
}
