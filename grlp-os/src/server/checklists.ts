import { prisma } from './db';
import { documentsForStage, stagesFor, type MasterDocument, type Process, type ProcessStage } from '../domain/master-documents';

/**
 * Builds a file's checklist from GRLP's own process (§18).
 *
 * The checklist is not a generic list of good ideas: it is the agency's rentals
 * document checklist and after-sale checklist, with the same gates. A stage with
 * a gate cannot be reported complete until every required document is in and the
 * named person has signed it off.
 */

export interface ChecklistItem {
  documentKey: string;
  label: string;
  stageKey: string;
  completedBy: MasterDocument['completedBy'];
  required: boolean;
  aiPopulates: boolean;
  /** Present once the document exists on the file. */
  documentId: string | null;
  status: 'outstanding' | 'requested' | 'received' | 'approved' | 'signed';
  notes?: string;
}

export interface StageStatus {
  stage: ProcessStage;
  items: ChecklistItem[];
  requiredCount: number;
  completeCount: number;
  /** True when every required document is in. The gate still needs signing. */
  documentsComplete: boolean;
  gatePassed: boolean;
  blocks: string | null;
}

export interface FileChecklist {
  process: Process;
  subjectLabel: string;
  stages: StageStatus[];
  /** The first stage that is not finished — where the file actually is. */
  currentStage: ProcessStage | null;
  outstandingRequired: ChecklistItem[];
  /** What the system can chase or prepare without a person. */
  actionableByAi: ChecklistItem[];
  summary: string;
}

/** Maps a stored document's status onto the checklist's vocabulary. */
function statusOf(status: string | undefined): ChecklistItem['status'] {
  switch (status) {
    case 'SIGNED':
    case 'FILED':
      return 'signed';
    case 'APPROVED':
      return 'approved';
    case 'AWAITING_SIGNATURE':
    case 'IN_REVIEW':
    case 'UPLOADED':
    case 'CLASSIFIED':
    case 'EXTRACTED':
    case 'GENERATED':
      return 'received';
    default:
      return 'outstanding';
  }
}

const SATISFIED: ReadonlySet<ChecklistItem['status']> = new Set(['received', 'approved', 'signed']);

export interface BuildOptions {
  process: Process;
  subjectLabel: string;
  /** Documents already on the file, keyed by catalogue key. */
  present: Map<string, { id: string; status: string }>;
  /** Stage keys a superior has signed off. */
  gatesPassed: Set<string>;
}

export function buildChecklist({ process, subjectLabel, present, gatesPassed }: BuildOptions): FileChecklist {
  const stages: StageStatus[] = stagesFor(process).map((stage) => {
    const items: ChecklistItem[] = documentsForStage(stage.key).map((doc) => {
      const found = present.get(doc.key);
      return {
        documentKey: doc.key,
        label: doc.name,
        stageKey: stage.key,
        completedBy: doc.completedBy,
        required: doc.required,
        aiPopulates: doc.aiPopulates,
        documentId: found?.id ?? null,
        status: statusOf(found?.status),
        notes: doc.notes,
      };
    });

    const required = items.filter((i) => i.required);
    const complete = required.filter((i) => SATISFIED.has(i.status));
    const documentsComplete = required.length > 0 && complete.length === required.length;
    const gatePassed = stage.gate ? gatesPassed.has(stage.key) : documentsComplete;

    return {
      stage,
      items,
      requiredCount: required.length,
      completeCount: complete.length,
      documentsComplete,
      gatePassed,
      blocks:
        stage.gate && !gatePassed
          ? documentsComplete
            ? `Waiting on sign-off. This blocks ${stage.gate.blocksWhat}.`
            : `${required.length - complete.length} required document(s) outstanding. This blocks ${stage.gate.blocksWhat}.`
          : null,
    };
  });

  const currentStage = stages.find((s) => !s.gatePassed)?.stage ?? null;
  const outstandingRequired = stages.flatMap((s) => s.items.filter((i) => i.required && !SATISFIED.has(i.status)));
  const actionableByAi = outstandingRequired.filter((i) => i.aiPopulates || i.completedBy !== 'AI');

  return {
    process,
    subjectLabel,
    stages,
    currentStage,
    outstandingRequired,
    actionableByAi: outstandingRequired.filter((i) => i.aiPopulates),
    summary: currentStage
      ? `${subjectLabel} is at ${currentStage.name.toLowerCase()}. ${outstandingRequired.length} required document${outstandingRequired.length === 1 ? '' : 's'} outstanding.`
      : `${subjectLabel} is complete — every stage signed off.`,
  };
}

/** Builds the checklist for a real transaction from what is on the file. */
export async function checklistForTransaction(transactionId: string): Promise<FileChecklist> {
  const transaction = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId },
    include: { property: true, documents: true },
  });

  const present = new Map<string, { id: string; status: string }>();
  for (const doc of transaction.documents) {
    const key = catalogueKeyFor(doc.kind, doc.title);
    if (key) present.set(key, { id: doc.id, status: doc.status });
  }

  return buildChecklist({
    process: 'SALES',
    subjectLabel: transaction.property.reference,
    present,
    gatesPassed: new Set(),
  });
}

/**
 * Best-effort mapping from a stored document to a catalogue entry. Returns null
 * rather than guessing, so an unrecognised file does not silently satisfy a
 * required item.
 */
export function catalogueKeyFor(kind: string, title: string): string | null {
  const t = title.toLowerCase();
  if (kind === 'OTP') return 'otp';
  if (kind === 'MANDATE') return t.includes('permission') ? 'permission_to_list' : 'sole_mandate';
  if (kind === 'LEASE') return 'lease_agreement';
  if (kind === 'FICA') return t.includes('tenant') ? 'tenant_fica' : t.includes('landlord') ? 'landlord_fica' : t.includes('purchaser') || t.includes('buyer') ? 'buyer_fica' : 'seller_fica';
  if (kind === 'INSPECTION') return t.includes('post') ? 'post_inspection' : 'pre_inspection';
  if (kind === 'COMPLIANCE_CERTIFICATE') {
    if (t.includes('gas')) return 'coc_gas';
    if (t.includes('beetle')) return 'coc_beetle';
    if (t.includes('fence')) return 'coc_electric_fence';
    if (t.includes('electric')) return 'coc_electrical';
    if (t.includes('clearance')) return 'municipal_clearance';
  }
  if (kind === 'COMMISSION') return 'commission_calculation';
  return null;
}
