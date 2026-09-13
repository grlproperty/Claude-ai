/**
 * The business vocabulary, in one place.
 *
 * Every fixed list the database constrains is mirrored here with the South
 * African English label staff actually see. Lists that GRLP may change over
 * time (lead sources, loss reasons, tags, commission rules, compliance
 * settings) are configuration rows, not code, and are not in this file.
 */

export type Option<T extends string> = { value: T; label: string };

function options<T extends string>(entries: Record<T, string>): Option<T>[] {
  return (Object.entries(entries) as [T, string][]).map(([value, label]) => ({ value, label }));
}

// --- Business area (spec 5, 24) --------------------------------------------
// Deliberately separate from client type and from status.
export const BUSINESS_AREAS = {
  sales: 'Sales',
  rentals: 'Rentals',
  sales_rentals: 'Sales & Rentals',
  other: 'Other',
} as const;
export type BusinessArea = keyof typeof BUSINESS_AREAS;
export const businessAreaOptions = options(BUSINESS_AREAS);

// --- Client type (spec 12) -------------------------------------------------
export const CLIENT_TYPES = {
  buyer: 'Buyer',
  seller: 'Seller',
  landlord: 'Landlord',
  tenant: 'Tenant',
  owner: 'Owner',
  investor: 'Investor',
  developer: 'Developer',
  other: 'Other',
} as const;
export type ClientType = keyof typeof CLIENT_TYPES;
export const clientTypeOptions = options(CLIENT_TYPES);

// --- Contact details (spec 12) ---------------------------------------------
export const CONTACT_TYPES = {
  mobile: 'Mobile',
  alternative_mobile: 'Alternative mobile',
  landline: 'Landline',
  email: 'Email',
  whatsapp: 'WhatsApp',
  fax: 'Fax',
  other: 'Other',
} as const;
export type ContactType = keyof typeof CONTACT_TYPES;
export const contactTypeOptions = options(CONTACT_TYPES);

export const PHONE_CONTACT_TYPES: ContactType[] = [
  'mobile',
  'alternative_mobile',
  'landline',
  'whatsapp',
  'fax',
];

export const ADDRESS_TYPES = {
  physical: 'Physical address',
  postal: 'Postal address',
  other: 'Other',
} as const;
export type AddressType = keyof typeof ADDRESS_TYPES;
export const addressTypeOptions = options(ADDRESS_TYPES);

export const PROVINCES = [
  'Western Cape',
  'Eastern Cape',
  'Northern Cape',
  'Free State',
  'KwaZulu-Natal',
  'North West',
  'Gauteng',
  'Mpumalanga',
  'Limpopo',
  'Outside South Africa',
] as const;
export type Province = (typeof PROVINCES)[number];

// --- Person relationships (spec 16) ----------------------------------------
export const RELATIONSHIP_TYPES = {
  spouse: 'Spouse',
  partner: 'Partner',
  family: 'Family',
  attorney: 'Attorney',
  adviser: 'Adviser',
  accountant: 'Accountant',
  company_representative: 'Company representative',
  co_owner: 'Co-owner',
  buyer: 'Buyer',
  seller: 'Seller',
  landlord: 'Landlord',
  tenant: 'Tenant',
  other: 'Other',
} as const;
export type RelationshipType = keyof typeof RELATIONSHIP_TYPES;
export const relationshipTypeOptions = options(RELATIONSHIP_TYPES);

// --- Communication (spec 53) -----------------------------------------------
export const COMMUNICATION_CHANNELS = {
  email: 'Email',
  whatsapp: 'WhatsApp',
  phone: 'Phone',
  sms: 'SMS',
  in_person: 'In person',
  other: 'Other',
} as const;
export type CommunicationChannel = keyof typeof COMMUNICATION_CHANNELS;
export const communicationChannelOptions = options(COMMUNICATION_CHANNELS);

export const TITLES = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'Adv', 'Rev', 'Other'] as const;

export function labelOf<T extends string>(map: Record<T, string>, value: string | null): string {
  if (!value) return '';
  return (map as Record<string, string>)[value] ?? value;
}

/** "Seller • Landlord", for the line under a person's name (spec 99). */
export function clientTypeSummary(types: readonly string[]): string {
  if (types.length === 0) return 'No client type recorded';
  return types.map((t) => labelOf(CLIENT_TYPES, t)).join(' • ');
}

