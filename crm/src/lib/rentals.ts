import { z } from 'zod';
import { agentToKeep, type Ctx } from './actor.ts';
import type { Db } from './db.ts';
import { diff, recordAudit } from './audit.ts';
import { ConcurrencyError, NotFoundError } from './errors.ts';
import {
  RENTAL_APPLICATION_STATUSES,
  SCREENING_ITEM_STATUSES,
  SCREENING_STATUSES,
  type RentalApplicationStatus,
  type ScreeningItemStatus,
  type ScreeningStatus,
} from './domain.ts';
import { optionalDate, optionalMoney, optionalText, optionalUuid } from './validate.ts';

/**
 * Rental applications and screening (spec 50, 51, 52).
 *
 * What GRLP checks on an applicant is configuration, not code: the checklist
 * lives in screening_checklist_items and can change without a deployment.
 * Nothing here hardcodes a legal requirement.
 */

const keys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]];

export const rentalApplicationInputSchema = z
  .object({
    propertyId: z.uuid('Which property is being applied for?'),
    applicantId: optionalUuid,
    coApplicantId: optionalUuid,
    landlordId: optionalUuid,
    agentId: optionalUuid,
    leadId: optionalUuid,
    monthlyRental: optionalMoney,
    deposit: optionalMoney,
    applicationStatus: z.enum(keys(RENTAL_APPLICATION_STATUSES)).default('draft'),
    screeningStatus: z.enum(keys(SCREENING_STATUSES)).default('not_started'),
    approvalDate: optionalDate,
    rejectionDate: optionalDate,
    rejectionReason: optionalText,
    leaseStart: optionalDate,
    leaseEnd: optionalDate,
    notes: optionalText,
  })
  .superRefine((input, ctx) => {
    if (input.applicationStatus === 'approved' && !input.approvalDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['approvalDate'],
        message: 'An approved application needs the date it was approved.',
      });
    }
    if (input.applicationStatus === 'rejected') {
      if (!input.rejectionDate) {
        ctx.addIssue({
          code: 'custom',
          path: ['rejectionDate'],
          message: 'A rejected application needs the date it was rejected.',
        });
      }
      if (!input.rejectionReason) {
        ctx.addIssue({
          code: 'custom',
          path: ['rejectionReason'],
          message: 'Say why the application was rejected.',
        });
      }
    }
    if (input.leaseStart && input.leaseEnd && input.leaseEnd < input.leaseStart) {
      ctx.addIssue({
        code: 'custom',
        path: ['leaseEnd'],
        message: 'The lease cannot end before it starts.',
      });
    }
    if (
      input.coApplicantId &&
      input.applicantId &&
      input.coApplicantId === input.applicantId
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['coApplicantId'],
        message: 'The co-applicant has to be a different person.',
      });
    }
  });
export type RentalApplicationInput = z.infer<typeof rentalApplicationInputSchema>;

export interface RentalApplicationSummary {
  id: string;
  applicationRef: string;
  propertyId: string;
  propertyRef: string;
  propertyLabel: string | null;
  applicantId: string | null;
  applicantName: string | null;
  applicantMobile: string | null;
  applicantEmail: string | null;
  coApplicantId: string | null;
  coApplicantName: string | null;
  landlordId: string | null;
  landlordName: string | null;
  agentId: string | null;
  agentName: string | null;
  monthlyRental: string | null;
  deposit: string | null;
  applicationStatus: RentalApplicationStatus;
  screeningStatus: ScreeningStatus;
  approvalDate: string | null;
  rejectionDate: string | null;
  rejectionReason: string | null;
  leaseStart: string | null;
  leaseEnd: string | null;
  notes: string | null;
  rowVersion: number;
}

const APPLICATION_SQL = `
  select r.id, r.application_ref, r.property_id, r.applicant_id, r.co_applicant_id,
         r.landlord_id, r.agent_id, r.monthly_rental, r.deposit, r.application_status,
         r.screening_status, r.approval_date, r.rejection_date, r.rejection_reason,
         r.lease_start, r.lease_end, r.notes, r.row_version,
         pr.property_ref,
         nullif(concat_ws(', ', pr.street_address, pr.suburb), '') as property_label,
         a.first_name || ' ' || a.surname as applicant_name,
         co.first_name || ' ' || co.surname as co_applicant_name,
         l.first_name || ' ' || l.surname as landlord_name,
         coalesce(ag.display_name, ag.full_name) as agent_name,
         (select c.value from person_contacts c
            where c.person_id = a.id and c.is_active
              and c.contact_type in ('mobile','whatsapp','alternative_mobile')
            order by c.is_primary desc limit 1) as applicant_mobile,
         (select c.value from person_contacts c
            where c.person_id = a.id and c.is_active and c.contact_type = 'email'
            order by c.is_primary desc limit 1) as applicant_email
    from rental_applications r
    join properties pr on pr.id = r.property_id
    left join people a on a.id = r.applicant_id
    left join people co on co.id = r.co_applicant_id
    left join people l on l.id = r.landlord_id
    left join users ag on ag.id = r.agent_id
`;

