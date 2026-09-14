import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { formatBytes, systemHealth } from '@/lib/health.ts';
import { listSettings } from '@/lib/settings.ts';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { DescriptionList } from '@/components/ui/table.tsx';
import { SettingRow } from '../forms.tsx';

export const metadata = { title: 'System health' };
export const dynamic = 'force-dynamic';

const STATE_TONE = {
  ok: 'ok',
  warn: 'warn',
  not_connected: 'stop',
  unknown: 'warn',
} as const;

const STATE_LABEL = {
  ok: 'Working',
  warn: 'Needs attention',
  not_connected: 'NOT CONNECTED',
  unknown: 'Unknown',
} as const;

/**
 * System health (spec 107, 115).
 *
 * Everything measured is measured from the database in front of it.
 * Everything external is listed as NOT CONNECTED, because it is: this
 * CRM has no mail server, no WhatsApp API, no portal feed, no register
 * lookup and no bank feed. Each one has its internal architecture in
 * place and no credential, and saying so is the only honest thing to do.
 *
 * Backups get the same treatment. The CRM takes none and can verify
 * none. What it can hold is the office's own written answer, clearly
 * labelled as a note somebody typed.
 */
export default async function SystemPage() {
  const user = await requirePermissionOrRedirect('SETTINGS_ADMIN', '/settings/system');

  const data = await readAsUser(user.id, async (db) => ({
    health: await systemHealth(db),
    backupSettings: (await listSettings(db, 'System')).filter((setting) =>
      setting.key.startsWith('backup.'),
    ),
  }));

  const { health, backupSettings } = data;
  const notConnected = health.checks.filter((check) => check.state === 'not_connected');
  const measured = health.checks.filter((check) => check.state !== 'not_connected');

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/settings">Settings</Link>}
        title="System health"
        description="What is working, what needs attention, and what is simply not connected."
      />

      <Alert tone="warn" title="The CRM takes no backups and cannot verify one" className="mb-4">
        There is no backup job in this application, and nothing here will ever show a green tick
        claiming a backup succeeded. Whoever runs the server takes them. Record below who that is
        and how it is done, so the answer is not lost — and understand that the answer is a note
        somebody typed, not something the CRM checked.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader title="Measured" description="Read from the database just now." />
          <ul className="divide-y divide-line-soft">
            {measured.map((check) => (
              <li key={check.name} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[0.8125rem] font-medium text-ink">{check.name}</span>
                  <Badge tone={STATE_TONE[check.state]}>{STATE_LABEL[check.state]}</Badge>
                </div>
                <p className="mt-0.5 text-[0.8125rem] text-ink-soft">{check.detail}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Not connected"
            description="Each of these has its architecture in place and no external credential. The CRM says so rather than pretending."
          />
          <ul className="divide-y divide-line-soft">
            {notConnected.map((check) => (
              <li key={check.name} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[0.8125rem] font-medium text-ink">{check.name}</span>
                  <Badge tone="stop">NOT CONNECTED</Badge>
                </div>
                <p className="mt-0.5 text-[0.8125rem] text-ink-soft">{check.detail}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="What is in the CRM" />
          <div className="p-4 sm:p-5">
            <DescriptionList
              items={[
                { label: 'People', value: String(health.counts.people) },
                { label: 'Properties', value: String(health.counts.properties) },
                { label: 'Active users', value: String(health.counts.activeUsers) },
                { label: 'Documents', value: String(health.counts.documents) },
                {
                  label: 'Audit entries',
                  value: String(health.counts.auditEntries),
                  span: true,
                },
                { label: 'PostgreSQL', value: health.database.version },
                { label: 'Database size', value: formatBytes(health.database.sizeBytes) },
                {
                  label: 'Migrations applied',
                  value: String(health.database.migrationsApplied),
                },
                { label: 'Latest migration', value: health.database.lastMigration },
                { label: 'Document storage', value: health.storage.detail, span: true },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Backups"
            description="The office's own answer, written down here because the CRM cannot check it."
          />
          <ul className="divide-y divide-line-soft">
            {backupSettings.map((setting) => (
              <li key={setting.key}>
                <SettingRow
                  settingKey={setting.key}
                  label={setting.label}
                  description={setting.description}
                  value={setting.value}
                  kind="text"
                />
              </li>
            ))}
          </ul>
          <div className="border-t border-line-soft p-4 sm:p-5">
            <p className="text-[0.8125rem] text-ink-soft">
              A backup nobody has restored is a backup nobody has. Whatever is written above,
              somebody should try restoring one before it matters.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
