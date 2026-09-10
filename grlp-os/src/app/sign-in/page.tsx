import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { prisma } from '../../server/db';
import { SESSION_COOKIE, createSession, verifyPassword } from '../../server/auth';
import { currentUser } from '../../server/session';
import { Wordmark } from '../../components/brand';

export const dynamic = 'force-dynamic';

async function signIn(formData: FormData) {
  'use server';

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? null);

  // One message for both cases, so the form cannot be used to discover who works here.
  if (!user || !user.active || !ok) redirect('/sign-in?error=1');

  const { token, expiresAt } = await createSession(user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });

  redirect('/');
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentUser()) redirect('/');
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-maroon px-6 py-6 text-white">
        <div className="mx-auto max-w-[1240px]">
          <Wordmark />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <p className="eyebrow">Command Centre</p>
          <h1 className="mt-1 text-2xl font-bold">Sign in</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            AI Executive Administration &amp; Real Estate Operations Assistant.
          </p>

          <form action={signIn} className="card mt-6 space-y-4 p-6">
            {error ? (
              <p className="rounded border-l-[3px] border-maroon bg-maroon-50 px-3 py-2 text-sm">
                That email address and password did not match.
              </p>
            ) : null}

            <label className="block">
              <span className="text-micro uppercase tracking-[0.12em] text-ink-muted">Email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="username"
                className="mt-1.5 w-full rounded border border-line px-3 py-2 text-sm focus:border-maroon"
              />
            </label>

            <label className="block">
              <span className="text-micro uppercase tracking-[0.12em] text-ink-muted">Password</span>
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="mt-1.5 w-full rounded border border-line px-3 py-2 text-sm focus:border-maroon"
              />
            </label>

            <button
              type="submit"
              className="w-full rounded bg-maroon px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-maroon-700"
            >
              Sign in
            </button>
          </form>

          <p className="mt-4 text-xs leading-relaxed text-ink-muted">
            Single sign-on through Google Workspace or Microsoft 365 is the intended production path. Neither is
            connected yet — see Settings → Integrations for what each requires.
          </p>
        </div>
      </div>
    </div>
  );
}
