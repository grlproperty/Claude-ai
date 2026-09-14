import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listSettings } from '@/lib/settings.ts';
import { formatDateTime } from '@/lib/format.ts';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { SettingRow } from '../forms.tsx';

export const metadata = { title: 'Business values' };
export const dynamic = 'force-dynamic';

/** Which settings are which kind, so a number never becomes a string. */
function kindOf(key: string, value: unknown): 'text' | 'number' | 'boolean' | 'json' {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value) || (value !== null && typeof value === 'object')) return 'json';
  void key;
  return 'text';
}

/**
 * Business values (spec 103).
 *
 * Anything the office might reasonably want to change — a rate, a
 * threshold, how long a check stays current — lives here rather than in
 * code, so changing it does not need a deployment. Every change is
 * recorded in the audit log with who made it.
 */
export default async function BusinessSettingsPage() {
  const user = await requirePermissionOrRedirect('SETTINGS_ADMIN', '/settings/business');
  const settings = await readAsUser(user.id, (db) => listSettings(db));

  // Grouped by the office's own categories, in a stable order.
  const groups = new Map<string, typeof settings>();
  for (const setting of settings) {
    const bucket = groups.get(setting.category) ?? [];
    bucket.push(setting);
    groups.set(setting.category, bucket);
  }

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/settings">Settings</Link>}
        title="Business values"
        description="Changed here, in force immediately, and recorded in the audit log."
      />

      <Alert tone="neutral" title="Changing a value never rewrites the past" className="mb-4">
        These affect what happens next. A commission already worked out keeps its own figures, a
        FICA file already verified keeps its own expiry, and an import already run stays exactly as
        it ran.
      </Alert>

      {settings.length === 0 ? (
        <Card>
          <EmptyState title="Nothing configurable yet" className="py-10" />
        </Card>
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([category, rows]) => (
            <Card key={category}>
              <CardHeader title={category} />
              <ul className="divide-y divide-line-soft">
                {rows.map((setting) => (
                  <li key={setting.key}>
                    <SettingRow
                      settingKey={setting.key}
                      label={setting.label}
                      description={setting.description}
                      value={setting.value}
                      kind={kindOf(setting.key, setting.value)}
                    />
                    <p className="px-4 pb-3 text-[0.625rem] text-ink-faint sm:px-5">
                      Last changed {formatDateTime(setting.updatedAt)}
                      {setting.updatedByName ? ` by ${setting.updatedByName}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
