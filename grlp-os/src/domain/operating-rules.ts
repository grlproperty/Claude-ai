/**
 * How GRLP actually operates.
 *
 * Every rule here was read out of the agency's own standard operating
 * procedures in Dropbox, and each carries the document it came from so it can be
 * checked and corrected. This is what lets the system act like GRLP rather than
 * like a generic estate agency: it knows that money moves through the trust
 * account, that credit checks go through TPN, that a deposit reconciliation is
 * due in seven days, and that listings are named by erf and street address.
 *
 * The commercially sensitive policies — commission negotiation, the listing
 * versus selling agent split — are deliberately NOT transcribed here. This
 * repository is public. Those documents are imported into the database instead.
 */

export interface SourcedRule {
  /** The rule, in the words a person would use. */
  rule: string;
  /** The GRLP document it came from. */
  source: string;
  /** Set where the rule comes from legislation rather than agency preference. */
  statute?: string;
}

/** The systems GRLP runs on. The system must fit these, not replace them. */
export const SYSTEMS = {
  crm: { name: 'PropCntrl', use: 'Property and listing management. Listings are created here first, then syndicated.', source: 'Listing SOP GRLP' },
  portals: { name: 'Property24, Private Property', use: 'Listing syndication from PropCntrl. Copy from the CRM, never retype.', source: 'Listing SOP GRLP' },
  tenantChecks: { name: 'TPN', use: 'Tenant credit and affordability checks, and rentbook invoicing.', source: 'Rentals SOP' },
  documents: { name: 'Dropbox', use: 'The digital file for every property, listing and transaction.', source: 'Listing SOP, Rentals SOP' },
  internalComms: { name: 'WhatsApp', use: 'The "New listings and changes" group is notified on every new listing and price change.', source: 'Listing SOP GRLP' },
  banking: { name: 'GRLP trust account', use: 'All client money. No personal accounts, ever.', source: 'Rentals SOP' },
} as const;

/** Where documents live, and how they are named. */
export const FILING_CONVENTIONS: SourcedRule[] = [
  { rule: 'A listing gets a Dropbox folder under Listings Shared, named by erf number and street address.', source: 'Listing SOP GRLP' },
  { rule: 'The listing folder holds the Google diagram, the CMA report, owner information from canvassing, the SG diagram, and the title deed where relevant.', source: 'Listing SOP GRLP' },
  { rule: 'When a property is relisted, the previous listing moves into an OLD folder inside the new one rather than being deleted.', source: 'Listing SOP GRLP' },
  { rule: 'A rental property file holds the mandate, FICA, marketing material, tenant applications and credit checks, the signed lease, every inspection report, and all addenda.', source: 'Rentals SOP' },
  { rule: 'Inspection photographs are saved into the property folder, not held on a phone.', source: 'Rentals SOP' },
];

/** The legislation GRLP works under. Named so the system never invents a basis. */
export const GOVERNING_LEGISLATION = [
  { act: 'Financial Intelligence Centre Act 38 of 2001', short: 'FICA', why: 'Estate agents are accountable institutions. Identity and residence documents are a legal obligation, not a preference.' },
  { act: 'Protection of Personal Information Act 4 of 2013', short: 'POPIA', why: 'Governs how client information is stored and shared. Every employee signs an acknowledgement.' },
  { act: 'Rental Housing Act 50 of 1999', short: 'Rental Housing Act', why: 'Deposits, interest on deposits, and the timing of refunds.' },
  { act: 'Consumer Protection Act 68 of 2008', short: 'CPA', why: 'Applies to sellers selling in the ordinary course of business, and to lease terms.' },
  { act: 'Prevention of Illegal Eviction from and Unlawful Occupation of Land Act 19 of 1998', short: 'PIE Act', why: 'Governs eviction. Never a step the system takes or advises on.' },
  { act: 'Alienation of Land Act 68 of 1981', short: 'Alienation of Land Act', why: 'Section 29A cooling-off applies where the purchase price is R250 000 or less.' },
  { act: 'Property Practitioners Act 22 of 2019', short: 'PPRA', why: 'Fidelity Fund Certificates, and the mandatory disclosure form.' },
  { act: 'Income Tax Act 58 of 1962 s35A', short: 'Section 35A', why: 'Withholding on a sale by a non-resident seller.' },
] as const;

/** Deadlines that are not GRLP's to choose. Missing one has consequences. */
export const STATUTORY_DEADLINES: SourcedRule[] = [
  { rule: 'A deposit reconciliation is provided to the tenant within 7 days of the outgoing inspection.', source: 'Rentals SOP', statute: 'Rental Housing Act' },
  { rule: 'The balance of a deposit is refunded within 14 days.', source: 'Rentals SOP', statute: 'Rental Housing Act' },
  { rule: 'Interest earned on a deposit belongs to the tenant.', source: 'Rentals SOP', statute: 'Rental Housing Act' },
  { rule: 'A purchaser has a 5-day cooling-off right where the purchase price is R250 000 or less.', source: 'Offer to purchase, clause 21', statute: 'Alienation of Land Act s29A' },
  { rule: 'A non-resident seller must notify the purchaser, agent and conveyancer within 7 days.', source: 'Offer to purchase, clause 1.1(c)', statute: 'Income Tax Act s35A' },
];

