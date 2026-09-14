import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getTemplate } from '@/lib/templates.ts';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { TemplateForm } from '../../../forms.tsx';

export const metadata = { title: 'Edit wording' };
export const dynamic = 'force-dynamic';

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect(
    'SETTINGS_ADMIN',
    `/communications/templates/${id}/edit`,
  );
  const template = await readAsUser(user.id, (db) => getTemplate(db, id));
  if (!template) notFound();

  return (
    <>
      <PageHeader eyebrow="Communications" title={template.name} description="Edit the wording." />
      <Card>
        <CardHeader title="The wording" />
        <TemplateForm mode="edit" template={template} />
      </Card>
    </>
  );
}