interface ApplicationRow {
  id: string;
  application_ref: string;
  property_id: string;
  property_ref: string;
  property_label: string | null;
  applicant_id: string | null;
  applicant_name: string | null;
  applicant_mobile: string | null;
  applicant_email: string | null;
  co_applicant_id: string | null;
  co_applicant_name: string | null;
  landlord_id: string | null;
  landlord_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  monthly_rental: string | null;
  deposit: string | null;
  application_status: RentalApplicationStatus;
  screening_status: ScreeningStatus;
  approval_date: Date | null;
  rejection_date: Date | null;
  rejection_reason: string | null;
  lease_start: Date | null;
  lease_end: Date | null;
  notes: string | null;
  row_version: number;
}

function toApplication(row: ApplicationRow): RentalApplicationSummary {
  return {
    id: row.id,
    applicationRef: row.application_ref,
    propertyId: row.property_id,
    propertyRef: row.property_ref,
    propertyLabel: row.property_label,
    applicantId: row.applicant_id,
    applicantName: row.applicant_name,
    applicantMobile: row.applicant_mobile,
    applicantEmail: row.applicant_email,
    coApplicantId: row.co_applicant_id,
    coApplicantName: row.co_applicant_name,
    landlordId: row.landlord_id,
    landlordName: row.landlord_name,
    agentId: row.agent_id,
    agentName: row.agent_name,
    monthlyRental: row.monthly_rental,
    deposit: row.deposit,
    applicationStatus: row.application_status,
    screeningStatus: row.screening_status,
    approvalDate: row.approval_date?.toISOString().slice(0, 10) ?? null,
    rejectionDate: row.rejection_date?.toISOString().slice(0, 10) ?? null,
    rejectionReason: row.rejection_reason,
    leaseStart: row.lease_start?.toISOString().slice(0, 10) ?? null,
    leaseEnd: row.lease_end?.toISOString().slice(0, 10) ?? null,
    notes: row.notes,
    rowVersion: row.row_version,
  };
}

export async function listRentalApplications(
  db: Db,
  filters: {
    propertyId?: string;
    applicantId?: string;
    agentId?: string | null;
    status?: string;
    expiringLease?: boolean;
    query?: string;
    limit?: number;
  },
): Promise<RentalApplicationSummary[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (filters.propertyId) where.push(`r.property_id = ${add(filters.propertyId)}`);
  if (filters.applicantId) {
    const value = add(filters.applicantId);
    where.push(`(r.applicant_id = ${value} or r.co_applicant_id = ${value})`);
  }
  if (filters.agentId) where.push(`r.agent_id = ${add(filters.agentId)}`);
  if (filters.status && filters.status !== 'all') {
    where.push(`r.application_status = ${add(filters.status)}`);
  }
  if (filters.expiringLease) {
    where.push(
      "r.lease_end is not null and r.lease_end <= current_date + interval '60 days' and r.application_status = 'lease_signed'",
    );
  }
  if (filters.query && filters.query.trim().length > 0) {
    const like = add(`%${filters.query.trim().toLowerCase()}%`);
    where.push(`(
      lower(r.application_ref) like ${like}
      or lower(coalesce(a.first_name || ' ' || a.surname, '')) like ${like}
      or lower(coalesce(pr.street_address, '')) like ${like}
    )`);
  }

  const rows = await db.query<ApplicationRow>(
    `${APPLICATION_SQL} where ${where.length > 0 ? where.join(' and ') : 'true'}
      order by r.created_at desc limit ${add(filters.limit ?? 200)}`,
    params,
  );
  return rows.map(toApplication);
}

export async function getRentalApplication(
  db: Db,
  id: string,
): Promise<RentalApplicationSummary | null> {
  const row = await db.maybeOne<ApplicationRow>(`${APPLICATION_SQL} where r.id = $1`, [id]);
  return row ? toApplication(row) : null;
}

