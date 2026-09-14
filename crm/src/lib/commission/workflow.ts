import type { Ctx } from '../actor.ts';
import type { Db } from '../db.ts';
import { holds } from '../actor.ts';
import { recordAudit } from '../audit.ts';
import { ConcurrencyError, ForbiddenError, NotFoundError, ValidationError } from '../errors.ts';
import { getSetting } from '../settings.ts';
import { getCommission, listSplits, note, type CommissionRecord } from './records.ts';
import { COMMISSION_STATUSES, mayMoveTo, type CommissionStatus } from './types.ts';

// ---------------------------------------------------------------------
// The approval workflow (spec 65, 106, 115)
// ---------------------------------------------------------------------

/**
 * Moving a commission along.
 *
 * Each step is a decision by a person, recorded with their name. Nothing
 * here decides anything on its own, and the database refuses every one of
 * these states without the person and the moment attached.
 */

export async function submitCommission(
  db: Db,
  ctx: Ctx,
  id: string,
  expectedVersion: number,
): Promise<void> {
  const record = await requireCommission(db, id, expectedVersion);
  requireTransition(record, 'submitted');

  const splits = await listSplits(db, id);
  const total = splits.reduce((running, split) => running + Number(split.sharePercent), 0);
  if (splits.length === 0) {
    throw new ValidationError(
      { splits: ['Nobody has a share of this commission yet.'] },
      'Say who this commission is shared between before sending it for approval.',
    );
  }
  if (Math.abs(total - 100) > 0.001) {
    throw new ValidationError(
      {
        splits: [
          `The shares come to ${total.toFixed(3)}%. They must come to exactly 100% before approval.`,
        ],
      },
      'The shares do not add up to the whole.',
    );
  }

  await write(
    db,
    ctx,
    id,
    expectedVersion,
    `status='submitted', submitted_by=$2, submitted_at=now(),
     rejected_by=null, rejected_at=null, rejection_reason=null`,
    [ctx.actor.id],
  );
  await note(db, ctx, id, 'status_changed', {
    oldStatus: record.status,
    newStatus: 'submitted',
    reason: 'Sent for approval',
  });
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'commission.submitted',
    entityType: 'commission',
    entityId: id,
    context: { commissionRef: record.commissionRef, grossExclVat: record.grossExclVat },
  });
}

/**
 * Approving it.
 *
 * Requires COMMISSION_APPROVE, which agents do not hold. Where GRLP has
 * switched on the separate-approver setting, the person who worked the
 * commission out cannot also approve it.
 */
export async function approveCommission(
  db: Db,
  ctx: Ctx,
  id: string,
  expectedVersion: number,
  approvalNote: string | null,
): Promise<void> {
  if (!holds(ctx.actor, 'COMMISSION_APPROVE')) throw new ForbiddenError('commission approval');

  const record = await requireCommission(db, id, expectedVersion);
  requireTransition(record, 'approved');

  const separateApprover = await getSetting<boolean>(
    db,
    'commission.require_separate_approver',
    false,
  );
  if (separateApprover && record.createdById === ctx.actor.id) {
    throw new ValidationError(
      { approvalNote: ['Somebody other than the person who worked this out must approve it.'] },
      'The office requires a second pair of eyes on a commission.',
    );
  }

  await write(
    db,
    ctx,
    id,
    expectedVersion,
    `status='approved', approved_by=$2, approved_at=now(), approval_note=$3`,
    [ctx.actor.id, approvalNote],
  );
  await note(db, ctx, id, 'status_changed', {
    oldStatus: record.status,
    newStatus: 'approved',
    reason: approvalNote,
    detail: { grossExclVat: record.grossExclVat, netExclVat: record.netExclVat },
  });
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'commission.approved',
    entityType: 'commission',
    entityId: id,
    context: { commissionRef: record.commissionRef, netExclVat: record.netExclVat },
  });
}

