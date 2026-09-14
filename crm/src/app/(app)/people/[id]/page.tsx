import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readAsUser, withUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getPerson, listAgents } from '@/lib/people/queries.ts';
import { findPersonDuplicates } from '@/lib/people/duplicates.ts';
import {
  ADDRESS_TYPES,
  BUSINESS_AREAS,
  COMMUNICATION_CHANNELS,
  CONTACT_TYPES,
  DNC_CHANNELS,
  DNC_SOURCES,
  PREFLIGHT_STATUSES,
  RELATIONSHIP_TYPES,
  clientTypeSummary,
  labelOf,
  statusTone,
  permissionChannelOptions,
  preflightTone,
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
import { listDoNotContact, listPermissions, preflightAllChannels } from '@/lib/compliance.ts';
import { COMPANY_ROLES, ENTITY_TYPES, companiesForPerson } from '@/lib/companies.ts';
import { FICA_STATUSES, ficaFor } from '@/lib/fica.ts';
import { Icon } from '@/components/icons.tsx';
import { isFavourite, noteViewed, tagsFor } from '@/lib/workspace.ts';
import { listTags } from '@/lib/people/queries.ts';
import { FavouriteButton, TagPanel } from '../../workspace.tsx';
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

    // Whether they may be contacted at all (spec 52 to 57). The verdicts come
    // from the database so an agent who cannot see a do-not-contact entry is
    // still told not to contact them.
    const compliance = user.permissions.has('COMPLIANCE_VIEW')
      ? {
          permissions: await listPermissions(db, person.id),
          stops: await listDoNotContact(db, { personId: person.id, state: 'active' }),
          verdicts: await preflightAllChannels(db, person.id),
        }
      : null;

    // Which entities they act for, and their FICA file (spec 31, 33).
    const companies = await companiesForPerson(db, person.id);
    const fica = user.permissions.has('FICA_VIEW')
      ? await ficaFor(db, { personId: person.id })
      : null;

    return {
      person, duplicates, assignments, audit, others, agents, related, compliance,
      companies, fica,
      starred: await isFavourite(db, user.id, 'person', person.id),
      tags: await tagsFor(db, 'person', person.id),
      allTags: await listTags(db),
    };
  });

  if (!data) notFound();
  const {
    person, duplicates, assignments, audit, others, agents, related, compliance,
    companies, fica, starred, tags, allTags,
  } = data;

  // Their own list of what they last opened (spec 93). Written in its own
  // transaction because the page itself is read only, and never allowed to
  // be the reason a profile fails to render.
  await withUser(user.id, (db) =>
    noteViewed(db, user.id, 'person', person.id, `${person.fullName} (${person.clientRef})`),
  );

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

      {compliance && compliance.stops.length > 0 ? (
        <Alert tone="stop" title="Do not contact this person" className="mb-4">
          {compliance.stops
            .map(
              (entry) =>
                `${labelOf(DNC_CHANNELS, entry.channel)} — ${labelOf(DNC_SOURCES, entry.source)}${entry.reason ? `: ${entry.reason}` : ''}`,
            )
            .join('. ')}{' '}
          <Link href={`/people/${person.id}/compliance`} className="underline">
            See the detail
          </Link>
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
          <div className="flex flex-wrap gap-2">
            <FavouriteButton
              entityType="person"
              entityId={person.id}
              path={`/people/${person.id}`}
              isFavourite={starred}
            />
            {canEdit ? (
              <ButtonLink href={`/people/${person.id}/edit`} tone="primary">
                Edit
              </ButtonLink>
            ) : null}
          </div>
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
                ? `${formatDate(person.lastContactAt)} · ${labelOf(COMMUNICATION_CHANNELS, person.lastContactMethod)}`
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
            stoppedChannels={compliance?.stops.map((entry) => entry.channel) ?? []}
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

        {compliance ? (
          <Card>
            <CardHeader
              title="May we contact them?"
              description="For direct marketing."
              actions={
                <ButtonLink href={`/people/${person.id}/compliance`} size="sm">
                  Manage
                </ButtonLink>
              }
            />
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 sm:p-5">
              {permissionChannelOptions.map((option) => {
                const verdict = compliance.verdicts[option.value];
                return (
                  <div key={option.value} className="rounded-lg border border-line-soft p-2">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
                      {option.label}
                    </p>
                    <Badge tone={preflightTone(verdict.status)}>
                      {PREFLIGHT_STATUSES[verdict.status]}
                    </Badge>
                  </div>
                );
              })}
            </div>
            {compliance.permissions.length === 0 ? (
              <p className="px-4 pb-4 text-[0.6875rem] text-ink-faint sm:px-5">
                Nothing has been recorded. Until it is, marketing to this person is a guess.
              </p>
            ) : null}
          </Card>
        ) : null}

        {companies.length > 0 ? (
          <Card>
            <CardHeader
              title="Entities they act for"
              description="A company, trust or close corporation they are behind."
            />
            <ul className="divide-y divide-line-soft">
              {companies.map((entry) => (
                <li key={entry.linkId} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <Link
                    href={`/companies/${entry.companyId}`}
                    className="font-medium text-ink hover:text-brand"
                  >
                    {entry.registeredName}
                  </Link>{' '}
                  {entry.isPrimaryContact ? <Badge tone="brand">Main contact</Badge> : null}
                  {entry.resignedOn ? <Badge>Resigned</Badge> : null}
                  <p className="text-[0.6875rem] text-ink-faint">
                    {labelOf(COMPANY_ROLES, entry.role)} ·{' '}
                    {labelOf(ENTITY_TYPES, entry.entityType)} ·{' '}
                    <span className="font-mono">{entry.companyRef}</span>
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {user.permissions.has('FICA_VIEW') ? (
          <Card>
            <CardHeader
              title="FICA"
              description="Recorded by a person. The CRM verifies nothing."
              actions={
                fica ? (
                  <ButtonLink href={`/fica/${fica.id}`} size="sm">
                    Open the file
                  </ButtonLink>
                ) : user.permissions.has('FICA_CREATE') ? (
                  <ButtonLink href={`/fica/new?personId=${person.id}`} size="sm">
                    Open a file
                  </ButtonLink>
                ) : null
              }
            />
            <div className="p-4 sm:p-5">
              {fica ? (
                <>
                  <Badge tone={statusTone(fica.status)}>
                    {labelOf(FICA_STATUSES, fica.status)}
                  </Badge>
                  {fica.isExpired ? <Badge tone="stop">Needs refreshing</Badge> : null}
                  <p className="mt-1.5 text-[0.6875rem] text-ink-faint">
                    {fica.verifiedByName
                      ? `Verified by ${fica.verifiedByName} on ${formatDate(fica.verifiedAt)}`
                      : 'Not verified by anybody yet'}
                    {fica.expiresOn ? ` · needs redoing by ${formatDate(fica.expiresOn)}` : ''}
                  </p>
                </>
              ) : (
                <p className="text-[0.8125rem] text-ink-soft">
                  No FICA file has been opened for this client.
                </p>
              )}
            </div>
          </Card>
        ) : null}

        <RelatedRecordCards records={related} user={user} scope={{ personId: person.id }} />

        {/* ---------------- Tags ---------------- */}
        <Card>
          <CardHeader
            title="Tags"
            description="The office's own labels. Retired tags stay on records that carry them."
          />
          <div className="px-4 pt-4 sm:px-5 sm:pt-5">
            {tags.length === 0 ? (
              <p className="text-[0.8125rem] text-ink-soft">No tags on this record.</p>
            ) : (
              <p className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <Badge key={tag.id} tone={tag.colour as 'neutral'}>
                    {tag.name}
                  </Badge>
                ))}
              </p>
            )}
          </div>
          {canEdit && allTags.length > 0 ? (
            <TagPanel
              entityType="person"
              entityId={person.id}
              path={`/people/${person.id}`}
              tags={allTags}
              selected={tags.map((tag) => tag.id)}
            />
          ) : null}
        </Card>

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
