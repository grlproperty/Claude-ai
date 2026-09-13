import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getPerson, listAgents } from '@/lib/people/queries.ts';
import { findPersonDuplicates } from '@/lib/people/duplicates.ts';
import {
  ADDRESS_TYPES,
  BUSINESS_AREAS,
  CONTACT_TYPES,
  RELATIONSHIP_TYPES,
  clientTypeSummary,
  labelOf,
} from '@/lib/domain.ts';
import { formatZaPhone } from '@/lib/phone.ts';
import { formatDate, formatDateTime, isOverdue, relativeTime } from '@/lib/format.ts';
import { describeAuditAction, describeField } from '@/lib/audit-labels.ts';
import {
  Badge,
  ButtonLink,
  Card,
  CardHeader,
  PageHeader,
} from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { DescriptionList } from '@/components/ui/table.tsx';
import { QuickActions, CommunicationNotice } from '@/components/quick-actions.tsx';
import { RelatedRecordCards, loadRelatedRecords } from '@/components/related-records.tsx';
import { Icon } from '@/components/icons.tsx';
import { IdentityReveal } from './identity-reveal.tsx';
import { AssignAgentPanel, ArchivePanel, RelationshipPanel, RemoveRelationshipButton } from './panels.tsx';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('PEOPLE_VIEW', `/people/${id}`);
  const person = await readAsUser(user.id, (db) => getPerson(db, id));
  return { title: person ? `${person.fullName} · ${person.clientRef}` : 'Person' };
}

const SAVED_MESSAGES: Record<string, string> = {
  created: 'Client created.',
  updated: 'Client saved.',
  merged: 'The records were merged.',
};

