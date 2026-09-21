import { describe, expect, it } from 'vitest';

import { matchContact, nameForNewContact, normalisePhone, samePhone, type ContactCandidate } from './contact-match';

const books: ContactCandidate[] = [
  { id: 'c_thandiwe', firstName: 'Thandiwe', lastName: 'Nkosi', phone: '082 456 7890' },
  { id: 'c_pieter', firstName: 'Pieter', lastName: 'van Wyk', phone: '+27 83 111 2222' },
  { id: 'c_petra', firstName: 'Petra', lastName: 'van Wyk', phone: null },
  { id: 'c_sipho', firstName: 'Sipho', lastName: 'Dlamini', phone: null },
];

describe('normalising a South African number', () => {
  it('reduces every shape of the same number to one key', () => {
    const shapes = ['082 456 7890', '0824567890', '+27 82 456 7890', '27824567890', '0027824567890', '+27-82-456-7890'];
    const keys = new Set(shapes.map(normalisePhone));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe('824567890');
  });

  it('returns nothing for what is not a number', () => {
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone('n/a')).toBeNull();
    expect(normalisePhone('0821')).toBeNull();
  });

  it('keeps a foreign number usable rather than discarding it', () => {
    expect(normalisePhone('+44 7700 900461')).toBe('447700900461');
  });

  it('compares two numbers written differently', () => {
    expect(samePhone('082 456 7890', '+27824567890')).toBe(true);
    expect(samePhone('082 456 7890', '083 111 2222')).toBe(false);
    expect(samePhone(null, null)).toBe(false);
  });
});

describe('matching on the number', () => {
  it('matches however the number was typed, and is certain about it', () => {
    const m = matchContact({ displayName: 'T', phone: '27824567890', candidates: books });
    expect(m).toMatchObject({ contactId: 'c_thandiwe', basis: 'phone', certain: true });
  });

  // Two records holding one number is a data problem; guessing between them
  // would file the conversation against a coin toss.
  it('refuses when two contacts share a number', () => {
    const muddled = [...books, { id: 'c_dup', firstName: 'Thandi', lastName: 'Nkosi', phone: '0824567890' }];
    expect(matchContact({ displayName: 'Thandiwe Nkosi', phone: '0824567890', candidates: muddled })).toBeNull();
  });
});

describe('matching on the name', () => {
  it('matches a full name exactly', () => {
    const m = matchContact({ displayName: 'Sipho Dlamini', candidates: books });
    expect(m).toMatchObject({ contactId: 'c_sipho', basis: 'full_name', certain: true });
  });

  it('sees through what people put in their phone book', () => {
    const m = matchContact({ displayName: 'Sipho Dlamini 🏡 Tenant', candidates: books });
    expect(m?.contactId).toBe('c_sipho');
  });

  it('ignores case and doubled spacing', () => {
    expect(matchContact({ displayName: 'SIPHO   DLAMINI', candidates: books })?.contactId).toBe('c_sipho');
  });

  // A first name alone is how you end up with one Pieter's offer in another
  // Pieter's file.
  it('will not match on a first name alone', () => {
    expect(matchContact({ displayName: 'Pieter', candidates: books })).toBeNull();
  });

  it('will not match on a surname alone', () => {
    expect(matchContact({ displayName: 'Nkosi', candidates: books })).toBeNull();
  });

  it('offers a surname-and-initial match but does not take it', () => {
    const m = matchContact({ displayName: 'S Dlamini', candidates: books });
    expect(m).toMatchObject({ contactId: 'c_sipho', basis: 'surname_and_initial', certain: false });
    expect(m?.reason).toContain('confirming');
  });

  it('does not match a surname when the initial belongs to someone else', () => {
    expect(matchContact({ displayName: 'P Dlamini', candidates: books })).toBeNull();
  });

  it('refuses where two people share a surname and an initial', () => {
    expect(matchContact({ displayName: 'P van Wyk', candidates: books })).toBeNull();
  });

  it('returns nothing when nobody is close', () => {
    expect(matchContact({ displayName: 'Johan Meyer', candidates: books })).toBeNull();
  });

  it('returns nothing when there are no contacts at all', () => {
    expect(matchContact({ displayName: 'Sipho Dlamini', phone: '0824567890', candidates: [] })).toBeNull();
  });
});

describe('the number outranks the name', () => {
  it('trusts the number when the phone book name says someone else', () => {
    const m = matchContact({ displayName: 'Sipho Dlamini', phone: '0824567890', candidates: books });
    expect(m?.contactId).toBe('c_thandiwe');
  });
});

describe('making a client record from a chat', () => {
  it('splits a name into first and last', () => {
    expect(nameForNewContact('Thandiwe Nkosi')).toEqual({ firstName: 'Thandiwe', lastName: 'Nkosi' });
  });

  it('keeps a multi-word surname together', () => {
    expect(nameForNewContact('pieter van wyk')).toEqual({ firstName: 'Pieter', lastName: 'Van Wyk' });
  });

  it('copes with only one name', () => {
    expect(nameForNewContact('Thandiwe')).toEqual({ firstName: 'Thandiwe', lastName: '' });
  });

  it('returns nothing when there is no name in it', () => {
    expect(nameForNewContact('🏡')).toBeNull();
    expect(nameForNewContact('   ')).toBeNull();
  });
});
