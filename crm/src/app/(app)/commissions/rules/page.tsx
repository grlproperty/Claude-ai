import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listRules } from '@/lib/commission/rules.ts';
import { COMMISSION_BASES } from '@/lib/commission/types.ts';
import { BUSINESS_AREAS, labelOf } from '@/lib/domain.ts';
import { formatDate, formatMoney } from '@/lib/format.ts';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { ArchiveRulePanel, RuleForm } from '../forms.tsx';

export const metadata = { title: 'Commission terms' };
export const dynamic = 'force-dynamic';

const SAVED_MESSAGES: Record<string, string> = {
  created: 'Rule added.',
  updated: 'Rule saved. Commissions already worked out keep their own figures.',
};

/**
 * The office's own terms (spec 61, 103).
 *
 * These are configuration, not code. Changing a rate here changes what the
 * next commission starts from; it never reaches back and rewrites a figure
 * somebody has already agreed.
 */
export default async function CommissionRulesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; edit?: string }>;
}) {
  const { saved, edit } = await searchParams;
  const user = await requirePermissionOrRedirect('SETTINGS_ADMIN', '/commissions/rules');

  const rules = await readAsUser(user.id, (db) => listRules(db, { includeArchived: true }));
  const editing = edit ? rules.find((rule) => rule.id === edit) : undefined;

  const live = rules.filter((rule) => !rule.isArchived);
  const retired = rules.filter((rule) => rule.isArchived);

  return (
    <>
      {saved && SAVED_MESSAGES[saved] ? (
        <Alert tone="ok" className="mb-4">
          {SAVED_MESSAGES[saved]}
        </Alert>
      ) : null}

      <PageHeader
        eyebrow="Commission"
        title="The office's own terms"
        description="What GRLP charges, and how it is worked out."
      />

      <Alert tone="neutral" title="Changing a rule never changes a past figure" className="mb-4">
        Every commission keeps a copy of the rule it was worked out from, so retiring or editing a
        rule here leaves history exactly as it was.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader title={`${live.length} rule(s) in use`} />
            {live.length === 0 ? (
              <EmptyState title="No rules yet" className="py-6" />
            ) : (
              <ul className="divide-y divide-line-soft">
                {live.map((rule) => (
                  <li key={rule.id}>
                    <div className="p-4 sm:p-5">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-medium text-ink">{rule.name}</span>
                        <Badge tone={rule.appliesTo === 'sale' ? 'brand' : 'info'}>
                          {rule.appliesTo === 'sale' ? 'Sales' : 'Rentals'}
                        </Badge>
                        {rule.isDefault ? <Badge tone="ok">The usual one</Badge> : null}
                        {rule.vatApplicable ? null : <Badge>No VAT</Badge>}
                      </div>
                      <p className="mt-0.5 text-[0.8125rem] text-ink-soft">
                        {labelOf(COMMISSION_BASES, rule.basis)}
                        {rule.ratePercent ? ` — ${Number(rule.ratePercent)}%` : ''}
                        {rule.months ? ` — ${Number(rule.months)} month(s)` : ''}
                        {rule.fixedAmount ? ` — ${formatMoney(rule.fixedAmount)}` : ''}
                        {rule.minimumAmount
                          ? ` · at least ${formatMoney(rule.minimumAmount)}`
                          : ''}
                      </p>
                      <p className="text-[0.6875rem] text-ink-faint">
                        {rule.businessArea
                          ? labelOf(BUSINESS_AREAS, rule.businessArea)
                          : 'Everywhere'}
                        {rule.effectiveFrom ? ` · from ${formatDate(rule.effectiveFrom)}` : ''}
                        {rule.effectiveTo ? ` until ${formatDate(rule.effectiveTo)}` : ''}
                        {rule.notes ? ` · ${rule.notes}` : ''}
                      </p>
                      <a
                        href={`/commissions/rules?edit=${rule.id}`}
                        className="mt-1 inline-block text-[0.8125rem] font-medium text-brand hover:underline"
                      >
                        Change it
                      </a>
                    </div>
                    <ArchiveRulePanel ruleId={rule.id} name={rule.name} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {retired.length > 0 ? (
            <Card>
              <CardHeader
                title="Retired"
                description="Kept because past commissions were worked out from them."
              />
              <ul className="divide-y divide-line-soft">
                {retired.map((rule) => (
                  <li key={rule.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                    <span className="font-medium text-ink">{rule.name}</span>{' '}
                    <Badge>Retired</Badge>
                    <p className="text-[0.6875rem] text-ink-faint">{rule.archiveReason}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader
            title={editing ? `Change "${editing.name}"` : 'Add a rule'}
            description={
              editing
                ? 'Commissions already worked out from it keep their own figures.'
                : 'A sale is worked out from a price; a letting from the rent.'
            }
          />
          <RuleForm mode={editing ? 'edit' : 'create'} rule={editing} />
        </Card>
      </div>
    </>
  );
}
