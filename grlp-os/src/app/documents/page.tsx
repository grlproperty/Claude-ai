import { requireUser } from '../../server/session';
import { prisma } from '../../server/db';
import { dropboxConfig } from '../../integrations/dropbox';
import { stagesFor, documentsForStage, ALL_DOCUMENTS, type Process } from '../../domain/master-documents';
import { Shell } from '../../components/shell';
import { Card, Notice } from '../../components/ui';

export const dynamic = 'force-dynamic';

const COMPLETER_LABEL: Record<string, string> = {
  AGENT: 'Agent',
  RENTALS: 'Rentals',
  ACCOUNTS: 'Accounts',
  SELLER: 'Seller',
  BUYER: 'Purchaser',
  LANDLORD: 'Landlord',
  TENANT: 'Tenant',
  CONVEYANCER: 'Conveyancer',
  AI: 'The system',
};

/**
 * GRLP's sales and rentals processes, A to Z, with the state of each master
 * document: imported or not, wording approved or not. The gates shown are the
 * agency's own — the four "signed off by superior" points in the rentals
 * checklist, and the sales after-sale sign-off.
 */
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ process?: string }> }) {
  const user = await requireUser();
  const { process: requested } = await searchParams;
  const process: Process = requested === 'RENTALS' ? 'RENTALS' : 'SALES';

  const templates = await prisma.template.findMany({
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  const byKey = new Map(templates.map((t) => [t.key, t]));
  const dropboxConnected = dropboxConfig() != null;

  const stages = stagesFor(process);
  const catalogued = ALL_DOCUMENTS.filter((d) => d.process === process);
  const imported = catalogued.filter((d) =>
    templates.some((t) => t.key === d.key || t.key.startsWith(`${d.key}.`)),
  ).length;
  const approved = templates.filter((t) => t.versions[0]?.approvedAt).length;

  return (
    <Shell
      user={user}
      current="/documents"
      title={process === 'SALES' ? 'Sales process' : 'Rentals process'}
      lede={`${catalogued.length} documents across ${stages.length} stages, taken from GRLP's own checklists. ${imported} have a master copy in the library; ${approved} have approved wording.`}
      action={
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1 shadow-card">
          {(['SALES', 'RENTALS'] as const).map((p) => (
            <a
              key={p}
              href={`/documents?process=${p}`}
              className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                p === process ? 'bg-maroon text-white' : 'text-ink-soft hover:text-maroon'
              }`}
            >
              {p === 'SALES' ? 'Sales' : 'Rentals'}
            </a>
          ))}
        </div>
      }
    >
      {!dropboxConnected ? (
        <div className="mb-6">
          <Notice tone="warn">
            <strong className="font-semibold">Dropbox is not connected</strong>, so master copies cannot be imported
            automatically. The process below is GRLP&rsquo;s own, transcribed from the master checklists, and the
            catalogue is ready — but the wording of each document has to come from Dropbox. Set{' '}
            <span className="font-mono text-xs">DROPBOX_APP_KEY</span>,{' '}
            <span className="font-mono text-xs">DROPBOX_APP_SECRET</span> and{' '}
            <span className="font-mono text-xs">DROPBOX_REFRESH_TOKEN</span>, then run{' '}
            <span className="font-mono text-xs">npm run import:masters</span>.
          </Notice>
        </div>
      ) : null}

      <div className="space-y-5">
        {stages.map((stage, index) => {
          const docs = documentsForStage(stage.key);
          return (
            <Card
              key={stage.key}
              title={stage.name}
              eyebrow={`Stage ${index + 1} of ${stages.length}`}
              count={docs.length}
              tone={stage.gate ? 'attention' : 'neutral'}
            >
              <p className="mb-4 text-[0.8125rem] leading-relaxed text-ink-soft">{stage.purpose}</p>

              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-micro uppercase tracking-[0.12em] text-ink-muted">
                      <th className="px-1 pb-2 font-semibold">Document</th>
                      <th className="px-1 pb-2 font-semibold">Completed by</th>
                      <th className="px-1 pb-2 font-semibold">Required</th>
                      <th className="px-1 pb-2 font-semibold">Master copy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc) => {
                      const variants = doc.variants ?? [];
                      const found = variants.length
                        ? templates.filter((t) => t.key.startsWith(`${doc.key}.`))
                        : [byKey.get(doc.key)].filter(Boolean);
                      const version = found[0]?.versions[0];
                      const isApproved = Boolean(version?.approvedAt);

                      return (
                        <tr key={doc.key} className="border-b border-line/70 last:border-0 align-top">
                          <td className="px-1 py-2.5">
                            <span className="font-medium">{doc.name}</span>
                            {variants.length ? (
                              <span className="ml-1.5 text-xs text-ink-muted">
                                ({variants.length} variants: {variants.join(', ')})
                              </span>
                            ) : null}
                            {doc.notes ? (
                              <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-soft">{doc.notes}</p>
                            ) : null}
                          </td>
                          <td className="px-1 py-2.5 text-ink-soft">
                            {COMPLETER_LABEL[doc.completedBy] ?? doc.completedBy}
                            {doc.aiPopulates ? <span className="ml-1.5 text-xs text-signal-calm">· prepared</span> : null}
                          </td>
                          <td className="px-1 py-2.5 text-ink-soft">{doc.required ? 'Yes' : 'If applicable'}</td>
                          <td className="px-1 py-2.5">
                            {!found.length ? (
                              <span className="text-micro uppercase tracking-[0.12em] text-ink-muted">Not imported</span>
                            ) : isApproved ? (
                              <span className="text-micro uppercase tracking-[0.12em] text-signal-calm">
                                Approved v{version?.version}
                              </span>
                            ) : (
                              <span className="text-micro uppercase tracking-[0.12em] text-maroon">
                                Imported, not approved
                              </span>
                            )}
                            {found.length > 1 ? (
                              <span className="ml-1.5 text-xs text-ink-muted">{found.length} variants</span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {stage.gate ? (
                <div className="mt-4">
                  <Notice tone="warn">
                    <strong className="font-semibold">{stage.gate.label}.</strong> Until this is signed, the system will
                    not treat the stage as passed — it blocks {stage.gate.blocksWhat}.
                  </Notice>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div className="mt-6">
        <Notice>
          Master copies are read from Dropbox and never written back — they are edited where GRLP already edits them.
          Imported wording is always <strong className="font-semibold">unapproved</strong> until an authorised person
          approves it, so importing a document does not put it into circulation.
        </Notice>
      </div>
    </Shell>
  );
}
