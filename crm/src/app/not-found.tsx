import Link from 'next/link';
import { Card } from '@/components/ui/primitives.tsx';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <Card className="p-6">
        <h1 className="text-lg font-semibold">That page could not be found</h1>
        <p className="mt-2 text-sm text-ink-soft">
          The link may be out of date, or the record may have been archived.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm text-brand underline">
          Back to the dashboard
        </Link>
      </Card>
    </div>
  );
}
