import { z } from 'zod';
import {
  BUSINESS_AREAS,
  MANDATE_STATUSES,
  MANDATE_TYPES,
  MARKETING_CHANNELS,
  MARKETING_STATUSES,
  PROPERTY_PERSON_ROLES,
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  PROVINCES,
  RENTAL_STATUSES,
  SALES_STATUSES,
  SALE_OUTCOMES,
  type BusinessArea,
  type MandateStatus,
  type MandateType,
  type MarketingStatus,
  type PropertyStatus,
  type PropertyType,
  type RentalStatus,
  type SaleOutcome,
  type SalesStatus,
} from '../domain.ts';
import { optionalDate, optionalMoney, optionalText, optionalUuid } from '../validate.ts';

const keys = <T extends Record<string, string>>(map: T) =>
  Object.keys(map) as [keyof T & string, ...(keyof T & string)[]];

const optionalCount = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null || value === '') return null;
    const cleaned = String(value).replace(/[\s,]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
    return cleaned;
  })
  .refine((value) => value === null || !Number.isNaN(value), {
    message: 'Please enter a number, for example 3 or 2.5.',
  }) as unknown as z.ZodType<string | null>;

export const propertyInputSchema = z
  .object({
    // Identification
    erfNumber: optionalText,
    portionNumber: optionalText,
    township: optionalText,
    propertyName: optionalText,
    streetAddress: optionalText,
    suburb: optionalText,
    city: optionalText,
    province: z
      .union([z.enum(PROVINCES as unknown as [string, ...string[]]), z.literal('')])
      .optional()
      .transform((v) => (v ? v : null)),
    postalCode: optionalText,

    // The property itself
    propertyType: z.enum(keys(PROPERTY_TYPES)).default('house'),
    bedrooms: optionalCount,
    bathrooms: optionalCount,
    garages: optionalCount,
    parking: optionalCount,
    landSizeSqm: optionalCount,
    buildingSizeSqm: optionalCount,

    // Money
    originalAskingPrice: optionalMoney,
    currentAskingPrice: optionalMoney,
    estimatedValue: optionalMoney,
    monthlyRental: optionalMoney,

    // Business area, kept separate from every status
    businessArea: z.enum(keys(BUSINESS_AREAS)).default('sales'),

    // The six separate status concepts
    propertyStatus: z.enum(keys(PROPERTY_STATUSES)).default('active'),
    salesStatus: z.enum(keys(SALES_STATUSES)).default('prospect'),
    rentalStatus: z.enum(keys(RENTAL_STATUSES)).default('rental_prospect'),
    mandateStatus: z.enum(keys(MANDATE_STATUSES)).default('no_mandate'),
    mandateType: z
      .union([z.enum(keys(MANDATE_TYPES)), z.literal('')])
      .optional()
      .transform((v) => (v ? v : null)),
    saleOutcome: z.enum(keys(SALE_OUTCOMES)).default('not_applicable'),

    mandateStart: optionalDate,
    mandateExpiry: optionalDate,

    primaryAgentId: optionalUuid,
    secondaryAgentId: optionalUuid,
    officeId: optionalUuid,
    teamId: optionalUuid,

    notes: optionalText,
    statusChangeReason: optionalText,
    tagIds: z.array(z.uuid()).default([]),
  })
  .superRefine((input, ctx) => {
    // A property has to be findable by something.
    if (!input.streetAddress && !input.erfNumber && !input.propertyName) {
      ctx.addIssue({
        code: 'custom',
        path: ['streetAddress'],
        message: 'Give a street address, an erf number or a property name.',
      });
    }
    if (input.mandateStatus === 'mandate_active' && !input.mandateStart) {
      ctx.addIssue({
        code: 'custom',
        path: ['mandateStart'],
        message: 'An active mandate needs a start date.',
      });
    }
    if (
      input.mandateStart &&
      input.mandateExpiry &&
      input.mandateExpiry < input.mandateStart
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['mandateExpiry'],
        message: 'The mandate cannot expire before it starts.',
      });
    }
  });

export type PropertyInput = z.infer<typeof propertyInputSchema>;

