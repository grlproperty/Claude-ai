import { requireUser } from '../../server/session';
import { decisionInbox } from '../../server/executive';
import { Shell } from '../../components/shell';
import { Card, Empty, Notice } from '../../components/ui';
import { formatZar } from '../../lib/format';

export const dynamic = 'force-dynamic';

interface Option { key: string; label: string; consequence: string; financialImpactZar?: number; reversible: boolean }

/**
 * The decision inbox (§25). Each card carries the research already done, so a
 * decision takes seconds rather than an investigation.
 */
export default async function DecisionsPage() {
  const user = await requireUser();
  const decisions = await decisionInbox(user.id);

  return (
    <Shell
      user={user}
      current="/decisions"
      title="Decisions"
      lede="Only matters that genuinely need your judgement. Each one arrives researched, with a recommendation."
    >
      {decisions.length === 0 ? (
        <Card title="Nothing waiting on you">
          <Empty>
            No decision is outstanding. When one is raised it will arrive here with the issue, what was already tried,
            your options and a recommendation — never as a bare problem.
          </Empty>
        </Card>
      ) : (
        <div className="space-y-5">
          {decisions.map((d) => {
            const options = (Array.isArray(d.options) ? d.options : []) as Option[];
            return (
              <article key={d.id} className="card p-6">
                <header className="mb-4">
                  <p className="eyebrow">
                    Waiting {d.waitingDays} day{d.waitingDays === 1 ? '' : 's'}
                    {d.dueAt ? ` · due ${d.dueAt.toLocaleDateString('en-ZA')}` : ''}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">{d.title}</h2>
                </header>

                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-micro uppercase tracking-[0.12em] text-ink-muted">Issue</dt>
                    <dd className="mt-1 text-sm leading-relaxed">{d.issue}</dd>
                  </div>
                  <div>
                    <dt className="text-micro uppercase tracking-[0.12em] text-ink-muted">Context</dt>
                    <dd className="mt-1 text-sm leading-relaxed">{d.context}</dd>
                  </div>
                </dl>

                {d.actionsTaken.length ? (
                  <div className="mt-4">
                    <p className="text-micro uppercase tracking-[0.12em] text-ink-muted">Already done</p>
                    <ul className="mt-1.5 space-y-1">
                      {d.actionsTaken.map((a, i) => (
                        <li key={i} className="text-sm text-ink-soft">
                          — {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {options.length ? (
                  <div className="mt-4">
                    <p className="text-micro uppercase tracking-[0.12em] text-ink-muted">Options</p>
                    <ul className="mt-1.5 space-y-1.5">
                      {options.map((o) => (
                        <li key={o.key} className="text-sm leading-relaxed">
                          <span className="font-medium">{o.label}</span> — {o.consequence}
                          {o.financialImpactZar != null ? ` (${formatZar(o.financialImpactZar)})` : ''}
                          {o.reversible ? '' : ' · not reversible'}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="mt-5">
                  <Notice tone="warn">
                    <strong className="font-semibold">Recommended:</strong> {d.recommendation}. {d.recommendationReason}
                  </Notice>
                </div>

                <p className="mt-4 text-sm font-semibold">{d.decisionRequired}</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {['Approve', 'Reject', 'Delegate', 'Request information', 'Defer'].map((label) => (
                    <button
                      key={label}
                      type="button"
                      disabled
                      title="Recording decisions is wired to the escalation record; the action endpoints are not built yet."
                      className="rounded border border-line px-3 py-1.5 text-sm text-ink-muted"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-muted">
                  These actions are not yet wired up. They are shown disabled rather than as buttons that appear to work.
                </p>
              </article>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
