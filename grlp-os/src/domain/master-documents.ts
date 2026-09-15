import type { Department, Role } from './types';

/**
 * GRLP's document catalogue and the two processes that use it (§16, §18).
 *
 * This is transcribed from GRLP's own master checklists — the rentals checklist
 * with its four "SIGNED OFF BY SUPERIOR" gates, and the after-sale checklist —
 * so the system follows the process the agency already runs rather than one
 * invented for it.
 *
 * Note what is and is not here. This file holds the *shape* of the process:
 * which document, at which stage, owned by whom, gated by what. The documents'
 * wording lives only in the database, imported from Dropbox at runtime, and
 * never in this repository.
 */

export type Process = 'SALES' | 'RENTALS';

/** Who completes the document. The AI prepares; these people are accountable. */
export type Completer = 'AGENT' | 'RENTALS' | 'ACCOUNTS' | 'SELLER' | 'BUYER' | 'LANDLORD' | 'TENANT' | 'CONVEYANCER' | 'AI';

export interface MasterDocument {
  key: string;
  /** As GRLP refers to it. */
  name: string;
  process: Process;
  stageKey: string;
  completedBy: Completer;
  department: Department;
  /** Required to pass the stage gate; optional documents do not block. */
  required: boolean;
  /** Filename fragments used to match the master copy in Dropbox. */
  matches: string[];
  /** True when the document has variants chosen by property type. */
  variants?: string[];
  /** Set when the AI can populate it from records the system already holds. */
  aiPopulates: boolean;
  notes?: string;
}

export interface ProcessStage {
  key: string;
  process: Process;
  order: number;
  name: string;
  purpose: string;
  /**
   * GRLP's own words where a gate exists. A stage with a gate cannot be passed
   * until a named person signs it off — this is the agency's rule, not ours.
   */
  gate?: { label: string; approverRole: Role; blocksWhat: string };
}

// ── sales, A to Z ──────────────────────────────────────────────────────────

export const SALES_STAGES: ProcessStage[] = [
  { key: 'sales.appraisal', process: 'SALES', order: 1, name: 'Appraisal', purpose: 'Establish what the property is worth and whether GRLP will take it on.' },
  {
    key: 'sales.mandate',
    process: 'SALES',
    order: 2,
    name: 'Mandate',
    purpose: 'Secure the written authority to market and sell.',
    gate: { label: 'Mandate signed and disclosure complete', approverRole: 'CEO', blocksWhat: 'marketing the property' },
  },
  { key: 'sales.listing', process: 'SALES', order: 3, name: 'Listing', purpose: 'Get the property to market accurately.' },
  { key: 'sales.marketing', process: 'SALES', order: 4, name: 'Marketing and viewings', purpose: 'Find the buyer and keep the seller informed.' },
  { key: 'sales.offer', process: 'SALES', order: 5, name: 'Offer', purpose: 'Reduce the agreement to writing, correctly, and get it signed.' },
  {
    key: 'sales.after_sale',
    process: 'SALES',
    order: 6,
    name: 'After sale',
    purpose: 'Assemble the complete file so transfer is not delayed.',
    gate: { label: 'After-sale checklist complete', approverRole: 'CEO', blocksWhat: 'handing the file to the conveyancer as complete' },
  },
  { key: 'sales.transfer', process: 'SALES', order: 7, name: 'Transfer', purpose: 'Clear the conditions and compliance certificates so registration can happen.' },
  { key: 'sales.registration', process: 'SALES', order: 8, name: 'Registration and commission', purpose: 'Close the transaction and get paid.' },
];

