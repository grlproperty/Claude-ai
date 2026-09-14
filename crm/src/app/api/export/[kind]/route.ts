import { NextResponse } from 'next/server';
import { withUser } from '@/lib/db.ts';
import { getCurrentUser, requestMeta } from '@/lib/session.ts';
import { toUserFacingError } from '@/lib/errors.ts';
import { buildExport } from '@/lib/exports.ts';
import type { Ctx } from '@/lib/actor.ts';

/**
 * Audited CSV exports (spec 15, 98).
 *
 * Three things make this safe rather than merely convenient:
 *
 *   1. The query runs on the user's own connection, so row level security
 *      has already narrowed it to records they may see.
 *   2. No export carries an identity number, a passport number or a
 *      credential. The columns simply are not selected, and exports.ts
 *      refuses the request outright if a caller asks for one.
 *   3. Every export is written to a log that cannot be altered or
 *      deleted, in the same transaction as the read.
 *
 * Values are escaped against formula injection in csv.ts, so a cell
 * beginning with =, +, - or @ cannot execute when the file is opened in a
 * spreadsheet.
 */

type Exportable = 'people' | 'properties' | 'sales' | 'commissions' | 'leads';

const QUERIES: Record<
  Exportable,
  {
    entityType: string;
    columns: { key: string; header: string }[];
    sql: string;
  }
> = {
  people: {
    entityType: 'people',
    columns: [
      { key: 'client_ref', header: 'Reference' },
      { key: 'first_name', header: 'First name' },
      { key: 'surname', header: 'Surname' },
      { key: 'business_area', header: 'Business area' },
      { key: 'client_types', header: 'Client types' },
      { key: 'mobile', header: 'Mobile' },
      { key: 'email', header: 'Email' },
      { key: 'suburb', header: 'Suburb' },
      { key: 'city', header: 'City' },
      { key: 'agent', header: 'Agent' },
      { key: 'last_contact_at', header: 'Last contact' },
      { key: 'created_at', header: 'Created' },
    ],
    // No identity column is selected at all. There is nothing to redact
    // because nothing sensitive is read (spec 15).
    sql: `
      select p.client_ref, p.first_name, p.surname, p.business_area,
             (select string_agg(ct.client_type, ' | ' order by ct.client_type)
                from person_client_types ct where ct.person_id = p.id) as client_types,
             (select c.value from person_contacts c
               where c.person_id = p.id and c.is_active
                 and c.contact_type in ('mobile','alternative_mobile')
               order by c.is_primary desc limit 1) as mobile,
             (select c.value from person_contacts c
               where c.person_id = p.id and c.is_active and c.contact_type = 'email'
               order by c.is_primary desc limit 1) as email,
             (select a.suburb from person_addresses a
               where a.person_id = p.id order by a.is_primary desc limit 1) as suburb,
             (select a.city from person_addresses a
               where a.person_id = p.id order by a.is_primary desc limit 1) as city,
             coalesce(u.display_name, u.full_name) as agent,
             to_char(p.last_contact_at, 'YYYY-MM-DD') as last_contact_at,
             to_char(p.created_at, 'YYYY-MM-DD') as created_at
        from people p
        left join users u on u.id = p.primary_agent_id
       where p.merged_into_id is null and not p.is_archived
       order by p.surname, p.first_name`,
  },
  properties: {
    entityType: 'properties',
    columns: [
      { key: 'property_ref', header: 'Reference' },
      { key: 'erf_number', header: 'Erf' },
      { key: 'street_address', header: 'Address' },
      { key: 'suburb', header: 'Suburb' },
      { key: 'city', header: 'City' },
      { key: 'property_type', header: 'Kind' },
      { key: 'bedrooms', header: 'Bedrooms' },
      { key: 'bathrooms', header: 'Bathrooms' },
      { key: 'current_asking_price', header: 'Asking price' },
      { key: 'property_status', header: 'Property status' },
      { key: 'sales_status', header: 'Sales status' },
      { key: 'rental_status', header: 'Rental status' },
      { key: 'mandate_status', header: 'Mandate status' },
      { key: 'mandate_expiry', header: 'Mandate expiry' },
      { key: 'agent', header: 'Agent' },
    ],
    sql: `
      select pr.property_ref, pr.erf_number, pr.street_address, pr.suburb, pr.city,
             pr.property_type, pr.bedrooms, pr.bathrooms, pr.current_asking_price,
             pr.property_status, pr.sales_status, pr.rental_status, pr.mandate_status,
             to_char(pr.mandate_expiry, 'YYYY-MM-DD') as mandate_expiry,
             coalesce(u.display_name, u.full_name) as agent
        from properties pr
        left join users u on u.id = pr.primary_agent_id
       where pr.merged_into_id is null and not pr.is_archived
       order by pr.suburb, pr.street_address`,
  },
  sales: {
    entityType: 'sales',
    columns: [
      { key: 'transaction_ref', header: 'Reference' },
      { key: 'property_ref', header: 'Property' },
      { key: 'address', header: 'Address' },
      { key: 'status', header: 'Transaction status' },
      { key: 'transaction_value', header: 'Value' },
      { key: 'sale_date', header: 'Sale date' },
      { key: 'expected_registration_date', header: 'Registration expected' },
      { key: 'actual_registration_date', header: 'Registered on' },
      { key: 'buyer', header: 'Buyer' },
      { key: 'seller', header: 'Seller' },
      { key: 'conveyancer', header: 'Conveyancer' },
    ],
    // Sale date and registration date are separate columns on purpose: a
    // spreadsheet that blurred them would lose the very distinction spec
    // 49 exists to protect.
    sql: `
      select t.transaction_ref, p.property_ref,
             nullif(trim(coalesce(p.street_address, '') || ' ' || coalesce(p.suburb, '')), '')
               as address,
             t.status, t.transaction_value,
             to_char(t.sale_date, 'YYYY-MM-DD') as sale_date,
             to_char(t.expected_registration_date, 'YYYY-MM-DD') as expected_registration_date,
             to_char(t.actual_registration_date, 'YYYY-MM-DD') as actual_registration_date,
             b.first_name || ' ' || b.surname as buyer,
             s.first_name || ' ' || s.surname as seller,
             t.conveyancer
        from transactions t
        join properties p on p.id = t.property_id
        left join people b on b.id = t.buyer_id
        left join people s on s.id = t.seller_id
       where ($1::date is null
              or coalesce(t.actual_registration_date, t.sale_date, t.created_at::date) >= $1)
         and ($2::date is null
              or coalesce(t.actual_registration_date, t.sale_date, t.created_at::date) <= $2)
       order by t.created_at desc`,
  },
  commissions: {
    entityType: 'commissions',
    columns: [
      { key: 'commission_ref', header: 'Reference' },
      { key: 'property_ref', header: 'Property' },
      { key: 'transaction_ref', header: 'Transaction' },
      { key: 'status', header: 'Commission status' },
      { key: 'transaction_status', header: 'Transaction status' },
      { key: 'base_amount', header: 'Worked out from' },
      { key: 'gross_excl_vat', header: 'Commission excluding VAT' },
      { key: 'vat_amount', header: 'VAT' },
      { key: 'gross_incl_vat', header: 'Invoice total' },
      { key: 'net_excl_vat', header: 'To share out' },
      { key: 'approved_by', header: 'Approved by' },
      { key: 'approved_at', header: 'Approved on' },
      { key: 'invoice_number', header: 'Invoice number' },
      { key: 'paid_on', header: 'Recorded as paid on' },
      { key: 'marked_paid_by', header: 'Recorded as paid by' },
    ],
    sql: `
      select c.commission_ref, p.property_ref, t.transaction_ref, c.status,
             t.status as transaction_status,
             c.base_amount, c.gross_excl_vat, c.vat_amount, c.gross_incl_vat, c.net_excl_vat,
             coalesce(ab.display_name, ab.full_name) as approved_by,
             to_char(c.approved_at, 'YYYY-MM-DD') as approved_at,
             c.invoice_number,
             to_char(c.paid_on, 'YYYY-MM-DD') as paid_on,
             coalesce(pb.display_name, pb.full_name) as marked_paid_by
        from commissions c
        join properties p on p.id = c.property_id
        left join transactions t on t.id = c.transaction_id
        left join users ab on ab.id = c.approved_by
        left join users pb on pb.id = c.marked_paid_by
       where ($1::date is null or coalesce(c.paid_on, c.invoice_date, c.created_at::date) >= $1)
         and ($2::date is null or coalesce(c.paid_on, c.invoice_date, c.created_at::date) <= $2)
       order by c.created_at desc`,
  },
  leads: {
    entityType: 'leads',
    columns: [
      { key: 'lead_type', header: 'Kind' },
      { key: 'status', header: 'Status' },
      { key: 'person', header: 'Person' },
      { key: 'source', header: 'Source' },
      { key: 'loss_reason', header: 'Why lost' },
      { key: 'budget_min', header: 'Budget from' },
      { key: 'budget_max', header: 'Budget to' },
      { key: 'agent', header: 'Agent' },
      { key: 'created_at', header: 'Created' },
    ],
    sql: `
      select l.lead_type, l.status,
             pe.first_name || ' ' || pe.surname as person,
             s.name as source, r.name as loss_reason,
             l.budget_min, l.budget_max,
             coalesce(u.display_name, u.full_name) as agent,
             to_char(l.created_at, 'YYYY-MM-DD') as created_at
        from leads l
        left join people pe on pe.id = l.person_id
        left join lead_sources s on s.id = l.source_id
        left join lead_loss_reasons r on r.id = l.loss_reason_id
        left join users u on u.id = l.primary_agent_id
       where not l.is_archived
         and ($1::date is null or l.created_at::date >= $1)
         and ($2::date is null or l.created_at::date <= $2)
       order by l.created_at desc`,
  },
};

