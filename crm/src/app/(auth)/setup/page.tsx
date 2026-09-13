import { redirect } from 'next/navigation';
import { bootstrapNeeded, companyDomainMessage } from '@/lib/auth.ts';
import { Card } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { SetupForm } from './setup-form.tsx';

export const metadata = { title: 'First time setup' };
export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if (!(await bootstrapNeeded())) redirect('/sign-in');

  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold">Set up the CRM</h1>
      <p className="mt-1 mb-4 text-[0.8125rem] text-ink-soft">
        No one has signed in yet. The first authorised company user becomes the Management
        account and can then invite everyone else.
      </p>
      <Alert tone="brand" className="mb-5">
        {companyDomainMessage()} This screen stops working the moment the first account exists.
      </Alert>
      <SetupForm />
    </Card>
  );
}
