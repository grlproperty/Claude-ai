import {
  BUSINESS_AREAS,
  CLIENT_TYPES,
  MANDATE_STATUSES,
  MANDATE_TYPES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  PROVINCES,
  RENTAL_STATUSES,
  SALES_STATUSES,
} from '../domain.ts';

/**
 * What can be brought in, and what the outside world tends to call it
 * (spec 61, 63).
 *
 * A PropCtrl export does not use the CRM's field names, and neither does the
 * spreadsheet somebody has been keeping since 2019. Rather than making a
 * person map thirty columns by hand every month, each field carries the
 * header names it has actually been seen under, and the mapping is proposed
 * from those. The proposal is always shown for confirmation — it is a
 * starting point, never a decision taken quietly.
 *
 * Nested things are deliberately flat here. A person's mobile number lives in
 * person_contacts, but a spreadsheet has a column called "Cell", so the
 * importable field is 'mobile' and assembling it into a contact row is the
 * writer's job, not the mapper's.
 */

export type FieldKind =
  | 'text'
  | 'longText'
  | 'phone'
  | 'email'
  | 'idNumber'
  | 'date'
  | 'money'
  | 'count'
  | 'enum'
  | 'list';

export interface ImportField {
  key: string;
  label: string;
  kind: FieldKind;
  /** Header names, lower-cased and stripped of punctuation, that mean this. */
  aliases: string[];
  /** For 'enum': the permitted values, plus what outside systems call them. */
  values?: Record<string, string>;
  valueAliases?: Record<string, string>;
  /** Shown in the wizard so somebody knows what good input looks like. */
  example?: string;
  /** A row with none of these is not worth importing. */
  identifying?: boolean;
}

/** Lower-cases a header and drops everything that is not a letter or digit. */
export function normaliseHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '');
}

