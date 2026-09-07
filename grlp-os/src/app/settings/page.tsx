import { requireUser } from '../../server/session';
import { checkAll } from '../../integrations/registry';
import { agentAvailability } from '../../agents/registry';
import { prisma } from '../../server/db';
import { Shell } from '../../components/shell';
import { Card, Notice } from '../../components/ui';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  CONNECTED: 'Connected',
  CREDENTIALS_MISSING: 'Partly configured',
  NOT_CONFIGURED: 'Not connected',
  ERROR: 'Error',
};

/**
 * Settings (§40, §50). The integration list is the system's honesty page: it
 * says what is actually connected, what each one would enable, and what still
 * works without it.
 */
export default async function SettingsPage() {
  const user = await requireUser();
  // A live credential check only runs where credentials exist, so an
  // unconfigured system makes no outbound calls when this page loads.
  const [integrations, templates] = await Promise.all([
    checkAll(process.env),
    prisma.template.findMany({ include: { versions: { orderBy: { version: 'desc' }, include: { fields: true } } } }),
  ]);
  const agents = agentAvailability();

  return (
    <Shell
      user={user}
      current="/settings"
      title="Settings"
      lede="What is connected, what is not, and what each one changes. Nothing here is simulated."
    >
      <div className="space-y-5">
        <Card title="Integrations" count={integrations.length}>
          <ul className="space-y-4">
            {integrations.map((i) => (
              <li key={i.key} className="rule pt-4 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">{i.name}</h3>
                  <span
                    className={`text-micro font-semibold uppercase tracking-[0.12em] ${
                      i.status === 'CONNECTED' ? 'text-signal-calm' : i.status === 'ERROR' ? 'text-maroon' : 'text-ink-muted'
                    }`}
                  >
                    {STATUS_LABEL[i.status]}
                  </span>
                </div>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-soft">{i.detail}</p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed">
                  <span className="text-ink-muted">Would enable:</span> {i.capabilityWhenConnected}
                </p>
                {i.status !== 'CONNECTED' ? (
                  <p className="mt-1 text-[0.8125rem] leading-relaxed">
                    <span className="text-ink-muted">Without it:</span> {i.degradedBehaviour}
                  </p>
                ) : null}
                {i.missingEnv.length ? (
                  <p className="mt-1.5 font-mono text-xs text-ink-muted">{i.missingEnv.join('  ')}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Agents" count={agents.length}>
          <ul className="space-y-2.5">
            {agents.map((a) => (
              <li key={a.key} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/70 pb-2.5 last:border-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-[0.8125rem] leading-relaxed text-ink-soft">{a.description}</p>
                </div>
                <span className={`text-micro uppercase tracking-[0.12em] ${a.available ? 'text-signal-calm' : 'text-ink-muted'}`}>
                  {a.available ? 'Available' : 'Needs API key'}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 rule pt-3 text-xs leading-relaxed text-ink-muted">
            Most agents need no language model. Routing, triage, validation, document population, the comparable
            analysis and the risk sweep are rules and arithmetic — the model only writes prose.
          </p>
        </Card>

        <Card title="Templates" count={templates.length}>
          <ul className="space-y-3">
            {templates.map((t) => {
              const latest = t.versions[0];
              const approved = Boolean(latest?.approvedAt);
              return (
                <li key={t.id} className="border-b border-line/70 pb-3 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">{t.name}</h3>
                    <span className={`text-micro font-semibold uppercase tracking-[0.12em] ${approved ? 'text-signal-calm' : 'text-maroon'}`}>
                      {approved ? `v${latest?.version} approved` : 'Wording not approved'}
                    </span>
                  </div>
                  <p className="mt-1 text-[0.8125rem] text-ink-soft">
                    {latest?.fields.length ?? 0} fields defined · signed by {latest?.signatoryRoles.join(', ') || 'nobody yet'}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="mt-4">
            <Notice tone="warn">
              Template field definitions and validation rules are ready to use. The <strong>wording is not</strong>:
              it ships deliberately unapproved, and the document engine refuses to produce anything from an unapproved
              version. Paste in GRLP’s approved mandate and offer-to-purchase wording, keeping the placeholders, and
              have an authorised person approve it.
            </Notice>
          </div>
        </Card>
      </div>
    </Shell>
  );
}