export const propertyPersonInputSchema = z.object({
  personId: z.uuid('Please choose a person.'),
  role: z.enum(keys(PROPERTY_PERSON_ROLES)),
  ownershipPercent: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null || value === '') return null;
      const cleaned = String(value).replace(/[\s%,]/g, '');
      if (!/^\d+(\.\d{1,3})?$/.test(cleaned)) return Number.NaN;
      return cleaned;
    })
    .refine((value) => value === null || !Number.isNaN(value), {
      message: 'Enter a percentage between 0 and 100.',
    }) as unknown as z.ZodType<string | null>,
  isPrimaryContact: z.boolean().default(false),
  startDate: optionalDate,
  endDate: optionalDate,
  notes: optionalText,
});

export const marketingInputSchema = z.object({
  headline: optionalText,
  shortDescription: optionalText,
  fullDescription: optionalText,
  keySellingPoints: optionalText,
  features: optionalText,
  directions: optionalText,
  onShowInfo: optionalText,
  marketingNotes: optionalText,
  marketingStatus: z.enum(keys(MARKETING_STATUSES)).default('not_prepared'),
});

export const marketingChannelInputSchema = z.object({
  channel: z.enum(keys(MARKETING_CHANNELS)),
  isPublished: z.boolean().default(false),
  publishedAt: optionalDate,
  removedAt: optionalDate,
  sourceUrl: optionalText,
  notes: optionalText,
});

export const saleHistoryInputSchema = z.object({
  saleDate: optionalDate,
  registeredAt: optionalDate,
  salePrice: optionalMoney,
  buyerId: optionalUuid,
  sellerId: optionalUuid,
  agentId: optionalUuid,
  saleOutcome: z
    .union([z.enum(keys(SALE_OUTCOMES)), z.literal('')])
    .optional()
    .transform((v) => (v ? v : null)),
  notes: optionalText,
});

export const rentalHistoryInputSchema = z.object({
  leaseStart: optionalDate,
  leaseEnd: optionalDate,
  monthlyRental: optionalMoney,
  tenantId: optionalUuid,
  landlordId: optionalUuid,
  agentId: optionalUuid,
  notes: optionalText,
});

export const propertyAssignInputSchema = z.object({
  primaryAgentId: optionalUuid,
  secondaryAgentId: optionalUuid,
  reason: optionalText,
});

// --- Read models -----------------------------------------------------------

export interface PropertySummary {
  id: string;
  propertyRef: string;
  addressLine: string;
  propertyName: string | null;
  streetAddress: string | null;
  erfNumber: string | null;
  portionNumber: string | null;
  suburb: string | null;
  city: string | null;
  propertyType: PropertyType;
  bedrooms: string | null;
  bathrooms: string | null;
  businessArea: BusinessArea;
  propertyStatus: PropertyStatus;
  salesStatus: SalesStatus;
  rentalStatus: RentalStatus;
  mandateStatus: MandateStatus;
  mandateType: MandateType | null;
  saleOutcome: SaleOutcome;
  mandateExpiry: string | null;
  currentAskingPrice: string | null;
  monthlyRental: string | null;
  primaryAgentId: string | null;
  primaryAgentName: string | null;
  ownerNames: string[];
  isArchived: boolean;
  tags: { id: string; name: string; colour: string }[];
  coverPhotoId: string | null;
}

export interface PropertyPersonLink {
  id: string;
  personId: string;
  personName: string;
  personRef: string;
  personMobile: string | null;
  personEmail: string | null;
  role: string;
  ownershipPercent: string | null;
  isPrimaryContact: boolean;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
}

export interface PropertyMarketing {
  headline: string | null;
  shortDescription: string | null;
  fullDescription: string | null;
  keySellingPoints: string | null;
  features: string | null;
  directions: string | null;
  onShowInfo: string | null;
  marketingNotes: string | null;
  marketingStatus: MarketingStatus;
}

export interface PropertyDetail extends PropertySummary {
  township: string | null;
  province: string | null;
  postalCode: string | null;
  garages: string | null;
  parking: string | null;
  landSizeSqm: string | null;
  buildingSizeSqm: string | null;
  originalAskingPrice: string | null;
  estimatedValue: string | null;
  mandateStart: string | null;
  secondaryAgentId: string | null;
  secondaryAgentName: string | null;
  officeId: string | null;
  officeName: string | null;
  teamId: string | null;
  teamName: string | null;
  notes: string | null;
  mergedIntoId: string | null;
  mergedIntoRef: string | null;
  archivedAt: string | null;
  archiveReason: string | null;
  createdAt: string;
  createdByName: string | null;
  updatedAt: string;
  updatedByName: string | null;
  rowVersion: number;
  people: PropertyPersonLink[];
  marketing: PropertyMarketing | null;
}