const enumAliases = (pairs: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(pairs).map(([alias, value]) => [normaliseHeader(alias), value]),
  );

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const PERSON_FIELDS: ImportField[] = [
  {
    key: 'title',
    label: 'Title',
    kind: 'text',
    aliases: ['title', 'salutation', 'honorific'],
    example: 'Mr',
  },
  {
    key: 'firstName',
    label: 'First name',
    kind: 'text',
    aliases: ['firstname', 'name', 'givenname', 'forename', 'firstnames', 'initials'],
    example: 'Johan',
    identifying: true,
  },
  {
    key: 'middleName',
    label: 'Middle name',
    kind: 'text',
    aliases: ['middlename', 'secondname', 'othernames'],
  },
  {
    key: 'surname',
    label: 'Surname',
    kind: 'text',
    aliases: ['surname', 'lastname', 'familyname', 'lastnames'],
    example: 'van der Merwe',
    identifying: true,
  },
  {
    key: 'preferredName',
    label: 'Goes by',
    kind: 'text',
    aliases: ['preferredname', 'knownas', 'nickname', 'displayname'],
  },
  {
    key: 'idNumber',
    label: 'South African ID number',
    kind: 'idNumber',
    aliases: ['idnumber', 'id', 'identitynumber', 'said', 'rsaid', 'idno'],
    example: '8001015009087',
    identifying: true,
  },
  {
    key: 'passportNumber',
    label: 'Passport number',
    kind: 'text',
    aliases: ['passportnumber', 'passport', 'passportno'],
  },
  {
    key: 'passportCountry',
    label: 'Passport country',
    kind: 'text',
    aliases: ['passportcountry', 'nationality', 'countryofissue'],
  },
  {
    key: 'passportExpiry',
    label: 'Passport expiry',
    kind: 'date',
    aliases: ['passportexpiry', 'passportexpirydate'],
  },
  {
    key: 'mobile',
    label: 'Mobile',
    kind: 'phone',
    aliases: ['mobile', 'cell', 'cellphone', 'cellnumber', 'mobilenumber', 'cellno', 'phone'],
    example: '082 123 4567',
    identifying: true,
  },
  {
    key: 'alternativeMobile',
    label: 'Alternative mobile',
    kind: 'phone',
    aliases: ['alternativemobile', 'altcell', 'secondcell', 'mobile2', 'cell2', 'othercell'],
  },
  {
    key: 'landline',
    label: 'Landline',
    kind: 'phone',
    aliases: ['landline', 'telephone', 'tel', 'hometel', 'worktel', 'officephone', 'telno'],
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    kind: 'phone',
    aliases: ['whatsapp', 'whatsappnumber', 'wa'],
  },
  {
    key: 'email',
    label: 'Email',
    kind: 'email',
    aliases: ['email', 'emailaddress', 'mail', 'eaddress', 'email1'],
    example: 'johan@example.co.za',
    identifying: true,
  },
  {
    key: 'businessArea',
    label: 'Business area',
    kind: 'enum',
    aliases: ['businessarea', 'area', 'division', 'department'],
    values: BUSINESS_AREAS,
    valueAliases: enumAliases({
      sales: 'sales',
      residential: 'sales',
      rentals: 'rentals',
      letting: 'rentals',
      lettings: 'rentals',
      rental: 'rentals',
      both: 'sales_rentals',
      'sales and rentals': 'sales_rentals',
      commercial: 'commercial',
    }),
  },
  {
    key: 'clientTypes',
    label: 'Client types',
    kind: 'list',
    aliases: ['clienttype', 'clienttypes', 'type', 'category', 'contacttype', 'role'],
    values: CLIENT_TYPES,
    valueAliases: enumAliases({
      buyer: 'buyer',
      purchaser: 'buyer',
      seller: 'seller',
      vendor: 'seller',
      owner: 'seller',
      tenant: 'tenant',
      lessee: 'tenant',
      landlord: 'landlord',
      lessor: 'landlord',
      investor: 'investor',
      developer: 'developer',
      attorney: 'attorney',
      conveyancer: 'attorney',
      supplier: 'supplier',
      contractor: 'supplier',
    }),
    example: 'Buyer, Tenant',
  },
  {
    key: 'addressLine1',
    label: 'Address line 1',
    kind: 'text',
    aliases: ['addressline1', 'address1', 'address', 'streetaddress', 'physicaladdress', 'line1'],
  },
  {
    key: 'addressLine2',
    label: 'Address line 2',
    kind: 'text',
    aliases: ['addressline2', 'address2', 'line2', 'complex', 'unit'],
  },
  {
    key: 'addressSuburb',
    label: 'Suburb',
    kind: 'text',
    aliases: ['suburb', 'area2', 'neighbourhood', 'district'],
  },
  { key: 'addressCity', label: 'City or town', kind: 'text', aliases: ['city', 'town', 'municipality'] },
  {
    key: 'addressProvince',
    label: 'Province',
    kind: 'enum',
    aliases: ['province', 'state', 'region'],
    values: Object.fromEntries(PROVINCES.map((province) => [province, province])),
    valueAliases: enumAliases({
      wc: 'Western Cape',
      'western cape': 'Western Cape',
      ec: 'Eastern Cape',
      'eastern cape': 'Eastern Cape',
      gp: 'Gauteng',
      gauteng: 'Gauteng',
      kzn: 'KwaZulu-Natal',
      'kwazulu natal': 'KwaZulu-Natal',
      'kwazulu-natal': 'KwaZulu-Natal',
      fs: 'Free State',
      'free state': 'Free State',
      nc: 'Northern Cape',
      nw: 'North West',
      lp: 'Limpopo',
      mp: 'Mpumalanga',
    }),
  },
  {
    key: 'addressPostalCode',
    label: 'Postal code',
    kind: 'text',
    aliases: ['postalcode', 'postcode', 'zip', 'zipcode'],
  },
  {
    key: 'notes',
    label: 'Notes',
    kind: 'longText',
    aliases: ['notes', 'note', 'comments', 'comment', 'remarks', 'description'],
  },
];

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