export async function rejectCommission(
  db: Db,
  ctx: Ctx,
  id: string,
  expectedVersion: number,
  reason: string,
): Promise<void> {
  if (!holds(ctx.actor, 'COMMISSION_APPROVE')) throw new ForbiddenError('commission approval');
  if (!reason.trim()) {
    throw new ValidationError({ rejectionReason: ['Say what needs changing.'] });
  }

  const record = await requireCommission(db, id, expectedVersion);
  requireTransition(record, 'rejected');

  await write(
    db,
    ctx,
    id,
    expectedVersion,
    `status='rejected', rejected_by=$2, rejected_at=now(), rejection_reason=$3,
     approved_by=null, approved_at=null, approval_note=null`,
    [ctx.actor.id, reason.trim()],
  );
  await note(db, ctx, id, 'status_changed', {
    oldStatus: record.status,
    newStatus: 'rejected',
    reason: reason.trim(),
  });
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'commission.rejected',
    entityType: 'commission',
    entityId: id,
    context: { commissionRef: record.commissionRef, reason: reason.trim() },
  });
}

/**
 * Recording the invoice.
 *
 * The CRM does not issue invoices and does not pretend to. This writes
 * down the number and date of an invoice raised elsewhere, which is why
 * the number is required.
 */
export async function invoiceCommission(
  db: Db,
  ctx: Ctx,
  id: string,
  expectedVersion: number,
  input: { invoiceNumber: string; invoiceDate: string | null },
): Promise<void> {
  if (!input.invoiceNumber.trim()) {
    throw new ValidationError(
      { invoiceNumber: ['Give the number of the invoice that was raised.'] },
      'Give the invoice number. The CRM does not issue invoices, so it needs the one that was.',
    );
  }

  const record = await requireCommission(db, id, expectedVersion);
  requireTransition(record, 'invoiced');
  await guardRegistration(db, record);

  await write(
    db,
    ctx,
    id,
    expectedVersion,
    `status='invoiced', invoice_number=$2, invoice_date=coalesce($3::date, current_date)`,
    [input.invoiceNumber.trim(), input.invoiceDate],
  );
  await note(db, ctx, id, 'invoiced', {
    oldStatus: record.status,
    newStatus: 'invoiced',
    detail: { invoiceNumber: input.invoiceNumber.trim(), grossInclVat: record.grossInclVat },
  });
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'commission.invoiced',
    entityType: 'commission',
    entityId: id,
    context: { commissionRef: record.commissionRef, invoiceNumber: input.invoiceNumber.trim() },
  });
}

/**
 * Recording that it was paid.
 *
 * THE CRM HAS NO BANK FEED AND NO PAYMENT INTEGRATION. It cannot know that
 * money moved. This records that a named person, on a known date, says it
 * did — which is why the status reads "Recorded as paid" and never
 * "Payment confirmed" (spec 115).
 */
export async function markCommissionPaid(
  db: Db,
  ctx: Ctx,
  id: string,
  expectedVersion: number,
  input: { paidOn: string | null; paymentReference: string | null; invoiceNumber?: string | null },
): Promise<void> {
  if (!holds(ctx.actor, 'COMMISSION_APPROVE')) throw new ForbiddenError('recording payment');

  const record = await requireCommission(db, id, expectedVersion);
  requireTransition(record, 'paid');
  await guardRegistration(db, record);

  const invoiceNumber = record.invoiceNumber ?? input.invoiceNumber?.trim() ?? null;
  if (!invoiceNumber) {
    throw new ValidationError(
      { invoiceNumber: ['Record the invoice number before recording the payment against it.'] },
      'Record the invoice number this payment was made against.',
    );
  }

  await write(
    db,
    ctx,
    id,
    expectedVersion,
    `status='paid', paid_on=coalesce($2::date, current_date), payment_reference=$3,
     marked_paid_by=$4, marked_paid_at=now(),
     invoice_number=coalesce(invoice_number, $5),
     invoice_date=coalesce(invoice_date, current_date)`,
    [input.paidOn, input.paymentReference, ctx.actor.id, invoiceNumber],
  );
  await note(db, ctx, id, 'paid', {
    oldStatus: record.status,
    newStatus: 'paid',
    detail: {
      paidOn: input.paidOn,
      reference: input.paymentReference,
      grossInclVat: record.grossInclVat,
    },
    reason: 'Recorded by hand; the CRM is connected to no bank.',
  });
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'commission.recorded_paid',
    entityType: 'commission',
    entityId: id,
    context: {
      commissionRef: record.commissionRef,
      paidOn: input.paidOn,
      reference: input.paymentReference,
    },
  });
}

