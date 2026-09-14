import { z } from 'zod';
import type { Ctx } from './actor.ts';
import type { Db } from './db.ts';
import { NotFoundError, ValidationError } from './errors.ts';
import { optionalText } from './validate.ts';

/**
 * The small things that make the CRM somebody's workspace rather than a
 * database with a web page on it (spec 88, 89, 93).
 *
 * Saved views, favourites and what a person looked at recently. The last
 * two are private: row level security keeps them to their own user, and
 * management cannot read them either, because what somebody looked at is
 * not office business.
 */

export const ENTITY_LABELS = {
  person: 'Person',
  company: 'Entity',
  property: 'Property',
  lead: 'Lead',
  task: 'Task',
  transaction: 'Transaction',
  rental_application: 'Rental application',
  communication: 'Conversation',
  commission: 'Commission',
  fica: 'FICA file',
} as const;
export type EntityType = keyof typeof ENTITY_LABELS;

/** Where a record of each kind lives, so one helper can link to anything. */
export const ENTITY_PATHS: Record<EntityType, string> = {
  person: '/people',
  company: '/companies',
  property: '/properties',
  lead: '/leads',
  task: '/tasks',
  transaction: '/sales/transactions',
  rental_application: '/rentals/applications',
  communication: '/communications',
  commission: '/commissions',
  fica: '/fica',
};

export function pathTo(entityType: string, id: string): string {
  const base = ENTITY_PATHS[entityType as EntityType];
  return base ? `${base}/${id}` : '/';
}

// ---------------------------------------------------------------------
// Saved views (spec 88)
// ---------------------------------------------------------------------

const VIEW_ENTITIES = [
  'person', 'property', 'lead', 'task', 'transaction',
  'rental_application', 'communication', 'commission', 'fica',
] as const;

export const savedViewInputSchema = z.object({
  name: z.string().trim().min(2, 'Give the view a name.').max(80),
  entityType: z.enum(VIEW_ENTITIES),
  /**
   * The list page's own query string. A saved view is a named link and
   * nothing more, so there is no second query language to keep in step
   * with the filters.
   */
  query: optionalText,
  isShared: z.boolean().default(false),
});
export type SavedViewInput = z.infer<typeof savedViewInputSchema>;

export interface SavedView {
  id: string;
  name: string;
  entityType: string;
  query: string;
  isShared: boolean;
  isMine: boolean;
  ownerName: string | null;
  href: string;
  rowVersion: number;
}

export async function listSavedViews(
  db: Db,
  actorId: string,
  entityType?: string,
): Promise<SavedView[]> {
  const rows = await db.query<{
    id: string;
    name: string;
    entity_type: string;
    query: string;
    is_shared: boolean;
    owner_id: string;
    owner_name: string | null;
    row_version: number;
  }>(
    `select v.id, v.name, v.entity_type, v.query, v.is_shared, v.owner_id,
            coalesce(u.display_name, u.full_name) as owner_name, v.row_version
       from saved_views v
       left join users u on u.id = v.owner_id
      where ($1::text is null or v.entity_type = $1)
      order by v.entity_type, v.sort_order, lower(v.name)`,
    [entityType ?? null],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    entityType: row.entity_type,
    query: row.query,
    isShared: row.is_shared,
    isMine: row.owner_id === actorId,
    ownerName: row.owner_name,
    href: `${ENTITY_PATHS[row.entity_type as EntityType] ?? '/'}${row.query ? `?${row.query}` : ''}`,
    rowVersion: row.row_version,
  }));
}

export async function saveView(
  db: Db,
  ctx: Ctx,
  input: SavedViewInput,
): Promise<{ id: string }> {
  // A query string is stored as it came off the list page, minus anything
  // that is not a filter, so a saved view cannot smuggle a path into a link.
  const query = cleanQuery(input.query ?? '');

  const existing = await db.maybeOne<{ id: string }>(
    `select id from saved_views
      where owner_id = $1 and entity_type = $2 and lower(name) = lower($3)`,
    [ctx.actor.id, input.entityType, input.name],
  );

  if (existing) {
    await db.query(
      'update saved_views set query = $2, is_shared = $3 where id = $1',
      [existing.id, query, input.isShared],
    );
    return { id: existing.id };
  }

  return db.one<{ id: string }>(
    `insert into saved_views (owner_id, name, entity_type, query, is_shared)
     values ($1,$2,$3,$4,$5) returning id`,
    [ctx.actor.id, input.name, input.entityType, query, input.isShared],
  );
}

