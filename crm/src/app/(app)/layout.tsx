import { readAsUser } from '@/lib/db.ts';
import { getAgentFilter } from '@/lib/session.ts';
import { initialsOf, requireUserOrRedirect } from '@/lib/guard.ts';
import { visibleNavItems, QUICK_ADD } from '@/lib/navigation.ts';
import { ROLE_LABELS, type RoleCode } from '@/lib/permissions.ts';
import { AppShell, type AgentOption } from '@/components/app-shell.tsx';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserOrRedirect();

  const canSeeEveryone = user.permissions.has('DATA_VIEW_ALL');
  const selectedAgentId = await getAgentFilter(user);

  const { agents, unread } = await readAsUser(user.id, async (db) => {
    const agentRows = canSeeEveryone
      ? await db.query<{ id: string; name: string }>(
          `select u.id, coalesce(u.display_name, u.full_name) as name
             from users u
            where u.status = 'active'
            order by u.full_name`,
        )
      : [];
    const unreadRow = await db.maybeOne<{ n: number }>(
      'select count(*)::int as n from notifications where user_id = $1 and read_at is null',
      [user.id],
    );
    return { agents: agentRows, unread: unreadRow?.n ?? 0 };
  });

  const primaryRole = (user.roles[0] ?? 'LIMITED') as RoleCode;

  return (
    <AppShell
      user={{
        fullName: user.fullName,
        displayName: user.displayName,
        email: user.email,
        roleLabel: ROLE_LABELS[primaryRole] ?? primaryRole,
        initials: initialsOf(user.fullName),
      }}
      navItems={visibleNavItems(user.permissions)}
      quickAdd={QUICK_ADD.filter((item) => user.permissions.has(item.permission))}
      agents={canSeeEveryone ? (agents as AgentOption[]) : null}
      selectedAgentId={canSeeEveryone ? selectedAgentId : null}
      unreadCount={unread}
    >
      {children}
    </AppShell>
  );
}
