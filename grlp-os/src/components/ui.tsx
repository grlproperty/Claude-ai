import { formatDuration } from '../lib/format';

export function Card({
  title,
  eyebrow,
  count,
  children,
  tone = 'neutral',
}: {
  title: string;
  eyebrow?: string;
  count?: number;
  children: React.ReactNode;
  tone?: 'neutral' | 'attention' | 'urgent';
}) {
  const accent =
    tone === 'urgent' ? 'before:bg-maroon' : tone === 'attention' ? 'before:bg-signal-attention' : 'before:bg-line';

  return (
    <section
      className={`card relative overflow-hidden p-5 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[''] ${accent}`}
    >
      <header className="mb-3.5 flex items-baseline justify-between gap-3">
        <div>
          {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
          <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
        </div>
        {count != null ? <span className="text-lg font-semibold tabular-nums text-ink-soft">{count}</span> : null}
      </header>
      {children}
    </section>
  );
}

/** The empty state matters: it must say what to do, not just that there is nothing. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-ink-muted">{children}</p>;
}

export function Row({
  title,
  detail,
  meta,
  tone,
}: {
  title: string;
  detail?: string;
  meta?: string;
  tone?: 'urgent' | 'attention' | 'calm';
}) {
  const dot = tone === 'urgent' ? 'bg-maroon' : tone === 'attention' ? 'bg-signal-attention' : 'bg-signal-calm';
  return (
    <li className="flex gap-3 border-b border-line/70 py-2.5 last:border-0 last:pb-0">
      {tone ? <span className={`mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" /> : null}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{title}</p>
        {detail ? <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-soft">{detail}</p> : null}
        {meta ? <p className="mt-1 text-xs text-ink-muted">{meta}</p> : null}
      </div>
    </li>
  );
}

export function Metric({ label, minutes, emphasis }: { label: string; minutes: number; emphasis?: boolean }) {
  return (
    <div>
      <p className="text-micro uppercase tracking-[0.12em] text-ink-muted">{label}</p>
      <p className={`mt-1 tabular-nums ${emphasis ? 'text-2xl font-bold text-maroon' : 'text-lg font-semibold'}`}>
        {formatDuration(minutes)}
      </p>
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-md border-l-[3px] px-4 py-3 text-sm leading-relaxed ${
        tone === 'warn' ? 'border-maroon bg-maroon-50 text-ink' : 'border-line bg-surface text-ink-soft'
      }`}
    >
      {children}
    </div>
  );
}
