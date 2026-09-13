import type { Ctx } from '../actor.ts';
import type { Db } from '../db.ts';
import { recordAudit } from '../audit.ts';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors.ts';
import {
  BUSINESS_AREAS,
  MANDATE_STATUSES,
  MANDATE_TYPES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  RENTAL_STATUSES,
  SALES_STATUSES,
  SALE_OUTCOMES,
  labelOf,
} from '../domain.ts';

/**
 * Merging two properties into one master record (spec 33).
 *
 * Same rules as people: the surviving value is chosen for each field that
 * differs, the history moves in one transaction, and the losing record keeps
 * its reference for ever.
 */

const SELECTABLE_FIELDS = {
  erf_number: 'Erf number',
  portion_number: 'Portion',
  township: 'Township',
  property_name: 'Property name',
  street_address: 'Street address',
  suburb: 'Suburb',
  city: 'Town or city',
  province: 'Province',
  postal_code: 'Postal code',
  property_type: 'Property type',
  bedrooms: 'Bedrooms',
  bathrooms: 'Bathrooms',
  garages: 'Garages',
  parking: 'Parking',
  land_size_sqm: 'Land size',
  building_size_sqm: 'Building size',
  original_asking_price: 'Original asking price',
  current_asking_price: 'Current asking price',
  estimated_value: 'Estimated value',
  monthly_rental: 'Monthly rental',
  business_area: 'Business area',
  property_status: 'Property status',
  sales_status: 'Sales status',
  rental_status: 'Rental status',
  mandate_status: 'Mandate status',
  mandate_type: 'Mandate type',
  sale_outcome: 'Sale outcome',
  mandate_start: 'Mandate start',
  mandate_expiry: 'Mandate expiry',
  primary_agent_id: 'Primary agent',
  secondary_agent_id: 'Secondary agent',
} as const;

export type SelectablePropertyField = keyof typeof SELECTABLE_FIELDS;

export interface PropertyComparisonField {
  field: SelectablePropertyField;
  label: string;
  masterValue: string;
  mergedValue: string;
  differs: boolean;
}

interface PropertySide {
  id: string;
  propertyRef: string;
  addressLine: string;
  agentName: string | null;
  createdAt: string;
  counts: { people: number; photos: number; documents: number; history: number };
}

export interface PropertyMergeComparison {
  master: PropertySide;
  merged: PropertySide;
  fields: PropertyComparisonField[];
}

interface SideRow {
  id: string;
  property_ref: string;
  street_address: string | null;
  property_name: string | null;
  suburb: string | null;
  city: string | null;
  agent_name: string | null;
  created_at: Date;
  people: number;
  photos: number;
  documents: number;
  history: number;
  merged_into_id: string | null;
  [key: string]: unknown;
}

const SIDE_SQL = `
  select p.*,
         coalesce(u.display_name, u.full_name) as agent_name,
         (select count(*)::int from property_people x where x.property_id = p.id) as people,
         (select count(*)::int from property_photos x where x.property_id = p.id) as photos,
         (select count(*)::int from documents x where x.property_id = p.id) as documents,
         (select count(*)::int from property_status_history x where x.property_id = p.id) as history
    from properties p
    left join users u on u.id = p.primary_agent_id
   where p.id = $1`;

const LABEL_MAPS: Partial<Record<SelectablePropertyField, Record<string, string>>> = {
  property_type: PROPERTY_TYPES,
  business_area: BUSINESS_AREAS,
  property_status: PROPERTY_STATUSES,
  sales_status: SALES_STATUSES,
  rental_status: RENTAL_STATUSES,
  mandate_status: MANDATE_STATUSES,
  mandate_type: MANDATE_TYPES,
  sale_outcome: SALE_OUTCOMES,
};

