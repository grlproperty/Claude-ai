import { describe, expect, it } from 'vitest';
import { prepareDocument, NOT_APPLICABLE, type TemplateVersionSpec } from './documents';
import { OTP_RESIDENTIAL_FIELDS } from './otp-fields';

/**
 * The question these tests answer is the one that matters to the person signing:
 * can the system fill this in so that only checking and signing is left?
 */

const body = OTP_RESIDENTIAL_FIELDS.map((f) => `${f.label}: {{${f.key}}}`).join('\n');

const template: TemplateVersionSpec = {
  templateKey: 'otp.residential',
  version: 1,
  approvedAt: new Date('2026-01-01'),
  requiredApproval: 'SIGNATURE',
  signatoryRoles: ['purchaser', 'seller', 'agent'],
  body,
  fields: OTP_RESIDENTIAL_FIELDS,
};

const complete = {
  seller: { fullName: 'J P van der Merwe', idNumber: '8001015009087', maritalStatus: 'Married ANC', address: '14 Protea Street, Sedgefield', email: 's@example.invalid', ordinaryCourseOfBusiness: false },
  buyer: { fullName: 'T Ndlovu', idNumber: '9202204720083', maritalStatus: 'Unmarried', address: '88 Beach Road, Wilderness', email: 'b@example.invalid' },
  property: { erfNumber: 'Erf 2481', extent: '812 square metres', township: 'Sedgefield', addressLine: '14 Protea Street, Sedgefield', isTenanted: false },
  agent: { name: 'Kandy', ffcNumber: '149966', email: 'kandy@grproperty.co.za', cell: '082 555 1234' },
  offer: { amount: 4_250_000, depositAmount: 425_000, occupationDate: '2026-11-01', subjectToBond: true, bondApprovalDays: 21, bondAmount: 3_825_000, subjectToSale: false, date: '2026-09-08', expiresAt: '2026-09-15' },
  mandate: { commissionPct: 6.5 },
};

const prep = (sources: Record<string, unknown>) => prepareDocument({ template, sources, checkSet: 'otp' });