// ===========================================================================
// PROPERTIES
//
// The six status concepts below are separate on purpose (spec 141). A
// property can be off market, with an expired sole mandate, that was sold by
// a third party — and each of those is a different fact about it.
// ===========================================================================

export const PROPERTY_TYPES = {
  house: 'House',
  apartment: 'Apartment',
  townhouse: 'Townhouse',
  vacant_land: 'Vacant land',
  farm: 'Farm',
  smallholding: 'Smallholding',
  commercial: 'Commercial',
  industrial: 'Industrial',
  retirement: 'Retirement',
  guest_house: 'Guest house',
  other: 'Other',
} as const;
export type PropertyType = keyof typeof PROPERTY_TYPES;
export const propertyTypeOptions = options(PROPERTY_TYPES);

/** Where the property itself stands. */
export const PROPERTY_STATUSES = {
  active: 'Active',
  on_market: 'On market',
  off_market: 'Off market',
  expired: 'Expired',
  mandate_withdrawn: 'Mandate withdrawn',
  sale_cancelled: 'Sale cancelled',
  sale_pending: 'Sale pending',
  sale_concluded: 'Sale concluded',
  sale_registered: 'Sale registered',
} as const;
export type PropertyStatus = keyof typeof PROPERTY_STATUSES;
export const propertyStatusOptions = options(PROPERTY_STATUSES);

/** Where it stands in the sales pipeline. */
export const SALES_STATUSES = {
  prospect: 'Prospect',
  active: 'Active',
  on_market: 'On market',
  viewing: 'Viewing',
  offer_received: 'Offer received',
  sale_pending: 'Sale pending',
  sale_concluded: 'Sale concluded',
  sale_cancelled: 'Sale cancelled',
  sale_registered: 'Sale registered',
  withdrawn: 'Withdrawn',
  off_market: 'Off market',
  expired: 'Expired',
} as const;
export type SalesStatus = keyof typeof SALES_STATUSES;
export const salesStatusOptions = options(SALES_STATUSES);

/** Where it stands in the rental pipeline. */
export const RENTAL_STATUSES = {
  rental_prospect: 'Rental prospect',
  available: 'Available',
  on_market: 'On market',
  viewing: 'Viewing',
  application_pending: 'Application pending',
  application_approved: 'Application approved',
  let: 'Let',
  lease_active: 'Lease active',
  lease_expired: 'Lease expired',
  withdrawn: 'Withdrawn',
  off_market: 'Off market',
  not_available: 'Not available',
} as const;
export type RentalStatus = keyof typeof RENTAL_STATUSES;
export const rentalStatusOptions = options(RENTAL_STATUSES);

export const MANDATE_STATUSES = {
  no_mandate: 'No mandate',
  mandate_active: 'Mandate active',
  mandate_expired: 'Mandate expired',
  mandate_withdrawn: 'Mandate withdrawn',
  mandate_cancelled: 'Mandate cancelled',
  mandate_concluded: 'Mandate concluded',
  other: 'Other',
} as const;
export type MandateStatus = keyof typeof MANDATE_STATUSES;
export const mandateStatusOptions = options(MANDATE_STATUSES);

export const MANDATE_TYPES = {
  sole: 'Sole mandate',
  open: 'Open mandate',
  dual: 'Dual mandate',
  other: 'Other',
} as const;
export type MandateType = keyof typeof MANDATE_TYPES;
export const mandateTypeOptions = options(MANDATE_TYPES);

/** Who eventually sold it, if anybody did. */
export const SALE_OUTCOMES = {
  sold_by_us: 'Sold by us',
  sold_by_sharing_party: 'Sold by sharing party',
  sold_by_third_party: 'Sold by 3rd party',
  not_sold: 'Not sold',
  sale_cancelled: 'Sale cancelled',
  pending: 'Pending',
  not_applicable: 'Not applicable',
} as const;
export type SaleOutcome = keyof typeof SALE_OUTCOMES;
export const saleOutcomeOptions = options(SALE_OUTCOMES);

