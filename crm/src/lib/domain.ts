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
