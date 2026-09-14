import type { Db } from './db.ts';
import { getNumberSetting } from './settings.ts';

/**
 * Reports and the dashboard (spec 94 to 96, 107, 141).
 *
 * Every figure here is counted from the records themselves, and each one
 * names exactly which status it counted. Nothing is blended: a property
 * on market, a sale concluded and a sale registered are three different
 * facts, and a report that added them together would be worse than no
 * report at all.
 *
 * Row level security means an agent's dashboard counts only their own
 * records, without a single `where agent_id = ...` in this file.
 */

export interface DashboardData {
  /** What needs the person in front of the screen, today. */
  today: {
    tasksDue: number;
    tasksOverdue: number;
    appointmentsToday: number;
    newLeads: number;
    unreadNotifications: number;
  };
  /** What is in flight, with the statuses kept apart. */
  pipeline: {
    propertiesOnMarket: number;
    mandatesExpiringSoon: number;
    offersOutstanding: number;
    salesConcluded: number;
    awaitingRegistration: number;
    registeredThisMonth: number;
    activeLeases: number;
    applicationsPending: number;
  };
  /** Things a person should look at, each with somewhere to go. */
  attention: { label: string; count: number; href: string; tone: 'warn' | 'stop' | 'neutral' }[];
}

export async function dashboard(
  db: Db,
  actorId: string,
): Promise<DashboardData> {
  const staleDays = await getNumberSetting(db, 'dashboard.stale_lead_days', 14);
  const mandateDays = await getNumberSetting(db, 'dashboard.mandate_warn_days', 30);

  const row = await db.one<Record<string, number>>(
    `select
       (select count(*) from tasks
         where status not in ('completed','cancelled') and due_at::date = current_date)::int
         as tasks_due,
       (select count(*) from tasks
         where status not in ('completed','cancelled') and due_at < now())::int as tasks_overdue,
       (select count(*) from appointments
         where starts_at::date = current_date and status <> 'cancelled')::int
         as appointments_today,
       (select count(*) from leads where status = 'new')::int as new_leads,
       (select count(*) from notifications
         where user_id = $1 and read_at is null)::int as unread_notifications,

       (select count(*) from properties
         where merged_into_id is null and not is_archived
           and property_status = 'on_market')::int as properties_on_market,
       (select count(*) from properties
         where merged_into_id is null and not is_archived
           and mandate_status = 'mandate_active'
           and mandate_expiry is not null
           and mandate_expiry between current_date and current_date + ($2::int))::int
         as mandates_expiring,
       (select count(*) from offers
         where status in ('submitted','under_review','counter_offer'))::int
         as offers_outstanding,
       (select count(*) from transactions where status = 'sale_concluded')::int
         as sales_concluded,
       (select count(*) from transactions
         where status in ('sale_concluded','awaiting_registration','suspensive_conditions'))::int
         as awaiting_registration,
       (select count(*) from transactions
         where status = 'registered'
           and actual_registration_date >= date_trunc('month', current_date))::int
         as registered_this_month,
       (select count(*) from properties
         where merged_into_id is null and rental_status = 'lease_active')::int
         as active_leases,
       (select count(*) from rental_applications
         where application_status in
           ('submitted','under_review','screening','documents_required'))::int
         as applications_pending,

       (select count(*) from leads
         where status not in ('won','lost','archived') and not is_archived
           and coalesce(updated_at, created_at) < now() - ($3::int * interval '1 day'))::int
         as stale_leads,
       (select count(*) from fica_records
         where status = 'verified' and expires_on < current_date)::int as fica_stale,
       (select count(*) from commissions where status = 'submitted')::int
         as commissions_waiting,
       (select count(*) from commissions c
          left join transactions t on t.id = c.transaction_id
         where c.status = 'approved' and c.transaction_id is not null
           and coalesce(t.status, '') <> 'registered')::int as commission_unregistered,
       (select count(*) from people p
         where p.merged_into_id is null and not p.is_archived
           and not exists (select 1 from person_contacts pc
                            where pc.person_id = p.id and pc.is_active))::int
         as people_without_contact`,
    [actorId, mandateDays, staleDays],
  );

  const attention: DashboardData['attention'] = ([
    {
      label: 'Tasks overdue',
      count: Number(row.tasks_overdue),
      href: '/tasks?view=overdue',
      tone: 'stop',
    },
    {
      label: `Leads with no contact for ${staleDays} days`,
      count: Number(row.stale_leads),
      href: '/leads?view=stale',
      tone: 'warn',
    },
    {
      label: `Mandates expiring within ${mandateDays} days`,
      count: Number(row.mandates_expiring),
      href: '/properties?mandateStatus=mandate_active',
      tone: 'warn',
    },
    {
      label: 'FICA files past their date',
      count: Number(row.fica_stale),
      href: '/fica?status=verified',
      tone: 'stop',
    },
    {
      label: 'Commission waiting for approval',
      count: Number(row.commissions_waiting),
      href: '/commissions?status=submitted',
      tone: 'warn',
    },
    {
      label: 'Commission approved but not registered',
      count: Number(row.commission_unregistered),
      href: '/commissions?view=unregistered',
      tone: 'warn',
    },
    {
      label: 'People with no way to contact them',
      count: Number(row.people_without_contact),
      href: '/reports/data-quality',
      tone: 'neutral',
    },
  ] as DashboardData['attention']).filter((item) => item.count > 0);

  return {
    today: {
      tasksDue: Number(row.tasks_due),
      tasksOverdue: Number(row.tasks_overdue),
      appointmentsToday: Number(row.appointments_today),
      newLeads: Number(row.new_leads),
      unreadNotifications: Number(row.unread_notifications),
    },
    pipeline: {
      propertiesOnMarket: Number(row.properties_on_market),
      mandatesExpiringSoon: Number(row.mandates_expiring),
      offersOutstanding: Number(row.offers_outstanding),
      salesConcluded: Number(row.sales_concluded),
      awaitingRegistration: Number(row.awaiting_registration),
      registeredThisMonth: Number(row.registered_this_month),
      activeLeases: Number(row.active_leases),
      applicationsPending: Number(row.applications_pending),
    },
    attention,
  };
}

