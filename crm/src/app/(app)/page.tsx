import { requireUserOrRedirect } from '@/lib/guard.ts';
import { PageHeader, Card } from '@/components/ui/primitives.tsx';

export default async function DashboardPage() {
  const user = await requireUserOrRedirect();
  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title={`Good day, ${user.displayName}`}
        description="Your dashboard is built in a later stage."
      />
      <Card className="p-5 text-sm text-ink-soft">Signed in as {user.email}.</Card>
    </>
  );
}
