import type { Ctx } from '../actor.ts';
import type { Db } from '../db.ts';
import { diff, recordAudit } from '../audit.ts';
import { ConcurrencyError, NotFoundError, ValidationError } from '../errors.ts';
import type { PropertyInput } from './types.ts';

/**
 * Writes to the property master database.
 *
 * Every status change, price change and mandate change is written to its own
 * history table before the master row is updated, so the record of what a
 * property has been through survives whatever it becomes next (spec 31).
 */

const AUDITED_FIELDS = [
  'erf_number', 'portion_number', 'township', 'property_name', 'street_address',
  'suburb', 'city', 'province', 'postal_code', 'property_type',
  'bedrooms', 'bathrooms', 'garages', 'parking', 'land_size_sqm', 'building_size_sqm',
  'original_asking_price', 'current_asking_price', 'estimated_value', 'monthly_rental',
  'business_area', 'property_status', 'sales_status', 'rental_status',
  'mandate_status', 'mandate_type', 'sale_outcome', 'mandate_start', 'mandate_expiry',
  'primary_agent_id', 'secondary_agent_id', 'office_id', 'team_id', 'notes', 'is_archived',
] as const;

/** The six status columns and the history kind each one is recorded under. */
const STATUS_FIELDS = [
  ['property_status', 'property'],
  ['sales_status', 'sales'],
  ['rental_status', 'rental'],
  ['mandate_status', 'mandate'],
  ['sale_outcome', 'sale_outcome'],
  ['business_area', 'business_area'],
] as const;

const PRICE_FIELDS = [
  ['current_asking_price', 'asking'],
  ['estimated_value', 'estimated'],
  ['monthly_rental', 'rental'],
] as const;

export interface PropertyWriteResult {
  id: string;
  propertyRef: string;
}

export async function createProperty(
  db: Db,
  ctx: Ctx,
  input: PropertyInput,
): Promise<PropertyWriteResult> {
  const primaryAgentId =
    input.primaryAgentId ?? (ctx.actor.permissions.has('DATA_VIEW_ALL') ? null : ctx.actor.id);

  const property = await db.one<{ id: string; property_ref: string }>(
    `insert into properties
       (erf_number, portion_number, township, property_name, street_address, suburb, city,
        province, postal_code, property_type, bedrooms, bathrooms, garages, parking,
        land_size_sqm, building_size_sqm, original_asking_price, current_asking_price,
        estimated_value, monthly_rental, business_area, property_status, sales_status,
        rental_status, mandate_status, mandate_type, sale_outcome, mandate_start, mandate_expiry,
        primary_agent_id, secondary_agent_id, office_id, team_id, notes, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
             $24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$35)
     returning id, property_ref`,
    [
      input.erfNumber, input.portionNumber, input.township, input.propertyName,
      input.streetAddress, input.suburb, input.city, input.province, input.postalCode,
      input.propertyType, input.bedrooms, input.bathrooms, input.garages, input.parking,
      input.landSizeSqm, input.buildingSizeSqm,
      // An asking price given once is also where the price history starts.
      input.originalAskingPrice ?? input.currentAskingPrice,
      input.currentAskingPrice, input.estimatedValue, input.monthlyRental,
      input.businessArea, input.propertyStatus, input.salesStatus, input.rentalStatus,
      input.mandateStatus, input.mandateType, input.saleOutcome,
      input.mandateStart, input.mandateExpiry,
      primaryAgentId, input.secondaryAgentId, input.officeId, input.teamId,
      input.notes, ctx.actor.id,
    ],
  );

  // The opening position of each status is the first entry in its history.
  for (const [column, kind] of STATUS_FIELDS) {
    const value = statusValueOf(input, column);
    await db.query(
      `insert into property_status_history
         (property_id, status_kind, old_value, new_value, reason, changed_by)
       values ($1,$2,null,$3,'Created',$4)`,
      [property.id, kind, value, ctx.actor.id],
    );
  }
  if (input.currentAskingPrice) {
    await db.query(
      `insert into property_price_history
         (property_id, price_kind, old_price, new_price, reason, changed_by)
       values ($1,'asking',null,$2,'Created',$3)`,
      [property.id, input.currentAskingPrice, ctx.actor.id],
    );
  }
  if (input.mandateStatus !== 'no_mandate') {
    await db.query(
      `insert into property_mandate_history
         (property_id, mandate_type, mandate_status, mandate_start, mandate_expiry, reason, recorded_by)
       values ($1,$2,$3,$4,$5,'Created',$6)`,
      [
        property.id, input.mandateType, input.mandateStatus,
        input.mandateStart, input.mandateExpiry, ctx.actor.id,
      ],
    );
  }
  if (primaryAgentId) {
    await db.query(
      `insert into property_agent_assignments (property_id, agent_id, assignment, assigned_by, reason)
       values ($1,$2,'primary',$3,'Created')`,
      [property.id, primaryAgentId, ctx.actor.id],
    );
  }
  if (input.secondaryAgentId) {
    await db.query(
      `insert into property_agent_assignments (property_id, agent_id, assignment, assigned_by, reason)
       values ($1,$2,'secondary',$3,'Created')`,
      [property.id, input.secondaryAgentId, ctx.actor.id],
    );
  }
  await replaceTags(db, ctx, property.id, input.tagIds);

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.created',
    entityType: 'property',
    entityId: property.id,
    entityLabel: `${property.property_ref} ${input.streetAddress ?? input.propertyName ?? ''}`.trim(),
    context: {
      businessArea: input.businessArea,
      propertyStatus: input.propertyStatus,
      mandateStatus: input.mandateStatus,
    },
  });

  return { id: property.id, propertyRef: property.property_ref };
}

