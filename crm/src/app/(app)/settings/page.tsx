import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requireUserOrRedirect } from '@/lib/guard.ts';
import { ROLE_LABELS } from '@/lib/permissions.ts';
import { formatDateTime } from '@/lib/format.ts';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { DescriptionList } from '@/components/ui/table.tsx';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

/**
 * Settings (spec 8, 10, 103, 107).
 *
 * Everybody sees their own account here. The office sections behind it
 * each need their own permission, and each page checks it again on the
 * server: what is hidden from this list is also refused if reached by
 * typing the address (spec 9).
 */
export default async function SettingsPage() {
  const user = await requireUserOrRedirect();

  const account = await readAsUser(user.id, (db) =>
    db.one<{
      email: string;
      full_name: string;
      display_name: string | null;
      job_title: string | null;
      last_login_at: Date | null;
      password_set_at: Date | null;
      role_codes: string[] | null;
    }>(
      `select u.email, u.full_name, u.display_name, u.job_title,
              u.last_login_at, u.password_set_at,
              (select array_agg(r.code order by r.code)
                 from user_roles ur join roles r on r.id = ur.role_id
                where ur.user_id = u.id) as role_codes
         from users u where u.id = $1`,
      [user.id],
    ),
  );

  const sections = [
    {
      href: '/settings/users',
      title: 'People who use the CRM',
      description:
        'Invite somebody, change what they may do, suspend an account. Nobody is ever deleted.',
      permission: 'USERS_ADMIN' as const,
    },
    {
      href: '/settings/business',
      title: 'Business values',
      description:
        'Rates, thresholds and how long a check stays current. Changing one here needs no deployment.',
      permission: 'SETTINGS_ADMIN' as const,
    },
    {
      href: '/settings/tags',
      title: 'Tags',
      description: 'What the office labels records with. Retired rather than deleted.',
      permission: 'SETTINGS_ADMIN' as const,
    },
    {
      href: '/commissions/rules',
      title: 'Commission terms',
      description: "What GRLP charges, and how it is worked out.",
      permission: 'SETTINGS_ADMIN' as const,
    },
    {
      href: '/settings/system',
      title: 'System health and backups',
      description:
        'What is connected, what is not, and the office’s own written answer on backups.',
      permission: 'SETTINGS_ADMIN' as const,
    },
  ].filter((section) => user.permissions.has(section.permission));

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Your own account, and — if you administer them — the office's."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Your account" />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                { label: 'Name', value: account.full_name },
                { label: 'Shown as', value: account.display_name },
                { label: 'Email', value: account.email, span: true },
                { label: 'Job title', value: account.job_title },
                {
                  label: 'Roles',
                  value: (account.role_codes ?? [])
                    .map((code) => ROLE_LABELS[code as keyof typeof ROLE_LABELS] ?? code)
                    .join(', '),
                },
                {
                  label: 'Last signed in',
                  value: account.last_login_at ? formatDateTime(account.last_login_at) : 'Never',
                },
                {
                  label: 'Password set',
                  value: account.password_set_at
                    ? formatDateTime(account.password_set_at)
                    : 'Not yet',
                },
              ]}
            />
          </div>
          <div className="border-t border-line-soft p-4 sm:p-5">
            <p className="text-[0.8125rem] text-ink-soft">
              Your password is stored only as a one-way hash, so nobody — including management —
              can read it. To change it, sign out and use the link on the sign-in page.
            </p>
          </div>
        </Card>

        {sections.length > 0 ? (
          <Card>
            <CardHeader
              title="The office"
              description="Each of these is checked again on the server."
            />
            <ul className="divide-y divide-line-soft">
              {sections.map((section) => (
                <li key={section.href} className="p-4 sm:p-5">
                  <Link href={section.href} className="block hover:text-brand">
                    <span className="text-[0.8125rem] font-medium text-ink">{section.title}</span>
                    <p className="text-[0.8125rem] text-ink-soft">{section.description}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card>
            <CardHeader title="The office" />
            <div className="p-4 sm:p-5">
              <p className="text-[0.8125rem] text-ink-soft">
                You do not administer office settings. <Badge>Nothing to show</Badge>
              </p>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