export async function createRentalApplication(
  db: Db,
  ctx: Ctx,
  input: RentalApplicationInput,
): Promise<{ id: string; applicationRef: string }> {
  const row = await db.one<{ id: string; application_ref: string }>(
    `insert into rental_applications
       (property_id, applicant_id, co_applicant_id, landlord_id, agent_id, lead_id,
        monthly_rental, deposit, application_status, screening_status,
        approval_date, rejection_date, rejection_reason, lease_start, lease_end, notes,
        created_by, updated_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
     returning id, application_ref`,
    [
      input.propertyId, input.applicantId, input.coApplicantId, input.landlordId,
      input.agentId ?? ctx.actor.id, input.leadId, input.monthlyRental, input.deposit,
      input.applicationStatus, input.screeningStatus, input.approvalDate,
      input.rejectionDate, input.rejectionReason, input.leaseStart, input.leaseEnd,
      input.notes, ctx.actor.id,
    ],
  );

  // Every checklist item starts as not started, so the screen shows the whole
  // list rather than an empty one.
  await db.query(
    `insert into rental_screening (application_id, item_id, status, recorded_by)
     select $1, i.id, 'not_started', $2
       from screening_checklist_items i where i.is_active`,
    [row.id, ctx.actor.id],
  );

  await syncPropertyFromApplication(db, ctx, input.propertyId, input.applicationStatus);

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'rental_application.created',
    entityType: 'rental_application',
    entityId: row.id,
    entityLabel: row.application_ref,
    context: { propertyId: input.propertyId, status: input.applicationStatus },
  });

  return { id: row.id, applicationRef: row.application_ref };
}

