import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listTemplates } from '@/lib/templates.ts';
import { TEMPLATE_CATEGORIES, labelOf } from '@/lib/domain.ts';
import { Badge, ButtonLink, Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { Alert, EmptyState } from '@/components/ui/feedback.tsx';
import { TemplatePreview } from '../forms.tsx';

export const metadata = { title: 'Wording' };
export const dynamic = 'force-dynamic';

const SAVED_MESSAGES: Record<string, string> = {
  created: 'Template added.',
  updated: 'Template saved.',
};

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requirePermissionOrRedirect('COMMUNICATION_VIEW', '/communications/templates');
  const { saved } = await searchParams;

  const templates = await readAsUser(user.id, (db) => listTemplates(db, { activeOnly: false }));
  const canEdit = user.permissions.has('SETTINGS_ADMIN');

  const byCategory = new Map<string, typeof templates>();
  for (const template of templates) {
    const existing = byCategory.get(template.category) ?? [];
    existing.push(template);
    byCategory.set(template.category, existing);
  }

  return (
    <>
      <PageHeader
        eyebrow="Communications"
        title="Wording you can reuse"
        description="Fills in from the record in front of you. You then send it yourself."
        actions={
          canEdit ? (
            <ButtonLink href="/communications/templates/new" tone="primary">
              Add wording
            </ButtonLink>
          ) : null
        }
      />

      {saved && SAVED_MESSAGES[saved] ? (
        <Alert tone="ok" className="mb-4">
          {SAVED_MESSAGES[saved]}
        </Alert>
      ) : null}

      <Alert tone="neutral" title="Using a template is not sending" className="mb-4">
        Choosing wording fills in the client&rsquo;s details and hands you the text. Sending it is
        something you do from WhatsApp or your own email. Anything the record cannot fill in stays
        visible as a placeholder so you can see it before you send.
      </Alert>

      {templates.length === 0 ? (
        <Card>
          <EmptyState title="No wording saved yet" className="py-10" />
        </Card>
      ) : (
        <div className="space-y-4">
          {[...byCategory.entries()].map(([category, group]) => (
            <Card key={category}>
              <CardHeader title={labelOf(TEMPLATE_CATEGORIES, category)} />
              <ul className="divide-y divide-line-soft">
                {group.map((template) => (
                  <li key={template.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 sm:px-5">
                      <span className="text-sm font-medium text-ink">{template.name}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge>{template.channel === 'any' ? 'Any channel' : template.channel}</Badge>
                        {canEdit ? (
                          <ButtonLink
                            href={`/communications/templates/${template.id}/edit`}
                            size="sm"
                          >
                            Edit
                          </ButtonLink>
                        ) : null}
                      </span>
                    </div>
                    <TemplatePreview template={template} />
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
