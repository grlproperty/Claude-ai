import { describe, expect, it } from 'vitest';
import {
  SupersededTemplateError,
  UnapprovedTemplateError,
  findUnmappedPlaceholders,
  prepareDocument,
  readPath,
  type TemplateVersionSpec,
} from './documents';

const otpTemplate: TemplateVersionSpec = {
  templateKey: 'otp',
  version: 3,
  requiredApproval: 'SIGNATURE',
  signatoryRoles: ['buyer', 'seller', 'agent'],
  approvedAt: new Date('2026-01-15'),
  body: [
    'OFFER TO PURCHASE',
    'The Purchaser, {{buyerFullName}} (ID {{buyerIdNumber}}), offers to purchase',
    'the property at {{propertyAddress}} for the sum of {{offerAmount}},',
    'payable by a deposit of {{depositAmount}} and a bond of {{bondAmount}}.',
    'Occupation: {{occupationDate}}. Offer dated {{offerDate}}.',
  ].join('\n'),
  fields: [
    { key: 'buyerFullName', label: 'Purchaser full name', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'buyer.fullName', order: 1 },
    { key: 'buyerIdNumber', label: 'Purchaser identity number', dataType: 'id_number', required: true, validators: ['sa_id'], sourcePath: 'buyer.idNumber', order: 2 },
    { key: 'sellerIdNumber', label: 'Seller identity number', dataType: 'id_number', required: true, validators: ['sa_id'], sourcePath: 'seller.idNumber', order: 3 },
    { key: 'propertyAddress', label: 'Property address', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'property.addressLine', order: 4 },
    { key: 'offerAmount', label: 'Offer amount', dataType: 'currency', required: true, validators: ['positive'], sourcePath: 'offer.amount', order: 5 },
    { key: 'depositAmount', label: 'Deposit', dataType: 'currency', required: true, validators: ['positive'], sourcePath: 'offer.deposit', order: 6 },
    { key: 'bondAmount', label: 'Bond amount', dataType: 'currency', required: false, validators: ['currency'], sourcePath: 'offer.bond', order: 7 },
    { key: 'occupationDate', label: 'Occupation date', dataType: 'date', required: true, validators: ['date'], sourcePath: 'offer.occupationDate', order: 8 },
    { key: 'offerDate', label: 'Offer date', dataType: 'date', required: true, validators: ['date'], sourcePath: 'offer.date', order: 9 },
  ],
};

const goodSources = {
  buyer: { fullName: 'J P van der Merwe', idNumber: '8001015009087' },
  seller: { fullName: 'A Ndlovu', idNumber: '9202204720083' },
  property: { addressLine: '14 Protea Street, Sedgefield' },
  offer: { amount: 4_250_000, deposit: 425_000, bond: 3_825_000, occupationDate: '2026-11-01', date: '2026-09-15' },
};

