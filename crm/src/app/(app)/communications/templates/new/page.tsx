import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { TemplateForm } from '../../forms.tsx';

export const metadata = { title: 'Add wording' };
export const dynamic = 'force-dynamic';

export default async function NewTemplatePage() {
  await requirePermissionOrRedirect('SETTINGS_ADMIN', '/communications/templates/new');
  return (
    <>
      <PageHeader
        eyebrow="Communications"
        title="Add wording"
        description="Something the office sends often enough to be worth keeping."
      />
      <Card>
        <CardHeader title="The wording" />
        <TemplateForm />
      </Card>
    </>
  );
}