export async function getPropertyMergeComparison(
  db: Db,
  masterId: string,
  mergedId: string,
): Promise<PropertyMergeComparison> {
  const [master, merged] = await Promise.all([
    db.maybeOne<SideRow>(SIDE_SQL, [masterId]),
    db.maybeOne<SideRow>(SIDE_SQL, [mergedId]),
  ]);
  if (!master || !merged) throw new NotFoundError('One of those properties');

  const fields = (Object.keys(SELECTABLE_FIELDS) as SelectablePropertyField[]).map((field) => {
    const masterValue = display(field, master[field]);
    const mergedValue = display(field, merged[field]);
    return {
      field,
      label: SELECTABLE_FIELDS[field],
      masterValue,
      mergedValue,
      differs: masterValue !== mergedValue,
    };
  });

  return { master: toSide(master), merged: toSide(merged), fields };
}

function toSide(row: SideRow): PropertySide {
  return {
    id: row.id,
    propertyRef: row.property_ref,
    addressLine: [row.property_name, row.street_address, row.suburb, row.city]
      .filter(Boolean)
      .join(', '),
    agentName: row.agent_name,
    createdAt: row.created_at.toISOString(),
    counts: {
      people: row.people,
      photos: row.photos,
      documents: row.documents,
      history: row.history,
    },
  };
}

function display(field: SelectablePropertyField, value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const map = LABEL_MAPS[field];
  if (map) return labelOf(map, String(value));
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export interface PropertyMergeResult {
  masterReference: string;
  mergedReference: string;
  moved: Record<string, { moved: number; dropped: number }>;
}

export async function mergeProperties(
  db: Db,
  ctx: Ctx,
  input: {
    masterId: string;
    mergedId: string;
    choices: Partial<Record<SelectablePropertyField, 'master' | 'merged'>>;
    reason: string | null;
  },
): Promise<PropertyMergeResult> {
  if (!ctx.actor.permissions.has('MERGE_RECORDS')) {
    throw new ForbiddenError('merging records');
  }
  if (input.masterId === input.mergedId) {
    throw new ValidationError(
      { _form: ['A record cannot be merged into itself.'] },
      'A record cannot be merged into itself.',
    );
  }

  const master = await db.maybeOne<SideRow>(SIDE_SQL, [input.masterId]);
  const merged = await db.maybeOne<SideRow>(SIDE_SQL, [input.mergedId]);
  if (!master || !merged) throw new NotFoundError('One of those properties');

  const takeFromMerged = (Object.keys(input.choices) as SelectablePropertyField[]).filter(
    (field) => input.choices[field] === 'merged' && field in SELECTABLE_FIELDS,
  );
  if (takeFromMerged.length > 0) {
    const assignments = takeFromMerged.map((field, index) => `${field} = $${index + 2}`);
    await db.query(
      `update properties set ${assignments.join(', ')}, updated_by = $${takeFromMerged.length + 2}
        where id = $1`,
      [input.masterId, ...takeFromMerged.map((field) => merged[field] ?? null), ctx.actor.id],
    );
  }

  const selected = Object.fromEntries(
    (Object.keys(SELECTABLE_FIELDS) as SelectablePropertyField[]).map((field) => [
      field,
      input.choices[field] ?? 'master',
    ]),
  );

  const row = await db.one<{
    merge_properties: {
      master_reference: string;
      merged_reference: string;
      moved: Record<string, { moved: number; dropped: number }>;
    };
  }>('select app.merge_properties($1, $2, $3, $4::jsonb) as merge_properties', [
    input.masterId,
    input.mergedId,
    input.reason,
    JSON.stringify(selected),
  ]);

  const result: PropertyMergeResult = {
    masterReference: row.merge_properties.master_reference,
    mergedReference: row.merge_properties.merged_reference,
    moved: row.merge_properties.moved ?? {},
  };

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.merged',
    entityType: 'property',
    entityId: input.masterId,
    entityLabel: `${master.property_ref} ← ${merged.property_ref}`,
    context: {
      masterReference: master.property_ref,
      mergedReference: merged.property_ref,
      reason: input.reason,
      choices: selected,
      moved: result.moved,
    },
  });

  return result;
}