export const PROPERTY_PERSON_ROLES = {
  owner: 'Owner',
  co_owner: 'Co-owner',
  seller: 'Seller',
  buyer: 'Buyer',
  landlord: 'Landlord',
  tenant: 'Tenant',
  previous_owner: 'Previous owner',
  interested_buyer: 'Interested buyer',
  interested_seller: 'Interested seller',
  contact: 'Contact',
  other: 'Other',
} as const;
export type PropertyPersonRole = keyof typeof PROPERTY_PERSON_ROLES;
export const propertyPersonRoleOptions = options(PROPERTY_PERSON_ROLES);

export const MARKETING_STATUSES = {
  not_prepared: 'Not prepared',
  ready: 'Ready',
  published: 'Published',
  unpublished: 'Unpublished',
  archived: 'Archived',
} as const;
export type MarketingStatus = keyof typeof MARKETING_STATUSES;
export const marketingStatusOptions = options(MARKETING_STATUSES);

export const MARKETING_CHANNELS = {
  grlp_website: 'GRLP website',
  property24: 'Property24',
  private_property: 'Private Property',
  facebook: 'Facebook',
  instagram: 'Instagram',
  other: 'Other',
} as const;
export type MarketingChannel = keyof typeof MARKETING_CHANNELS;
export const marketingChannelOptions = options(MARKETING_CHANNELS);

export const DOCUMENT_CATEGORIES = {
  permission_evidence: 'Permission evidence',
  fica: 'FICA',
  property: 'Property',
  mandate: 'Mandate',
  transaction: 'Transaction',
  commission: 'Commission',
  communication: 'Communication',
  identity: 'Identity',
  other: 'Other',
} as const;
export type DocumentCategory = keyof typeof DOCUMENT_CATEGORIES;
export const documentCategoryOptions = options(DOCUMENT_CATEGORIES);

/** Badge colour for a status, so the same state reads the same everywhere. */
// --- Compliance (spec 52 to 57) --------------------------------------------
// The channel a message to a person would go out on. Three separate things
// are easy to confuse here, so they stay separate lists: CONTACT_TYPES is
// what a detail IS (a mobile number), MARKETING_CHANNELS is where a PROPERTY
// is advertised (Property24), and this is how the office would REACH SOMEONE.
// One mobile number carries calls, SMS and WhatsApp, and a person may allow
// one of those and refuse another.
export const PERMISSION_CHANNELS = {
  call: 'Call',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  email: 'Email',
  post: 'Post',
} as const;
export type PermissionChannel = keyof typeof PERMISSION_CHANNELS;
export const permissionChannelOptions = options(PERMISSION_CHANNELS);

export const PERMISSION_PURPOSES = {
  direct_marketing: 'Direct marketing',
  property_alerts: 'Property alerts',
  newsletter: 'Newsletter',
  market_reports: 'Market reports',
  service_updates: 'Service updates',
} as const;
export type PermissionPurpose = keyof typeof PERMISSION_PURPOSES;
export const permissionPurposeOptions = options(PERMISSION_PURPOSES);

export const PERMISSION_STATUSES = {
  granted: 'Granted',
  withdrawn: 'Withdrawn',
  refused: 'Refused',
} as const;
export type PermissionStatus = keyof typeof PERMISSION_STATUSES;
export const permissionStatusOptions = options(PERMISSION_STATUSES);

export const LAWFUL_BASES = {
  consent: 'Consent',
  contract: 'Contract',
  legitimate_interest: 'Legitimate interest',
  legal_obligation: 'Legal obligation',
} as const;
export type LawfulBasis = keyof typeof LAWFUL_BASES;
export const lawfulBasisOptions = options(LAWFUL_BASES);

export const EVIDENCE_TYPES = {
  signed_form: 'Signed form',
  email_reply: 'Email reply',
  whatsapp_reply: 'WhatsApp reply',
  website_form: 'Website form',
  verbal_noted: 'Said in person, noted at the time',
  imported_record: 'Came in with an import',
  other: 'Other',
} as const;
export type EvidenceType = keyof typeof EVIDENCE_TYPES;
export const evidenceTypeOptions = options(EVIDENCE_TYPES);

export const DNC_SOURCES = {
  client_request: 'They asked us',
  ncc_register: 'NCC opt-out register',
  complaint: 'Complaint',
  bounced: 'Kept bouncing',
  deceased: 'Deceased',
  other: 'Other',
} as const;
export type DncSource = keyof typeof DNC_SOURCES;
export const dncSourceOptions = options(DNC_SOURCES);

