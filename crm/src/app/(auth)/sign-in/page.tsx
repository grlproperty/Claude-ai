import { redirect } from 'next/navigation';
import { bootstrapNeeded } from '@/lib/auth.ts';
import { getCurrentUser } from '@/lib/session.ts';
import { Card } from '@/components/ui/primitives.tsx';
import { SignInForm } from './sign-in-form.tsx';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await bootstrapNeeded()) redirect('/setup');
  if (await getCurrentUser()) redirect('/');

  const { next } = await searchParams;

  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold">Sign in</h1>
      <p className="mt-1 mb-5 text-[0.8125rem] text-ink-soft">
        Use your Garden Route Lifestyle Property company email address.
      </p>
      <SignInForm next={next ?? '/'} />
    </Card>
  );
}