export async function deleteSavedView(db: Db, id: string): Promise<void> {
  const removed = await db.count('delete from saved_views where id = $1', [id]);
  if (removed === 0) throw new NotFoundError('That view');
}

/**
 * Keeps a saved view's query to plain filter pairs.
 *
 * Anything with a scheme, a slash or a fragment is dropped, so a named
 * view is always a link back into this CRM and never somewhere else.
 */
export function cleanQuery(query: string): string {
  const pairs = new URLSearchParams(query.replace(/^\?/, ''));
  const kept = new URLSearchParams();
  for (const [key, value] of pairs) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key)) continue;
    if (value.length > 200) continue;
    if (/[\\/]|:\/\/|^#/.test(value)) continue;
    kept.append(key, value);
  }
  return kept.toString();
}

// ---------------------------------------------------------------------
// Favourites (spec 89)
// ---------------------------------------------------------------------

export interface Favourite {
  entityType: string;
  entityId: string;
  label: string;
  href: string;
}

export async function isFavourite(
  db: Db,
  actorId: string,
  entityType: string,
  entityId: string,
): Promise<boolean> {
  const row = await db.maybeOne(
    'select 1 from favourites where user_id = $1 and entity_type = $2 and entity_id = $3',
    [actorId, entityType, entityId],
  );
  return row !== null;
}

/** Adds or removes, and reports which it did, so one button can do both. */
export async function toggleFavourite(
  db: Db,
  ctx: Ctx,
  entityType: string,
  entityId: string,
): Promise<'added' | 'removed'> {
  const removed = await db.count(
    'delete from favourites where user_id = $1 and entity_type = $2 and entity_id = $3',
    [ctx.actor.id, entityType, entityId],
  );
  if (removed > 0) return 'removed';

  await db.query(
    'insert into favourites (user_id, entity_type, entity_id) values ($1,$2,$3)',
    [ctx.actor.id, entityType, entityId],
  );
  return 'added';
}

/**
 * Somebody's favourites, with a label read from the record itself.
 *
 * Row level security still applies to each record, so a favourite whose
 * record the user may no longer see simply does not come back.
 */
export async function listFavourites(db: Db, actorId: string): Promise<Favourite[]> {
  const rows = await db.query<{
    entity_type: string;
    entity_id: string;
    label: string | null;
  }>(
    `select f.entity_type, f.entity_id,
            case f.entity_type
              when 'person' then (select p.first_name || ' ' || p.surname
                                    from people p where p.id = f.entity_id)
              when 'company' then (select c.registered_name
                                     from companies c where c.id = f.entity_id)
              when 'property' then (select coalesce(
                                             nullif(trim(coalesce(pr.street_address, '')
                                               || ' ' || coalesce(pr.suburb, '')), ''),
                                             pr.property_ref)
                                      from properties pr where pr.id = f.entity_id)
              when 'lead' then (select coalesce(l.enquiry_summary, l.lead_type)
                                  from leads l where l.id = f.entity_id)
              when 'transaction' then (select t.transaction_ref
                                         from transactions t where t.id = f.entity_id)
              when 'rental_application' then (select ra.application_ref
                                                from rental_applications ra
                                               where ra.id = f.entity_id)
              when 'commission' then (select cm.commission_ref
                                        from commissions cm where cm.id = f.entity_id)
              else null
            end as label
       from favourites f
      where f.user_id = $1
      order by f.created_at desc
      limit 50`,
    [actorId],
  );

  return rows
    .filter((row) => row.label !== null)
    .map((row) => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      label: row.label as string,
      href: pathTo(row.entity_type, row.entity_id),
    }));
}

// ---------------------------------------------------------------------
// Recently viewed (spec 93)
// ---------------------------------------------------------------------

/**
 * Notes that somebody opened a record.
 *
 * The label is stored with it, so the list survives the record being
 * archived and does not need eight joins to render. This is called from a
 * page render, so it must never be the reason a page fails: a problem
 * writing it is swallowed deliberately.
 */