export async function updateRentalApplication(
  db: Db,
  ctx: Ctx,
  applicationId: string,
  input: RentalApplicationInput,
  expectedVersion: number,
): Promise<void> {
  const before = await db.maybeOne<
    Record<string, unknown> & { row_version: number; application_ref: string }
  >('select * from rental_applications where id = $1', [applicationId]);
  if (!before) throw new NotFoundError('That application');
  if (before.row_version !== expectedVersion) throw new ConcurrencyError();

  const agentId = agentToKeep(ctx.actor, input.agentId, before.agent_id as string | null);

  const updated = await db.query<Record<string, unknown>>(
    `update rental_applications set
        applicant_id=$2, co_applicant_id=$3, landlord_id=$4, agent_id=$5, lead_id=$6,
        monthly_rental=$7, deposit=$8, application_status=$9, screening_status=$10,
        approval_date=$11, rejection_date=$12, rejection_reason=$13,
        lease_start=$14, lease_end=$15, notes=$16, updated_by=$17
      where id=$1 and row_version=$18
      returning *`,
    [
      applicationId, input.applicantId, input.coApplicantId, input.landlordId,
      agentId, input.leadId, input.monthlyRental, input.deposit,
      input.applicationStatus, input.screeningStatus, input.approvalDate,
      input.rejectionDate, input.rejectionReason, input.leaseStart, input.leaseEnd,
      input.notes, ctx.actor.id, expectedVersion,
    ],
  );
  const after = updated[0];
  if (!after) throw new ConcurrencyError();

  if (before.application_status !== after.application_status) {
    await syncPropertyFromApplication(
      db,
      ctx,
      before.property_id as string,
      after.application_status as RentalApplicationStatus,
    );
  }

  // A signed lease is also part of the property's rental history.
  if (
    after.application_status === 'lease_signed' &&
    before.application_status !== 'lease_signed'
  ) {
    await db.query(
      `insert into property_rental_history
         (property_id, lease_start, lease_end, monthly_rental, tenant_id, landlord_id,
          agent_id, notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        before.property_id, input.leaseStart, input.leaseEnd, input.monthlyRental,
        input.applicantId, input.landlordId, agentId,
        `From application ${before.application_ref}`, ctx.actor.id,
      ],
    );
  }

  const changes = diff(before, after, [
    'applicant_id', 'co_applicant_id', 'landlord_id', 'agent_id', 'monthly_rental',
    'deposit', 'application_status', 'screening_status', 'approval_date',
    'rejection_date', 'rejection_reason', 'lease_start', 'lease_end', 'notes',
  ]);
  if (Object.keys(changes).length > 0) {
    await recordAudit(db, ctx.actor, ctx.meta, {
      action: 'rental_application.updated',
      entityType: 'rental_application',
      entityId: applicationId,
      entityLabel: before.application_ref,
      changes,
    });
  }
}

/** Moves the property's rental status in step with the application. */
async function syncPropertyFromApplication(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  status: RentalApplicationStatus,
): Promise<void> {
  const mapping: Partial<Record<RentalApplicationStatus, string>> = {
    submitted: 'application_pending',
    under_review: 'application_pending',
    documents_required: 'application_pending',
    screening: 'application_pending',
    approved: 'application_approved',
    lease_prepared: 'application_approved',
    lease_signed: 'lease_active',
    rejected: 'available',
    withdrawn: 'available',
    cancelled: 'available',
  };
  const target = mapping[status];
  if (!target) return;

  const before = await db.maybeOne<{ rental_status: string }>(
    'select rental_status from properties where id = $1',
    [propertyId],
  );
  if (!before || before.rental_status === target) return;

  await db.query('update properties set rental_status = $2, updated_by = $3 where id = $1', [
    propertyId,
    target,
    ctx.actor.id,
  ]);
  await db.query(
    `insert into property_status_history
       (property_id, status_kind, old_value, new_value, reason, changed_by)
     values ($1,'rental',$2,$3,$4,$5)`,
    [
      propertyId,
      before.rental_status,
      target,
      `Rental application is now ${status}`,
      ctx.actor.id,
    ],
  );
}

// ---------------------------------------------------------------------------
// Screening (spec 51)
// ---------------------------------------------------------------------------

export interface ScreeningRow {
  id: string;
  itemId: string;
  name: string;
  description: string | null;
  isRequired: boolean;
  status: ScreeningItemStatus;
  notes: string | null;
  recordedAt: string;
  recordedByName: string | null;
}

export async function listScreening(db: Db, applicationId: string): Promise<ScreeningRow[]> {
  const rows = await db.query<{
    id: string;
    item_id: string;
    name: string;
    description: string | null;
    is_required: boolean;
    status: ScreeningItemStatus;
    notes: string | null;
    recorded_at: Date;
    recorded_by_name: string | null;
  }>(
    `select s.id, s.item_id, i.name, i.description, i.is_required, s.status, s.notes,
            s.recorded_at, coalesce(u.display_name, u.full_name) as recorded_by_name
       from rental_screening s
       join screening_checklist_items i on i.id = s.item_id
       left join users u on u.id = s.recorded_by
      where s.application_id = $1
      order by i.sort_order, i.name`,
    [applicationId],
  );
  return rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    name: row.name,
    description: row.description,
    isRequired: row.is_required,
    status: row.status,
    notes: row.notes,
    recordedAt: row.recorded_at.toISOString(),
    recordedByName: row.recorded_by_name,
  }));
}

/**
 * Records the outcome of one screening check, and keeps the application's
 * overall screening status in step with the checklist.
 */
export async function setScreeningItem(
  db: Db,
  ctx: Ctx,
  applicationId: string,
  input: { itemId: string; status: ScreeningItemStatus; notes: string | null },
): Promise<void> {
  const updated = await db.count(
    `update rental_screening
        set status = $3, notes = $4, recorded_at = now(), recorded_by = $5
      where application_id = $1 and item_id = $2`,
    [applicationId, input.itemId, input.status, input.notes, ctx.actor.id],
  );
  if (updated === 0) {
    await db.query(
      `insert into rental_screening (application_id, item_id, status, notes, recorded_by)
       values ($1,$2,$3,$4,$5)`,
      [applicationId, input.itemId, input.status, input.notes, ctx.actor.id],
    );
  }

  const progress = await db.one<{ required: number; done: number; failed: number; started: number }>(
    `select
       count(*) filter (where i.is_required)::int as required,
       count(*) filter (where i.is_required and s.status in ('verified','not_applicable'))::int as done,
       count(*) filter (where s.status = 'failed')::int as failed,
       count(*) filter (where s.status <> 'not_started')::int as started
     from rental_screening s
     join screening_checklist_items i on i.id = s.item_id
     where s.application_id = $1`,
    [applicationId],
  );

  const screeningStatus: ScreeningStatus =
    progress.failed > 0
      ? 'failed'
      : progress.required > 0 && progress.done >= progress.required
        ? 'complete'
        : progress.started > 0
          ? 'in_progress'
          : 'not_started';

  await db.query(
    'update rental_applications set screening_status = $2, updated_by = $3 where id = $1',
    [applicationId, screeningStatus, ctx.actor.id],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'rental_application.screening_recorded',
    entityType: 'rental_application',
    entityId: applicationId,
    context: { itemId: input.itemId, status: input.status, screeningStatus },
  });
}

export async function listScreeningChecklistItems(
  db: Db,
): Promise<{ id: string; name: string; description: string | null; isRequired: boolean }[]> {
  const rows = await db.query<{
    id: string;
    name: string;
    description: string | null;
    is_required: boolean;
  }>(
    `select id, name, description, is_required from screening_checklist_items
      where is_active order by sort_order, name`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    isRequired: row.is_required,
  }));
}

export const SCREENING_ITEM_STATUS_KEYS = keys(SCREENING_ITEM_STATUSES);