export async function cancelCommission(
  db: Db,
  ctx: Ctx,
  id: string,
  expectedVersion: number,
  reason: string,
): Promise<void> {
  if (!reason.trim()) {
    throw new ValidationError({ cancellationReason: ['Say why it is being cancelled.'] });
  }
  const record = await requireCommission(db, id, expectedVersion);
  requireTransition(record, 'cancelled');

  await write(db, ctx, id, expectedVersion, `status='cancelled', cancellation_reason=$2`, [
    reason.trim(),
  ]);
  await note(db, ctx, id, 'status_changed', {
    oldStatus: record.status,
    newStatus: 'cancelled',
    reason: reason.trim(),
  });
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'commission.cancelled',
    entityType: 'commission',
    entityId: id,
    context: { commissionRef: record.commissionRef, reason: reason.trim() },
  });
}

async function requireCommission(
  db: Db,
  id: string,
  expectedVersion: number,
): Promise<CommissionRecord> {
  const record = await getCommission(db, id);
  if (!record) throw new NotFoundError('That commission');
  if (record.rowVersion !== expectedVersion) throw new ConcurrencyError();
  return record;
}

function requireTransition(record: CommissionRecord, to: CommissionStatus): void {
  if (!mayMoveTo(record.status, to)) {
    throw new ValidationError(
      { status: [`${COMMISSION_STATUSES[record.status]} cannot become ${COMMISSION_STATUSES[to]}.`] },
      `${record.commissionRef} is ${COMMISSION_STATUSES[record.status].toLowerCase()}, so that step is not available.`,
    );
  }
}

/**
 * Spec 49, explained before the database has to refuse it.
 *
 * The trigger on the table is the real guard, since it applies however the
 * row is written. This is here so the person gets the reason rather than a
 * constraint name.
 */
async function guardRegistration(db: Db, record: CommissionRecord): Promise<void> {
  if (!record.transactionId) return;
  if (record.transactionStatus === 'registered') return;

  // The trigger on the table is the real guard. Where the office has
  // deliberately switched it off, this must agree with it rather than
  // refusing something the database would accept.
  const allowed = await getSetting<boolean>(db, 'commission.allow_before_registration', false);
  if (allowed) return;

  throw new ValidationError(
    {
      status: [
        'The transfer has not registered yet. A concluded sale is not a registered sale, '
          + 'and commission is only earned on registration.',
      ],
    },
    `${record.transactionRef ?? 'That transaction'} has not registered `
      + `(it is ${record.transactionStatus ?? 'unknown'}), so its commission cannot be `
      + 'invoiced or recorded as paid yet.',
  );
}

/**
 * One guarded write.
 *
 * Every workflow step goes through here so that none of them can forget
 * the row version, which is what stops two people approving at once from
 * overwriting each other (spec 105).
 */
async function write(
  db: Db,
  ctx: Ctx,
  id: string,
  expectedVersion: number,
  setClause: string,
  params: readonly unknown[],
): Promise<void> {
  const actor = `$${params.length + 2}`;
  const version = `$${params.length + 3}`;
  const updated = await db.count(
    `update commissions set ${setClause}, updated_by = ${actor}
      where id = $1 and row_version = ${version}`,
    [id, ...params, ctx.actor.id, expectedVersion],
  );
  if (updated === 0) throw new ConcurrencyError();
}
