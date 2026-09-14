import { z } from 'zod';
import {
  ADDRESS_TYPES,
  BUSINESS_AREAS,
  CLIENT_TYPES,
  CONTACT_TYPES,
  PROVINCES,
  RELATIONSHIP_TYPES,
  type BusinessArea,
  type ClientType,
} from '../domain.ts';
import { isLikelyEmail, normaliseZaPhone } from '../phone.ts';
import { validateSaIdNumber } from '../identity.ts';
import { optionalDate, optionalDateTime, optionalText, optionalUuid, requiredText } from '../validate.ts';

const clientTypeEnum = z.enum(Object.keys(CLIENT_TYPES) as [ClientType, ...ClientType[]]);
const businessAreaEnum = z.enum(Object.keys(BUSINESS_AREAS) as [BusinessArea, ...BusinessArea[]]);
const contactTypeEnum = z.enum(Object.keys(CONTACT_TYPES) as [string, ...string[]]);
const addressTypeEnum = z.enum(Object.keys(ADDRESS_TYPES) as [string, ...string[]]);
const provinceEnum = z.enum(PROVINCES as unknown as [string, ...string[]]);

export const contactInputSchema = z
  .object({
    id: optionalUuid,
    contactType: contactTypeEnum,
    value: requiredText('Contact detail', 200),
    isPrimary: z.boolean().default(false),
    isActive: z.boolean().default(true),
    notes: optionalText,
  })
  .superRefine((row, ctx) => {
    if (row.contactType === 'email' && !isLikelyEmail(row.value)) {
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'That does not look like an email address.',
      });
      return;
    }
    if (row.contactType !== 'email' && row.contactType !== 'other') {
      const normalised = normaliseZaPhone(row.value);
      const digits = (normalised ?? '').replace(/\D/g, '');
      if (digits.length < 9 || digits.length > 15) {
        ctx.addIssue({
          code: 'custom',
          path: ['value'],
          message: 'That does not look like a telephone number, for example 082 543 2681.',
        });
      }
    }
  });

export const addressInputSchema = z.object({
  id: optionalUuid,
  addressType: addressTypeEnum.default('physical'),
  line1: optionalText,
  line2: optionalText,
  suburb: optionalText,
  city: optionalText,
  province: z.union([provinceEnum, z.literal('')]).optional().transform((v) => (v ? v : null)),
  postalCode: optionalText,
  isPrimary: z.boolean().default(false),
  notes: optionalText,
});

export const personInputSchema = z.object({
  title: optionalText,
  firstName: requiredText('First name', 80),
  middleName: optionalText,
  surname: requiredText('Surname', 80),
  preferredName: optionalText,

  idNumber: optionalText.refine(
    (value) => value === null || validateSaIdNumber(value).valid,
    // The specific reason is attached by the caller so the message can name
    // the check digit or the date.
    { message: 'That ID number is not valid.' },
  ),
  passportNumber: optionalText,
  passportCountry: optionalText,
  passportExpiry: optionalDate,

  businessArea: businessAreaEnum.default('sales'),
  clientTypes: z.array(clientTypeEnum).default([]),

  primaryAgentId: optionalUuid,
  secondaryAgentId: optionalUuid,
  officeId: optionalUuid,
  teamId: optionalUuid,

  nextFollowUpAt: optionalDateTime,
  notes: optionalText,

  contacts: z.array(contactInputSchema).default([]),
  addresses: z.array(addressInputSchema).default([]),
  tagIds: z.array(z.uuid()).default([]),
});

export type PersonInput = z.infer<typeof personInputSchema>;

export const relationshipInputSchema = z.object({
  relatedPersonId: z.uuid('Please choose the other person.'),
  relationshipType: z.enum(
    Object.keys(RELATIONSHIP_TYPES) as [string, ...string[]],
  ),
  startDate: optionalDate,
  endDate: optionalDate,
  notes: optionalText,
});

// --- Read models -----------------------------------------------------------

export interface PersonSummary {
  id: string;
  clientRef: string;
  fullName: string;
  displayName: string;
  businessArea: BusinessArea;
  clientTypes: ClientType[];
  primaryAgentName: string | null;
  primaryAgentId: string | null;
  primaryMobile: string | null;
  primaryEmail: string | null;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  isArchived: boolean;
  tags: { id: string; name: string; colour: string }[];
}

export interface PersonContact {
  id: string;
  contactType: string;
  value: string;
  valueNormalised: string | null;
  isPrimary: boolean;
  isActive: boolean;
  notes: string | null;
}

export interface PersonAddress {
  id: string;
  addressType: string;
  line1: string | null;
  line2: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  isPrimary: boolean;
  notes: string | null;
}

export interface PersonRelationship {
  id: string;
  relationshipType: string;
  otherPersonId: string;
  otherPersonName: string;
  otherPersonRef: string;
  direction: 'from' | 'to';
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
}

export interface PersonDetail extends PersonSummary {
  title: string | null;
  firstName: string;
  middleName: string | null;
  surname: string;
  preferredName: string | null;
  /** Masked unless the reader holds PERSON_ID_VIEW and asked to reveal it. */
  idDisplay: string;
  idIsRecorded: boolean;
  passportDisplay: string;
  passportIsRecorded: boolean;
  passportCountry: string | null;
  passportExpiry: string | null;
  secondaryAgentId: string | null;
  secondaryAgentName: string | null;
  officeId: string | null;
  officeName: string | null;
  teamId: string | null;
  teamName: string | null;
  firstContactAt: string | null;
  lastContactMethod: string | null;
  lastContactedByName: string | null;
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
  contacts: PersonContact[];
  addresses: PersonAddress[];
  relationships: PersonRelationship[];
}

export function fullNameOf(person: {
  firstName: string;
  surname: string;
  preferredName?: string | null;
}): string {
  return `${person.firstName} ${person.surname}`.trim();
}