function statusValueOf(input: PropertyInput, column: (typeof STATUS_FIELDS)[number][0]): string {
  switch (column) {
    case 'property_status':
      return input.propertyStatus;
    case 'sales_status':
      return input.salesStatus;
    case 'rental_status':
      return input.rentalStatus;
    case 'mandate_status':
      return input.mandateStatus;
    case 'sale_outcome':
      return input.saleOutcome;
    case 'business_area':
      return input.businessArea;
    default:
      return '';
  }
}

export async function updateProperty(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  input: PropertyInput,
  expectedVersion: number,
): Promise<PropertyWriteResult> {
  const before = await db.maybeOne<Record<string, unknown> & {
    property_ref: string;
    row_version: number;
  }>(`select * from properties where id = $1`, [propertyId]);
  if (!before) throw new NotFoundError('That property');
  if (before.row_version !== expectedVersion) throw new ConcurrencyError();

  const updated = await db.query<Record<string, unknown>>(
    `update properties set
        erf_number=$2, portion_number=$3, township=$4, property_name=$5, street_address=$6,
        suburb=$7, city=$8, province=$9, postal_code=$10, property_type=$11,
        bedrooms=$12, bathrooms=$13, garages=$14, parking=$15,
        land_size_sqm=$16, building_size_sqm=$17,
        original_asking_price=$18, current_asking_price=$19, estimated_value=$20, monthly_rental=$21,
        business_area=$22, property_status=$23, sales_status=$24, rental_status=$25,
        mandate_status=$26, mandate_type=$27, sale_outcome=$28,
        mandate_start=$29, mandate_expiry=$30,
        primary_agent_id=$31, secondary_agent_id=$32, office_id=$33, team_id=$34,
        notes=$35, updated_by=$36
      where id=$1 and row_version=$37
      returning *`,
    [
      propertyId, input.erfNumber, input.portionNumber, input.township, input.propertyName,
      input.streetAddress, input.suburb, input.city, input.province, input.postalCode,
      input.propertyType, input.bedrooms, input.bathrooms, input.garages, input.parking,
      input.landSizeSqm, input.buildingSizeSqm,
      input.originalAskingPrice ?? before.original_asking_price ?? input.currentAskingPrice,
      input.currentAskingPrice, input.estimatedValue, input.monthlyRental,
      input.businessArea, input.propertyStatus, input.salesStatus, input.rentalStatus,
      input.mandateStatus, input.mandateType, input.saleOutcome,
      input.mandateStart, input.mandateExpiry,
      input.primaryAgentId, input.secondaryAgentId, input.officeId, input.teamId,
      input.notes, ctx.actor.id, expectedVersion,
    ],
  );
  const after = updated[0];
  if (!after) throw new ConcurrencyError();

  const reason = input.statusChangeReason;

  // Each status that moved gets its own history entry, under its own kind.
  for (const [column, kind] of STATUS_FIELDS) {
    const previous = (before[column] ?? null) as string | null;
    const next = (after[column] ?? null) as string | null;
    if (previous === next) continue;
    await db.query(
      `insert into property_status_history
         (property_id, status_kind, old_value, new_value, reason, changed_by)
       values ($1,$2,$3,$4,$5,$6)`,
      [propertyId, kind, previous, next, reason, ctx.actor.id],
    );
  }

  for (const [column, kind] of PRICE_FIELDS) {
    const previous = (before[column] ?? null) as string | null;
    const next = (after[column] ?? null) as string | null;
    if (previous === next) continue;
    await db.query(
      `insert into property_price_history
         (property_id, price_kind, old_price, new_price, reason, changed_by)
       values ($1,$2,$3,$4,$5,$6)`,
      [propertyId, kind, previous, next, reason, ctx.actor.id],
    );
  }

  const mandateChanged = (['mandate_type', 'mandate_status', 'mandate_start', 'mandate_expiry'] as const).some(
    (column) => String(before[column] ?? '') !== String(after[column] ?? ''),
  );
  if (mandateChanged) {
    await db.query(
      `insert into property_mandate_history
         (property_id, mandate_type, mandate_status, mandate_start, mandate_expiry, reason, recorded_by)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        propertyId, after.mandate_type, after.mandate_status,
        after.mandate_start, after.mandate_expiry, reason, ctx.actor.id,
      ],
    );
  }

  await recordAgentChange(db, ctx, propertyId, before, after, reason);
  await replaceTags(db, ctx, propertyId, input.tagIds);

  const changes = diff(before, after, AUDITED_FIELDS);
  if (Object.keys(changes).length > 0) {
    await recordAudit(db, ctx.actor, ctx.meta, {
      action: 'property.updated',
      entityType: 'property',
      entityId: propertyId,
      entityLabel: before.property_ref,
      changes,
      context: reason ? { reason } : null,
    });
  }

  return { id: propertyId, propertyRef: before.property_ref };
}

export async function archiveProperty(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  reason: string | null,
): Promise<void> {
  const row = await db.maybeOne<{ property_ref: string; is_archived: boolean }>(
    'select property_ref, is_archived from properties where id = $1',
    [propertyId],
  );
  if (!row) throw new NotFoundError('That property');
  if (row.is_archived) return;

  await db.query(
    `update properties set is_archived = true, archived_at = now(), archived_by = $2,
            archive_reason = $3, updated_by = $2 where id = $1`,
    [propertyId, ctx.actor.id, reason],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.archived',
    entityType: 'property',
    entityId: propertyId,
    entityLabel: row.property_ref,
    context: { reason },
  });
}

export async function restoreProperty(db: Db, ctx: Ctx, propertyId: string): Promise<void> {
  const row = await db.maybeOne<{ property_ref: string; merged_into_id: string | null }>(
    'select property_ref, merged_into_id from properties where id = $1',
    [propertyId],
  );
  if (!row) throw new NotFoundError('That property');
  if (row.merged_into_id) {
    throw new ValidationError(
      { _form: ['That record was merged into another and cannot be restored on its own.'] },
      'That record was merged into another and cannot be restored on its own.',
    );
  }
  await db.query(
    `update properties set is_archived = false, archived_at = null, archived_by = null,
            archive_reason = null, updated_by = $2 where id = $1`,
    [propertyId, ctx.actor.id],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.restored',
    entityType: 'property',
    entityId: propertyId,
    entityLabel: row.property_ref,
  });
}

export async function assignPropertyAgent(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  input: { primaryAgentId: string | null; secondaryAgentId: string | null; reason: string | null },
): Promise<void> {
  const before = await db.maybeOne<Record<string, unknown> & { property_ref: string }>(
    'select property_ref, primary_agent_id, secondary_agent_id from properties where id = $1',
    [propertyId],
  );
  if (!before) throw new NotFoundError('That property');

  await db.query(
    'update properties set primary_agent_id=$2, secondary_agent_id=$3, updated_by=$4 where id=$1',
    [propertyId, input.primaryAgentId, input.secondaryAgentId, ctx.actor.id],
  );
  await recordAgentChange(
    db,
    ctx,
    propertyId,
    before,
    { primary_agent_id: input.primaryAgentId, secondary_agent_id: input.secondaryAgentId },
    input.reason,
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.agent_assigned',
    entityType: 'property',
    entityId: propertyId,
    entityLabel: before.property_ref,
    changes: diff(
      before,
      { primary_agent_id: input.primaryAgentId, secondary_agent_id: input.secondaryAgentId },
      ['primary_agent_id', 'secondary_agent_id'],
    ),
    context: { reason: input.reason },
  });
}

// --- people linked to a property -------------------------------------------

export async function linkPersonToProperty(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  input: {
    personId: string;
    role: string;
    ownershipPercent: string | null;
    isPrimaryContact: boolean;
    startDate: string | null;
    endDate: string | null;
    notes: string | null;
  },
): Promise<void> {
  // Ownership shares must not add up to more than the whole property.
  if (input.ownershipPercent && ['owner', 'co_owner'].includes(input.role)) {
    const existing = await db.one<{ total: string | null }>(
      `select coalesce(sum(ownership_percent), 0)::text as total
         from property_people
        where property_id = $1 and role in ('owner','co_owner') and end_date is null
          and person_id <> $2`,
      [propertyId, input.personId],
    );
    const total = Number(existing.total ?? 0) + Number(input.ownershipPercent);
    if (total > 100.001) {
      throw new ValidationError({
        ownershipPercent: [
          `Ownership would come to ${total.toFixed(2)}%. The shares on a property cannot exceed 100%.`,
        ],
      });
    }
  }

  if (input.isPrimaryContact) {
    await db.query(
      'update property_people set is_primary_contact = false where property_id = $1',
      [propertyId],
    );
  }

  await db.query(
    `insert into property_people
       (property_id, person_id, role, ownership_percent, is_primary_contact,
        start_date, end_date, notes, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
     on conflict (property_id, person_id, role) do update
       set ownership_percent = excluded.ownership_percent,
           is_primary_contact = excluded.is_primary_contact,
           start_date = excluded.start_date, end_date = excluded.end_date,
           notes = excluded.notes, updated_by = excluded.updated_by`,
    [
      propertyId, input.personId, input.role, input.ownershipPercent,
      input.isPrimaryContact, input.startDate, input.endDate, input.notes, ctx.actor.id,
    ],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.person_linked',
    entityType: 'property',
    entityId: propertyId,
    context: { personId: input.personId, role: input.role },
  });
}

export async function unlinkPersonFromProperty(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  linkId: string,
): Promise<void> {
  const removed = await db.count(
    'delete from property_people where id = $1 and property_id = $2',
    [linkId, propertyId],
  );
  if (removed === 0) throw new NotFoundError('That link');
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.person_unlinked',
    entityType: 'property',
    entityId: propertyId,
    context: { linkId },
  });
}

// --- marketing --------------------------------------------------------------

export async function saveMarketing(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  input: {
    headline: string | null;
    shortDescription: string | null;
    fullDescription: string | null;
    keySellingPoints: string | null;
    features: string | null;
    directions: string | null;
    onShowInfo: string | null;
    marketingNotes: string | null;
    marketingStatus: string;
  },
): Promise<void> {
  await db.query(
    `insert into property_marketing
       (property_id, headline, short_description, full_description, key_selling_points,
        features, directions, on_show_info, marketing_notes, marketing_status, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (property_id) do update
       set headline = excluded.headline,
           short_description = excluded.short_description,
           full_description = excluded.full_description,
           key_selling_points = excluded.key_selling_points,
           features = excluded.features,
           directions = excluded.directions,
           on_show_info = excluded.on_show_info,
           marketing_notes = excluded.marketing_notes,
           marketing_status = excluded.marketing_status,
           updated_at = now(), updated_by = excluded.updated_by`,
    [
      propertyId, input.headline, input.shortDescription, input.fullDescription,
      input.keySellingPoints, input.features, input.directions, input.onShowInfo,
      input.marketingNotes, input.marketingStatus, ctx.actor.id,
    ],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.marketing_saved',
    entityType: 'property',
    entityId: propertyId,
    context: { marketingStatus: input.marketingStatus },
  });
}

/**
 * Records where a property was advertised.
 *
 * This is a record of what somebody did by hand. Nothing here contacts a
 * portal, and marking a channel published does not publish anything
 * (spec 37, 115).
 */
export async function saveMarketingChannel(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  input: {
    channel: string;
    isPublished: boolean;
    publishedAt: string | null;
    removedAt: string | null;
    sourceUrl: string | null;
    notes: string | null;
  },
): Promise<void> {
  if (input.sourceUrl && !/^https?:\/\//i.test(input.sourceUrl)) {
    throw new ValidationError(
      { sourceUrl: ['Enter a full web address starting with https://'] },
      'Enter a full web address starting with https://',
    );
  }
  await db.query(
    `insert into property_marketing_channels
       (property_id, channel, is_published, published_at, removed_at, source_url, notes, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (property_id, channel) do update
       set is_published = excluded.is_published,
           published_at = excluded.published_at,
           removed_at = excluded.removed_at,
           source_url = excluded.source_url,
           notes = excluded.notes,
           updated_at = now(), updated_by = excluded.updated_by`,
    [
      propertyId, input.channel, input.isPublished, input.publishedAt,
      input.removedAt, input.sourceUrl, input.notes, ctx.actor.id,
    ],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.marketing_channel_recorded',
    entityType: 'property',
    entityId: propertyId,
    context: {
      channel: input.channel,
      recordedAsPublished: input.isPublished,
      note: 'Recorded by hand. The CRM does not contact portals.',
    },
  });
}

// --- past sales and rentals -------------------------------------------------

export async function addSaleHistory(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  input: {
    saleDate: string | null;
    registeredAt: string | null;
    salePrice: string | null;
    buyerId: string | null;
    sellerId: string | null;
    agentId: string | null;
    saleOutcome: string | null;
    notes: string | null;
  },
): Promise<void> {
  await db.query(
    `insert into property_sale_history
       (property_id, sale_date, registered_at, sale_price, buyer_id, seller_id, agent_id,
        sale_outcome, notes, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      propertyId, input.saleDate, input.registeredAt, input.salePrice, input.buyerId,
      input.sellerId, input.agentId, input.saleOutcome, input.notes, ctx.actor.id,
    ],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.sale_history_added',
    entityType: 'property',
    entityId: propertyId,
    context: { saleDate: input.saleDate, saleOutcome: input.saleOutcome },
  });
}

export async function addRentalHistory(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  input: {
    leaseStart: string | null;
    leaseEnd: string | null;
    monthlyRental: string | null;
    tenantId: string | null;
    landlordId: string | null;
    agentId: string | null;
    notes: string | null;
  },
): Promise<void> {
  await db.query(
    `insert into property_rental_history
       (property_id, lease_start, lease_end, monthly_rental, tenant_id, landlord_id, agent_id,
        notes, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      propertyId, input.leaseStart, input.leaseEnd, input.monthlyRental, input.tenantId,
      input.landlordId, input.agentId, input.notes, ctx.actor.id,
    ],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.rental_history_added',
    entityType: 'property',
    entityId: propertyId,
    context: { leaseStart: input.leaseStart },
  });
}

// --- shared -----------------------------------------------------------------

async function replaceTags(db: Db, ctx: Ctx, propertyId: string, tagIds: string[]): Promise<void> {
  await db.query(
    `delete from record_tags
      where entity_type = 'property' and entity_id = $1 and tag_id <> all($2::uuid[])`,
    [propertyId, tagIds],
  );
  if (tagIds.length > 0) {
    await db.query(
      `insert into record_tags (tag_id, entity_type, entity_id, added_by)
       select unnest($2::uuid[]), 'property', $1, $3
       on conflict do nothing`,
      [propertyId, tagIds, ctx.actor.id],
    );
  }
}

async function recordAgentChange(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  reason: string | null = null,
): Promise<void> {
  for (const [assignment, field] of [
    ['primary', 'primary_agent_id'],
    ['secondary', 'secondary_agent_id'],
  ] as const) {
    const previous = (before[field] ?? null) as string | null;
    const next = (after[field] ?? null) as string | null;
    if (previous === next) continue;

    if (previous) {
      await db.query(
        `update property_agent_assignments set unassigned_at = now()
          where property_id = $1 and assignment = $2 and agent_id = $3 and unassigned_at is null`,
        [propertyId, assignment, previous],
      );
    }
    if (next) {
      await db.query(
        `insert into property_agent_assignments
           (property_id, agent_id, assignment, assigned_by, reason)
         values ($1,$2,$3,$4,$5)`,
        [propertyId, next, assignment, ctx.actor.id, reason],
      );
    }
  }
}
