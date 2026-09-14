import type { Db } from './db.ts';

/**
 * Data quality (spec 96).
 *
 * What is missing, inconsistent or contradictory, counted honestly and
 * with a link to each offending record so somebody can actually fix it.
 * Nothing here corrects anything on its own: a CRM that quietly "tidies"
 * a record has destroyed information nobody asked it to touch.
 *
 * The contradictions matter more than the gaps. A property marked as
 * registered with no registration date, or a mandate active past its
 * expiry, is the kind of thing that goes unnoticed for months.
 */

export interface QualityIssue {
  code: string;
  label: string;
  detail: string;
  count: number;
  severity: 'high' | 'medium' | 'low';
  href: string | null;
}

export async function dataQuality(db: Db): Promise<{
  issues: QualityIssue[];
  totals: { people: number; properties: number };
}> {
  const row = await db.one<Record<string, number>>(
    `select
       (select count(*) from people where merged_into_id is null and not is_archived)::int
         as people,
       (select count(*) from properties where merged_into_id is null and not is_archived)::int
         as properties,

       -- Gaps
       (select count(*) from people p
         where p.merged_into_id is null and not p.is_archived
           and not exists (select 1 from person_contacts c
                            where c.person_id = p.id and c.is_active))::int
         as people_no_contact,
       (select count(*) from people p
         where p.merged_into_id is null and not p.is_archived
           and not exists (select 1 from person_client_types t
                            where t.person_id = p.id))::int
         as people_no_client_type,
       (select count(*) from people p
         where p.merged_into_id is null and not p.is_archived
           and p.primary_agent_id is null)::int as people_no_agent,
       (select count(*) from properties pr
         where pr.merged_into_id is null and not pr.is_archived
           and pr.primary_agent_id is null)::int as properties_no_agent,
       (select count(*) from properties pr
         where pr.merged_into_id is null and not pr.is_archived
           and pr.erf_number is null and pr.street_address is null)::int
         as properties_unidentifiable,
       (select count(*) from properties pr
         where pr.merged_into_id is null and not pr.is_archived
           and pr.property_status = 'on_market'
           and pr.current_asking_price is null)::int as on_market_no_price,

       -- Contradictions
       (select count(*) from properties pr
         where pr.mandate_status = 'mandate_active'
           and pr.mandate_expiry is not null
           and pr.mandate_expiry < current_date)::int as mandate_active_but_expired,
       (select count(*) from properties pr
         where pr.property_status = 'sale_registered'
           and not exists (select 1 from transactions t
                            where t.property_id = pr.id and t.status = 'registered'))::int
         as registered_without_transaction,
       (select count(*) from transactions t
         where t.status = 'registered' and t.actual_registration_date is null)::int
         as registered_without_date,
       (select count(*) from properties pr
         where pr.rental_status = 'lease_active'
           and not exists (select 1 from property_rental_history h
                            where h.property_id = pr.id
                              and (h.lease_end is null or h.lease_end >= current_date)))::int
         as let_without_lease,

       -- Compliance and FICA
       -- A permission points at its evidence; without that link there is
       -- nothing backing it up.
       (select count(*) from contact_permissions cp
         where cp.status = 'granted' and cp.evidence_id is null)::int
         as permission_without_evidence,
       (select count(*) from fica_records f
         where f.status = 'verified' and f.expires_on < current_date)::int as fica_past_date,

       -- Duplicates still waiting for somebody to decide
       (select count(*) from (
          select lower(c.value_normalised) as v
            from person_contacts c
            join people p on p.id = c.person_id
           where c.is_active and c.value_normalised is not null
             and p.merged_into_id is null
           group by lower(c.value_normalised) having count(distinct p.id) > 1
        ) d)::int as shared_contact_numbers`,
  );

  const issues: QualityIssue[] = [
    {
      code: 'people_no_contact',
      label: 'People with no way to reach them',
      detail:
        'No active phone number and no email address. The record cannot be acted on, '
        + 'and it will keep failing the contact preflight.',
      count: Number(row.people_no_contact),
      severity: 'high',
      href: '/people',
    },
    {
      code: 'properties_unidentifiable',
      label: 'Properties with neither an erf number nor a street address',
      detail: 'Nothing identifies which property this is.',
      count: Number(row.properties_unidentifiable),
      severity: 'high',
      href: '/properties',
    },
    {
      code: 'mandate_active_but_expired',
      label: 'Mandates marked active but past their expiry date',
      detail:
        'The mandate status and the expiry date contradict each other. Somebody must '
        + 'decide which is right; the CRM will not guess.',
      count: Number(row.mandate_active_but_expired),
      severity: 'high',
      href: '/properties?mandateStatus=mandate_active',
    },
    {
      code: 'registered_without_transaction',
      label: 'Properties marked sale registered with no registered transaction',
      detail:
        'The property says registered but no transaction on it does. Registration is a '
        + 'separate event with its own date, and one of these two records is wrong.',
      count: Number(row.registered_without_transaction),
      severity: 'high',
      href: '/properties',
    },
    {
      code: 'registered_without_date',
      label: 'Transactions marked registered with no registration date',
      detail: 'The database refuses this, so any of these came from before that rule existed.',
      count: Number(row.registered_without_date),
      severity: 'high',
      href: '/sales',
    },
    {
      code: 'permission_without_evidence',
      label: 'Contact permissions granted with nothing to back them up',
      detail:
        'A granted permission with no evidence cannot be relied on if it is ever '
        + 'questioned. The preflight already treats these as needing checking.',
      count: Number(row.permission_without_evidence),
      severity: 'high',
      href: '/compliance',
    },
    {
      code: 'fica_past_date',
      label: 'Verified FICA files past their date',
      detail: 'Verified once, but nobody has looked since. They should not be relied on.',
      count: Number(row.fica_past_date),
      severity: 'medium',
      href: '/fica',
    },
    {
      code: 'let_without_lease',
      label: 'Properties marked as let with no current lease recorded',
      detail: 'The rental status says let, but there is no lease running to support it.',
      count: Number(row.let_without_lease),
      severity: 'medium',
      href: '/rentals',
    },
    {
      code: 'on_market_no_price',
      label: 'Properties on market with no asking price',
      detail: 'It cannot be marketed or matched to a buyer without one.',
      count: Number(row.on_market_no_price),
      severity: 'medium',
      href: '/properties?propertyStatus=on_market',
    },
    {
      code: 'shared_contact_numbers',
      label: 'Contact numbers appearing on more than one person',
      detail:
        'Sometimes right — a couple sharing a landline — and sometimes two records for '
        + 'one person. Worth a look at the duplicates page.',
      count: Number(row.shared_contact_numbers),
      severity: 'medium',
      href: '/people/duplicates',
    },
    {
      code: 'people_no_client_type',
      label: 'People with no client type recorded',
      detail: 'Nothing says whether they are a buyer, a seller, a landlord or a tenant.',
      count: Number(row.people_no_client_type),
      severity: 'low',
      href: '/people',
    },
    {
      code: 'people_no_agent',
      label: 'People with no agent looking after them',
      detail: 'Nobody is responsible for the relationship.',
      count: Number(row.people_no_agent),
      severity: 'low',
      href: '/people',
    },
    {
      code: 'properties_no_agent',
      label: 'Properties with no agent looking after them',
      detail: 'Nobody is responsible for the listing.',
      count: Number(row.properties_no_agent),
      severity: 'low',
      href: '/properties',
    },
  ];

  return {
    issues: issues.filter((issue) => issue.count > 0),
    totals: { people: Number(row.people), properties: Number(row.properties) },
  };
}