export const DNC_CHANNELS = { all: 'Every channel', ...PERMISSION_CHANNELS } as const;
export type DncChannel = keyof typeof DNC_CHANNELS;
export const dncChannelOptions = options(DNC_CHANNELS);

export const NCC_BATCH_STATUSES = {
  draft: 'Draft',
  submitted: 'Sent for checking',
  results_loaded: 'Results loaded',
  cancelled: 'Cancelled',
} as const;
export type NccBatchStatus = keyof typeof NCC_BATCH_STATUSES;
export const nccBatchStatusOptions = options(NCC_BATCH_STATUSES);

export const NCC_RESULTS = {
  not_checked: 'Not checked',
  not_listed: 'Not on the register',
  listed: 'On the register',
  invalid_number: 'Not a usable number',
} as const;
export type NccResult = keyof typeof NCC_RESULTS;
export const nccResultOptions = options(NCC_RESULTS);

/** The preflight verdict (spec 57). Never anything but these three. */
export const PREFLIGHT_STATUSES = {
  green: 'Clear to send',
  amber: 'Check before sending',
  red: 'Do not send',
} as const;
export type PreflightStatus = keyof typeof PREFLIGHT_STATUSES;

export function preflightTone(status: PreflightStatus): 'ok' | 'warn' | 'stop' {
  return status === 'green' ? 'ok' : status === 'amber' ? 'warn' : 'stop';
}

export function statusTone(value: string): 'neutral' | 'brand' | 'ok' | 'warn' | 'stop' | 'info' {
  if (
    [
      'sale_registered', 'sale_concluded', 'mandate_active', 'lease_active', 'let',
      'application_approved', 'available', 'active', 'sold_by_us', 'published', 'ready',
    ].includes(value)
  ) {
    return 'ok';
  }
  if (
    [
      'sale_pending', 'offer_received', 'viewing', 'application_pending', 'pending',
      'mandate_expired', 'lease_expired', 'expired',
    ].includes(value)
  ) {
    return 'warn';
  }
  if (
    [
      'sale_cancelled', 'mandate_withdrawn', 'mandate_cancelled', 'withdrawn',
      'not_available', 'not_sold', 'sold_by_third_party', 'refused', 'listed',
    ].includes(value)
  ) {
    return 'stop';
  }
  if (
    [
      'won', 'accepted', 'approved', 'verified', 'complete', 'completed',
      'lease_signed', 'mandate_signed', 'registered', 'granted', 'not_listed',
      'results_loaded',
    ].includes(value)
  ) {
    return 'ok';
  }
  if (
    [
      'lost', 'rejected', 'failed', 'cancelled', 'no_show', 'not_proceeding',
      'not_interested', 'not_suitable', 'bond_declined', 'withdrawn',
    ].includes(value)
  ) {
    return 'stop';
  }
  if (
    [
      'submitted', 'under_review', 'screening', 'documents_required', 'requested',
      'awaiting_registration', 'suspensive_conditions', 'counter_offer', 'nurture',
      'urgent', 'high', 'in_progress', 'scheduled',
    ].includes(value)
  ) {
    return 'warn';
  }
  if (['on_market', 'new', 'offer', 'offer_accepted', 'very_interested'].includes(value)) {
    return 'brand';
  }
  if (
    ['prospect', 'rental_prospect', 'off_market', 'not_prepared', 'draft', 'to_do', 'none',
     'not_started', 'not_applicable', 'low', 'normal'].includes(value)
  ) {
    return 'neutral';
  }
  return 'info';
}

/** Where an address is, written the way people say it. */
export function propertyLocation(property: {
  suburb?: string | null;
  city?: string | null;
}): string {
  return [property.suburb, property.city].filter(Boolean).join(', ');
}

export function propertyAddressLine(property: {
  streetAddress?: string | null;
  propertyName?: string | null;
  suburb?: string | null;
  city?: string | null;
  erfNumber?: string | null;
}): string {
  const parts = [property.propertyName, property.streetAddress].filter(Boolean);
  const place = propertyLocation(property);
  if (parts.length === 0 && property.erfNumber) parts.push(`Erf ${property.erfNumber}`);
  return [parts.join(', '), place].filter(Boolean).join(', ');
}

// ===========================================================================
// LEADS (spec 39, 40)
// ===========================================================================