export const SALES_DOCUMENTS: MasterDocument[] = [
  // Appraisal
  { key: 'market_assessment', name: 'Market assessment (CMA)', process: 'SALES', stageKey: 'sales.appraisal', completedBy: 'AI', department: 'SALES', required: true, matches: ['market assessment', 'cma'], aiPopulates: true, notes: 'Prepared by the system; the pricing opinion is the CEO’s.' },
  { key: 'lightstone_report', name: 'Lightstone property report', process: 'SALES', stageKey: 'sales.appraisal', completedBy: 'AGENT', department: 'SALES', required: false, matches: ['lightstone'], aiPopulates: false },

  // Mandate
  { key: 'sole_mandate', name: 'Sole mandate', process: 'SALES', stageKey: 'sales.mandate', completedBy: 'AGENT', department: 'SALES', required: true, matches: ['sole mandate'], aiPopulates: true },
  { key: 'permission_to_list', name: 'Permission to list', process: 'SALES', stageKey: 'sales.mandate', completedBy: 'AGENT', department: 'SALES', required: true, matches: ['permission to list'], aiPopulates: true, notes: 'Used where the mandate is not sole.' },
  { key: 'property_disclosure', name: 'PPRA mandatory disclosure (Annexure B)', process: 'SALES', stageKey: 'sales.mandate', completedBy: 'SELLER', department: 'SALES', required: true, matches: ['annexure b', 'property disclosure', 'disclosure and info sheet'], aiPopulates: false, notes: 'The seller’s own declaration. The system requests and tracks it; it never completes it.' },
  { key: 'fixtures_fittings', name: 'Fixtures and fittings list', process: 'SALES', stageKey: 'sales.mandate', completedBy: 'SELLER', department: 'SALES', required: true, matches: ['fixtures'], aiPopulates: false },
  { key: 'seller_fica', name: 'Seller FICA', process: 'SALES', stageKey: 'sales.mandate', completedBy: 'SELLER', department: 'ACCOUNTS', required: true, matches: ['schedule 3 fica', 'schedule 4 fica', 'schedule 6 fica'], variants: ['natural person', 'legal entity', 'trust'], aiPopulates: false },

  // Listing
  { key: 'listing_sheet', name: 'Listing sheet', process: 'SALES', stageKey: 'sales.listing', completedBy: 'AGENT', department: 'SALES', required: true, matches: ['sales sheet', 'listing sheet'], aiPopulates: true },

  // Offer
  { key: 'otp', name: 'Offer to purchase', process: 'SALES', stageKey: 'sales.offer', completedBy: 'AGENT', department: 'SALES', required: true, matches: ['offer to purchase'], variants: ['residential', 'sectional title', 'estate hoa', 'vacant land', 'residential vat registered'], aiPopulates: true, notes: 'Five approved variants. The variant is chosen by property type, never by the system alone.' },
  { key: 'otp_info_request', name: 'Information required to draw up the OTP', process: 'SALES', stageKey: 'sales.offer', completedBy: 'AI', department: 'SALES', required: true, matches: ['info required to draw up otp'], aiPopulates: true, notes: 'The system sends this and tracks what comes back.' },
  { key: 'otp_checklist_purchaser', name: 'OTP checklist — purchaser', process: 'SALES', stageKey: 'sales.offer', completedBy: 'AGENT', department: 'SALES', required: true, matches: ['otp checklist purchaser'], aiPopulates: false },
  { key: 'otp_checklist_seller', name: 'OTP checklist — seller', process: 'SALES', stageKey: 'sales.offer', completedBy: 'AGENT', department: 'SALES', required: true, matches: ['otp checklist seller'], aiPopulates: false },
  { key: 'buyer_fica', name: 'Purchaser FICA', process: 'SALES', stageKey: 'sales.offer', completedBy: 'BUYER', department: 'ACCOUNTS', required: true, matches: ['schedule 3 fica', 'schedule 4 fica', 'schedule 6 fica'], variants: ['natural person', 'legal entity', 'trust'], aiPopulates: false },
  { key: 'resolution', name: 'Company or trust resolution', process: 'SALES', stageKey: 'sales.offer', completedBy: 'BUYER', department: 'SALES', required: false, matches: ['resolution'], aiPopulates: false, notes: 'Required whenever a party is a juristic entity.' },

  // After sale — GRLP's own 22-item checklist
  { key: 'otp_cover_sheet', name: 'OTP cover sheet', process: 'SALES', stageKey: 'sales.after_sale', completedBy: 'AGENT', department: 'SALES', required: true, matches: ['otp cover'], aiPopulates: true },
  { key: 'attorney_instruction', name: 'Attorney letter / instruction', process: 'SALES', stageKey: 'sales.after_sale', completedBy: 'AGENT', department: 'SALES', required: true, matches: ['attorney letter', 'attorney instruction'], aiPopulates: true },
  { key: 'buyer_seller_letters', name: 'Buyer and seller letters', process: 'SALES', stageKey: 'sales.after_sale', completedBy: 'AI', department: 'SALES', required: true, matches: ['buyer letter', 'seller letter', 'after sales letters'], aiPopulates: true },
  { key: 'deposit_guarantee', name: 'Deposit or guarantee', process: 'SALES', stageKey: 'sales.after_sale', completedBy: 'CONVEYANCER', department: 'ACCOUNTS', required: true, matches: ['guarantee'], aiPopulates: false },

  // Transfer
  { key: 'coc_electrical', name: 'Electrical certificate of compliance', process: 'SALES', stageKey: 'sales.transfer', completedBy: 'SELLER', department: 'SALES', required: true, matches: ['electrical coc', 'electrical certificate'], aiPopulates: false, notes: 'Clause 17.1. Seller’s cost. Solar needs its own certificate.' },
  { key: 'coc_gas', name: 'Gas certificate of conformity', process: 'SALES', stageKey: 'sales.transfer', completedBy: 'SELLER', department: 'SALES', required: false, matches: ['gas coc', 'gas certificate'], aiPopulates: false, notes: 'Clause 17.2. Required only where there is a gas installation.' },
  { key: 'coc_beetle', name: 'Borer beetle certificate', process: 'SALES', stageKey: 'sales.transfer', completedBy: 'SELLER', department: 'SALES', required: false, matches: ['beetle'], aiPopulates: false, notes: 'Clause 17.3.' },
  { key: 'coc_electric_fence', name: 'Electric fence certificate', process: 'SALES', stageKey: 'sales.transfer', completedBy: 'SELLER', department: 'SALES', required: false, matches: ['electric fence'], aiPopulates: false },
  { key: 'municipal_clearance', name: 'Municipal clearance', process: 'SALES', stageKey: 'sales.transfer', completedBy: 'CONVEYANCER', department: 'SALES', required: true, matches: ['clearance'], aiPopulates: false, notes: 'Clause 17.4.' },

  // Registration
  { key: 'commission_calculation', name: 'Commission calculation sheet', process: 'SALES', stageKey: 'sales.registration', completedBy: 'ACCOUNTS', department: 'ACCOUNTS', required: true, matches: ['comm calculation', 'commission acknowledgement'], aiPopulates: true },
  { key: 'commission_invoice', name: 'Commission invoice', process: 'SALES', stageKey: 'sales.registration', completedBy: 'ACCOUNTS', department: 'ACCOUNTS', required: true, matches: ['invoice'], aiPopulates: true },
  { key: 'congratulations_letters', name: 'Congratulations letters', process: 'SALES', stageKey: 'sales.registration', completedBy: 'AI', department: 'SALES', required: false, matches: ['congrats'], aiPopulates: true },
  { key: 'welcome_pack', name: 'Moving-in welcome pack', process: 'SALES', stageKey: 'sales.registration', completedBy: 'AGENT', department: 'MARKETING', required: false, matches: ['welcome pack'], aiPopulates: false },

  // Used at various points
  { key: 'cancellation_agreement', name: 'Cancellation agreement', process: 'SALES', stageKey: 'sales.offer', completedBy: 'AGENT', department: 'SALES', required: false, matches: ['cancellation agreement'], aiPopulates: true },
  { key: 'nda', name: 'Confidentiality undertaking / NDA', process: 'SALES', stageKey: 'sales.marketing', completedBy: 'BUYER', department: 'SALES', required: false, matches: ['confidentiality', 'non disclosure'], aiPopulates: true },
  { key: 'subject_to_viewing', name: 'Subject to viewing — approval of property', process: 'SALES', stageKey: 'sales.offer', completedBy: 'BUYER', department: 'SALES', required: false, matches: ['subject to viewing'], aiPopulates: true },
  { key: 'comm_sharing', name: 'Commission sharing agreement (other agency)', process: 'SALES', stageKey: 'sales.registration', completedBy: 'ACCOUNTS', department: 'ACCOUNTS', required: false, matches: ['comm sharing'], aiPopulates: true },
];