export default async function PersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const user = await requirePermissionOrRedirect('PEOPLE_VIEW', `/people/${id}`);

  const data = await readAsUser(user.id, async (db) => {
    const person = await getPerson(db, id);
    if (!person) return null;

    const duplicates = user.permissions.has('MERGE_RECORDS')
      ? await findPersonDuplicates(
          db,
          {
            firstName: person.firstName,
            surname: person.surname,
            contactValues: person.contacts.map((c) => c.value),
            suburb: person.addresses[0]?.suburb ?? null,
          },
          { excludeId: person.id, limit: 5 },
        )
      : [];

    const assignments = await db.query<{
      agent_name: string | null;
      assignment: string;
      assigned_at: Date;
      unassigned_at: Date | null;
      reason: string | null;
      assigned_by_name: string | null;
    }>(
      `select coalesce(a.display_name, a.full_name) as agent_name, pa.assignment,
              pa.assigned_at, pa.unassigned_at, pa.reason,
              coalesce(b.display_name, b.full_name) as assigned_by_name
         from person_agent_assignments pa
         left join users a on a.id = pa.agent_id
         left join users b on b.id = pa.assigned_by
        where pa.person_id = $1
        order by pa.assigned_at desc`,
      [id],
    );

    const audit = user.permissions.has('AUDIT_LOG_VIEW')
      ? await db.query<{
          occurred_at: Date;
          action: string;
          actor_email: string | null;
          changes: Record<string, { from: unknown; to: unknown }> | null;
        }>(
          `select occurred_at, action, actor_email, changes
             from audit_logs where entity_type = 'person' and entity_id = $1
            order by occurred_at desc limit 25`,
          [id],
        )
      : [];

    const others = user.permissions.has('PEOPLE_EDIT')
      ? await db.query<{ id: string; label: string }>(
          `select id, first_name || ' ' || surname || ' (' || client_ref || ')' as label
             from people where id <> $1 and merged_into_id is null and not is_archived
            order by surname, first_name limit 300`,
          [id],
        )
      : [];

    const agents = user.permissions.has('DATA_VIEW_ALL') ? await listAgents(db) : [];

    // What is in flight for this person (spec 99).
    const related = await loadRelatedRecords(db, user, { personId: person.id });

    return { person, duplicates, assignments, audit, others, agents, related };
  });

  if (!data) notFound();
  const { person, duplicates, assignments, audit, others, agents, related } = data;

  const canEdit = user.permissions.has('PEOPLE_EDIT');
  const primaryMobile =
    person.contacts.find((c) => c.isPrimary && c.contactType === 'mobile')?.value ??
    person.contacts.find((c) => ['mobile', 'whatsapp'].includes(c.contactType))?.value ??
    null;
  const primaryEmail =
    person.contacts.find((c) => c.contactType === 'email' && c.isPrimary)?.value ??
    person.contacts.find((c) => c.contactType === 'email')?.value ??
    null;

  return (
    <>
      {saved && SAVED_MESSAGES[saved] ? (
        <Alert tone="ok" className="mb-4">
          {SAVED_MESSAGES[saved]}
        </Alert>
      ) : null}

      {person.mergedIntoId ? (
        <Alert tone="warn" title="This record was merged" className="mb-4">
          {person.clientRef} was merged into{' '}
          <Link href={`/people/${person.mergedIntoId}`} className="underline">
            {person.mergedIntoRef}
          </Link>
          . It is kept for its history and its reference will never be reused.
        </Alert>
      ) : null}

      {person.isArchived && !person.mergedIntoId ? (
        <Alert tone="warn" title="This client is archived" className="mb-4">
          {person.archiveReason ?? 'No reason was recorded.'}
        </Alert>
      ) : null}

      <PageHeader
        eyebrow={<span className="font-mono">{person.clientRef}</span>}
        title={person.fullName}
        description={
          <>
            {clientTypeSummary(person.clientTypes)} ·{' '}
            {labelOf(BUSINESS_AREAS, person.businessArea)}
            {person.primaryAgentName ? ` · Primary agent: ${person.primaryAgentName}` : ''}
          </>
        }
        actions={
          canEdit ? (
            <ButtonLink href={`/people/${person.id}/edit`} tone="primary">
              Edit
            </ButtonLink>
          ) : null
        }
      />

      {/* What do I need to do next? (spec 145) */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-line-soft px-4 py-3.5 sm:px-5">
          <Fact label="First contact" value={person.firstContactAt ? formatDate(person.firstContactAt) : 'Not yet'} />
          <Fact
            label="Last contact"
            value={
              person.lastContactAt
                ? `${formatDate(person.lastContactAt)} · ${labelOf(CONTACT_TYPES, person.lastContactMethod)}`
                : 'Never'
            }
            hint={person.lastContactAt ? relativeTime(person.lastContactAt) : undefined}
          />
          <Fact
            label="Next follow-up"
            value={
              person.nextFollowUpAt ? (
                <Badge tone={isOverdue(person.nextFollowUpAt) ? 'stop' : 'ok'}>
                  {formatDateTime(person.nextFollowUpAt)}
                </Badge>
              ) : (
                'None set'
              )
            }
          />
        </div>
        <div className="space-y-2 px-4 py-3.5 sm:px-5">
          <QuickActions
            mobile={primaryMobile}
            email={primaryEmail}
            personId={person.id}
            canLog={user.permissions.has('COMMUNICATION_CREATE')}
            canTask={user.permissions.has('TASKS_CREATE')}
          />
          <CommunicationNotice />
        </div>
      </Card>

      {duplicates.length > 0 ? (
        <Alert tone="warn" title="This may be the same person as another record" className="mb-4">
          <ul className="mt-1 space-y-1">
            {duplicates.map((match) => (
              <li key={match.personId}>
                <Link href={`/people/${person.id}/merge?with=${match.personId}`} className="underline">
                  {match.fullName} ({match.clientRef})
                </Link>{' '}
                — {match.reasons.join(', ')}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Contact details" />
          <div className="p-4 sm:p-5">
            {person.contacts.length === 0 ? (
              <EmptyState title="No contact details recorded" className="py-6" />
            ) : (
              <ul className="space-y-2.5">
                {person.contacts.map((contact) => (
                  <li key={contact.id} className="flex flex-wrap items-baseline gap-2">
                    <span className="w-32 shrink-0 text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                      {labelOf(CONTACT_TYPES, contact.contactType)}
                    </span>
                    <span className="text-sm tabular-nums text-ink">
                      {contact.contactType === 'email'
                        ? contact.value
                        : formatZaPhone(contact.value) || contact.value}
                    </span>
                    {contact.isPrimary ? <Badge tone="brand">Primary</Badge> : null}
                    {!contact.isActive ? <Badge>No longer used</Badge> : null}
                  </li>
                ))}
              </ul>
            )}

            {person.addresses.length > 0 ? (
              <div className="mt-5 space-y-3 border-t border-line-soft pt-4">
                {person.addresses.map((address) => (
                  <div key={address.id}>
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                      {labelOf(ADDRESS_TYPES, address.addressType)}
                    </p>
                    <p className="text-sm text-ink">
                      {[address.line1, address.line2, address.suburb, address.city, address.province, address.postalCode]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Classification and assignment" />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                { label: 'Business area', value: labelOf(BUSINESS_AREAS, person.businessArea) },
                { label: 'Client types', value: clientTypeSummary(person.clientTypes) },
                { label: 'Primary agent', value: person.primaryAgentName },
                { label: 'Secondary agent', value: person.secondaryAgentName },
                { label: 'Office', value: person.officeName },
                { label: 'Team', value: person.teamName },
                {
                  label: 'Tags',
                  value:
                    person.tags.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {person.tags.map((tag) => (
                          <Badge key={tag.id} tone={tag.colour as 'neutral'}>
                            {tag.name}
                          </Badge>
                        ))}
                      </span>
                    ) : null,
                  span: true,
                },
                { label: 'Notes', value: person.notes, span: true },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Identity document"
            description="Stored separately and shown masked."
          />
          <div className="p-4 sm:p-5">
            {user.permissions.has('PERSON_ID_VIEW') ? (
              <IdentityReveal
                personId={person.id}
                maskedId={person.idDisplay}
                maskedPassport={person.passportDisplay}
                hasId={person.idIsRecorded}
                hasPassport={person.passportIsRecorded}
              />
            ) : (
              <DescriptionList
                items={[
                  {
                    label: 'South African ID',
                    value: person.idIsRecorded ? (
                      <span className="font-mono">{person.idDisplay}</span>
                    ) : null,
                  },
                  {
                    label: 'Passport',
                    value: person.passportIsRecorded ? (
                      <span className="font-mono">{person.passportDisplay}</span>
                    ) : null,
                  },
                ]}
              />
            )}
            {person.passportCountry || person.passportExpiry ? (
              <p className="mt-3 text-xs text-ink-soft">
                {person.passportCountry ? `Issued by ${person.passportCountry}. ` : ''}
                {person.passportExpiry ? `Expires ${formatDate(person.passportExpiry)}.` : ''}
              </p>
            ) : null}
            {!user.permissions.has('PERSON_ID_VIEW') && person.idIsRecorded ? (
              <p className="mt-3 text-xs text-ink-faint">
                Your role does not include reading full identity numbers.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Relationships"
            description="Spouses, attorneys, co-owners and company representatives."
          />
          {person.relationships.length === 0 ? (
            <EmptyState title="No relationships recorded" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {person.relationships.map((relationship) => (
                <li key={`${relationship.id}-${relationship.direction}`} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/people/${relationship.otherPersonId}`}
                      className="text-sm font-medium text-ink hover:text-brand"
                    >
                      {relationship.otherPersonName}
                    </Link>
                    <p className="text-[0.6875rem] text-ink-faint">
                      {labelOf(RELATIONSHIP_TYPES, relationship.relationshipType)}
                      {relationship.startDate ? ` · from ${formatDate(relationship.startDate)}` : ''}
                      {relationship.endDate ? ` until ${formatDate(relationship.endDate)}` : ''}
                    </p>
                  </div>
                  {canEdit ? (
                    <RemoveRelationshipButton personId={person.id} relationshipId={relationship.id} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canEdit && others.length > 0 ? <RelationshipPanel personId={person.id} people={others} /> : null}
        </Card>

        {canEdit && agents.length > 0 ? (
          <Card>
            <CardHeader title="Agent assignment" description="Previous assignments are kept." />
            <AssignAgentPanel
              personId={person.id}
              agents={agents}
              primaryAgentId={person.primaryAgentId}
              secondaryAgentId={person.secondaryAgentId}
            />
            {assignments.length > 0 ? (
              <ul className="divide-y divide-line-soft border-t border-line-soft">
                {assignments.map((row, index) => (
                  <li key={index} className="px-4 py-2 text-[0.8125rem] sm:px-5">
                    <span className="font-medium">{row.agent_name ?? 'Unassigned'}</span>{' '}
                    <span className="text-ink-faint">
                      ({row.assignment}) from {formatDate(row.assigned_at)}
                      {row.unassigned_at ? ` until ${formatDate(row.unassigned_at)}` : ' — current'}
                      {row.reason ? ` · ${row.reason}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        ) : null}

        <RelatedRecordCards records={related} user={user} scope={{ personId: person.id }} />

        <Card>
          <CardHeader title="Record" />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                { label: 'Client reference', value: <span className="font-mono">{person.clientRef}</span> },
                { label: 'Created', value: `${formatDate(person.createdAt)}${person.createdByName ? ` by ${person.createdByName}` : ''}` },
                { label: 'Last updated', value: `${formatDate(person.updatedAt)}${person.updatedByName ? ` by ${person.updatedByName}` : ''}` },
              ]}
            />
          </div>
          {user.permissions.has('PEOPLE_DELETE') && !person.mergedIntoId ? (
            <div className="border-t border-line-soft">
              <ArchivePanel
                personId={person.id}
                isArchived={person.isArchived}
                clientRef={person.clientRef}
              />
            </div>
          ) : null}
        </Card>

        {user.permissions.has('AUDIT_LOG_VIEW') ? (
          <Card className="lg:col-span-2">
            <CardHeader
              title="Audit history"
              description="What changed, who changed it and when. Sensitive values are never stored here."
              actions={
                <ButtonLink href={`/settings/audit?entityId=${person.id}`} size="sm">
                  <Icon.document className="size-4" />
                  Full log
                </ButtonLink>
              }
            />
            {audit.length === 0 ? (
              <EmptyState title="Nothing recorded yet" className="py-6" />
            ) : (
              <ul className="divide-y divide-line-soft">
                {audit.map((entry, index) => (
                  <li key={index} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                    <span className="font-medium text-ink">{describeAuditAction(entry.action)}</span>
                    <span className="text-ink-faint">
                      {' '}
                      · {formatDateTime(entry.occurred_at)}
                      {entry.actor_email ? ` · ${entry.actor_email}` : ''}
                    </span>
                    {entry.changes ? (
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {Object.keys(entry.changes).map(describeField).join(', ')}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}

function Fact({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="text-sm text-ink">{value}</p>
      {hint ? <p className="text-[0.6875rem] text-ink-faint">{hint}</p> : null}
    </div>
  );
}