describe('a complete file produces a document ready to sign', () => {
  it('leaves nothing required outstanding', () => {
    const doc = prep(complete);
    expect(doc.missingRequired).toEqual([]);
    expect(doc.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(doc.readyForReview).toBe(true);
  });

  it('writes every amount in figures and in words, from one recorded value', () => {
    const doc = prep(complete);
    expect(doc.body).toContain('R4 250 000');
    expect(doc.body).toContain('FOUR MILLION TWO HUNDRED AND FIFTY THOUSAND RAND');
    expect(doc.body).toContain('R425 000');
    expect(doc.body).toContain('FOUR HUNDRED AND TWENTY-FIVE THOUSAND RAND');
    expect(doc.body).toContain('R3 825 000');
  });

  it('writes periods and dates the way the contract does', () => {
    const doc = prep(complete);
    expect(doc.body).toContain('7 (SEVEN) WORKING DAYS');
    expect(doc.body).toContain('21 (TWENTY-ONE) DAYS');
    expect(doc.body).toContain('1 November 2026');
  });

  it('applies GRLP’s standing terms without anyone retyping them', () => {
    const doc = prep({ ...complete, mandate: {} });
    expect(doc.fields.find((f) => f.key === 'commissionPct')?.value).toBe('6.5');
    expect(doc.fields.find((f) => f.key === 'otherTerms')?.value).toBe('NONE');
    expect(doc.fields.find((f) => f.key === 'agentOffice')?.value).toContain('Hoekwil');
  });

  it('marks clauses that do not apply as N/A, not as missing', () => {
    const doc = prep(complete);
    // No second seller, no tenant, not subject to sale.
    expect(doc.body).toContain(NOT_APPLICABLE);
    expect(doc.body).not.toContain('MISSING: Second seller');
    expect(doc.body).not.toContain('MISSING: Tenant lease expiry');
    expect(doc.body).not.toContain('MISSING: Address of purchaser');
  });
});

describe('an incomplete file stops, and says exactly what it needs', () => {
  it('names the missing field and refuses to call it ready', () => {
    const { erfNumber, ...property } = complete.property;
    void erfNumber;
    const doc = prep({ ...complete, property });
    expect(doc.readyForReview).toBe(false);
    expect(doc.missingRequired).toContain('erfNumber');
    expect(doc.body).toContain('[[ MISSING: Stand / Erf number ]]');
  });

  it('requires the bond details once the offer is subject to a bond', () => {
    const doc = prep({ ...complete, offer: { ...complete.offer, bondAmount: undefined } });
    expect(doc.missingRequired).toContain('bondAmount');
  });

  it('does not require bond details on a cash offer', () => {
    const doc = prep({
      ...complete,
      offer: { ...complete.offer, subjectToBond: false, bondAmount: undefined, bondApprovalDays: undefined },
    });
    expect(doc.missingRequired).toEqual([]);
    expect(doc.readyForReview).toBe(true);
  });

  it('requires the tenant clauses only when the property is let', () => {
    const let_ = prep({ ...complete, property: { ...complete.property, isTenanted: true } });
    expect(let_.missingRequired).toContain('leaseExpiryDate');
    expect(let_.missingRequired).toContain('tenantNoticeDate');
  });

  it('requires the second identity number once a second party is named', () => {
    const doc = prep({ ...complete, buyer: { ...complete.buyer, fullName2: 'A N Other' } });
    expect(doc.missingRequired).toContain('buyerIdNumber2');
  });
});

describe('the checks a person would otherwise have to do by eye', () => {
  it('catches an identity number that does not check out', () => {
    const doc = prep({ ...complete, buyer: { ...complete.buyer, idNumber: '9202204720082' } });
    expect(doc.readyForReview).toBe(false);
    expect(doc.issues.some((i) => i.field === 'buyerIdNumber' && i.severity === 'error')).toBe(true);
  });

  it('catches a deposit larger than the purchase price', () => {
    const doc = prep({ ...complete, offer: { ...complete.offer, depositAmount: 9_000_000 } });
    expect(doc.issues.some((i) => i.message.includes('deposit is larger'))).toBe(true);
  });

  it('catches an offer whose validity date has already passed', () => {
    const doc = prep({ ...complete, offer: { ...complete.offer, expiresAt: '2020-01-01' } });
    expect(doc.issues.some((i) => i.field === 'offerValidUntil' && i.severity === 'warning')).toBe(true);
  });

  it('catches an offer that lapses before it is even made', () => {
    const doc = prep({ ...complete, offer: { ...complete.offer, date: '2026-09-20', expiresAt: '2026-09-15' } });
    expect(doc.issues.some((i) => i.field === 'offerValidUntil' && i.severity === 'error')).toBe(true);
  });

  it('catches occupation dated before the offer was signed', () => {
    const doc = prep({ ...complete, offer: { ...complete.offer, occupationDate: '2026-01-01' } });
    expect(doc.issues.some((i) => i.field === 'occupationDate' && i.severity === 'error')).toBe(true);
  });

  it('catches a commission rate that cannot be right', () => {
    const doc = prep({ ...complete, mandate: { commissionPct: 65 } });
    expect(doc.issues.some((i) => i.field === 'commissionPct' && i.severity === 'error')).toBe(true);
  });

  it('never derives words that disagree with the figures', () => {
    const doc = prep(complete);
    const price = doc.fields.find((f) => f.key === 'purchasePrice')!;
    const words = doc.fields.find((f) => f.key === 'purchasePriceWords')!;
    // Both come from offer.amount, so they cannot drift apart.
    expect(price.sourcePath).toBe(words.sourcePath);
    expect(words.value).toBe('FOUR MILLION TWO HUNDRED AND FIFTY THOUSAND RAND');
  });
});

describe('how much is left for the person signing', () => {
  it('fills the great majority of the document from the file', () => {
    const doc = prep(complete);
    const filled = doc.fields.filter((f) => f.value != null).length;
    expect(filled / doc.fields.length).toBeGreaterThan(0.7);
  });

  it('still requires a signature — the system does not sign', () => {
    const doc = prep(complete);
    expect(doc.requiredApproval).toBe('SIGNATURE');
    expect(doc.signatoryRoles).toEqual(['purchaser', 'seller', 'agent']);
  });
});