// ── rentals, A to Z ────────────────────────────────────────────────────────
// Transcribed from GRLP's "Rental Document checklist", including its four gates.

export const RENTALS_STAGES: ProcessStage[] = [
  {
    key: 'rentals.landlord_onboarding',
    process: 'RENTALS',
    order: 1,
    name: 'Landlord onboarding',
    purpose: 'Take the property on properly before a cent is spent advertising it.',
    gate: {
      label: 'Signed off by superior',
      approverRole: 'RENTALS',
      blocksWhat: 'advertising the property — GRLP’s rule: “Above must be in order before you start advertising.”',
    },
  },
  {
    key: 'rentals.tenant_application',
    process: 'RENTALS',
    order: 2,
    name: 'Tenant application and vetting',
    purpose: 'Establish that the tenant qualifies, on evidence.',
    gate: {
      label: 'Signed off by superior',
      approverRole: 'RENTALS',
      blocksWhat: 'drawing up the lease — “the tenant must qualify before you draw up the lease.”',
    },
  },
  {
    key: 'rentals.lease',
    process: 'RENTALS',
    order: 3,
    name: 'Lease',
    purpose: 'Get the lease drawn, checked, signed and paid for.',
    gate: {
      label: 'Signed off by superior',
      approverRole: 'RENTALS',
      blocksWhat: 'the tenant moving in — “Above must be in order before tenant can move in.”',
    },
  },
  {
    key: 'rentals.move_in',
    process: 'RENTALS',
    order: 4,
    name: 'Move-in and inspection',
    purpose: 'Record the condition of the property before anyone lives in it.',
    gate: { label: 'Signed off by superior', approverRole: 'RENTALS', blocksWhat: 'closing the file as complete' },
  },
  { key: 'rentals.tenancy', process: 'RENTALS', order: 5, name: 'Tenancy', purpose: 'Collect rent, handle maintenance, keep both sides informed.' },
  { key: 'rentals.renewal_or_exit', process: 'RENTALS', order: 6, name: 'Renewal or exit', purpose: 'Renew in good time, or end the lease and return the deposit correctly.' },
];

