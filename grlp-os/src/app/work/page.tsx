import { revalidatePath } from 'next/cache';
import { requireUser } from '../../server/session';
import { prepareEverything } from '../../server/executive';
import { executePlan } from '../../server/executor';
import { Shell } from '../../components/shell';
import { Card, Empty, Row } from '../../components/ui';
import { formatDuration } from '../../lib/format';

export const dynamic = 'force-dynamic';

/**
 * "Prepare everything for me" (§10) shown as a worked result: what was handled,
 * what was delegated to whom and why, what is waiting, and what is left.
 */
/**
 * Runs the plan. This is the only place work is actually carried out, and what
 * it can and cannot do is reported back honestly — a task created is real, a
 * message unsent because no mailbox is connected is said plainly.
 */
async function runPlan() {
  'use server';
  const user = await requireUser();
  const prepared = await prepareEverything(user.id);
  await executePlan(prepared.ready, user.id);
  revalidatePath('/work');
  revalidatePath('/');
}

export default async function WorkPage() {
  const user = await requireUser();
  const prepared = await prepareEverything(user.id);

  const groups = [
    { title: 'Ready to run — nobody needed', items: prepared.ready, tone: 'calm' as const },
    { title: 'Delegated', items: prepared.delegated, tone: 'calm' as const },
    { title: 'Prepared, waiting for approval', items: prepared.awaitingApproval, tone: 'attention' as const },
    { title: 'Needs you', items: prepared.needsCeo, tone: 'urgent' as const },
    { title: 'Blocked — no owner could be justified', items: prepared.blocked, tone: 'attention' as const },
  ];

  return (
    <Shell
      user={user}
      current="/work"
      title="Prepared for you"
      lede={prepared.headline}
      action={
        prepared.ready.length ? (
          <form action={runPlan}>
            <button
              type="submit"
              className="rounded bg-maroon px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-maroon-700"
            >
              Prepare everything for me
            </button>
          </form>
        ) : null
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map((g: { title: string; items: typeof prepared.items; tone: 'calm' | 'urgent' | 'attention' }) => (
          <Card key={g.title} title={g.title} count={g.items.length} tone={g.tone === 'urgent' ? 'urgent' : g.tone === 'attention' ? 'attention' : 'neutral'}>
            {g.items.length ? (
              <ul>
                {g.items.map((item: (typeof prepared.items)[number]) => (
                  <Row
                    key={item.finding.fingerprint}
                    title={item.finding.title}
                    detail={item.detail}
                    meta={
                      item.minutesSaved
                        ? `${formatDuration(item.minutesSaved)} of work removed · ${item.decision.requiredApproval.replace(/_/g, ' ').toLowerCase()}`
                        : item.decision.requiredApproval.replace(/_/g, ' ').toLowerCase()
                    }
                    tone={g.tone}
                  />
                ))}
              </ul>
            ) : (
              <Empty>Nothing in this group.</Empty>
            )}
          </Card>
        ))}
      </div>
    </Shell>
  );
}
