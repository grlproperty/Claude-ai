import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listSettings } from '@/lib/settings.ts';
import { allowedImportHosts } from '@/lib/import/url.ts';
import { formatDate } from '@/lib/format.ts';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { AllowedHostsForm } from '../forms.tsx';

export const metadata = { title: 'Import settings' };
export const dynamic = 'force-dynamic';

export default async function ImportSettingsPage() {
  const user = await requirePermissionOrRedirect('SETTINGS_ADMIN', '/import/settings');

  const data = await readAsUser(user.id, async (db) => ({
    hosts: await allowedImportHosts(db),
    settings: await listSettings(db, 'Import'),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Import"
        title="Import settings"
        description="Limits and the hosts an import may fetch from."
      />

      <Card className="mb-4">
        <CardHeader
          title="Fetching from a web address"
          description="Off by default, and only ever to hosts named here."
        />
        <AllowedHostsForm hosts={data.hosts} />
      </Card>

      <Card>
        <CardHeader title="Limits" />
        <div className="divide-y divide-line-soft">
          {data.settings
            .filter((setting) => setting.key !== 'import.url_allowed_hosts')
            .map((setting) => (
              <div key={setting.key} className="p-4 sm:p-5">
                <p className="text-sm font-medium text-ink">{setting.label}</p>
                <p className="text-[0.8125rem] text-ink-soft">{setting.description}</p>
                <p className="mt-1 text-sm tabular-nums text-ink">{String(setting.value)}</p>
                <p className="text-[0.6875rem] text-ink-faint">
                  <span className="font-mono">{setting.key}</span> · last changed{' '}
                  {formatDate(setting.updatedAt)}
                  {setting.updatedByName ? ` by ${setting.updatedByName}` : ''}
                </p>
              </div>
            ))}
        </div>
        <Alert tone="neutral" className="m-4 sm:m-5">
          These two are changed in the general settings area; they are shown here so the limits
          are visible where imports are run.
        </Alert>
      </Card>
    </>
  );
}
