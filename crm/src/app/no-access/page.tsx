import Link from 'next/link';
import { Card } from '@/components/ui/primitives.tsx';

export const metadata = { title: 'No access' };

export default function NoAccessPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <Card className="p-6">
        <h1 className="text-lg font-semibold">You do not have access to that area</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Your role does not include this part of the CRM. If you need it for your work, please
          ask management to update your permissions.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-brand underline">
          Back to the dashboard
        </Link>
      </Card>
    </div>
  );
}
