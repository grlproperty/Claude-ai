import { z } from 'zod';
import type { Ctx } from './actor.ts';
import type { Db } from './db.ts';
import { recordAudit } from './audit.ts';
import { ConcurrencyError, NotFoundError } from './errors.ts';
import { TEMPLATE_CATEGORIES, type TemplateCategory } from './domain.ts';
import { formatDate, formatMoney } from './format.ts';
import { optionalText, requiredText } from './validate.ts';

/**
 * Message templates (spec 44).
 *
 * A template composes wording. The person then sends that wording themselves,
 * from their own mail application or from WhatsApp on their own phone. Using a
 * template is not sending, and nothing here ever says it is.
 *
 * Merge fields are filled from the record in front of the user. A field with
 * nothing behind it is left visibly unfilled rather than silently blanked, so
 * "Good day {{first_name}}" never goes out as "Good day " — the person can see
 * what is missing before they send it.
 */

const keys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]];

export interface MergeField {
  key: string;
  label: string;
  example: string;
}

/** Everything a template may refer to, for the "what can I use" list. */
export const MERGE_FIELDS: MergeField[] = [
  { key: 'first_name', label: 'Their first name', example: 'Johan' },
  { key: 'preferred_name', label: 'What they go by', example: 'Jo' },
  { key: 'surname', label: 'Their surname', example: 'van der Merwe' },
  { key: 'full_name', label: 'Their full name', example: 'Johan van der Merwe' },
  { key: 'title', label: 'Their title', example: 'Mr' },
  { key: 'client_ref', label: 'Their client reference', example: 'GRLP-00000042' },
  { key: 'property_address', label: 'The property address', example: '18 Main Road, Wilderness' },
  { key: 'property_ref', label: 'The property reference', example: 'GRLP-P-00000007' },
  { key: 'suburb', label: 'The suburb', example: 'Wilderness' },
  { key: 'asking_price', label: 'The asking price', example: 'R2 950 000' },
  { key: 'monthly_rental', label: 'The monthly rental', example: 'R14 500' },
  { key: 'bedrooms', label: 'Bedrooms', example: '3' },
  { key: 'mandate_expiry', label: 'When the mandate expires', example: '1 December 2026' },
  { key: 'appointment_date', label: 'The appointment date', example: '4 March 2026' },
  { key: 'appointment_time', label: 'The appointment time', example: '10:00' },
  { key: 'agent_name', label: 'Your name', example: 'Ayden Grobler' },
  { key: 'agent_phone', label: 'Your number', example: '082 123 4567' },
  { key: 'agent_email', label: 'Your email', example: 'ayden@grproperty.co.za' },
  { key: 'today', label: "Today's date", example: '14 September 2026' },
];

export const MERGE_FIELD_KEYS = new Set(MERGE_FIELDS.map((field) => field.key));

export const templateInputSchema = z.object({
  name: requiredText('A name for the template', 120),
  category: z.enum(keys(TEMPLATE_CATEGORIES)).default('general'),
  channel: z
    .enum(['any', 'call', 'whatsapp', 'sms', 'email', 'in_person'])
    .default('any'),
  subject: optionalText,
  body: requiredText('The wording', 8000),
  isActive: z.coerce.boolean().default(true),
});
export type TemplateInput = z.infer<typeof templateInputSchema>;

export interface Template {
  id: string;
  name: string;
  category: TemplateCategory;
  channel: string;
  subject: string | null;
  body: string;
  isActive: boolean;
  timesUsed: number;
  lastUsedAt: string | null;
  rowVersion: number;
}

export async function listTemplates(
  db: Db,
  filters: { channel?: string; category?: string; activeOnly?: boolean } = {},
): Promise<Template[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.activeOnly !== false) where.push('t.is_active');
  if (filters.channel && filters.channel !== 'all') {
    where.push(`(t.channel = 'any' or t.channel = ${add(filters.channel)})`);
  }
  if (filters.category && filters.category !== 'all') {
    where.push(`t.category = ${add(filters.category)}`);
  }

  const rows = await db.query<{
    id: string;
    name: string;
    category: TemplateCategory;
    channel: string;
    subject: string | null;
    body: string;
    is_active: boolean;
    times_used: number;
    last_used_at: Date | null;
    row_version: number;
  }>(
    `select t.id, t.name, t.category, t.channel, t.subject, t.body, t.is_active,
            t.times_used, t.last_used_at, t.row_version
       from communication_templates t
      where ${where.length > 0 ? where.join(' and ') : 'true'}
      order by t.category, t.name`,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    channel: row.channel,
    subject: row.subject,
    body: row.body,
    isActive: row.is_active,
    timesUsed: row.times_used,
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    rowVersion: row.row_version,
  }));
}

export async function getTemplate(db: Db, id: string): Promise<Template | null> {
  const rows = await listTemplates(db, { activeOnly: false });
  return rows.find((row) => row.id === id) ?? null;
}

export async function createTemplate(
  db: Db,
  ctx: Ctx,
  input: TemplateInput,
): Promise<{ id: string }> {
  const unrecognised = unknownMergeFields(`${input.subject ?? ''} ${input.body}`);
  const row = await db.one<{ id: string }>(
    `insert into communication_templates
       (name, category, channel, subject, body, is_active, created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$7) returning id`,
    [
      input.name, input.category, input.channel, input.subject, input.body,
      input.isActive, ctx.actor.id,
    ],
  );
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'template.created',
    entityType: 'communication_template',
    entityId: row.id,
    context: { name: input.name, unknownMergeFields: unrecognised },
  });
  return { id: row.id };
}

