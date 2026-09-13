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
      'not_available', 'not_sold', 'sold_by_third_party',
    ].includes(value)
  ) {
    return 'stop';
  }
  if (['on_market'].includes(value)) return 'brand';
  if (['prospect', 'rental_prospect', 'off_market', 'not_prepared'].includes(value)) return 'neutral';
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
