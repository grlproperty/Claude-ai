import { describe, expect, it } from 'vitest';
import { buildChecklist, catalogueKeyFor } from './checklists';

/** GRLP's gates are the point of these tests: they must actually block. */
const empty = () => ({ present: new Map<string, { id: string; status: string }>(), gatesPassed: new Set<string>() });

describe('the rentals checklist follows GRLP’s own gates', () => {
  it('starts at landlord onboarding and blocks advertising', () => {
    const c = buildChecklist({ process: 'RENTALS', subjectLabel: '12 Marine Drive', ...empty() });
    expect(c.currentStage?.key).toBe('rentals.landlord_onboarding');
    expect(c.stages[0]!.blocks).toMatch(/advertising/);
    expect(c.summary).toContain('12 Marine Drive');
  });

  it('will not pass a gate on documents alone — a person must sign it off', () => {
    const present = new Map([
      ['rental_mandate', { id: 'd1', status: 'SIGNED' }],
      ['landlord_fica', { id: 'd2', status: 'APPROVED' }],
      ['property_condition_report', { id: 'd3', status: 'FILED' }],
      ['rental_listing_form', { id: 'd4', status: 'APPROVED' }],
      ['rentals_ppra_disclosure', { id: 'd5', status: 'SIGNED' }],
    ]);
    const c = buildChecklist({ process: 'RENTALS', subjectLabel: 'x', present, gatesPassed: new Set() });

    expect(c.stages[0]!.documentsComplete).toBe(true);
    expect(c.stages[0]!.gatePassed).toBe(false);
    expect(c.stages[0]!.blocks).toMatch(/Waiting on sign-off/);
  });

  it('moves on once the superior has signed off', () => {
    const present = new Map([
      ['rental_mandate', { id: 'd1', status: 'SIGNED' }],
      ['landlord_fica', { id: 'd2', status: 'APPROVED' }],
      ['property_condition_report', { id: 'd3', status: 'FILED' }],
      ['rental_listing_form', { id: 'd4', status: 'APPROVED' }],
      ['rentals_ppra_disclosure', { id: 'd5', status: 'SIGNED' }],
    ]);
    const c = buildChecklist({
      process: 'RENTALS',
      subjectLabel: 'x',
      present,
      gatesPassed: new Set(['rentals.landlord_onboarding']),
    });
    expect(c.currentStage?.key).toBe('rentals.tenant_application');
  });

  it('lists what the tenant still has to provide', () => {
    const c = buildChecklist({ process: 'RENTALS', subjectLabel: 'x', ...empty() });
    const tenantItems = c.outstandingRequired.filter((i) => i.completedBy === 'TENANT').map((i) => i.label);
    expect(tenantItems).toContain('Six months’ payslips');
    expect(tenantItems).toContain('Six months’ bank statements');
  });

  it('separates what the system can prepare from what it cannot', () => {
    const c = buildChecklist({ process: 'RENTALS', subjectLabel: 'x', ...empty() });
    const prepared = c.actionableByAi.map((i) => i.documentKey);
    expect(prepared).toContain('lease_agreement');
    // A credit check and a landlord's FICA are not the system's to produce.
    expect(prepared).not.toContain('credit_check_report');
    expect(prepared).not.toContain('landlord_fica');
  });
});

describe('the sales checklist runs appraisal to commission', () => {
  it('starts at appraisal', () => {
    const c = buildChecklist({ process: 'SALES', subjectLabel: 'GRLP-114', ...empty() });
    expect(c.currentStage?.key).toBe('sales.appraisal');
  });

  it('requires the seller’s disclosure and does not offer to write it', () => {
    const c = buildChecklist({ process: 'SALES', subjectLabel: 'x', ...empty() });
    const disclosure = c.outstandingRequired.find((i) => i.documentKey === 'property_disclosure')!;
    expect(disclosure.completedBy).toBe('SELLER');
    expect(disclosure.aiPopulates).toBe(false);
    expect(c.actionableByAi.map((i) => i.documentKey)).not.toContain('property_disclosure');
  });

  it('does not require certificates that may not apply', () => {
    const c = buildChecklist({ process: 'SALES', subjectLabel: 'x', ...empty() });
    const keys = c.outstandingRequired.map((i) => i.documentKey);
    expect(keys).toContain('coc_electrical'); // always required
    expect(keys).not.toContain('coc_gas'); // only where there is gas
    expect(keys).not.toContain('coc_beetle');
  });

  it('reports the file complete only when every stage is signed off', () => {
    const c = buildChecklist({ process: 'SALES', subjectLabel: 'x', ...empty() });
    expect(c.summary).not.toMatch(/complete/);
  });
});

describe('mapping a stored document to the catalogue', () => {
  it('recognises the documents it should', () => {
    expect(catalogueKeyFor('OTP', 'Offer to purchase — 14 Protea Street')).toBe('otp');
    expect(catalogueKeyFor('MANDATE', 'Permission to list')).toBe('permission_to_list');
    expect(catalogueKeyFor('MANDATE', 'Sole mandate')).toBe('sole_mandate');
    expect(catalogueKeyFor('FICA', 'Tenant FICA pack')).toBe('tenant_fica');
    expect(catalogueKeyFor('COMPLIANCE_CERTIFICATE', 'Gas certificate of conformity')).toBe('coc_gas');
    expect(catalogueKeyFor('COMPLIANCE_CERTIFICATE', 'Electrical COC')).toBe('coc_electrical');
  });

  it('returns nothing rather than letting an unknown file tick a required box', () => {
    expect(catalogueKeyFor('OTHER', 'Some scanned page')).toBeNull();
    expect(catalogueKeyFor('CORRESPONDENCE', 'Random note')).toBeNull();
  });
});