export const PROPERTY_FIELDS: ImportField[] = [
  {
    key: 'erfNumber',
    label: 'Erf number',
    kind: 'text',
    aliases: ['erfnumber', 'erf', 'erfno', 'standnumber', 'stand', 'lotnumber'],
    identifying: true,
  },
  {
    key: 'portionNumber',
    label: 'Portion number',
    kind: 'text',
    aliases: ['portionnumber', 'portion', 'portionno'],
  },
  { key: 'township', label: 'Township', kind: 'text', aliases: ['township', 'farmname', 'scheme'] },
  {
    key: 'propertyName',
    label: 'Property or complex name',
    kind: 'text',
    aliases: ['propertyname', 'complexname', 'buildingname', 'developmentname', 'estate'],
    identifying: true,
  },
  {
    key: 'streetAddress',
    label: 'Street address',
    kind: 'text',
    aliases: ['streetaddress', 'address', 'address1', 'addressline1', 'physicaladdress', 'street'],
    identifying: true,
  },
  {
    key: 'suburb',
    label: 'Suburb',
    kind: 'text',
    aliases: ['suburb', 'neighbourhood', 'district', 'area'],
    identifying: true,
  },
  { key: 'city', label: 'City or town', kind: 'text', aliases: ['city', 'town', 'municipality'] },
  {
    key: 'province',
    label: 'Province',
    kind: 'enum',
    aliases: ['province', 'state', 'region'],
    values: Object.fromEntries(PROVINCES.map((province) => [province, province])),
    valueAliases: enumAliases({
      wc: 'Western Cape',
      'western cape': 'Western Cape',
      ec: 'Eastern Cape',
      gp: 'Gauteng',
      kzn: 'KwaZulu-Natal',
      'kwazulu-natal': 'KwaZulu-Natal',
      fs: 'Free State',
      nc: 'Northern Cape',
      nw: 'North West',
      lp: 'Limpopo',
      mp: 'Mpumalanga',
    }),
  },
  {
    key: 'postalCode',
    label: 'Postal code',
    kind: 'text',
    aliases: ['postalcode', 'postcode', 'zip'],
  },
  {
    key: 'propertyType',
    label: 'Property type',
    kind: 'enum',
    aliases: ['propertytype', 'type', 'dwellingtype', 'category'],
    values: PROPERTY_TYPES,
    valueAliases: enumAliases({
      house: 'house',
      freestanding: 'house',
      'freestanding house': 'house',
      dwelling: 'house',
      apartment: 'apartment',
      flat: 'apartment',
      townhouse: 'townhouse',
      duplex: 'townhouse',
      simplex: 'townhouse',
      cluster: 'townhouse',
      vacantland: 'vacant_land',
      'vacant land': 'vacant_land',
      land: 'vacant_land',
      plot: 'vacant_land',
      erf: 'vacant_land',
      farm: 'farm',
      smallholding: 'smallholding',
      plotandplan: 'house',
      commercial: 'commercial',
      office: 'commercial',
      retail: 'commercial',
      industrial: 'industrial',
      warehouse: 'industrial',
    }),
  },
  { key: 'bedrooms', label: 'Bedrooms', kind: 'count', aliases: ['bedrooms', 'beds', 'bed', 'nobedrooms'] },
  {
    key: 'bathrooms',
    label: 'Bathrooms',
    kind: 'count',
    aliases: ['bathrooms', 'baths', 'bath', 'nobathrooms'],
  },
  { key: 'garages', label: 'Garages', kind: 'count', aliases: ['garages', 'garage', 'garaging'] },
  {
    key: 'parking',
    label: 'Parking bays',
    kind: 'count',
    aliases: ['parking', 'parkingbays', 'carports', 'carport', 'openparking'],
  },
  {
    key: 'landSizeSqm',
    label: 'Land size (m²)',
    kind: 'count',
    aliases: ['landsize', 'landsizesqm', 'erfsize', 'standsize', 'plotsize', 'landarea'],
  },
  {
    key: 'buildingSizeSqm',
    label: 'Building size (m²)',
    kind: 'count',
    aliases: ['buildingsize', 'buildingsizesqm', 'floorsize', 'floorarea', 'undertoof', 'underroof'],
  },
  {
    key: 'originalAskingPrice',
    label: 'Original asking price',
    kind: 'money',
    aliases: ['originalaskingprice', 'originalprice', 'listprice', 'listingprice'],
  },
  {
    key: 'currentAskingPrice',
    label: 'Asking price',
    kind: 'money',
    aliases: ['currentaskingprice', 'askingprice', 'price', 'saleprice', 'amount'],
  },
  {
    key: 'estimatedValue',
    label: 'Estimated value',
    kind: 'money',
    aliases: ['estimatedvalue', 'valuation', 'marketvalue', 'municipalvalue'],
  },
  {
    key: 'monthlyRental',
    label: 'Monthly rental',
    kind: 'money',
    aliases: ['monthlyrental', 'rental', 'rent', 'rentalamount', 'rentpermonth'],
  },
  {
    key: 'businessArea',
    label: 'Business area',
    kind: 'enum',
    aliases: ['businessarea', 'division', 'department'],
    values: BUSINESS_AREAS,
    valueAliases: enumAliases({
      sales: 'sales',
      sale: 'sales',
      forsale: 'sales',
      residential: 'sales',
      rentals: 'rentals',
      rental: 'rentals',
      tolet: 'rentals',
      letting: 'rentals',
      both: 'sales_rentals',
      commercial: 'commercial',
    }),
  },
  {
    key: 'propertyStatus',
    label: 'Property status',
    kind: 'enum',
    aliases: ['propertystatus'],
    values: PROPERTY_STATUSES,
    valueAliases: enumAliases({
      active: 'active',
      current: 'active',
      onmarket: 'on_market',
      'on market': 'on_market',
      listed: 'on_market',
      offmarket: 'off_market',
      withdrawn: 'off_market',
      archived: 'archived',
    }),
  },
  {
    key: 'salesStatus',
    label: 'Sales status',
    kind: 'enum',
    aliases: ['salesstatus', 'status', 'listingstatus', 'marketstatus'],
    values: SALES_STATUSES,
    valueAliases: enumAliases({
      prospect: 'prospect',
      lead: 'prospect',
      onmarket: 'on_market',
      'on market': 'on_market',
      forsale: 'on_market',
      available: 'on_market',
      offerreceived: 'offer_received',
      'offer received': 'offer_received',
      underoffer: 'offer_received',
      salepending: 'sale_pending',
      'sale pending': 'sale_pending',
      pending: 'sale_pending',
      saleconcluded: 'sale_concluded',
      sold: 'sale_concluded',
      saleregistered: 'sale_registered',
      registered: 'sale_registered',
      transferred: 'sale_registered',
      salecancelled: 'sale_cancelled',
      cancelled: 'sale_cancelled',
    }),
  },
  {
    key: 'rentalStatus',
    label: 'Rental status',
    kind: 'enum',
    aliases: ['rentalstatus', 'letstatus'],
    values: RENTAL_STATUSES,
    valueAliases: enumAliases({
      rentalprospect: 'rental_prospect',
      prospect: 'rental_prospect',
      available: 'available_to_let',
      availabletolet: 'available_to_let',
      tolet: 'available_to_let',
      applicationpending: 'application_pending',
      let: 'let',
      leased: 'let',
      tenanted: 'let',
      leaseexpired: 'lease_expired',
      expired: 'lease_expired',
    }),
  },
  {
    key: 'mandateStatus',
    label: 'Mandate status',
    kind: 'enum',
    aliases: ['mandatestatus'],
    values: MANDATE_STATUSES,
    valueAliases: enumAliases({
      nomandate: 'no_mandate',
      none: 'no_mandate',
      mandateactive: 'mandate_active',
      active: 'mandate_active',
      signed: 'mandate_active',
      mandateexpired: 'mandate_expired',
      expired: 'mandate_expired',
      mandatewithdrawn: 'mandate_withdrawn',
      withdrawn: 'mandate_withdrawn',
    }),
  },
  {
    key: 'mandateType',
    label: 'Mandate type',
    kind: 'enum',
    aliases: ['mandatetype', 'mandate'],
    values: MANDATE_TYPES,
    valueAliases: enumAliases({
      sole: 'sole',
      solemandate: 'sole',
      exclusive: 'sole',
      open: 'open',
      openmandate: 'open',
      nonexclusive: 'open',
      multiple: 'multi_listing',
      multilisting: 'multi_listing',
      mls: 'multi_listing',
      joint: 'joint',
      jointmandate: 'joint',
    }),
  },
  { key: 'mandateStart', label: 'Mandate start', kind: 'date', aliases: ['mandatestart', 'mandatestartdate', 'listingdate'] },
  {
    key: 'mandateExpiry',
    label: 'Mandate expiry',
    kind: 'date',
    aliases: ['mandateexpiry', 'mandateenddate', 'mandateexpirydate', 'expirydate'],
  },
  {
    key: 'notes',
    label: 'Notes',
    kind: 'longText',
    aliases: ['notes', 'note', 'comments', 'remarks', 'description', 'marketingdescription'],
  },
];

