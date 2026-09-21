import { requireUser } from '../server/session';
import { dailyBrief, prepareEverything } from '../server/executive';
import { recoveredToday } from '../server/executor';
import { isEmpty } from '../server/snapshot';
import { prisma } from '../server/db';
import { Shell } from '../components/shell';
import { Card, Empty, Metric, Notice, Row } from '../components/ui';
import { formatDuration } from '../lib/format';

export const dynamic = 'force-dynamic';

/**
 * The Command Centre (§8, §9, §46).
 *
 * It answers five questions in one screen: what needs me, what does not,
 * what should I focus on, what is at risk, and what has already been taken off
 * my plate. Everything else is a click away.
 */
export default async function CommandCentre() {
  const user = await requireUser();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [brief, prepared, empty, recovered, doneToday] = await Promise.all([
    dailyBrief(user.id),
    prepareEverything(user.id),
    isEmpty(),
    // The headline figure comes from work actually carried out, never from the plan.
    recoveredToday(user.id),
    prisma.aiAction.findMany({
      where: { status: 'COMPLETED', finishedAt: { gte: startOfDay } },
      orderBy: { finishedAt: 'desc' },
      take: 8,
    }),
  ]);

  return (
    <Shell
      user={user}
      current="/"
      title={brief.greeting}
      lede={brief.recommendation}
      action={
        <div className="flex items-end gap-6 rounded-lg border border-line bg-surface px-5 py-3 shadow-card">
          <Metric label="Recovered today" minutes={recovered} emphasis />
          <Metric label="Ready to remove" minutes={prepared.available.recoveredMinutes} />
          <Metric label="Needs you" minutes={prepared.ceoMinutesRequired} />
        </div>
      }
    >
      {empty ? (
        <div className="mb-6">
          <Notice tone="warn">
            <strong className="font-semibold">No operational records yet.</strong> The team, templates and workflows are
            configured, but no clients, properties, leads or transactions have been imported. Nothing on this page is
            simulated — it will fill as real records arrive. Start by connecting a mailbox in Settings → Integrations,
            or importing your CRM export.
          </Notice>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="What needs you" eyebrow="Today" count={brief.topThree.length} tone="urgent">
            {brief.topThree.length ? (
              <ul>
                {brief.topThree.map((t, i) => (
                  <Row key={i} title={t.title} detail={t.why} tone="urgent" />
                ))}
              </ul>
            ) : (
              <Empty>Nothing requires your decision. Everything open has an owner and a next action.</Empty>
            )}
          </Card>

          <Card
            title="Prepared and waiting for approval"
            eyebrow="Requires my approval"
            count={prepared.awaitingApproval.length}
            tone="attention"
          >
            {prepared.awaitingApproval.length ? (
              <ul>
                {prepared.awaitingApproval.map((item) => (
                  <Row
                    key={item.finding.fingerprint}
                    title={item.finding.title}
                    detail={item.detail}
                    meta={`${formatDuration(item.minutesSaved)} of work already done · ${formatDuration(item.decision.estimatedMinutes)} to review`}
                    tone="attention"
                  />
                ))}
              </ul>
            ) : (
              <Empty>Nothing is waiting on your approval.</Empty>
            )}
          </Card>

          <Card title="At risk" eyebrow="Falling through the cracks" count={prepared.items.length}>
            {prepared.items.length ? (
              <ul>
                {prepared.items.slice(0, 8).map((item) => (
                  <Row
                    key={item.finding.fingerprint}
                    title={item.finding.title}
                    detail={item.finding.detail}
                    meta={item.detail}
                    tone={item.finding.severity === 'URGENT' ? 'urgent' : item.finding.severity === 'HIGH' ? 'attention' : 'calm'}
                  />
                ))}
              </ul>
            ) : (
              <Empty>
                {empty ? 'Nothing to sweep yet — no records have been imported.' : 'Nothing is falling through the cracks.'}
              </Empty>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Done today" eyebrow="AI working" count={doneToday.length}>
            {doneToday.length ? (
              <ul>
                {doneToday.map((a) => (
                  <Row key={a.id} title={a.summary} meta={`${formatDuration(a.minutesSaved)} saved`} tone="calm" />
                ))}
              </ul>
            ) : (
              <Empty>
                Nothing has been carried out yet today. The plan on <em>Prepared for you</em> lists what can run without
                you — it has not been run.
              </Empty>
            )}
          </Card>

          <Card title="Ready to run without you" eyebrow="No person needed" count={prepared.ready.length + prepared.delegated.length}>
            {prepared.ready.length || prepared.delegated.length ? (
              <ul>
                {[...prepared.ready, ...prepared.delegated].slice(0, 6).map((item) => (
                  <Row key={item.finding.fingerprint} title={item.finding.title} detail={item.detail} tone="calm" />
                ))}
              </ul>
            ) : (
              <Empty>Nothing is waiting to run.</Empty>
            )}
          </Card>

          <Card title="Today’s calendar" eyebrow="Meetings" count={brief.meetings.length}>
            {brief.meetings.length ? (
              <ul>
                {brief.meetings.map((m, i) => (
                  <Row
                    key={i}
                    title={m.title}
                    detail={m.startsAt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
                    meta={m.prepared ? 'Briefing prepared' : 'No briefing yet'}
                  />
                ))}
              </ul>
            ) : (
              <Empty>
                Nothing in the diary. A calendar is not connected — see Settings → Integrations.
              </Empty>
            )}
          </Card>

          <Card title="Your capacity" eyebrow={brief.capacity.state}>
            <p className="text-sm leading-relaxed">{brief.capacity.headline}</p>
            {brief.capacity.recommendations.length ? (
              <ul className="mt-3">
                {brief.capacity.recommendations.map((r, i) => (
                  <Row key={i} title={r.detail} meta={`Frees about ${formatDuration(r.minutesFreed)}`} />
                ))}
              </ul>
            ) : null}
            {brief.notifications.message ? (
              <p className="mt-3 text-xs text-ink-muted">{brief.notifications.message}</p>
            ) : null}
          </Card>

          <Card title="Available to remove" eyebrow="CEO hours recovered">
            <dl className="grid grid-cols-2 gap-4">
              <Metric label="AI could complete" minutes={prepared.available.aiCompletedMinutes} />
              <Metric label="Automatable" minutes={prepared.available.automatedMinutes} />
              <Metric label="To delegate" minutes={prepared.available.delegatedMinutes} />
              <Metric label="Still yours" minutes={prepared.available.humanRequiredMinutes} />
            </dl>
            <p className="mt-4 rule pt-3 text-xs leading-relaxed text-ink-muted">
              These are estimates of what running the plan would remove. The figure at the top of the page is different:
              it counts only work that was actually carried out, and a prepared document counts for the preparation,
              never the review.
            </p>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
