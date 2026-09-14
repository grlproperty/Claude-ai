import { notFound } from 'next/navigation';
import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { getCompany } from '@/lib/companies.ts';
import { listAgents } from '@/lib/people/queries.ts';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { CompanyForm } from '../../forms.tsx';

export const metadata = { title: 'Edit the entity' };
export const dynamic = 'force-dynamic';

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermissionOrRedirect('PEOPLE_EDIT', `/companies/${id}/edit`);

  const data = await readAsUser(user.id, async (db) => {
    const company = await getCompany(db, id);
    if (!company) return null;
    return {
      company,
      agents: user.permissions.has('DATA_VIEW_ALL') ? await listAgents(db) : [],
    };
  });
  if (!data) notFound();

  return (
    <>
      <PageHeader
        eyebrow={<span className="font-mono">{data.company.companyRef}</span>}
        title={data.company.registeredName}
        description="Edit the entity."
      />
      <Card>
        <CardHeader title="The entity" />
        <CompanyForm mode="edit" company={data.company} agents={data.agents} />
      </Card>
    </>
  );
}
