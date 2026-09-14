import type { Db } from './db.ts';
import { ENTITY_LABELS, pathTo, type EntityType } from './workspace.ts';
import { normaliseZaPhone } from './phone.ts';

/**
 * Global search (spec 17, 84, 97).
 *
 * One box that finds a person by name, by a mobile number typed however
 * somebody happens to type it, by email, or by any GRLP reference; and a
 * property by reference, erf, address or suburb.
 *
 * IT NEVER SEARCHES BY IDENTITY NUMBER. A South African ID number must
 * not travel in a URL or a query string (spec 15), and a search box puts
 * whatever is typed into both. Looking somebody up by ID is done on their
 * profile, by somebody who holds PERSON_ID_VIEW, and that access is
 * logged.
 *
 * Row level security does the rest: an agent's search reaches only the
 * records they may see, because every query here runs under their own
 * connection.
 */

export interface SearchHit {
  entityType: EntityType;
  entityId: string;
  title: string;
  subtitle: string | null;
  reference: string | null;
  href: string;
  kindLabel: string;
}

/** True where what was typed looks like an SA identity number. */
export function looksLikeIdNumber(query: string): boolean {
  return /^\d{13}$/.test(query.replace(/[\s-]/g, ''));
}

export async function globalSearch(
  db: Db,
  rawQuery: string,
  options: { limit?: number } = {},
): Promise<{ hits: SearchHit[]; refusedIdNumber: boolean }> {
  const query = rawQuery.trim();
  if (query.length < 2) return { hits: [], refusedIdNumber: false };

  // Refused rather than answered: an ID number does not belong in a URL.
  if (looksLikeIdNumber(query)) return { hits: [], refusedIdNumber: true };

  const limit = Math.min(options.limit ?? 30, 100);
  const like = `%${query}%`;
  const phone = normaliseZaPhone(query);
  const digits = query.replace(/\D/g, '');
  const phoneNeedle = phone ?? (digits.length >= 6 ? digits : null);

  const people = await db.query<{
    id: string;
    client_ref: string;
    title: string;
    subtitle: string | null;
  }>(
    `select p.id, p.client_ref,
            p.first_name || ' ' || p.surname as title,
            (select nullif(trim(coalesce(a.suburb, '') || ' ' || coalesce(a.city, '')), '')
               from person_addresses a
              where a.person_id = p.id
              order by a.is_primary desc, a.created_at limit 1) as subtitle
       from people p
      where p.merged_into_id is null
        and (
          p.first_name ilike $1 or p.surname ilike $1
          or (p.first_name || ' ' || p.surname) ilike $1
          or coalesce(p.preferred_name, '') ilike $1
          or p.client_ref ilike $1
          or exists (
            select 1 from person_contacts c
             where c.person_id = p.id and c.is_active
               and (c.value ilike $1
                    or ($2::text is not null
                        and c.value_normalised like '%' || $2 || '%'))
          )
        )
      order by p.surname, p.first_name
      limit $3`,
    [like, phoneNeedle, limit],
  );

  const properties = await db.query<{
    id: string;
    property_ref: string;
    title: string | null;
    subtitle: string | null;
  }>(
    `select pr.id, pr.property_ref,
            coalesce(
              nullif(trim(coalesce(pr.street_address, '') || ' ' || coalesce(pr.suburb, '')), ''),
              pr.property_name,
              pr.property_ref
            ) as title,
            nullif(trim(coalesce(pr.city, '') || ' ' || coalesce(pr.province, '')), '') as subtitle
       from properties pr
      where pr.merged_into_id is null
        and (
          pr.property_ref ilike $1 or pr.street_address ilike $1
          or pr.suburb ilike $1 or pr.city ilike $1 or pr.township ilike $1
          or pr.property_name ilike $1 or pr.erf_number ilike $1
        )
      order by pr.suburb, pr.street_address
      limit $2`,
    [like, limit],
  );

  const companies = await db.query<{ id: string; company_ref: string; title: string }>(
    `select c.id, c.company_ref, c.registered_name as title
       from companies c
      where c.registered_name ilike $1 or c.trading_name ilike $1
         or c.company_ref ilike $1 or c.registration_number ilike $1
      order by c.registered_name limit $2`,
    [like, limit],
  );

  const transactions = await db.query<{
    id: string;
    transaction_ref: string;
    subtitle: string | null;
  }>(
    `select t.id, t.transaction_ref,
            nullif(trim(coalesce(p.street_address, '') || ' ' || coalesce(p.suburb, '')), '')
              as subtitle
       from transactions t join properties p on p.id = t.property_id
      where t.transaction_ref ilike $1
      order by t.created_at desc limit $2`,
    [like, limit],
  );

  const commissions = await db.query<{
    id: string;
    commission_ref: string;
    subtitle: string | null;
  }>(
    `select c.id, c.commission_ref,
            nullif(trim(coalesce(p.street_address, '') || ' ' || coalesce(p.suburb, '')), '')
              as subtitle
       from commissions c join properties p on p.id = c.property_id
      where c.commission_ref ilike $1
      order by c.created_at desc limit $2`,
    [like, limit],
  );

  const ficaFiles = await db.query<{ id: string; fica_ref: string; subtitle: string | null }>(
    `select f.id, f.fica_ref,
            coalesce(pe.first_name || ' ' || pe.surname, co.registered_name) as subtitle
       from fica_records f
       left join people pe on pe.id = f.person_id
       left join companies co on co.id = f.company_id
      where f.fica_ref ilike $1
      order by f.created_at desc limit $2`,
    [like, limit],
  );

  const hits: SearchHit[] = [
    ...people.map((row) => hit('person', row.id, row.title, row.subtitle, row.client_ref)),
    ...properties.map((row) =>
      hit('property', row.id, row.title ?? row.property_ref, row.subtitle, row.property_ref),
    ),
    ...companies.map((row) => hit('company', row.id, row.title, null, row.company_ref)),
    ...transactions.map((row) =>
      hit('transaction', row.id, row.transaction_ref, row.subtitle, row.transaction_ref),
    ),
    ...commissions.map((row) =>
      hit('commission', row.id, row.commission_ref, row.subtitle, row.commission_ref),
    ),
    ...ficaFiles.map((row) => hit('fica', row.id, row.fica_ref, row.subtitle, row.fica_ref)),
  ];

  return { hits: hits.slice(0, limit), refusedIdNumber: false };
}

function hit(
  entityType: EntityType,
  entityId: string,
  title: string,
  subtitle: string | null,
  reference: string | null,
): SearchHit {
  return {
    entityType,
    entityId,
    title,
    subtitle,
    reference,
    href: pathTo(entityType, entityId),
    kindLabel: ENTITY_LABELS[entityType],
  };
}
