import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listAllTags } from '@/lib/workspace.ts';
import { pluralise } from '@/lib/format.ts';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { TagActiveButton, TagForm } from '../forms.tsx';

export const metadata = { title: 'Tags' };
export const dynamic = 'force-dynamic';

/**
 * Tags (spec 87, 104).
 *
 * The office's own labels. A tag is retired, never deleted: it stays on
 * every record that already carries it, so a past decision to label
 * something is not quietly erased.
 */
export default async function TagsPage() {
  const user = await requirePermissionOrRedirect('SETTINGS_ADMIN', '/settings/tags');
  const tags = await readAsUser(user.id, listAllTags);

  const live = tags.filter((tag) => tag.isActive);
  const retired = tags.filter((tag) => !tag.isActive);

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/settings">Settings</Link>}
        title="Tags"
        description="What the office labels people and properties with."
      />

      <Alert tone="neutral" title="A tag is retired, never deleted" className="mb-4">
        Retiring one stops it being offered on new records and leaves it on every record that
        already carries it. Somebody once decided that label applied, and the CRM does not undo
        that decision for them.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={`${pluralise(live.length, 'tag')} in use`} />
          {live.length === 0 ? (
            <EmptyState title="No tags yet" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {live.map((tag) => (
                <li key={tag.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <Badge tone={tag.colour as 'neutral'}>{tag.name}</Badge>
                    <p className="text-[0.6875rem] text-ink-faint">
                      On {pluralise(tag.useCount, 'record')}
                    </p>
                  </div>
                  <TagActiveButton
                    tagId={tag.id}
                    name={tag.name}
                    isActive
                    useCount={tag.useCount}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-line-soft">
            <TagForm />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Retired"
            description="Still on the records that carry them."
          />
          {retired.length === 0 ? (
            <EmptyState title="None retired" className="py-6" />
          ) : (
            <ul className="divide-y divide-line-soft">
              {retired.map((tag) => (
                <li key={tag.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <Badge>{tag.name}</Badge>
                    <p className="text-[0.6875rem] text-ink-faint">
                      Still on {pluralise(tag.useCount, 'record')}
                    </p>
                  </div>
                  <TagActiveButton
                    tagId={tag.id}
                    name={tag.name}
                    isActive={false}
                    useCount={tag.useCount}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
