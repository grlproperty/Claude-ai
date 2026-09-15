import { requireUser } from '../../server/session';
import { decisionInbox } from '../../server/executive';
import { delegationCandidates } from '../../server/decisions';
import { Shell } from '../../components/shell';
import { Card, Empty, Notice } from '../../components/ui';
import { formatZar } from '../../lib/format';
import { DecideForm } from './decide-form';

export const dynamic = 'force-dynamic';

interface Option { key: string; label: string; consequence: string; financialImpactZar?: number; reversible: boolean }

/**
 * Pre-selects the option the system recommended, so taking the advice is one
 * press. It matches on the label rather than assuming an order, and selects
 * nothing when the recommendation is not one of the options — a wrong
 * pre-selection is worse than none.
 */
function recommendedOptionKey(options: Option[], recommendation: string): string | null {
  const wanted = recommendation.trim().toLowerCase();
  const hit = options.find((o) => o.label.trim().toLowerCase() === wanted);
  return hit?.key ?? null;
}

/**
 * The decision inbox (§25). Each card carries the research already done, so a
 * decision takes seconds rather than an investigation.
 */
export default async function DecisionsPage() {
  const user = await requireUser();
  const [decisions, people] = await Promise.all([decisionInbox(user.id), delegationCandidates(user.id)]);
  const choices = people.map((p) => ({ id: p.id, name: p.name, department: p.department }));

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

                <DecideForm
                  escalationId={d.id}
                  options={options.map((o) => ({ key: o.key, label: o.label, reversible: o.reversible }))}
                  people={choices}
                  recommendedOptionKey={recommendedOptionKey(options, d.recommendation)}
                />
              </article>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