export const SALES_LEAD_TYPES = {
  buyer: 'Buyer',
  seller: 'Seller',
  investor: 'Investor',
  valuation: 'Valuation',
  property_enquiry: 'Property enquiry',
} as const;

export const RENTAL_LEAD_TYPES = {
  landlord: 'Landlord',
  tenant: 'Tenant',
  rental_enquiry: 'Rental enquiry',
  rental_valuation: 'Rental valuation',
} as const;

export const LEAD_TYPES = {
  ...SALES_LEAD_TYPES,
  ...RENTAL_LEAD_TYPES,
  other: 'Other',
} as const;
export type LeadType = keyof typeof LEAD_TYPES;
export const leadTypeOptions = options(LEAD_TYPES);
export const salesLeadTypeOptions = options({ ...SALES_LEAD_TYPES, other: 'Other' });
export const rentalLeadTypeOptions = options({ ...RENTAL_LEAD_TYPES, other: 'Other' });

export const LEAD_STATUSES = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  viewing_appointment: 'Viewing / appointment',
  valuation: 'Valuation',
  mandate_discussion: 'Mandate discussion',
  mandate_signed: 'Mandate signed',
  offer: 'Offer',
  under_contract: 'Under contract',
  won: 'Won',
  lost: 'Lost',
  nurture: 'Nurture',
  archived: 'Archived',
} as const;
export type LeadStatus = keyof typeof LEAD_STATUSES;
export const leadStatusOptions = options(LEAD_STATUSES);

/** The statuses that mean the lead is still live work. */
export const OPEN_LEAD_STATUSES: LeadStatus[] = [
  'new', 'contacted', 'qualified', 'viewing_appointment', 'valuation',
  'mandate_discussion', 'mandate_signed', 'offer', 'under_contract', 'nurture',
];

// ===========================================================================
// TASKS AND CALENDAR (spec 43, 45)
// ===========================================================================

export const TASK_TYPES = {
  follow_up: 'Follow-up',
  call: 'Call',
  whatsapp: 'WhatsApp',
  email: 'Email',
  meeting: 'Meeting',
  viewing: 'Viewing',
  valuation: 'Valuation',
  paperwork: 'Paperwork',
  fica: 'FICA',
  compliance: 'Compliance',
  marketing: 'Marketing',
  commission: 'Commission',
  other: 'Other',
} as const;
export type TaskType = keyof typeof TASK_TYPES;
export const taskTypeOptions = options(TASK_TYPES);

export const TASK_STATUSES = {
  to_do: 'To do',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
} as const;
export type TaskStatus = keyof typeof TASK_STATUSES;
export const taskStatusOptions = options(TASK_STATUSES);

export const TASK_PRIORITIES = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
} as const;
export type TaskPriority = keyof typeof TASK_PRIORITIES;
export const taskPriorityOptions = options(TASK_PRIORITIES);

export const TASK_RECURRENCES = {
  none: 'Does not repeat',
  daily: 'Every day',
  weekly: 'Every week',
  fortnightly: 'Every two weeks',
  monthly: 'Every month',
} as const;
export type TaskRecurrence = keyof typeof TASK_RECURRENCES;
export const taskRecurrenceOptions = options(TASK_RECURRENCES);

export const APPOINTMENT_TYPES = {
  viewing: 'Viewing',
  valuation: 'Valuation',
  meeting: 'Meeting',
  inspection: 'Inspection',
  rental_appointment: 'Rental appointment',
  other: 'Other',
} as const;
export type AppointmentType = keyof typeof APPOINTMENT_TYPES;
export const appointmentTypeOptions = options(APPOINTMENT_TYPES);

export const APPOINTMENT_STATUSES = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'Did not arrive',
} as const;
export type AppointmentStatus = keyof typeof APPOINTMENT_STATUSES;
export const appointmentStatusOptions = options(APPOINTMENT_STATUSES);

// ===========================================================================
// VIEWINGS (spec 46)
// ===========================================================================

export const VIEWING_OUTCOMES = {
  offer_expected: 'Offer expected',
  wants_second_viewing: 'Wants a second viewing',
  thinking: 'Thinking about it',
  not_proceeding: 'Not proceeding',
  other: 'Other',
} as const;
export type ViewingOutcome = keyof typeof VIEWING_OUTCOMES;
export const viewingOutcomeOptions = options(VIEWING_OUTCOMES);

