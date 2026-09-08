import type { TemplateFieldSpec } from './documents';

/**
 * The field map for GRLP's Offer to Purchase (residential).
 *
 * Every entry is taken from the agency's own approved master — the clause
 * reference is in each label's note — so this is a description of GRLP's
 * document, not a generic one. The wording itself is not here: it lives in the
 * database, imported from Dropbox.
 *
 * Two conventions from the master are enforced by construction:
 *
 *   - Every amount appears twice, in figures and in words. The words are derived
 *     from the same recorded value, so the two cannot disagree.
 *   - The standing defaults GRLP uses (6.5% commission, a 7-working-day deposit,
 *     21 days for guarantees, "OTHER TERMS: NONE") are defaults, not blanks, so
 *     they do not have to be retyped and cannot be forgotten.
 */

const f = (spec: TemplateFieldSpec): TemplateFieldSpec => spec;
let order = 0;
const next = () => (order += 1);

export const OTP_RESIDENTIAL_FIELDS: TemplateFieldSpec[] = [
  // ── 1.1 Parties: Seller ──────────────────────────────────────────────────
  f({ key: 'sellerFullName', label: 'Seller full name', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'seller.fullName', order: next() }),
  f({ key: 'sellerIdNumber', label: 'Seller identity number', dataType: 'id_number', required: true, validators: ['sa_id'], sourcePath: 'seller.idNumber', order: next() }),
  f({ key: 'sellerFullName2', label: 'Second seller full name', dataType: 'string', required: false, validators: [], sourcePath: 'seller.fullName2', order: next() }),
  f({ key: 'sellerIdNumber2', label: 'Second seller identity number', dataType: 'id_number', required: false, validators: ['sa_id'], sourcePath: 'seller.idNumber2', conditionalOn: { path: 'seller.fullName2', present: true }, order: next() }),
  f({ key: 'sellerMaritalStatus', label: 'Seller marital status', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'seller.maritalStatus', order: next() }),
  f({ key: 'sellerAddress', label: 'Seller residential address', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'seller.address', order: next() }),
  f({ key: 'sellerEmail', label: 'Seller email (domicilium, clause 11.1)', dataType: 'string', required: true, validators: ['email'], sourcePath: 'seller.email', order: next() }),
  f({ key: 'sellerOrdinaryCourseOfBusiness', label: 'Seller selling in the ordinary course of business (CPA)', dataType: 'boolean', required: true, validators: [], sourcePath: 'seller.ordinaryCourseOfBusiness', defaultValue: 'No', order: next() }),

  // ── 1.2 Parties: Purchaser ───────────────────────────────────────────────
  f({ key: 'buyerFullName', label: 'Purchaser full name', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'buyer.fullName', order: next() }),
  f({ key: 'buyerIdNumber', label: 'Purchaser identity number', dataType: 'id_number', required: true, validators: ['sa_id'], sourcePath: 'buyer.idNumber', order: next() }),
  f({ key: 'buyerFullName2', label: 'Second purchaser full name', dataType: 'string', required: false, validators: [], sourcePath: 'buyer.fullName2', order: next() }),
  f({ key: 'buyerIdNumber2', label: 'Second purchaser identity number', dataType: 'id_number', required: false, validators: ['sa_id'], sourcePath: 'buyer.idNumber2', conditionalOn: { path: 'buyer.fullName2', present: true }, order: next() }),
  f({ key: 'buyerMaritalStatus', label: 'Purchaser marital status', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'buyer.maritalStatus', order: next() }),
  f({ key: 'buyerAddress', label: 'Purchaser residential address', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'buyer.address', order: next() }),
  f({ key: 'buyerEmail', label: 'Purchaser email (domicilium, clause 11.1)', dataType: 'string', required: true, validators: ['email'], sourcePath: 'buyer.email', order: next() }),

  // ── 2.1 The property ─────────────────────────────────────────────────────
  f({ key: 'erfNumber', label: 'Stand / Erf number', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'property.erfNumber', order: next() }),
  f({ key: 'extent', label: 'Extent (measuring ±)', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'property.extent', order: next() }),
  f({ key: 'township', label: 'Township / scheme', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'property.township', order: next() }),
  f({ key: 'streetAddress', label: 'Street address', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'property.addressLine', order: next() }),

  // ── 2.2 The agent ────────────────────────────────────────────────────────
  f({ key: 'agentOffice', label: 'GRLP office (Hoekwil or George)', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'agent.office', defaultValue: 'Office 1, Building C, Duiwerivier Road, Hoekwil, Wilderness, 6538', order: next() }),
  f({ key: 'agentName', label: 'Agent name', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'agent.name', order: next() }),
  f({ key: 'agentFfcNumber', label: 'Agent Fidelity Fund Certificate number', dataType: 'string', required: true, validators: ['required_text'], sourcePath: 'agent.ffcNumber', order: next() }),
  f({ key: 'agentEmail', label: 'Agent email', dataType: 'string', required: true, validators: ['email'], sourcePath: 'agent.email', order: next() }),
  f({ key: 'agentCell', label: 'Agent cell', dataType: 'string', required: true, validators: ['sa_phone'], sourcePath: 'agent.cell', order: next() }),

  // ── 4 Purchase price ─────────────────────────────────────────────────────
  f({ key: 'purchasePrice', label: 'Purchase price (figures)', dataType: 'currency', required: true, validators: ['positive'], sourcePath: 'offer.amount', order: next() }),
  f({ key: 'purchasePriceWords', label: 'Purchase price (words)', dataType: 'string', required: true, validators: [], sourcePath: 'offer.amount', transform: 'rand_words', order: next() }),
  f({ key: 'depositAmount', label: 'Deposit (figures, clause 4.1)', dataType: 'currency', required: true, validators: ['positive'], sourcePath: 'offer.depositAmount', order: next() }),
  f({ key: 'depositAmountWords', label: 'Deposit (words)', dataType: 'string', required: true, validators: [], sourcePath: 'offer.depositAmount', transform: 'rand_words', order: next() }),
  f({ key: 'depositWorkingDays', label: 'Deposit payable within (working days)', dataType: 'string', required: true, validators: [], sourcePath: 'offer.depositWorkingDays', defaultValue: '7', transform: 'period_words', transformUnit: 'working days', order: next() }),

  // ── 8 Occupation ─────────────────────────────────────────────────────────
  f({ key: 'occupationDate', label: 'Occupation / vacate date (clause 8.1, at noon)', dataType: 'date', required: true, validators: ['date'], sourcePath: 'offer.occupationDate', transform: 'date_long', order: next() }),
  f({ key: 'occupationalInterest', label: 'Occupational interest per month (figures, clause 8.2)', dataType: 'currency', required: false, validators: ['currency'], sourcePath: 'offer.occupationalInterest', order: next() }),
  f({ key: 'occupationalInterestWords', label: 'Occupational interest (words)', dataType: 'string', required: false, validators: [], sourcePath: 'offer.occupationalInterest', transform: 'rand_words', conditionalOn: { path: 'offer.occupationalInterest', present: true }, order: next() }),

  // ── 8.7 Tenanted property ────────────────────────────────────────────────
  f({ key: 'isTenanted', label: 'Property is let to tenants (clause 8.7)', dataType: 'boolean', required: true, validators: [], sourcePath: 'property.isTenanted', defaultValue: 'No', order: next() }),
  f({ key: 'leaseCopyGivenDate', label: 'Date lease copy given to purchaser', dataType: 'date', required: false, validators: ['date'], sourcePath: 'property.leaseCopyGivenDate', conditionalOn: { path: 'property.isTenanted', equals: true }, transform: 'date_long', order: next() }),
  f({ key: 'leaseExpiryDate', label: 'Tenant lease expiry date', dataType: 'date', required: false, validators: ['date'], sourcePath: 'property.leaseExpiryDate', conditionalOn: { path: 'property.isTenanted', equals: true }, transform: 'date_long', order: next() }),
  f({ key: 'tenantNoticeDate', label: 'Date written notice to be given to tenant', dataType: 'date', required: false, validators: ['date'], sourcePath: 'property.tenantNoticeDate', conditionalOn: { path: 'property.isTenanted', equals: true }, transform: 'date_long', order: next() }),

  // ── 12 Commission ────────────────────────────────────────────────────────
  f({ key: 'commissionPct', label: 'Agent’s commission (%, clause 12)', dataType: 'number', required: true, validators: ['percentage', 'positive'], sourcePath: 'mandate.commissionPct', defaultValue: '6.5', order: next() }),

  // ── 13.1 Suspensive condition: bond ──────────────────────────────────────
  f({ key: 'subjectToBond', label: 'Subject to bond approval (clause 13.1)', dataType: 'boolean', required: true, validators: [], sourcePath: 'offer.subjectToBond', defaultValue: 'No', order: next() }),
  f({ key: 'bondApprovalDays', label: 'Bond approval period (days)', dataType: 'string', required: false, validators: [], sourcePath: 'offer.bondApprovalDays', conditionalOn: { path: 'offer.subjectToBond', equals: true }, transform: 'period_words', transformUnit: 'days', order: next() }),
  f({ key: 'bondAmount', label: 'Bond amount (figures)', dataType: 'currency', required: false, validators: ['positive'], sourcePath: 'offer.bondAmount', conditionalOn: { path: 'offer.subjectToBond', equals: true }, order: next() }),
  f({ key: 'bondAmountWords', label: 'Bond amount (words)', dataType: 'string', required: false, validators: [], sourcePath: 'offer.bondAmount', conditionalOn: { path: 'offer.subjectToBond', equals: true }, transform: 'rand_words', order: next() }),

  // ── 13.2 Suspensive condition: subject to sale ───────────────────────────
  f({ key: 'subjectToSale', label: 'Subject to sale of purchaser’s property (clause 13.2)', dataType: 'boolean', required: true, validators: [], sourcePath: 'offer.subjectToSale', defaultValue: 'No', order: next() }),
  f({ key: 'salePropertyAddress', label: 'Address of purchaser’s property to be sold', dataType: 'string', required: false, validators: [], sourcePath: 'offer.salePropertyAddress', conditionalOn: { path: 'offer.subjectToSale', equals: true }, order: next() }),
  f({ key: 'saleMonths', label: 'Period allowed for that sale (months)', dataType: 'string', required: false, validators: [], sourcePath: 'offer.saleMonths', conditionalOn: { path: 'offer.subjectToSale', equals: true }, transform: 'period_words', transformUnit: 'months', order: next() }),

  // ── 19 Signature ─────────────────────────────────────────────────────────
  f({ key: 'offerDate', label: 'Date the offer is signed by the purchaser', dataType: 'date', required: true, validators: ['date'], sourcePath: 'offer.date', transform: 'date_long', order: next() }),
  f({ key: 'offerValidUntil', label: 'Offer open for acceptance until 5pm on (clause 19.1)', dataType: 'date', required: true, validators: ['date', 'future_date'], sourcePath: 'offer.expiresAt', transform: 'date_long', order: next() }),
  f({ key: 'purchaserSignedAt', label: 'Place purchaser signs', dataType: 'string', required: false, validators: [], sourcePath: 'offer.purchaserSignedAt', order: next() }),
  f({ key: 'sellerSignedAt', label: 'Place seller signs', dataType: 'string', required: false, validators: [], sourcePath: 'offer.sellerSignedAt', order: next() }),

  // ── 29 Other terms ───────────────────────────────────────────────────────
  f({ key: 'otherTerms', label: 'Other terms (clause 29)', dataType: 'string', required: true, validators: [], sourcePath: 'offer.otherTerms', defaultValue: 'NONE', order: next() }),
];

/** Fields a person must supply because no record holds them yet. */
export const OTP_FIELDS_NEEDING_INPUT = [
  'sellerMaritalStatus',
  'buyerMaritalStatus',
  'erfNumber',
  'extent',
  'township',
  'agentFfcNumber',
] as const;

export const OTP_FIELD_COUNT = OTP_RESIDENTIAL_FIELDS.length;