// ---------------------------------------------------------------------
// Reports (spec 95)
// ---------------------------------------------------------------------

export interface CountByLabel {
  label: string;
  count: number;
}

/** How leads arrive, which is the only honest measure of what marketing works. */
export async function leadsBySource(db: Db, from?: string, to?: string): Promise<CountByLabel[]> {
  const rows = await db.query<{ label: string; count: number }>(
    `select coalesce(s.name, 'Not recorded') as label, count(*)::int as count
       from leads l
       left join lead_sources s on s.id = l.source_id
      where ($1::date is null or l.created_at::date >= $1)
        and ($2::date is null or l.created_at::date <= $2)
      group by coalesce(s.name, 'Not recorded')
      order by count desc, label`,
    [from ?? null, to ?? null],
  );
  return rows.map((row) => ({ label: row.label, count: Number(row.count) }));
}

export async function leadOutcomes(db: Db, from?: string, to?: string): Promise<{
  byStatus: CountByLabel[];
  lossReasons: CountByLabel[];
  conversionRate: number | null;
}> {
  const byStatus = await db.query<{ label: string; count: number }>(
    `select l.status as label, count(*)::int as count
       from leads l
      where ($1::date is null or l.created_at::date >= $1)
        and ($2::date is null or l.created_at::date <= $2)
      group by l.status order by count desc`,
    [from ?? null, to ?? null],
  );

  const lossReasons = await db.query<{ label: string; count: number }>(
    `select coalesce(r.name, 'Not recorded') as label, count(*)::int as count
       from leads l
       left join lead_loss_reasons r on r.id = l.loss_reason_id
      where l.status = 'lost'
        and ($1::date is null or l.created_at::date >= $1)
        and ($2::date is null or l.created_at::date <= $2)
      group by coalesce(r.name, 'Not recorded') order by count desc`,
    [from ?? null, to ?? null],
  );

  const won = byStatus.find((row) => row.label === 'won')?.count ?? 0;
  const decided = byStatus
    .filter((row) => row.label === 'won' || row.label === 'lost')
    .reduce((total, row) => total + Number(row.count), 0);

  return {
    byStatus: byStatus.map((row) => ({ label: row.label, count: Number(row.count) })),
    lossReasons: lossReasons.map((row) => ({ label: row.label, count: Number(row.count) })),
    // Left null rather than shown as 0% when nothing has been decided:
    // "0% conversion" and "nothing decided yet" are not the same statement.
    conversionRate: decided === 0 ? null : Math.round((Number(won) / decided) * 100),
  };
}

/**
 * Sales, with concluded and registered counted separately (spec 49).
 *
 * The value of concluded sales is not turnover. It is the value of deals
 * that may still fall over, and this report never adds the two together.
 */
