import Link from 'next/link';
import { readAsUser } from '@/lib/db.ts';
import { requireUserOrRedirect } from '@/lib/guard.ts';
import { NOTIFICATION_KINDS, listNotifications } from '@/lib/notifications.ts';
import { labelOf } from '@/lib/domain.ts';
import { formatDateTime, pluralise } from '@/lib/format.ts';
import { Badge, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { MarkAllReadButton, MarkReadButton } from './forms.tsx';

export const metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

/**
 * Notifications (spec 90).
 *
 * In-app only. The CRM sends no email, no SMS and no push, so nothing
 * here left the building; it waited for the person to come back.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const user = await requireUserOrRedirect();
  const unreadOnly = view !== 'all';

  const notifications = await readAsUser(user.id, (db) =>
    listNotifications(db, user.id, { unreadOnly }),
  );
  const unread = notifications.filter((entry) => entry.readAt === null).length;

  return (
    <>
      <PageHeader
        eyebrow="Notifications"
        title={unreadOnly ? 'What you have not read' : 'Everything'}
        description="Waiting for you inside the CRM."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={unreadOnly ? '/notifications?view=all' : '/notifications'}
              className="tap inline-flex items-center rounded-lg border border-line px-3 text-sm font-medium"
            >
              {unreadOnly ? 'Show everything' : 'Show unread only'}
            </Link>
            {unread > 0 ? <MarkAllReadButton /> : null}
          </div>
        }
      />

      {/* Spec 6, 90, 143: said once, at the top, where it matters. */}
      <Alert tone="neutral" title="Nothing here was sent to you" className="mb-4">
        The CRM has no mail server and no messaging integration. A notification is a note that
        waits inside the CRM until you next open it — never an email, an SMS or a push.
      </Alert>

      <Card>
        <CardHeader title={pluralise(notifications.length, 'notification')} />
        {notifications.length === 0 ? (
          <EmptyState
            title={unreadOnly ? 'Nothing unread' : 'Nothing yet'}
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {notifications.map((entry) => (
              <li
                key={entry.id}
                className={`flex flex-wrap items-start gap-3 p-4 sm:p-5 ${
                  entry.readAt === null ? 'bg-paper' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    {entry.href ? (
                      <Link
                        href={entry.href}
                        className="text-[0.8125rem] font-medium text-ink hover:text-brand"
                      >
                        {entry.title}
                      </Link>
                    ) : (
                      <span className="text-[0.8125rem] font-medium text-ink">{entry.title}</span>
                    )}
                    {entry.readAt === null ? <Badge tone="brand">Unread</Badge> : null}
                    <Badge>{labelOf(NOTIFICATION_KINDS, entry.kind)}</Badge>
                  </div>
                  {entry.body ? (
                    <p className="mt-0.5 text-[0.8125rem] text-ink-soft">{entry.body}</p>
                  ) : null}
                  <p className="text-[0.6875rem] text-ink-faint">
                    {formatDateTime(entry.createdAt)}
                    {entry.readAt ? ` · read ${formatDateTime(entry.readAt)}` : ''}
                  </p>
                </div>
                {entry.readAt === null ? <MarkReadButton id={entry.id} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
