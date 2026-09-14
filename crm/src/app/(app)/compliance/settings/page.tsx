import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listSettings } from '@/lib/settings.ts';
import { formatDate } from '@/lib/format.ts';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { ComplianceSettingForm } from '../forms.tsx';

export const metadata = { title: 'Compliance settings' };
export const dynamic = 'force-dynamic';

const KINDS: Record<string, 'number' | 'money' | 'boolean'> = {
  'ncc.cost_per_number': 'money',
  'ncc.result_valid_days': 'number',
  'compliance.require_evidence': 'boolean',
};

export default async function ComplianceSettingsPage() {
  const user = await requirePermissionOrRedirect('SETTINGS_ADMIN', '/compliance/settings');
  const settings = await readAsUser(user.id, (db) => listSettings(db, 'Compliance'));

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Compliance settings"
        description="Business values the office sets, not constants buried in the software."
      />

      <Alert tone="neutral" className="mb-4">
        Changing the cost per number does not rewrite what an existing batch cost. Each batch keeps
        the price it was created at.
      </Alert>

      <Card>
        <CardHeader title="Settings" />
        {settings.length === 0 ? (
          <EmptyState title="No compliance settings found" className="py-8" />
        ) : (
          settings.map((setting) => (
            <div key={setting.key}>
              <ComplianceSettingForm
                settingKey={setting.key}
                label={setting.label}
                description={setting.description}
                value={setting.value}
                kind={KINDS[setting.key] ?? 'number'}
              />
              <p className="px-4 pb-3 text-[0.6875rem] text-ink-faint sm:px-5">
                <span className="font-mono">{setting.key}</span> · last changed{' '}
                {formatDate(setting.updatedAt)}
                {setting.updatedByName ? ` by ${setting.updatedByName}` : ''}
              </p>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