export function fieldsFor(entityType: 'person' | 'property'): ImportField[] {
  return entityType === 'person' ? PERSON_FIELDS : PROPERTY_FIELDS;
}

export function fieldByKey(
  entityType: 'person' | 'property',
  key: string,
): ImportField | undefined {
  return fieldsFor(entityType).find((field) => field.key === key);
}

/**
 * Headers a PropCtrl export is known to use where the plain alias list would
 * guess wrong or miss it. Applied on top of the aliases, not instead of them.
 */
export const SOURCE_SYSTEM_HINTS: Record<
  string,
  { person?: Record<string, string>; property?: Record<string, string> }
> = {
  propctrl: {
    person: {
      contactname: 'firstName',
      contactsurname: 'surname',
      contactcell: 'mobile',
      contactemail: 'email',
      contactidnumber: 'idNumber',
      contactcategory: 'clientTypes',
      contactphysicaladdress: 'addressLine1',
    },
    property: {
      propertyreference: 'erfNumber',
      unitnumber: 'portionNumber',
      propertyaddress: 'streetAddress',
      propertysuburb: 'suburb',
      propertycity: 'city',
      askingamount: 'currentAskingPrice',
      rentalamountpm: 'monthlyRental',
      mandatetypedescription: 'mandateType',
      listingstatusdescription: 'salesStatus',
    },
  },
};

export const SOURCE_SYSTEMS = {
  generic: 'A spreadsheet of our own',
  propctrl: 'PropCtrl export',
  private_property: 'Private Property export',
  property24: 'Property24 export',
} as const;
export type SourceSystem = keyof typeof SOURCE_SYSTEMS;
