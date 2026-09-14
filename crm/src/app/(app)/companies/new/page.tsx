import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listAgents } from '@/lib/people/queries.ts';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { CompanyForm } from '../forms.tsx';

export const metadata = { title: 'Add an entity' };
export const dynamic = 'force-dynamic';

export default async function NewCompanyPage() {
  const user = await requirePermissionOrRedirect('PEOPLE_CREATE', '/companies/new');
  const agents = await readAsUser(user.id, (db) =>
    user.permissions.has('DATA_VIEW_ALL') ? listAgents(db) : Promise.resolve([]),
  );

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Add a company, trust or other entity"
        description="Its own record, with its own people behind it."
      />
      <Card>
        <CardHeader title="The entity" />
        <CompanyForm agents={agents} />
      </Card>
    </>
  );
}
