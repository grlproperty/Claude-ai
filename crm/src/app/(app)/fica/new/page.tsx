import { readAsUser } from '@/lib/db.ts';
import { requirePermissionOrRedirect } from '@/lib/guard.ts';
import { listCompanies } from '@/lib/companies.ts';
import { Card, CardHeader, PageHeader } from '@/components/ui/primitives.tsx';
import { StartFicaForm } from '../forms.tsx';

export const metadata = { title: 'Open a FICA file' };
export const dynamic = 'force-dynamic';

export default async function NewFicaPage({
  searchParams,
}: {
  searchParams: Promise<{ personId?: string; companyId?: string }>;
}) {
  const user = await requirePermissionOrRedirect('FICA_CREATE', '/fica/new');
  const defaults = await searchParams;

  const data = await readAsUser(user.id, async (db) => ({
    people: await db.query<{ id: string; label: string }>(
      `select id, first_name || ' ' || surname || ' (' || client_ref || ')' as label
         from people
        where merged_into_id is null and not is_archived
          and not exists (select 1 from fica_records f where f.person_id = people.id)
        order by surname, first_name limit 500`,
    ),
    companies: (
      await listCompanies(db, { pageSize: 100 })
    ).rows
      .filter((company) => !company.ficaStatus)
      .map((company) => ({
        id: company.id,
        label: `${company.registeredName} (${company.companyRef})`,
      })),
  }));

  return (
    <>
      <PageHeader
        eyebrow="FICA"
        title="Open a file"
        description="One file per person or per entity. Anyone who already has one is not listed."
      />
      <Card>
        <CardHeader title="Who is it about?" />
        <StartFicaForm people={data.people} companies={data.companies} defaults={defaults} />
      </Card>
    </>
  );
}
