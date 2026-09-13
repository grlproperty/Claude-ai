'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from './icons.tsx';
import { Wordmark } from './brand.tsx';
import { cn } from '@/lib/cn.ts';
import type { NavItem, QuickAddItem } from '@/lib/navigation.ts';

export interface ShellUser {
  fullName: string;
  displayName: string;
  email: string;
  roleLabel: string;
  initials: string;
}

export interface AgentOption {
  id: string;
  name: string;
}

export function AppShell({
  user,
  navItems,
  quickAdd,
  agents,
  selectedAgentId,
  unreadCount,
  children,
}: {
  user: ShellUser;
  navItems: NavItem[];
  quickAdd: QuickAddItem[];
  /** Null when the signed-in user may not see other agents' records. */
  agents: AgentOption[] | null;
  selectedAgentId: string | null;
  unreadCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => setNavOpen(false), [pathname]);

  // Ctrl+K / Cmd+K jumps straight to search (spec 97).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function isActive(href: string): boolean {
    return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      {/* ---------------- Top bar ---------------- */}
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
          <button
            type="button"
            className="tap grid w-11 place-items-center rounded-lg text-ink-soft hover:bg-paper lg:hidden"
            aria-label={navOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? <Icon.close /> : <Icon.menu />}
          </button>

          <Link href="/" className="min-w-0 shrink rounded-md lg:w-56 lg:shrink-0" aria-label="GRLP CRM home">
            <Wordmark />
          </Link>

          {/* Global search (spec 17, 84) */}
          <form
            action="/search"
            className="relative ml-auto hidden min-w-0 flex-1 items-center sm:flex lg:ml-0 lg:max-w-xl"
            role="search"
          >
            <Icon.search className="pointer-events-none absolute left-3 size-4 text-ink-faint" />
            <input
              ref={searchRef}
              type="search"
              name="q"
              placeholder="Search people, properties, references…"
              aria-label="Search the CRM"
              className="h-10 w-full rounded-lg border border-line bg-paper pl-9 pr-14 text-sm text-ink placeholder:text-ink-faint focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
            <kbd className="pointer-events-none absolute right-2.5 hidden rounded border border-line bg-white px-1.5 py-0.5 text-[0.625rem] font-medium text-ink-faint md:block">
              Ctrl K
            </kbd>
          </form>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:ml-2">
            <QuickAddMenu items={quickAdd} />

            <Link
              href="/notifications"
              className="tap relative grid w-11 place-items-center rounded-lg text-ink-soft hover:bg-paper"
              aria-label={
                unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'
              }
            >
              <Icon.bell />
              {unreadCount > 0 ? (
                <span className="absolute right-2 top-2 grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[0.625rem] font-semibold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              ) : null}
            </Link>

            <UserMenu user={user} />
          </div>
        </div>

        {/* Search on small screens sits on its own row so it stays usable. */}
        <form action="/search" className="relative flex px-3 pb-2.5 sm:hidden" role="search">
          <Icon.search className="pointer-events-none absolute left-6 top-2.5 size-4 text-ink-faint" />
          <input
            type="search"
            name="q"
            placeholder="Search…"
            aria-label="Search the CRM"
            className="h-10 w-full rounded-lg border border-line bg-paper pl-9 pr-3 text-sm focus:border-brand focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </form>
      </header>

      <div className="lg:flex">
        {/* ---------------- Sidebar ---------------- */}
        <nav
          id="app-nav"
          aria-label="Main"
          className={cn(
            'border-r border-line bg-white lg:sticky lg:top-14 lg:block lg:h-[calc(100dvh-3.5rem)] lg:w-56 lg:shrink-0 lg:overflow-y-auto',
            navOpen ? 'block' : 'hidden',
          )}
        >
          {agents ? (
            <div className="border-b border-line-soft p-3">
              <AgentFilter
                agents={agents}
                selectedAgentId={selectedAgentId}
                onChanged={() => router.refresh()}
              />
            </div>
          ) : null}

          <ul className="p-2 pb-8">
            {navItems.map((item) => {
              const Glyph = Icon[item.icon];
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'tap flex items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-brand-wash text-brand-dark'
                        : 'text-ink-soft hover:bg-paper hover:text-ink',
                    )}
                  >
                    <Glyph
                      className={cn('size-[1.125rem] shrink-0', active ? 'text-brand' : 'text-ink-faint')}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ---------------- Page ---------------- */}
        <main id="main" className="min-w-0 flex-1 px-3 py-5 sm:px-5 lg:px-7">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

function QuickAddMenu({ items }: { items: QuickAddItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocument(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocument);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocument);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="tap inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-white hover:bg-brand-dark"
      >
        <Icon.plus className="size-4" />
        <span className="hidden sm:inline">Add</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1.5 w-60 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className="block px-3 py-2.5 text-sm text-ink hover:bg-paper"
            >
              {item.label}
              {item.hint ? <span className="block text-xs text-ink-faint">{item.hint}</span> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocument(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocument);
    return () => document.removeEventListener('mousedown', onDocument);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="tap grid w-11 place-items-center rounded-lg hover:bg-paper"
        aria-label={`Signed in as ${user.fullName}`}
      >
        <span className="grid size-8 place-items-center rounded-full bg-ink text-[0.6875rem] font-semibold text-white">
          {user.initials}
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1.5 w-64 overflow-hidden rounded-lg border border-line bg-white shadow-lg"
        >
          <div className="border-b border-line-soft px-3 py-2.5">
            <p className="truncate text-sm font-medium text-ink">{user.fullName}</p>
            <p className="truncate text-xs text-ink-soft">{user.email}</p>
            <p className="mt-1 text-[0.6875rem] font-medium uppercase tracking-wide text-brand">
              {user.roleLabel}
            </p>
          </div>
          <Link href="/settings/profile" role="menuitem" className="block px-3 py-2.5 text-sm hover:bg-paper">
            My profile and password
          </Link>
          <form action="/sign-out" method="post">
            <button
              type="submit"
              role="menuitem"
              className="w-full px-3 py-2.5 text-left text-sm text-stop hover:bg-stop-wash"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Management's global agent selector (spec 10). It narrows the view to one
 * agent across every module; it is never what keeps an agent out of another
 * agent's records, which row level security does.
 */
function AgentFilter({
  agents,
  selectedAgentId,
  onChanged,
}: {
  agents: AgentOption[];
  selectedAgentId: string | null;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);

  return (
    <label className="block">
      <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-faint">
        Agent view
      </span>
      <select
        className="h-10 w-full rounded-lg border border-line bg-white px-2.5 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        defaultValue={selectedAgentId ?? 'all'}
        disabled={pending}
        onChange={async (event) => {
          setPending(true);
          try {
            await fetch('/api/agent-filter', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ agentId: event.target.value }),
            });
            onChanged();
          } finally {
            setPending(false);
          }
        }}
      >
        <option value="all">All agents</option>
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
    </label>
  );
}
