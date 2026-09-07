import { describe, expect, it } from 'vitest';
import {
  ForbiddenError,
  can,
  canReadDomain,
  ownershipWhere,
  principalForAgent,
  require_,
  scopeFor,
  type Principal,
} from './permissions';

const mandy: Principal = { id: 'mandy', name: 'Mandy', role: 'CEO', department: 'EXECUTIVE', isCeo: true };
const jason: Principal = { id: 'jason', name: 'Jason', role: 'SALES_AGENT', department: 'SALES', isCeo: false };
const linda: Principal = { id: 'linda', name: 'Linda', role: 'MARKETING_ADMIN', department: 'MARKETING', isCeo: false };
const lisa: Principal = { id: 'lisa', name: 'Lisa', role: 'RENTALS', department: 'RENTALS', isCeo: false };

describe('least privilege', () => {
  it('gives the CEO the whole business and nobody else', () => {
    expect(can(mandy, 'view:all_business')).toBe(true);
    for (const p of [jason, linda, lisa]) expect(can(p, 'view:all_business')).toBe(false);
  });

  it('keeps staff management, templates and integrations with the CEO', () => {
    for (const perm of ['manage:staff', 'manage:templates', 'manage:integrations', 'view:audit'] as const) {
      expect(can(mandy, perm)).toBe(true);
      expect(can(jason, perm)).toBe(false);
    }
  });

  it('lets agents approve sales documents but not commission', () => {
    expect(can(jason, 'approve:mandate')).toBe(true);
    expect(can(jason, 'approve:commission')).toBe(false);
    expect(can({ ...jason, role: 'ACCOUNTS' }, 'approve:commission')).toBe(true);
  });

  it('reserves the valuation approval for the CEO', () => {
    expect(can(mandy, 'approve:market_assessment')).toBe(true);
    expect(can(jason, 'approve:market_assessment')).toBe(false);
  });

  it('throws a usable error rather than failing open', () => {
    expect(() => require_(linda, 'view:all_business')).toThrow(ForbiddenError);
    expect(() => require_(mandy, 'view:all_business')).not.toThrow();
  });
});

describe('personal data is walled off', () => {
  it('lets only the owner read personal records', () => {
    expect(canReadDomain(mandy, 'PERSONAL', 'mandy')).toBe(true);
    expect(canReadDomain(jason, 'PERSONAL', 'mandy')).toBe(false);
    // Not even the CEO can read someone else's personal records.
    expect(canReadDomain(mandy, 'PERSONAL', 'jason')).toBe(false);
  });

  it('leaves business records readable', () => {
    expect(canReadDomain(jason, 'BUSINESS', 'mandy')).toBe(true);
  });

  it('refuses a personal record with no owner', () => {
    expect(canReadDomain(mandy, 'PERSONAL', null)).toBe(false);
  });
});

describe('query scoping', () => {
  it('does not filter the CEO', () => {
    expect(ownershipWhere(scopeFor(mandy))).toEqual({});
  });

  it('limits an agent to their own work and their department', () => {
    const where = ownershipWhere(scopeFor(jason), { ownerField: 'ownerId', departmentField: 'department' });
    expect(where).toEqual({ OR: [{ ownerId: 'jason' }, { department: 'SALES' }] });
  });

  it('limits to own work when the record has no department', () => {
    expect(ownershipWhere(scopeFor(lisa))).toEqual({ OR: [{ ownerId: 'lisa' }] });
  });
});

describe('the AI is not a way around permissions', () => {
  it('gives an agent exactly the permissions of the person it acts for', () => {
    const agent = principalForAgent(linda);
    expect(can(agent, 'view:all_business')).toBe(false);
    expect(canReadDomain(agent, 'PERSONAL', 'mandy')).toBe(false);
  });
});
