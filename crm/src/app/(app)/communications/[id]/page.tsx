import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getCommunication } from '@/lib/communications.ts';
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_DIRECTIONS,
  COMMUNICATION_OUTCOMES,
  labelOf,
} from '@/lib/domain.ts';
import { formatDateTime, relativeTime } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { DescriptionList } from '@/components/ui/table.tsx';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('COMMUNICATION_VIEW', `/communications/${id}`);
  const entry = await readAsUser(user.id, (db) => getCommunication(db, id));
  return {
    title: entry
      ? `${labelOf(COMMUNICATION_CHANNELS, entry.channel)} · ${entry.personName ?? 'Communication'}`
      : 'Communication',
  };
}

export default async function CommunicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const user = await requirePermissionOrRedirect('COMMUNICATION_VIEW', `/communications/${id}`);

  const entry = await readAsUser(user.id, (db) => getCommunication(db, id));
  if (!entry) notFound();

  const canCorrect =
    user.permissions.has('COMMUNICATION_CREATE') &&
    (user.permissions.has('DATA_VIEW_ALL') || entry.createdById === user.id);

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/communications">Communications</Link>}
        title={`${labelOf(COMMUNICATION_CHANNELS, entry.channel)} — ${labelOf(COMMUNICATION_DIRECTIONS, entry.direction)}`}
        description={`${formatDateTime(entry.occurredAt)} (${relativeTime(entry.occurredAt)})`}
        actions={
          canCorrect ? (
            <ButtonLink href={`/communications/${entry.id}/edit`} tone="primary">
              Correct it
            </ButtonLink>
          ) : null
        }
      />

      {saved === 'corrected' ? (
        <Alert tone="ok" className="mb-4">
          Corrected. The change is in the audit log; nothing was deleted.
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="What was said" />
          <div className="p-4 sm:p-5">
            {entry.subject ? (
              <p className="text-sm font-medium text-ink">{entry.subject}</p>
            ) : null}
            {entry.body ? (
              <p className="mt-1 whitespace-pre-wrap text-[0.9375rem] text-ink">{entry.body}</p>
            ) : (
              <p className="text-[0.8125rem] text-ink-faint">
                Nothing was written down beyond the outcome.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="The record" />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                {
                  label: 'Which way round',
                  value: labelOf(COMMUNICATION_DIRECTIONS, entry.direction),
                },
                { label: 'How', value: labelOf(COMMUNICATION_CHANNELS, entry.channel) },
                {
                  label: 'What came of it',
                  value: entry.outcome ? labelOf(COMMUNICATION_OUTCOMES, entry.outcome) : null,
                },
                {
                  label: 'How long',
                  value: entry.durationMinutes ? `${entry.durationMinutes} minutes` : null,
                },
                { label: 'When', value: formatDateTime(entry.occurredAt) },
                {
                  label: 'Client',
                  value: entry.personId ? (
                    <Link href={`/people/${entry.personId}`} className="hover:text-brand">
                      {entry.personName}
                    </Link>
                  ) : null,
                },
                {
                  label: 'Property',
                  value: entry.propertyId ? (
                    <Link href={`/properties/${entry.propertyId}`} className="hover:text-brand">
                      {entry.propertyLabel ?? entry.propertyRef}
                    </Link>
                  ) : null,
                },
                { label: 'Whose conversation', value: entry.agentName },
                {
                  label: 'Written down by',
                  value: `${entry.createdByName ?? 'unknown'} on ${formatDateTime(entry.createdAt)}`,
                  span: true,
                },
                {
                  label: 'Wording used',
                  value: entry.templateName,
                  span: true,
                },
              ]}
            />
            {entry.isImportant ? (
              <p className="mt-3">
                <Badge tone="brand">Important</Badge>
              </p>
            ) : null}
          </div>

          {entry.taskId ? (
            <div className="border-t border-line-soft p-4 sm:p-5">
              <p className="text-[0.8125rem] text-ink-soft">
                A follow-up was made from this conversation.
              </p>
              <ButtonLink href="/tasks" size="sm" className="mt-2">
                See the task list
              </ButtonLink>
            </div>
          ) : null}
        </Card>
      </div>

      <Alert tone="neutral" className="mt-4">
        There is no delivery or read information here, and there never will be while the CRM has
        no connection to email or WhatsApp. What you see is what a person wrote down.
      </Alert>
    </>
  );
}