/** Deadlines GRLP sets itself, from the offer to purchase and the SOPs. */
export const AGENCY_DEADLINES: SourcedRule[] = [
  { rule: 'The deposit is paid to the conveyancer within 7 working days of the seller accepting.', source: 'Offer to purchase, clause 4.1' },
  { rule: 'Guarantees are furnished to the seller’s conveyancer within 21 days of acceptance, after all suspensive conditions are met.', source: 'Offer to purchase, clause 4.2' },
  { rule: 'A party in breach has 7 days from written notice to remedy it.', source: 'Offer to purchase, clause 15' },
  { rule: 'A 72-hour clause runs for 72 hours excluding Saturdays, Sundays and public holidays.', source: 'Offer to purchase, clause 13.2' },
  { rule: 'Mid-lease inspections happen at least every 6 months.', source: 'Rentals SOP' },
  { rule: 'A "Sold" board may stand for three months from fulfilment of the suspensive conditions.', source: 'Offer to purchase, clause 22' },
];

/** How money is handled. These are the rules with the least room for judgement. */
export const MONEY_RULES: SourcedRule[] = [
  { rule: 'All client money flows through the GRLP trust account. Personal accounts are never used.', source: 'Rentals SOP' },
  { rule: 'A deposit is invested in an interest-bearing trust account, with the interest accruing to the purchaser.', source: 'Offer to purchase, clause 4.1', statute: 'Legal Practice Act 28 of 2014, s86(4)' },
  { rule: 'The agent’s commission is the first charge against the deposit.', source: 'Offer to purchase, clause 4.1' },
  { rule: 'Rental payments to a landlord are made less commission and any services.', source: 'Rentals SOP' },
  { rule: 'Breakage and services deposits are held until the end of the lease.', source: 'Rentals SOP' },
  { rule: 'Payments are loaded by rentals and released only after management authorises them.', source: 'Rentals SOP' },
  { rule: 'Commission calculations are signed off before payment.', source: 'After sales commission calculation sign off procedure' },
];

/** Points where a person must approve before anything proceeds. */
export const APPROVAL_POINTS: SourcedRule[] = [
  { rule: 'A rental mandate, landlord FICA and property condition report must be in order before advertising begins.', source: 'Rental Document checklist — "signed off by superior"' },
  { rule: 'A tenant must qualify, and the application be approved with a superior, before the lease is drawn.', source: 'Rental Document checklist — "signed off by superior"' },
  { rule: 'The lease must be signed by all parties and the rent and deposit received before the tenant moves in.', source: 'Rental Document checklist — "signed off by superior"' },
  { rule: 'A drafted lease is checked by a superior before it goes out for signature.', source: 'Rentals SOP' },
  { rule: 'Qualified tenant applications are presented to the landlord for approval — the agency does not choose the tenant.', source: 'Rentals SOP' },
  { rule: 'Maintenance is quoted and authorised by the landlord before a contractor is instructed.', source: 'Rentals SOP' },
  { rule: 'Commission calculations are signed off after the sale, before payment.', source: 'After sales commission calculation sign off procedure' },
];

/** What has to be true before a buyer is taken to a viewing. */
export const BUYER_QUALIFICATION: SourcedRule[] = [
  { rule: 'A buyer is qualified as RWA — ready, willing and able — before viewings or negotiation.', source: 'Buyer Qualification SOP' },
  { rule: 'The address and sensitive listing details are not shared until FICA or clear intent is established.', source: 'Buyer Qualification SOP' },
  { rule: 'FICA and the nature of funds are requested early, explained as a regulatory and seller requirement.', source: 'Buyer Qualification SOP' },
  { rule: 'Qualified buyers are tagged by suburb and price on the buyer match sheet.', source: 'Buyer Qualification SOP' },
  { rule: 'Foreign buyers may need SARS tax clearance; liaise with the attorney or currency partner.', source: 'Buyer Qualification SOP' },
  { rule: 'High-net-worth or sensitive buyers are handled with discretion, with the sales manager involved.', source: 'Buyer Qualification SOP' },
];

/** Compliance documents required before a listing goes live. */
export const LISTING_PREREQUISITES: SourcedRule[] = [
  { rule: 'A signed sole or joint mandate, or a permission to list for an open mandate.', source: 'Listing SOP GRLP' },
  { rule: 'Seller ID and proof of residence. A legal entity follows the FICA manual instead.', source: 'Listing SOP GRLP' },
  { rule: 'POPIA consent, where the mandate is open.', source: 'Listing SOP GRLP' },
  { rule: 'An approved pricing strategy before the property is loaded.', source: 'Listing SOP GRLP' },
  { rule: 'Images and video, or a scheduled shoot.', source: 'Listing SOP GRLP' },
];

/** Company facts that appear on documents and must be right. */
export const COMPANY_FACTS = {
  registeredName: 'Garden Route Lifestyle Property (Pty) Ltd',
  registrationNumber: '2020 / 697392 / 07',
  vatNumber: '4780304178',
  fidelityFundCertificate: '149966',
  director: 'M.K. Pelser',
  operatingPrincipal: 'Mandy Pelser',
  offices: [
    'Office 1, Building C, Duiwerivier Road, Hoekwil, Wilderness, 6538',
    '8 Third Street, George, 6530',
  ],
  generalEmail: 'info@grproperty.co.za',
  regulator: 'Registered with the PPRA',
  defaultCommissionPct: 6.5,
  source: 'Offer to purchase footer; Rental Document checklist footer',
} as const;

export const ALL_RULES: SourcedRule[] = [
  ...FILING_CONVENTIONS,
  ...STATUTORY_DEADLINES,
  ...AGENCY_DEADLINES,
  ...MONEY_RULES,
  ...APPROVAL_POINTS,
  ...BUYER_QUALIFICATION,
  ...LISTING_PREREQUISITES,
];

/** Rules matching a term, for answering "what does GRLP do about X?". */
export function rulesAbout(term: string): SourcedRule[] {
  const t = term.toLowerCase();
  return ALL_RULES.filter((r) => r.rule.toLowerCase().includes(t) || r.source.toLowerCase().includes(t) || (r.statute ?? '').toLowerCase().includes(t));
}