export const INTEREST_LEVELS = {
  very_interested: 'Very interested',
  interested: 'Interested',
  considering: 'Considering',
  not_interested: 'Not interested',
  not_suitable: 'Not suitable',
} as const;
export type InterestLevel = keyof typeof INTEREST_LEVELS;
export const interestLevelOptions = options(INTEREST_LEVELS);

// ===========================================================================
// VALUATIONS (spec 47)
// ===========================================================================

export const VALUATION_STATUSES = {
  requested: 'Requested',
  scheduled: 'Scheduled',
  completed: 'Completed',
  mandate_discussion: 'Mandate discussion',
  mandate_signed: 'Mandate signed',
  not_proceeding: 'Not proceeding',
  cancelled: 'Cancelled',
} as const;
export type ValuationStatus = keyof typeof VALUATION_STATUSES;
export const valuationStatusOptions = options(VALUATION_STATUSES);

// ===========================================================================
// OFFERS AND TRANSACTIONS (spec 48, 49)
// ===========================================================================

export const OFFER_STATUSES = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  counter_offer: 'Counter offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
  cancelled: 'Cancelled',
} as const;
export type OfferStatus = keyof typeof OFFER_STATUSES;
export const offerStatusOptions = options(OFFER_STATUSES);

export const FINANCE_STATUSES = {
  not_applicable: 'Not applicable',
  cash: 'Cash',
  bond_applied: 'Bond applied for',
  bond_pending: 'Bond pending',
  bond_approved: 'Bond approved',
  bond_declined: 'Bond declined',
  other: 'Other',
} as const;
export type FinanceStatus = keyof typeof FINANCE_STATUSES;
export const financeStatusOptions = options(FINANCE_STATUSES);

/**
 * Transaction statuses. Concluded and registered are separate stages, and
 * the database refuses to record 'registered' without a registration date
 * (spec 49).
 */
export const TRANSACTION_STATUSES = {
  draft: 'Draft',
  offer: 'Offer',
  offer_accepted: 'Offer accepted',
  sale_pending: 'Sale pending',
  suspensive_conditions: 'Suspensive conditions',
  sale_concluded: 'Sale concluded',
  awaiting_registration: 'Awaiting registration',
  registered: 'Registered',
  cancelled: 'Cancelled',
  failed: 'Failed',
  other: 'Other',
} as const;
export type TransactionStatus = keyof typeof TRANSACTION_STATUSES;
export const transactionStatusOptions = options(TRANSACTION_STATUSES);

/** Statuses that mean the deal is still moving. */
export const OPEN_TRANSACTION_STATUSES: TransactionStatus[] = [
  'draft', 'offer', 'offer_accepted', 'sale_pending', 'suspensive_conditions',
  'sale_concluded', 'awaiting_registration',
];

export const TRANSACTION_AGENT_ROLES = {
  primary: 'Primary agent',
  sharing: 'Sharing agent',
  referral: 'Referral',
} as const;
export type TransactionAgentRole = keyof typeof TRANSACTION_AGENT_ROLES;
export const transactionAgentRoleOptions = options(TRANSACTION_AGENT_ROLES);

// ===========================================================================
// RENTAL APPLICATIONS (spec 50, 51)
// ===========================================================================

export const RENTAL_APPLICATION_STATUSES = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  documents_required: 'Documents required',
  screening: 'Screening',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  cancelled: 'Cancelled',
  lease_prepared: 'Lease prepared',
  lease_signed: 'Lease signed',
} as const;
export type RentalApplicationStatus = keyof typeof RENTAL_APPLICATION_STATUSES;
export const rentalApplicationStatusOptions = options(RENTAL_APPLICATION_STATUSES);

export const SCREENING_STATUSES = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete: 'Complete',
  failed: 'Failed',
} as const;
export type ScreeningStatus = keyof typeof SCREENING_STATUSES;
export const screeningStatusOptions = options(SCREENING_STATUSES);

export const SCREENING_ITEM_STATUSES = {
  not_started: 'Not started',
  requested: 'Requested',
  received: 'Received',
  verified: 'Verified',
  failed: 'Failed',
  not_applicable: 'Not applicable',
} as const;
export type ScreeningItemStatus = keyof typeof SCREENING_ITEM_STATUSES;
export const screeningItemStatusOptions = options(SCREENING_ITEM_STATUSES);
