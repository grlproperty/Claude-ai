import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { dataQuality } from '@/lib/data-quality.ts';
import { pluralise } from '@/lib/format.ts';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';

export const metadata = { title: 'Data quality' };
export const dynamic = 'force-dynamic';

const SEVERITY_TONE = { high: 'stop', medium: 'warn', low: 'neutral' } as const;
const SEVERITY_LABEL = {
  high: 'Needs fixing',
  medium: 'Worth checking',
  low: 'Untidy',
} as const;

/**
 * Data quality (spec 96).
 *
 * Gaps and, more importantly, contradictions. A property marked as
 * registered with no registered transaction behind it is the kind of
 * thing that sits unnoticed for months and then costs somebody a
 * commission argument.
 *
 * Nothing on this page is corrected automatically. A CRM that quietly
 * "tidies" a record has destroyed information nobody asked it to touch.
 */
export default async function DataQualityPage() {
  const user = await requirePermissionOrRedirect('REPORTS_VIEW', '/reports/data-quality');
  const { issues, totals } = await readAsUser(user.id, dataQuality);

  const high = issues.filter((issue) => issue.severity === 'high');
  const rest = issues.filter((issue) => issue.severity !== 'high');

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/reports">Reports</Link>}
        title="Data quality"
        description={`Across ${pluralise(totals.people, 'person', 'people')} and ${pluralise(totals.properties, 'property', 'properties')}.`}
      />

      <Alert tone="neutral" title="Nothing here is corrected automatically" className="mb-4">
        Every one of these needs a person to decide what is right. A CRM that guessed — picked one
        of two contradictory dates, or deleted the record it liked less — would be destroying
        information nobody asked it to touch.
      </Alert>

      {issues.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing to report"
            description="No gaps and no contradictions found in the records you can see."
            className="py-10"
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {high.length > 0 ? (
            <Card>
              <CardHeader
                title="Contradictions and blocking gaps"
                description="Two records disagreeing, or a record that cannot be acted on at all."
              />
              <IssueList issues={high} />
            </Card>
          ) : null}

          {rest.length > 0 ? (
            <Card>
              <CardHeader title="Worth tidying" description="Nothing is broken; things are missing." />
              <IssueList issues={rest} />
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}

function IssueList({
  issues,
}: {
  issues: {
    code: string;
    label: string;
    detail: string;
    count: number;
    severity: 'high' | 'medium' | 'low';
    href: string | null;
  }[];
}) {
  return (
    <ul className="divide-y divide-line-soft">
      {issues.map((issue) => (
        <li key={issue.code} className="p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline gap-2">
            <Badge tone={SEVERITY_TONE[issue.severity]}>{issue.count}</Badge>
            <span className="text-[0.8125rem] font-medium text-ink">{issue.label}</span>
            <span className="text-[0.6875rem] text-ink-faint">
              {SEVERITY_LABEL[issue.severity]}
            </span>
          </div>
          <p className="mt-0.5 text-[0.8125rem] text-ink-soft">{issue.detail}</p>
          {issue.href ? (
            <Link
              href={issue.href}
              className="mt-1 inline-block text-[0.8125rem] font-medium text-brand hover:underline"
            >
              Go and look
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