export async function salesReport(db: Db, from?: string, to?: string): Promise<{
  concluded: { count: number; value: string };
  registered: { count: number; value: string };
  failed: { count: number; value: string };
  byAgent: { agentName: string; concluded: number; registered: number; value: string }[];
}> {
  const totals = await db.one<{
    concluded_count: number;
    concluded_value: string | null;
    registered_count: number;
    registered_value: string | null;
    failed_count: number;
    failed_value: string | null;
  }>(
    `select
       count(*) filter (where t.status = 'sale_concluded')::int as concluded_count,
       sum(t.transaction_value) filter (where t.status = 'sale_concluded') as concluded_value,
       count(*) filter (where t.status = 'registered')::int as registered_count,
       sum(t.transaction_value) filter (where t.status = 'registered') as registered_value,
       count(*) filter (where t.status in ('cancelled','failed'))::int as failed_count,
       sum(t.transaction_value) filter (where t.status in ('cancelled','failed')) as failed_value
     from transactions t
     where ($1::date is null or coalesce(t.actual_registration_date, t.sale_date, t.created_at::date) >= $1)
       and ($2::date is null or coalesce(t.actual_registration_date, t.sale_date, t.created_at::date) <= $2)`,
    [from ?? null, to ?? null],
  );

  const byAgent = await db.query<{
    agent_name: string | null;
    concluded: number;
    registered: number;
    value: string | null;
  }>(
    `select coalesce(u.display_name, u.full_name) as agent_name,
            count(*) filter (where t.status = 'sale_concluded')::int as concluded,
            count(*) filter (where t.status = 'registered')::int as registered,
            sum(t.transaction_value) filter (where t.status = 'registered') as value
       from transactions t
       join transaction_agents ta on ta.transaction_id = t.id
       join users u on u.id = ta.agent_id
      where ($1::date is null or coalesce(t.actual_registration_date, t.sale_date, t.created_at::date) >= $1)
        and ($2::date is null or coalesce(t.actual_registration_date, t.sale_date, t.created_at::date) <= $2)
      group by coalesce(u.display_name, u.full_name)
      order by registered desc, concluded desc`,
    [from ?? null, to ?? null],
  );

  return {
    concluded: {
      count: Number(totals.concluded_count),
      value: totals.concluded_value ?? '0.00',
    },
    registered: {
      count: Number(totals.registered_count),
      value: totals.registered_value ?? '0.00',
    },
    failed: { count: Number(totals.failed_count), value: totals.failed_value ?? '0.00' },
    byAgent: byAgent.map((row) => ({
      agentName: row.agent_name ?? 'Not recorded',
      concluded: Number(row.concluded),
      registered: Number(row.registered),
      value: row.value ?? '0.00',
    })),
  };
}

export async function propertyReport(db: Db): Promise<{
  byStatus: CountByLabel[];
  byArea: CountByLabel[];
  byType: CountByLabel[];
  mandates: CountByLabel[];
}> {
  const group = async (column: string) => {
    const rows = await db.query<{ label: string; count: number }>(
      `select coalesce(${column}, 'Not recorded') as label, count(*)::int as count
         from properties
        where merged_into_id is null and not is_archived
        group by coalesce(${column}, 'Not recorded')
        order by count desc, label`,
    );
    return rows.map((row) => ({ label: row.label, count: Number(row.count) }));
  };

  return {
    byStatus: await group('property_status'),
    byArea: await group('suburb'),
    byType: await group('property_type'),
    mandates: await group('mandate_status'),
  };
}

export async function activityReport(db: Db, from?: string, to?: string): Promise<{
  communications: CountByLabel[];
  viewings: number;
  byAgent: { agentName: string; conversations: number }[];
}> {
  const communications = await db.query<{ label: string; count: number }>(
    `select channel as label, count(*)::int as count
       from communications
      where ($1::date is null or occurred_at::date >= $1)
        and ($2::date is null or occurred_at::date <= $2)
      group by channel order by count desc`,
    [from ?? null, to ?? null],
  );

  const viewings = await db.one<{ count: number }>(
    `select count(*)::int as count from viewings
      where ($1::date is null or viewed_at::date >= $1)
        and ($2::date is null or viewed_at::date <= $2)`,
    [from ?? null, to ?? null],
  );

  const byAgent = await db.query<{ agent_name: string | null; conversations: number }>(
    `select coalesce(u.display_name, u.full_name) as agent_name, count(*)::int as conversations
       from communications c
       left join users u on u.id = c.agent_id
      where ($1::date is null or c.occurred_at::date >= $1)
        and ($2::date is null or c.occurred_at::date <= $2)
      group by coalesce(u.display_name, u.full_name)
      order by conversations desc`,
    [from ?? null, to ?? null],
  );

  return {
    communications: communications.map((row) => ({
      label: row.label,
      count: Number(row.count),
    })),
    viewings: Number(viewings.count),
    byAgent: byAgent.map((row) => ({
      agentName: row.agent_name ?? 'Not recorded',
      conversations: Number(row.conversations),
    })),
  };
}