export async function updateTemplate(
  db: Db,
  ctx: Ctx,
  id: string,
  input: TemplateInput,
  expectedVersion: number,
): Promise<void> {
  const changed = await db.count(
    `update communication_templates
        set name=$2, category=$3, channel=$4, subject=$5, body=$6, is_active=$7, updated_by=$8
      where id=$1 and row_version=$9`,
    [
      id, input.name, input.category, input.channel, input.subject, input.body,
      input.isActive, ctx.actor.id, expectedVersion,
    ],
  );
  if (changed === 0) {
    const exists = await db.maybeOne<{ id: string }>(
      'select id from communication_templates where id = $1',
      [id],
    );
    if (!exists) throw new NotFoundError('That template');
    throw new ConcurrencyError();
  }

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'template.updated',
    entityType: 'communication_template',
    entityId: id,
    context: { name: input.name, active: input.isActive },
  });
}

// ---------------------------------------------------------------------------
// Filling a template in
// ---------------------------------------------------------------------------

export type MergeValues = Partial<Record<string, string | null>>;

export interface RenderedTemplate {
  subject: string | null;
  body: string;
  /** Fields the template asked for that this record could not supply. */
  unfilled: string[];
  /** Fields the template asked for that are not fields at all. */
  unknown: string[];
}

const FIELD_PATTERN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function mergeFieldsUsed(text: string): string[] {
  const used = new Set<string>();
  for (const match of text.matchAll(FIELD_PATTERN)) {
    if (match[1]) used.add(match[1].toLowerCase());
  }
  return [...used];
}

export function unknownMergeFields(text: string): string[] {
  return mergeFieldsUsed(text).filter((field) => !MERGE_FIELD_KEYS.has(field));
}

/**
 * Fills a template in.
 *
 * A field with no value is left as its own placeholder, not blanked. That is
 * deliberate: the person is about to send this themselves, and seeing
 * "Good day {{first_name}}" tells them something is missing, where
 * "Good day " would go out looking careless and they might not notice.
 */
export function renderTemplate(
  template: Pick<Template, 'subject' | 'body'>,
  values: MergeValues,
): RenderedTemplate {
  const unfilled = new Set<string>();
  const unknown = new Set<string>();

  const fill = (text: string): string =>
    text.replace(FIELD_PATTERN, (whole, rawKey: string) => {
      const key = rawKey.toLowerCase();
      if (!MERGE_FIELD_KEYS.has(key)) {
        unknown.add(key);
        return whole;
      }
      const value = values[key];
      if (value === undefined || value === null || value === '') {
        unfilled.add(key);
        return whole;
      }
      return value;
    });

  const body = fill(template.body);
  const subject = template.subject ? fill(template.subject) : null;

  return { subject, body, unfilled: [...unfilled], unknown: [...unknown] };
}

/**
 * The merge values for a person, optionally about a property.
 *
 * Reads only what the caller can already see: it is given the records rather
 * than fetching them, so a template can never become a way to read a record
 * somebody is not allowed to open.
 */
export function mergeValuesFor(input: {
  person?: {
    firstName?: string | null;
    preferredName?: string | null;
    surname?: string | null;
    fullName?: string | null;
    title?: string | null;
    clientRef?: string | null;
  } | null;
  property?: {
    addressLine?: string | null;
    propertyRef?: string | null;
    suburb?: string | null;
    currentAskingPrice?: string | null;
    monthlyRental?: string | null;
    // The read model hands this back as text, like every other numeric field.
    bedrooms?: string | number | null;
    mandateExpiry?: string | null;
  } | null;
  appointment?: { startsAt?: string | null } | null;
  agent?: { name?: string | null; phone?: string | null; email?: string | null } | null;
}): MergeValues {
  const { person, property, appointment, agent } = input;

  return {
    first_name: person?.firstName ?? null,
    preferred_name: person?.preferredName ?? person?.firstName ?? null,
    surname: person?.surname ?? null,
    // join() gives '' when both parts are missing, which renderTemplate
    // treats as unfilled — the same as null, and what we want.
    full_name:
      person?.fullName ?? [person?.firstName, person?.surname].filter(Boolean).join(' '),
    title: person?.title ?? null,
    client_ref: person?.clientRef ?? null,

    property_address: property?.addressLine ?? null,
    property_ref: property?.propertyRef ?? null,
    suburb: property?.suburb ?? null,
    asking_price: property?.currentAskingPrice ? formatMoney(property.currentAskingPrice) : null,
    monthly_rental: property?.monthlyRental ? formatMoney(property.monthlyRental) : null,
    bedrooms:
      property?.bedrooms === null || property?.bedrooms === undefined
        ? null
        : String(property.bedrooms),
    mandate_expiry: property?.mandateExpiry ? formatDate(property.mandateExpiry) : null,

    appointment_date: appointment?.startsAt ? formatDate(appointment.startsAt) : null,
    appointment_time: appointment?.startsAt
      ? new Date(appointment.startsAt).toLocaleTimeString('en-ZA', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Africa/Johannesburg',
        })
      : null,

    agent_name: agent?.name ?? null,
    agent_phone: agent?.phone ?? null,
    agent_email: agent?.email ?? null,

    today: formatDate(new Date().toISOString()),
  };
}