function isExportable(value: string): value is Exportable {
  return Object.hasOwn(QUERIES, value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  try {
    const { kind } = await params;
    if (!isExportable(kind)) {
      return NextResponse.json({ ok: false, message: 'Unknown export.' }, { status: 404 });
    }

    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });
    if (!user.permissions.has('REPORTS_EXPORT')) {
      return NextResponse.json(
        { ok: false, message: 'You do not have permission to export.' },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const from = url.searchParams.get('from') || null;
    const to = url.searchParams.get('to') || null;
    const dated = QUERIES[kind].sql.includes('$1');

    const ctx: Ctx = {
      actor: { id: user.id, email: user.email, permissions: user.permissions },
      meta: await requestMeta(),
    };

    const result = await withUser(user.id, async (db) => {
      const rows = await db.query<Record<string, unknown>>(
        QUERIES[kind].sql,
        dated ? [from, to] : [],
      );
      return buildExport(db, ctx, {
        entityType: QUERIES[kind].entityType,
        columns: QUERIES[kind].columns,
        rows,
        filters: dated ? { from, to } : {},
      });
    });

    return new Response(result.csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${result.filename}"`,
        // An export is somebody's own data, narrowed by their own
        // permissions. It must never sit in a shared cache.
        'cache-control': 'no-store, private',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    const safe = toUserFacingError(error);
    console.error(`[export] ${safe.code}: ${safe.logDetail}`);
    return NextResponse.json({ ok: false, message: safe.message }, { status: safe.status });
  }
}
