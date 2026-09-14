import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listAgents } from '@/lib/people/queries.ts';
import { getNumberSetting } from '@/lib/settings.ts';
import { COMMISSION_BASES, COMMISSION_STATUSES, SPLIT_ROLES } from '@/lib/commission/types.ts';
import {
  commissionHistory,
  getCommission,
  listDeductions,
  listSplits,
} from '@/lib/commission/records.ts';
import { listRules } from '@/lib/commission/rules.ts';
import { labelOf, statusTone } from '@/lib/domain.ts';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { DescriptionList, Table, TableScroll, Td, Th, Tr } from '@/components/ui/table.tsx';
import {
  CommissionForm,
  DeductionPanel,
  RemoveDeductionButton,
  RemoveSplitButton,
  SplitPanel,
  WorkflowPanel,
} from '../forms.tsx';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('COMMISSION_VIEW', `/commissions/${id}`);
  const record = await readAsUser(user.id, (db) => getCommission(db, id));
  return { title: record ? `${record.commissionRef} · Commission` : 'Commission' };
}

const SAVED_MESSAGES: Record<string, string> = {
  created: 'Opened as a draft. Nothing is approved yet.',
  updated: 'Worked out again and saved.',
};

const EVENT_LABELS: Record<string, string> = {
  opened: 'Opened',
  recalculated: 'Worked out again',
  overridden: 'Figure overridden',
  split_changed: 'Shares changed',
  deduction_changed: 'Deductions changed',
  status_changed: 'Status changed',
  invoiced: 'Invoice recorded',
  paid: 'Recorded as paid',
  note: 'Note',
};

