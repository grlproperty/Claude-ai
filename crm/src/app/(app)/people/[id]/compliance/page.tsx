import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getPerson } from '@/lib/people/queries.ts';
import {
  listDoNotContact,
  listEvidence,
  listPermissions,
  permissionHistory,
  preflightAllChannels,
} from '@/lib/compliance.ts';
import {
  DNC_CHANNELS,
  DNC_SOURCES,
  EVIDENCE_TYPES,
  LAWFUL_BASES,
  PERMISSION_CHANNELS,
  PERMISSION_PURPOSES,
  PERMISSION_STATUSES,
  PREFLIGHT_STATUSES,
  labelOf,
  permissionChannelOptions,
  preflightTone,
  statusTone,
} from '@/lib/domain.ts';
import { formatDate, formatDateTime } from '@/lib/format.ts';
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import {
  DoNotContactForm,
  EvidenceForm,
  PermissionForm,
  ReleaseDoNotContactForm,
} from '../../../compliance/forms.tsx';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('COMPLIANCE_VIEW', `/people/${id}/compliance`);
  const person = await readAsUser(user.id, (db) => getPerson(db, id));
  return { title: person ? `Compliance · ${person.fullName}` : 'Compliance' };
}

export default async function PersonCompliancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('COMPLIANCE_VIEW', `/people/${id}/compliance`);

  const data = await readAsUser(user.id, async (db) => {
    const person = await getPerson(db, id);
    if (!person) return null;
    return {
      person,
      permissions: await listPermissions(db, id),
      evidence: await listEvidence(db, id),
      history: await permissionHistory(db, id),
      dnc: await listDoNotContact(db, { personId: id, state: 'all' }),
      verdicts: await preflightAllChannels(db, id),
    };
  });
  if (!data) notFound();

  const { person, permissions, evidence, history, dnc, verdicts } = data;
  const canRecord = user.permissions.has('COMPLIANCE_CREATE');
  const canEdit = user.permissions.has('COMPLIANCE_EDIT');
  const activeStops = dnc.filter((entry) => !entry.releasedAt);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href={`/people/${person.id}`}>
            <span className="font-mono">{person.clientRef}</span> · {person.fullName}
          </Link>
        }
        title="Compliance"
        description="What they said we may do, what backs it up, and what has changed."
        actions={<ButtonLink href={`/people/${person.id}`}>Back to the profile</ButtonLink>}
      />

      {activeStops.length > 0 ? (
        <Alert tone="stop" title="This person has asked us to stop" className="mb-4">
          {activeStops
            .map(
              (entry) =>
                `${labelOf(DNC_CHANNELS, entry.channel)} — ${labelOf(DNC_SOURCES, entry.source)}${entry.reason ? `: ${entry.reason}` : ''}`,
            )
            .join('. ')}
        </Alert>
      ) : null}

      {/* The verdict per channel, which is what someone actually needs to know. */}
      <Card className="mb-4">
        <CardHeader
          title="May we contact them?"
          description="For direct marketing. Worked out by the database, so a missing permission can never read as clear."
        />
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
          {permissionChannelOptions.map((option) => {
            const verdict = verdicts[option.value];
            return (
              <div key={option.value} className="rounded-lg border border-line-soft p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{option.label}</span>
                  <Badge tone={preflightTone(verdict.status)}>
                    {PREFLIGHT_STATUSES[verdict.status]}
                  </Badge>
                </div>
                <ul className="mt-1 text-[0.6875rem] text-ink-faint">
                  {verdict.reasons.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="What they have told us" />
          {permissions.length === 0 ? (
            <EmptyState
              title="Nothing recorded"
              description="Until something is recorded, direct marketing to this person is a guess."
              className="py-6"
            />
          ) : (
            <ul className="divide-y divide-line-soft">
              {permissions.map((permission) => (
                <li key={permission.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-medium text-ink">
                      {labelOf(PERMISSION_CHANNELS, permission.channel)}
                    </span>
                    <span className="text-ink-soft">
                      {labelOf(PERMISSION_PURPOSES, permission.purpose)}
                    </span>
                    <Badge tone={statusTone(permission.status)}>
                      {labelOf(PERMISSION_STATUSES, permission.status)}
                    </Badge>
                  </div>
                  <p className="text-[0.6875rem] text-ink-faint">
                    {permission.lawfulBasis
                      ? labelOf(LAWFUL_BASES, permission.lawfulBasis)
                      : 'No basis recorded'}
                    {permission.grantedAt ? ` · granted ${formatDate(permission.grantedAt)}` : ''}
                    {permission.withdrawnAt
                      ? ` · withdrawn ${formatDate(permission.withdrawnAt)}`
                      : ''}
                  </p>
                  <p className="text-[0.6875rem] text-ink-faint">
                    {permission.evidenceSummary ? (
                      `Backed by ${permission.evidenceSummary}`
                    ) : (
                      <span className="text-warn">Nothing kept to back this up</span>
                    )}
                  </p>
                  {permission.note ? (
                    <p className="text-[0.8125rem] text-ink-soft">{permission.note}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canRecord ? (
            <div className="border-t border-line-soft">
              <PermissionForm
                personId={person.id}
                evidence={evidence}
                existing={permissions}
                canEdit={canEdit}
              />
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="What backs it up"
            description="The signed form, the reply, the web submission."
          />
          {evidence.length === 0 ? (
            <EmptyState title="Nothing kept yet" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {evidence.map((item) => (
                <li key={item.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <span className="font-medium text-ink">
                    {labelOf(EVIDENCE_TYPES, item.evidenceType)}
                  </span>
                  {item.reference ? <span className="text-ink-soft"> — {item.reference}</span> : null}
                  <p className="text-[0.6875rem] text-ink-faint">
                    {formatDate(item.capturedAt)}
                    {item.createdByName ? ` · recorded by ${item.createdByName}` : ''}
                  </p>
                  {item.notes ? (
                    <p className="text-[0.8125rem] text-ink-soft">{item.notes}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canRecord ? (
            <div className="border-t border-line-soft">
              <EvidenceForm personId={person.id} />
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Do not contact"
            description="Never deleted. Releasing one needs a reason."
          />
          {dnc.length === 0 ? (
            <EmptyState title="They have not asked us to stop" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {dnc.map((entry) => (
                <li key={entry.id} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <Badge tone={entry.releasedAt ? 'neutral' : 'stop'}>
                    {entry.releasedAt ? 'Released' : labelOf(DNC_CHANNELS, entry.channel)}
                  </Badge>{' '}
                  <span className="text-ink-soft">{labelOf(DNC_SOURCES, entry.source)}</span>
                  <p className="text-[0.6875rem] text-ink-faint">
                    {formatDate(entry.addedAt)}
                    {entry.addedByName ? ` · ${entry.addedByName}` : ''}
                    {entry.reason ? ` — ${entry.reason}` : ''}
                  </p>
                  {entry.releasedAt ? (
                    <p className="text-[0.6875rem] text-ink-faint">
                      Released {formatDate(entry.releasedAt)}
                      {entry.releasedByName ? ` by ${entry.releasedByName}` : ''}
                      {entry.releaseReason ? ` — ${entry.releaseReason}` : ''}
                    </p>
                  ) : canEdit ? (
                    <ReleaseDoNotContactForm
                      entryId={entry.id}
                      rowVersion={entry.rowVersion}
                      label={person.fullName}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canRecord ? (
            <div className="border-t border-line-soft">
              <DoNotContactForm personId={person.id} personName={person.fullName} />
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="What has changed"
            description="Kept forever, and nobody can alter it — not even Management."
          />
          {history.length === 0 ? (
            <EmptyState title="Nothing has changed yet" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {history.map((entry, index) => (
                <li key={index} className="px-4 py-2.5 text-[0.8125rem] sm:px-5">
                  <span className="font-medium text-ink">
                    {labelOf(PERMISSION_CHANNELS, entry.channel)} ·{' '}
                    {labelOf(PERMISSION_PURPOSES, entry.purpose)}
                  </span>
                  <p className="text-[0.6875rem] text-ink-faint">
                    {entry.oldStatus
                      ? `${labelOf(PERMISSION_STATUSES, entry.oldStatus)} → `
                      : 'First recorded as '}
                    {labelOf(PERMISSION_STATUSES, entry.newStatus)} ·{' '}
                    {formatDateTime(entry.changedAt)}
                    {entry.changedByName ? ` · ${entry.changedByName}` : ''}
                  </p>
                  {entry.reason ? (
                    <p className="text-[0.8125rem] text-ink-soft">&ldquo;{entry.reason}&rdquo;</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