export async function noteViewed(
  db: Db,
  actorId: string,
  entityType: EntityType,
  entityId: string,
  label: string,
): Promise<void> {
  try {
    await db.query(
      `insert into recently_viewed (user_id, entity_type, entity_id, label)
       values ($1,$2,$3,$4)
       on conflict (user_id, entity_type, entity_id)
         do update set viewed_at = now(), label = excluded.label`,
      [actorId, entityType, entityId, label.slice(0, 200)],
    );
  } catch {
    /* A history of what was opened is never worth a broken page. */
  }
}

export async function listRecentlyViewed(
  db: Db,
  actorId: string,
  limit = 8,
): Promise<{ entityType: string; entityId: string; label: string; href: string; viewedAt: string }[]> {
  const rows = await db.query<{
    entity_type: string;
    entity_id: string;
    label: string;
    viewed_at: Date;
  }>(
    `select entity_type, entity_id, label, viewed_at
       from recently_viewed where user_id = $1
      order by viewed_at desc limit $2`,
    [actorId, Math.min(limit, 30)],
  );

  return rows.map((row) => ({
    entityType: row.entity_type,
    entityId: row.entity_id,
    label: row.label,
    href: pathTo(row.entity_type, row.entity_id),
    viewedAt: row.viewed_at.toISOString(),
  }));
}

// ---------------------------------------------------------------------
// Tags (spec 87)
// ---------------------------------------------------------------------

export const TAG_COLOURS = ['neutral', 'brand', 'ok', 'warn', 'stop', 'info'] as const;

export const tagInputSchema = z.object({
  name: z.string().trim().min(2, 'Give the tag a name.').max(40),
  colour: z.enum(TAG_COLOURS).default('neutral'),
});
export type TagInput = z.infer<typeof tagInputSchema>;

export interface TagRow {
  id: string;
  name: string;
  colour: string;
  isActive: boolean;
  useCount: number;
}

export async function listAllTags(db: Db): Promise<TagRow[]> {
  const rows = await db.query<{
    id: string;
    name: string;
    colour: string;
    is_active: boolean;
    use_count: number;
  }>(
    `select t.id, t.name, t.colour, t.is_active,
            (select count(*) from record_tags r where r.tag_id = t.id) as use_count
       from tags t order by t.sort_order, lower(t.name)`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    colour: row.colour,
    isActive: row.is_active,
    useCount: Number(row.use_count),
  }));
}

export async function createTag(db: Db, ctx: Ctx, input: TagInput): Promise<{ id: string }> {
  const clash = await db.maybeOne('select 1 from tags where lower(name) = lower($1)', [input.name]);
  if (clash) {
    throw new ValidationError(
      { name: ['There is already a tag with that name.'] },
      'That tag already exists.',
    );
  }
  return db.one<{ id: string }>(
    'insert into tags (name, colour, created_by) values ($1,$2,$3) returning id',
    [input.name, input.colour, ctx.actor.id],
  );
}

/**
 * Retiring a tag.
 *
 * It stops being offered but stays on every record that carries it, so no
 * history is rewritten (spec 104).
 */
export async function setTagActive(db: Db, id: string, isActive: boolean): Promise<void> {
  const updated = await db.count('update tags set is_active = $2 where id = $1', [id, isActive]);
  if (updated === 0) throw new NotFoundError('That tag');
}

export async function tagsFor(
  db: Db,
  entityType: string,
  entityId: string,
): Promise<{ id: string; name: string; colour: string }[]> {
  return db.query<{ id: string; name: string; colour: string }>(
    `select t.id, t.name, t.colour
       from record_tags r join tags t on t.id = r.tag_id
      where r.entity_type = $1 and r.entity_id = $2
      order by t.sort_order, lower(t.name)`,
    [entityType, entityId],
  );
}

export async function setTags(
  db: Db,
  ctx: Ctx,
  entityType: string,
  entityId: string,
  tagIds: string[],
): Promise<void> {
  await db.query(
    'delete from record_tags where entity_type = $1 and entity_id = $2 and tag_id <> all($3::uuid[])',
    [entityType, entityId, tagIds],
  );
  for (const tagId of tagIds) {
    await db.query(
      `insert into record_tags (tag_id, entity_type, entity_id, added_by)
       values ($1,$2,$3,$4) on conflict do nothing`,
      [tagId, entityType, entityId, ctx.actor.id],
    );
  }
}