export const RENTALS_DOCUMENTS: MasterDocument[] = [
  // Gate 1 — landlord onboarding
  { key: 'rental_mandate', name: 'Rental mandate from landlord', process: 'RENTALS', stageKey: 'rentals.landlord_onboarding', completedBy: 'LANDLORD', department: 'RENTALS', required: true, matches: ['mandate'], aiPopulates: true },
  { key: 'landlord_fica', name: 'Landlord FICA', process: 'RENTALS', stageKey: 'rentals.landlord_onboarding', completedBy: 'LANDLORD', department: 'RENTALS', required: true, matches: ['fica'], aiPopulates: false },
  { key: 'property_condition_report', name: 'Property condition report', process: 'RENTALS', stageKey: 'rentals.landlord_onboarding', completedBy: 'RENTALS', department: 'RENTALS', required: true, matches: ['property condition', 'declaration of property condition'], aiPopulates: false },
  { key: 'rental_listing_form', name: 'Rental listing form', process: 'RENTALS', stageKey: 'rentals.landlord_onboarding', completedBy: 'RENTALS', department: 'RENTALS', required: true, matches: ['rental listing form', 'listing sheet'], aiPopulates: true },
  { key: 'rentals_ppra_disclosure', name: 'PPRA disclosure', process: 'RENTALS', stageKey: 'rentals.landlord_onboarding', completedBy: 'LANDLORD', department: 'RENTALS', required: true, matches: ['ppra disclosure'], aiPopulates: false },

  // Gate 2 — tenant application
  { key: 'tenant_application', name: 'Tenant application form', process: 'RENTALS', stageKey: 'rentals.tenant_application', completedBy: 'TENANT', department: 'RENTALS', required: true, matches: ['application'], aiPopulates: false },
  { key: 'tenant_fica', name: 'Tenant FICA, ID and proof of residence', process: 'RENTALS', stageKey: 'rentals.tenant_application', completedBy: 'TENANT', department: 'RENTALS', required: true, matches: ['fica', 'address confirmation'], aiPopulates: false },
  { key: 'tenant_payslips', name: 'Six months’ payslips', process: 'RENTALS', stageKey: 'rentals.tenant_application', completedBy: 'TENANT', department: 'RENTALS', required: true, matches: [], aiPopulates: false },
  { key: 'tenant_bank_statements', name: 'Six months’ bank statements', process: 'RENTALS', stageKey: 'rentals.tenant_application', completedBy: 'TENANT', department: 'RENTALS', required: true, matches: [], aiPopulates: false },
  { key: 'tenant_references', name: 'Three references from previous rentals', process: 'RENTALS', stageKey: 'rentals.tenant_application', completedBy: 'RENTALS', department: 'RENTALS', required: true, matches: [], aiPopulates: false },
  { key: 'credit_check_pop', name: 'Credit check fee — proof of payment', process: 'RENTALS', stageKey: 'rentals.tenant_application', completedBy: 'TENANT', department: 'ACCOUNTS', required: true, matches: [], aiPopulates: false },
  { key: 'credit_check_report', name: 'Credit check report', process: 'RENTALS', stageKey: 'rentals.tenant_application', completedBy: 'RENTALS', department: 'RENTALS', required: true, matches: ['tpn'], aiPopulates: false, notes: 'TPN. The decision to approve or reject is discussed with a superior.' },

  // Gate 3 — lease
  { key: 'lease_agreement', name: 'Agreement of lease', process: 'RENTALS', stageKey: 'rentals.lease', completedBy: 'RENTALS', department: 'RENTALS', required: true, matches: ['agreement of lease'], variants: ['residential', 'office business', 'procurement', 'farm', 'commercial'], aiPopulates: true },
  { key: 'lease_addendum', name: 'Addendum to agreement of lease', process: 'RENTALS', stageKey: 'rentals.lease', completedBy: 'RENTALS', department: 'RENTALS', required: false, matches: ['addendum to agreement of lease'], aiPopulates: true },
  { key: 'lease_surety', name: 'Lease surety agreement', process: 'RENTALS', stageKey: 'rentals.lease', completedBy: 'TENANT', department: 'RENTALS', required: false, matches: ['surety'], aiPopulates: true, notes: 'Where a surety is required by the vetting outcome.' },
  { key: 'rentals_resolution', name: 'Resolution for rentals', process: 'RENTALS', stageKey: 'rentals.lease', completedBy: 'TENANT', department: 'RENTALS', required: false, matches: ['resolution for rentals'], aiPopulates: false },
  { key: 'rental_invoice', name: 'Tenant invoice (rent and deposit)', process: 'RENTALS', stageKey: 'rentals.lease', completedBy: 'ACCOUNTS', department: 'ACCOUNTS', required: true, matches: ['tax invoice template'], aiPopulates: true },
  { key: 'rental_pop', name: 'Proof of payment — rent and deposit', process: 'RENTALS', stageKey: 'rentals.lease', completedBy: 'TENANT', department: 'ACCOUNTS', required: true, matches: [], aiPopulates: false },
  { key: 'popi_consent', name: 'POPI consent', process: 'RENTALS', stageKey: 'rentals.lease', completedBy: 'TENANT', department: 'RENTALS', required: true, matches: ['popi', 'tpn consent'], aiPopulates: true },

  // Gate 4 — move-in
  { key: 'pre_inspection', name: 'Pre-occupation inspection sheet and photographs', process: 'RENTALS', stageKey: 'rentals.move_in', completedBy: 'RENTALS', department: 'RENTALS', required: true, matches: ['pre  post inspection', 'inspection sheet'], aiPopulates: false },
  { key: 'key_control', name: 'Key control list', process: 'RENTALS', stageKey: 'rentals.move_in', completedBy: 'RENTALS', department: 'RENTALS', required: true, matches: ['key control'], aiPopulates: true },
  { key: 'tenant_checklist', name: 'Residential tenants’ checklist', process: 'RENTALS', stageKey: 'rentals.move_in', completedBy: 'TENANT', department: 'RENTALS', required: false, matches: ['tenants-checklist', 'tenants checklist'], aiPopulates: false },

  // Tenancy
  { key: 'tenant_warning_letter', name: 'Tenant warning letter', process: 'RENTALS', stageKey: 'rentals.tenancy', completedBy: 'RENTALS', department: 'RENTALS', required: false, matches: ['warning letter'], aiPopulates: true },
  { key: 'letter_of_demand', name: 'Letter of demand', process: 'RENTALS', stageKey: 'rentals.tenancy', completedBy: 'ACCOUNTS', department: 'ACCOUNTS', required: false, matches: ['letter of demand', 'letters of demand'], aiPopulates: true, notes: 'A letter of demand is a legal step. Prepared for review, never sent automatically.' },

  // Renewal or exit
  { key: 'termination_letter', name: 'Termination letter', process: 'RENTALS', stageKey: 'rentals.renewal_or_exit', completedBy: 'RENTALS', department: 'RENTALS', required: false, matches: ['termination letter'], aiPopulates: true },
  { key: 'post_inspection', name: 'Post-occupation inspection sheet', process: 'RENTALS', stageKey: 'rentals.renewal_or_exit', completedBy: 'RENTALS', department: 'RENTALS', required: true, matches: ['pre  post inspection', 'inspection sheet'], aiPopulates: false },
  { key: 'deposit_statement', name: 'Deposit statement with interest', process: 'RENTALS', stageKey: 'rentals.renewal_or_exit', completedBy: 'ACCOUNTS', department: 'ACCOUNTS', required: true, matches: ['deposit statement'], aiPopulates: true, notes: 'Interest is owed to the tenant under the Rental Housing Act.' },
];

