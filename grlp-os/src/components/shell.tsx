import Link from 'next/link';
import { Wordmark } from './brand';
import type { Principal } from '../server/permissions';
import { can } from '../server/permissions';

const NAV = [
  { href: '/', label: 'Command Centre', permission: null },
  { href: '/decisions', label: 'Decisions', permission: null },
  { href: '/work', label: 'Work', permission: null },
  { href: '/documents', label: 'Documents', permission: null },
  { href: '/staff', label: 'Staff', permission: 'view:department' as const },
  { href: '/settings', label: 'Settings', permission: null },
];

export function Shell({
  user,
  current,
  title,
  lede,
  action,
  children,
}: {
  user: Principal;
  current: string;
  title: string;
  lede?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const items = NAV.filter((n) => !n.permission || can(user, n.permission));

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-maroon text-white">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-6 px-5 py-4 sm:px-8">
          <Link href="/" className="text-white/95 transition hover:text-white">
            <Wordmark />
          </Link>
          <div className="text-right">
            <p className="text-sm font-medium leading-tight">{user.name}</p>
            <p className="text-micro uppercase tracking-[0.12em] text-white/70">
              {user.isCeo ? 'Chief Executive' : user.role.replace(/_/g, ' ').toLowerCase()}
            </p>
          </div>
        </div>

        <nav className="mx-auto max-w-[1240px] px-5 sm:px-8">
          <ul className="-mb-px flex gap-1 overflow-x-auto">
            {items.map((n) => {
              const active = n.href === '/' ? current === '/' : current.startsWith(n.href);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    className={`inline-block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition ${
                      active
                        ? 'border-white font-semibold text-white'
                        : 'border-transparent text-white/70 hover:border-white/40 hover:text-white'
                    }`}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8 sm:py-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">{title}</h1>
            {lede ? <p className="mt-1.5 max-w-measure text-[0.9375rem] leading-relaxed text-ink-soft">{lede}</p> : null}
          </div>
          {action}
        </div>
        {children}
      </main>

      <footer className="mx-auto max-w-[1240px] px-5 pb-10 sm:px-8">
        <p className="rule pt-4 text-xs text-ink-muted">
          GRLP Command Centre · AI Executive Administration &amp; Real Estate Operations Assistant
        </p>
      </footer>
    </div>
  );
}
