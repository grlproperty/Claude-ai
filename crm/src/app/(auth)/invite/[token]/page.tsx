import Link from 'next/link';
import { loadInvitation } from '@/lib/auth.ts';
import { Card } from '@/components/ui/primitives.tsx';
import { Alert } from '@/components/ui/feedback.tsx';
import { AcceptInvitationForm } from './accept-form.tsx';

export const metadata = { title: 'Accept your invitation' };
export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = await loadInvitation(token);

  if (!invitation) {
    return (
      <Card className="p-6">
        <h1 className="text-lg font-semibold">This invitation is no longer valid</h1>
        <Alert tone="warn" className="mt-4">
          The link has expired, has already been used, or was withdrawn. Please ask management
          to send you a new invitation.
        </Alert>
        <Link href="/sign-in" className="mt-4 inline-block text-sm text-brand underline">
          Back to sign in
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h1 className="text-lg font-semibold">Welcome, {invitation.fullName.split(' ')[0]}</h1>
      <p className="mt-1 mb-5 text-[0.8125rem] text-ink-soft">
        You have been invited to the GRLP CRM as <strong>{invitation.roleName}</strong> using{' '}
        <strong>{invitation.email}</strong>. Choose a password to finish setting up your account.
      </p>
      <AcceptInvitationForm token={token} />
    </Card>
  );
}
