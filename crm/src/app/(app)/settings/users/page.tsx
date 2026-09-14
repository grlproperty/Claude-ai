import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listPendingInvitations, listUsers, rolePermissionMatrix } from '@/lib/users.ts';
import { ROLE_LABELS } from '@/lib/permissions.ts';
import { formatDateTime, pluralise } from '@/lib/format.ts';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { Table, TableScroll, Td, Th, Tr } from '@/components/ui/table.tsx';
import { InviteForm, RevokeInvitationButton, UserPanel } from '../forms.tsx';

export const metadata = { title: 'People who use the CRM' };
export const dynamic = 'force-dynamic';

/**
 * User administration (spec 7, 8, 9, 10).
 *
 * A private CRM with no public registration. The first authorised company
 * user became Management; after that, people are invited, and each one
 * sets their own password from a single-use link.
 *
 * Nobody is ever deleted. A suspended or disabled account cannot sign in,
 * and every session it holds is revoked at once, but the person's name
 * stays on everything they did (spec 104).
 */
export default async function UsersPage() {
  const user = await requirePermissionOrRedirect('USERS_ADMIN', '/settings/users');

  const data = await readAsUser(user.id, async (db) => ({
    users: await listUsers(db),
    invitations: await listPendingInvitations(db),
    matrix: await rolePermissionMatrix(db),
  }));

  const { users, invitations, matrix } = data;
  const active = users.filter((entry) => entry.status === 'active');

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/settings">Settings</Link>}
        title="People who use the CRM"
        description={`${pluralise(active.length, 'active user')} of ${users.length} accounts.`}
      />

      <Alert tone="neutral" title="Nobody can register, and nobody is ever deleted" className="mb-4">
        This is a private internal CRM. There is no sign-up page: somebody here invites a
        colleague, and that colleague sets their own password from a link that works once.
        Suspending an account stops it signing in immediately and leaves every record they touched
        attributed to them.
      </Alert>

      <div className="grid gap-4">
        <Card>
          <CardHeader
            title="Invite a colleague"
            description="Produces a link. The CRM cannot send it — there is no mail server."
          />
          <InviteForm />
        </Card>

        {invitations.length > 0 ? (
          <Card>
            <CardHeader
              title={`${pluralise(invitations.length, 'invitation')} outstanding`}
              description="Each works once and lasts seven days."
            />
            <ul className="divide-y divide-line-soft">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center gap-3 p-4 sm:p-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.8125rem] font-medium text-ink">
                      {invitation.fullName}{' '}
                      <Badge>{invitation.roleLabel}</Badge>
                      {invitation.isExpired ? <Badge tone="stop">Expired</Badge> : null}
                    </p>
                    <p className="text-[0.6875rem] text-ink-faint">
                      {invitation.email} · invited{' '}
                      {formatDateTime(invitation.createdAt)}
                      {invitation.invitedByName ? ` by ${invitation.invitedByName}` : ''} · expires{' '}
                      {formatDateTime(invitation.expiresAt)}
                    </p>
                  </div>
                  <RevokeInvitationButton id={invitation.id} email={invitation.email} />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <CardHeader title={pluralise(users.length, 'account')} />
          {users.length === 0 ? (
            <EmptyState title="No accounts" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {users.map((entry) => (
                <li key={entry.id}>
                  <UserPanel user={entry} isSelf={entry.id === user.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="What each role allows"
            description="The database holds this same list and enforces it independently."
          />
          <TableScroll>
            <Table className="min-w-[40rem]">
              <thead>
                <tr>
                  <Th>Permission</Th>
                  {matrix.roles.map((role) => (
                    <Th key={role} align="center">
                      {ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.byPermission.map((row) => (
                  <Tr key={row.permission}>
                    <Td className="font-mono text-[0.6875rem]">{row.permission}</Td>
                    {matrix.roles.map((role) => (
                      <Td key={role} align="center" className="text-[0.8125rem]">
                        {row.held.includes(role) ? (
                          <span className="text-ok" aria-label="allowed">
                            ✓
                          </span>
                        ) : (
                          <span className="text-ink-faint" aria-label="not allowed">
                            —
                          </span>
                        )}
                      </Td>
                    ))}
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableScroll>
        </Card>
      </div>
    </>
  );
}