describe('preparing an offer to purchase', () => {
  it('populates every field from the records and marks it ready', () => {
    const doc = prepareDocument({ template: otpTemplate, sources: goodSources, checkSet: 'otp' });
    expect(doc.readyForReview).toBe(true);
    expect(doc.missingRequired).toEqual([]);
    expect(doc.body).toContain('J P van der Merwe');
    expect(doc.body).toContain('14 Protea Street, Sedgefield');
    expect(doc.body).not.toContain('{{');
    expect(doc.summary).toContain('ready for review');
  });

  it('shows a missing field as a visible gap and refuses to call it ready', () => {
    const sources = { ...goodSources, buyer: { fullName: 'J P van der Merwe' } };
    const doc = prepareDocument({ template: otpTemplate, sources, checkSet: 'otp' });
    expect(doc.readyForReview).toBe(false);
    expect(doc.missingRequired).toContain('buyerIdNumber');
    expect(doc.body).toContain('[[ MISSING: Purchaser identity number ]]');
    // The gap must be impossible to miss — never a blank in a contract.
    expect(doc.body).not.toMatch(/ID \)/);
  });

  it('never invents a value it cannot source', () => {
    const doc = prepareDocument({ template: otpTemplate, sources: { ...goodSources, offer: {} }, checkSet: 'otp' });
    const amount = doc.fields.find((f) => f.key === 'offerAmount');
    expect(amount?.value).toBeNull();
    expect(amount?.missing).toBe(true);
  });

  it('catches an identity number that does not check out', () => {
    const sources = { ...goodSources, buyer: { ...goodSources.buyer, idNumber: '8001015009088' } };
    const doc = prepareDocument({ template: otpTemplate, sources, checkSet: 'otp' });
    expect(doc.readyForReview).toBe(false);
    expect(doc.issues.some((i) => i.field === 'buyerIdNumber' && i.severity === 'error')).toBe(true);
  });

  it('catches a deposit larger than the offer', () => {
    const sources = { ...goodSources, offer: { ...goodSources.offer, deposit: 5_000_000 } };
    const doc = prepareDocument({ template: otpTemplate, sources, checkSet: 'otp' });
    expect(doc.issues.some((i) => i.message.includes('deposit is larger'))).toBe(true);
    expect(doc.readyForReview).toBe(false);
  });

  it('warns when the deposit and bond do not add up to the offer', () => {
    const sources = { ...goodSources, offer: { ...goodSources.offer, bond: 1_000_000 } };
    const doc = prepareDocument({ template: otpTemplate, sources, checkSet: 'otp' });
    const issue = doc.issues.find((i) => i.field === 'bondAmount');
    expect(issue?.severity).toBe('warning');
    // A warning is a question for a human, not a blocker.
    expect(doc.readyForReview).toBe(true);
  });

  it('catches occupation dated before the offer', () => {
    const sources = { ...goodSources, offer: { ...goodSources.offer, occupationDate: '2026-01-01' } };
    const doc = prepareDocument({ template: otpTemplate, sources, checkSet: 'otp' });
    expect(doc.issues.some((i) => i.field === 'occupationDate' && i.severity === 'error')).toBe(true);
  });

  it('catches the buyer and seller being the same person', () => {
    const sources = { ...goodSources, seller: { idNumber: '8001015009087' } };
    const doc = prepareDocument({ template: otpTemplate, sources, checkSet: 'otp' });
    expect(doc.issues.some((i) => i.message.includes('same'))).toBe(true);
  });

  it('lets a person override a sourced value', () => {
    const doc = prepareDocument({
      template: otpTemplate,
      sources: goodSources,
      overrides: { offerAmount: '4300000' },
      checkSet: 'otp',
    });
    expect(doc.body).toContain('4300000');
  });
});

describe('template integrity', () => {
  it('refuses to produce a document from wording nobody has approved', () => {
    expect(() => prepareDocument({ template: { ...otpTemplate, approvedAt: null }, sources: goodSources })).toThrow(
      UnapprovedTemplateError,
    );
  });

  it('refuses to prepare from a superseded template version', () => {
    expect(() =>
      prepareDocument({ template: { ...otpTemplate, supersededAt: new Date('2026-01-01') }, sources: goodSources }),
    ).toThrow(SupersededTemplateError);
  });

  it('flags a placeholder the template has no field for', () => {
    const broken = { ...otpTemplate, body: otpTemplate.body + '\nAgent: {{agentName}}' };
    expect(findUnmappedPlaceholders(broken)).toEqual(['agentName']);
  });

  it('substitutes only placeholders, never the surrounding wording', () => {
    const doc = prepareDocument({ template: otpTemplate, sources: goodSources, checkSet: 'otp' });
    expect(doc.body).toContain('OFFER TO PURCHASE');
    expect(doc.body).toContain('offers to purchase');
    expect(doc.body.split('\n')).toHaveLength(5);
  });
});

describe('conditional fields', () => {
  const template: TemplateVersionSpec = {
    ...otpTemplate,
    body: 'Bond: {{bondAmount}} approved within {{bondApprovalDays}} days.',
    fields: [
      { key: 'bondAmount', label: 'Bond amount', dataType: 'currency', required: false, validators: [], sourcePath: 'offer.bond', order: 1 },
      {
        key: 'bondApprovalDays',
        label: 'Bond approval period',
        dataType: 'number',
        required: false,
        validators: ['positive'],
        sourcePath: 'offer.bondDays',
        conditionalOn: { path: 'offer.bond', present: true },
        order: 2,
      },
    ],
  };

  it('requires the approval period only when there is a bond', () => {
    const withBond = prepareDocument({ template, sources: { offer: { bond: 3_000_000 } } });
    expect(withBond.missingRequired).toContain('bondApprovalDays');

    const cashSale = prepareDocument({ template, sources: { offer: {} } });
    expect(cashSale.missingRequired).toEqual([]);
  });
});

describe('readPath', () => {
  it('returns undefined rather than throwing on a bad path', () => {
    expect(readPath({ a: 1 }, 'a.b.c')).toBeUndefined();
    expect(readPath(null, 'a')).toBeUndefined();
  });
});