export const ALL_STAGES = [...SALES_STAGES, ...RENTALS_STAGES];
export const ALL_DOCUMENTS = [...SALES_DOCUMENTS, ...RENTALS_DOCUMENTS];

export function documentsForStage(stageKey: string): MasterDocument[] {
  return ALL_DOCUMENTS.filter((d) => d.stageKey === stageKey);
}

export function stagesFor(process: Process): ProcessStage[] {
  return ALL_STAGES.filter((s) => s.process === process).sort((a, b) => a.order - b.order);
}

export function getDocument(key: string): MasterDocument | undefined {
  return ALL_DOCUMENTS.find((d) => d.key === key);
}

/**
 * Matches a Dropbox filename to a catalogue entry. Returns the best match by
 * longest matching fragment, so "OFFER TO PURCHASE SECTIONAL TITLE" prefers the
 * OTP entry over a looser one, and returns nothing rather than guessing.
 */
export function matchDocument(filename: string): { document: MasterDocument; variant?: string } | null {
  const name = filename.toLowerCase();
  let best: { document: MasterDocument; variant?: string; score: number } | null = null;

  for (const doc of ALL_DOCUMENTS) {
    for (const fragment of doc.matches) {
      if (!fragment || !name.includes(fragment)) continue;
      const variant = doc.variants?.find((v) => name.includes(v));
      const score = fragment.length + (variant ? variant.length : 0);
      if (!best || score > best.score) best = { document: doc, variant, score };
    }
  }

  return best ? { document: best.document, variant: best.variant } : null;
}