export default async function CommissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const user = await requirePermissionOrRedirect('COMMISSION_VIEW', `/commissions/${id}`);

  const data = await readAsUser(user.id, async (db) => {
    const record = await getCommission(db, id);
    if (!record) return null;
    return {
      record,
      splits: await listSplits(db, id),
      deductions: await listDeductions(db, id),
      history: await commissionHistory(db, id),
      rules: await listRules(db, { appliesTo: record.rentalId ? 'rental' : 'sale' }),
      agents: user.permissions.has('DATA_VIEW_ALL') ? await listAgents(db) : [],
      vatRate: await getNumberSetting(db, 'commission.vat_rate', 15),
    };
  });
  if (!data) notFound();

  const { record, splits, deductions, history, rules, agents, vatRate } = data;
  const canEdit = user.permissions.has('COMMISSION_EDIT');
  const canApprove = user.permissions.has('COMMISSION_APPROVE');
  const settled = ['approved', 'invoiced', 'paid', 'cancelled'].includes(record.status);
  const waitingOnRegistration =
    Boolean(record.transactionId) && record.transactionStatus !== 'registered';
  const allocated = splits.reduce((total, split) => total + Number(split.sharePercent), 0);

  return (
    <>
      {saved && SAVED_MESSAGES[saved] ? (
        <Alert tone="ok" className="mb-4">
          {SAVED_MESSAGES[saved]}
        </Alert>
      ) : null}

      <PageHeader
        eyebrow={<Link href="/commissions">Commission</Link>}
        title={record.propertyLabel ?? record.propertyRef}
        description={
          <>
            <span className="font-mono">{record.commissionRef}</span> ·{' '}
            {labelOf(COMMISSION_STATUSES, record.status)}
            {record.transactionRef ? ` · ${record.transactionRef}` : ' · a lease'}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/properties/${record.propertyId}`}>The property</ButtonLink>
            {record.transactionId ? (
              <ButtonLink href={`/sales/transactions/${record.transactionId}`}>
                The transaction
              </ButtonLink>
            ) : null}
          </div>
        }
      />

      {/* Spec 49, said before anybody has to discover it. */}
      {waitingOnRegistration ? (
        <Alert tone="warn" title="Nothing here is earned yet" className="mb-4">
          The transaction is{' '}
          <strong>{record.transactionStatus?.replace(/_/g, ' ') ?? 'not registered'}</strong>. A
          concluded sale is not a registered sale. This commission cannot be invoiced or recorded
          as paid until the deeds office registers the transfer.
        </Alert>
      ) : null}

      {record.status === 'paid' ? (
        <Alert tone="ok" title="Recorded as paid by a person, not confirmed by a bank" className="mb-4">
          {record.markedPaidByName ?? 'Somebody'} recorded this as paid on{' '}
          {formatDate(record.paidOn)}
          {record.paymentReference ? `, reference ${record.paymentReference}` : ''}. The CRM is
          connected to no bank account and checked nothing.
        </Alert>
      ) : null}

      {record.status === 'rejected' ? (
        <Alert tone="stop" title="Sent back" className="mb-4">
          {record.rejectionReason}
          {record.rejectedByName ? ` — ${record.rejectedByName}` : ''}
          {record.rejectedAt ? ` on ${formatDate(record.rejectedAt)}` : ''}
        </Alert>
      ) : null}

      {record.status === 'cancelled' ? (
        <Alert tone="warn" title="Cancelled" className="mb-4">
          {record.cancellationReason ?? 'No reason was recorded.'} The figures are kept for the
          record.
        </Alert>
      ) : null}

      {record.isOverridden ? (
        <Alert tone="warn" title="The figure was overridden" className="mb-4">
          The rule works out {formatMoney(record.calculatedExclVat, { decimals: true })}. This
          commission claims {formatMoney(record.grossExclVat, { decimals: true })} —{' '}
          {record.overrideReason}
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="The figures" />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                {
                  label: 'Status',
                  value: (
                    <Badge tone={statusTone(record.status)}>
                      {labelOf(COMMISSION_STATUSES, record.status)}
                    </Badge>
                  ),
                },
                { label: 'Worked out how', value: labelOf(COMMISSION_BASES, record.basis) },
                {
                  label: record.rentalId ? 'Monthly rent' : 'Sale price',
                  value: formatMoney(record.baseAmount),
                },
                {
                  label: 'Rate',
                  value:
                    record.basis === 'fixed_amount'
                      ? formatMoney(record.fixedAmount)
                      : record.basis === 'months_of_rent'
                        ? `${Number(record.months)} month(s)`
                        : `${Number(record.ratePercent)}%`,
                },
                { label: "The office's rule", value: record.ruleName ?? 'Not from a rule' },
                {
                  label: 'What the rule works out',
                  value: formatMoney(record.calculatedExclVat, { decimals: true }),
                },
                {
                  label: 'Commission claimed',
                  value: (
                    <strong>{formatMoney(record.grossExclVat, { decimals: true })}</strong>
                  ),
                },
                {
                  label: `VAT${record.vatApplicable ? ` at ${Number(record.vatRate)}%` : ''}`,
                  value: record.vatApplicable
                    ? formatMoney(record.vatAmount, { decimals: true })
                    : 'Does not apply',
                },
                {
                  label: 'Invoice total',
                  value: <strong>{formatMoney(record.grossInclVat, { decimals: true })}</strong>,
                },
                {
                  label: 'Deductions',
                  value: formatMoney(record.deductionsTotal, { decimals: true }),
                },
                {
                  label: 'To share out',
                  value: <strong>{formatMoney(record.netExclVat, { decimals: true })}</strong>,
                },
                { label: 'Invoice number', value: record.invoiceNumber },
                {
                  label: 'Invoice date',
                  value: record.invoiceDate ? formatDate(record.invoiceDate) : null,
                },
                {
                  label: 'Approved by',
                  value: record.approvedByName
                    ? `${record.approvedByName} on ${formatDate(record.approvedAt)}`
                    : 'Nobody yet',
                  span: true,
                },
                {
                  label: 'Registered',
                  value: record.registeredOn
                    ? formatDate(record.registeredOn)
                    : record.rentalId
                      ? 'A lease registers nowhere'
                      : 'Not yet',
                },
                {
                  label: 'Opened',
                  value: `${formatDate(record.createdAt)}${record.createdByName ? ` by ${record.createdByName}` : ''}`,
                  span: true,
                },
                { label: 'Notes', value: record.notes, span: true },
              ]}
            />
          </div>
        </Card>

        {/* min-w-0: a grid item will not shrink below its widest child
            otherwise, and a wide table inside would push the page sideways
            on a phone (spec 101, 139). */}
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Who gets what"
              description="VAT is never in anybody's share; it belongs to SARS."
              actions={
                <Badge tone={Math.abs(allocated - 100) < 0.001 ? 'ok' : 'warn'}>
                  {allocated.toFixed(2)}% allocated
                </Badge>
              }
            />
            {splits.length === 0 ? (
              <EmptyState title="Nobody has a share yet" className="py-6" />
            ) : (
              <TableScroll>
                <Table className="min-w-[34rem]">
                  <thead>
                    <tr>
                      <Th>Who</Th>
                      <Th>In what capacity</Th>
                      <Th align="right">Share</Th>
                      <Th align="right">Amount</Th>
                      {canEdit && !settled ? <Th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {splits.map((split) => (
                      <Tr key={split.id}>
                        <Td className="text-[0.8125rem] font-medium text-ink">
                          {split.agentName ?? split.partyName}
                          {split.agentId ? null : (
                            <span className="ml-1 text-[0.6875rem] text-ink-faint">
                              (not a CRM user)
                            </span>
                          )}
                        </Td>
                        <Td className="text-[0.8125rem]">{labelOf(SPLIT_ROLES, split.role)}</Td>
                        <Td align="right" className="text-[0.8125rem] tabular-nums">
                          {Number(split.sharePercent)}%
                        </Td>
                        <Td align="right" className="text-[0.8125rem] font-medium tabular-nums">
                          {formatMoney(split.amount, { decimals: true })}
                        </Td>
                        {canEdit && !settled ? (
                          <Td>
                            <RemoveSplitButton
                              commissionId={record.id}
                              splitId={split.id}
                              label={split.agentName ?? split.partyName ?? 'this share'}
                            />
                          </Td>
                        ) : null}
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableScroll>
            )}
            {canEdit && !settled ? (
              <SplitPanel
                commissionId={record.id}
                netExclVat={record.netExclVat}
                agents={agents.map((entry) => ({ id: entry.id, name: entry.name }))}
                splits={splits}
              />
            ) : null}
          </Card>

          <Card>
            <CardHeader
              title="Deductions"
              description="Taken off what is shared out, not off the VAT."
            />
            {deductions.length === 0 ? (
              <EmptyState title="Nothing deducted" className="py-6" />
            ) : (
              <ul className="divide-y divide-line-soft">
                {deductions.map((deduction) => (
                  <li
                    key={deduction.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.8125rem] font-medium text-ink">{deduction.label}</p>
                      <p className="text-[0.6875rem] text-ink-faint">
                        {formatDate(deduction.createdAt)}
                        {deduction.createdByName ? ` · ${deduction.createdByName}` : ''}
                        {deduction.note ? ` · ${deduction.note}` : ''}
                      </p>
                    </div>
                    <span className="text-[0.8125rem] font-medium tabular-nums text-ink">
                      {formatMoney(deduction.amount, { decimals: true })}
                    </span>
                    {canEdit && !settled ? (
                      <RemoveDeductionButton
                        commissionId={record.id}
                        deductionId={deduction.id}
                        label={deduction.label}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && !settled ? <DeductionPanel commissionId={record.id} /> : null}
          </Card>

          <Card>
            <CardHeader title="Where it goes next" />
            <WorkflowPanel record={record} canEdit={canEdit} canApprove={canApprove} />
          </Card>

          {canEdit && !settled ? (
            <Card>
              <CardHeader
                title="Work it out again"
                description="Changing a figure re-shares every amount, and the change is kept."
              />
              <CommissionForm
                mode="edit"
                record={record}
                rules={rules}
                vatRate={String(vatRate)}
              />
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="What has happened to it"
              description="Kept forever, and nobody can alter it."
            />
            {history.length === 0 ? (
              <EmptyState title="Nothing yet" className="py-6" />
            ) : (
              <ul className="divide-y divide-line-soft">
                {history.map((entry, index) => (
                  <li key={index} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                    <span className="font-medium text-ink">
                      {EVENT_LABELS[entry.event] ?? entry.event}
                      {entry.oldStatus && entry.newStatus
                        ? `: ${labelOf(COMMISSION_STATUSES, entry.oldStatus)} → ${labelOf(COMMISSION_STATUSES, entry.newStatus)}`
                        : ''}
                    </span>
                    <p className="text-[0.6875rem] text-ink-faint">
                      {formatDateTime(entry.changedAt)}
                      {entry.changedByName ? ` · ${entry.changedByName}` : ''}
                      {entry.reason ? ` · ${entry.reason}` : ''}
                    </p>
                    {entry.detail ? (
                      <p className="text-[0.6875rem] text-ink-faint">
                        {Object.entries(entry.detail)
                          .filter(([, value]) => value !== null && value !== undefined)
                          .map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${String(value)}`)
                          .join(' · ')}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
