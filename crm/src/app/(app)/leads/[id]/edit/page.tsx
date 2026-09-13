import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getLead } from '@/lib/leads.ts';
import { loadLeadFormOptions } from '@/lib/leads-form-options.ts';
import { PageHeader } from '@/components/ui/primitives.tsx';
import { LeadForm } from '../../lead-form.tsx';

export const metadata = { title: 'Edit lead' };
export const dynamic = 'force-dynamic';

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('LEADS_EDIT', `/leads/${id}/edit`);

  const { lead, options, selectedTagIds } = await readAsUser(user.id, async (db) => ({
    lead: await getLead(db, id),
    options: await loadLeadFormOptions(db, user),
    selectedTagIds: (
      await db.query<{ tag_id: string }>(
        "select tag_id from record_tags where entity_type = 'lead' and entity_id = $1",
        [id],
      )
    ).map((row) => row.tag_id),
  }));
  if (!lead) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Leads"
        title={`Edit ${lead.personName ?? 'lead'}`}
        description="Status changes are kept in the lead's history."
      />
      <LeadForm mode="edit" lead={lead} options={{ ...options, selectedTagIds }} />
    </>
  );
}
