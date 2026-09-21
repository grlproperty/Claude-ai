/**
 * Working out who a WhatsApp conversation is with.
 *
 * This is the join that makes WhatsApp a client record rather than a pile of
 * chats. It is also the place where being wrong is expensive: a conversation
 * filed against the wrong client puts one person's offer in another person's
 * history, and nobody notices until it matters. So a match is only made where
 * there is a real reason for it, and everything else is handed back as a
 * suggestion for a person to confirm.
 *
 * Phone numbers do most of the work. WhatsApp identifies people by number, and
 * a number is the one thing about a person that does not have three spellings.
 */

export interface ContactCandidate {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

export type MatchBasis = 'phone' | 'full_name' | 'surname_and_initial';

export interface ContactMatch {
  contactId: string;
  basis: MatchBasis;
  /** True when it is safe to file the conversation without asking. */
  certain: boolean;
  /** Why, in words that can be shown next to the link. */
  reason: string;
}

/**
 * South African numbers reach us in at least four shapes — 082 456 7890,
 * +27 82 456 7890, 0027824567890, and the bare 27824567890 that WhatsApp uses.
 * They are all the same person, so they are all reduced to the same key.
 */
export function normalisePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  digits = digits.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('0027')) digits = digits.slice(4);
  else if (digits.startsWith('27') && digits.length >= 11) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);

  // A South African subscriber number is nine digits. Anything else is left as
  // it is: an international client's number is still a usable key, it just is
  // not one this rule understands.
  return digits.length >= 7 ? digits : null;
}

export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalisePhone(a);
  const right = normalisePhone(b);
  return left != null && left === right;
}

/** "Thandiwe Nkosi 🏡" and "THANDIWE  NKOSI" are the same name written twice. */
function nameKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    // Emoji, company suffixes and the labels people put in their phone book.
    .replace(/[^\p{L}\s'-]/gu, ' ')
    .toLowerCase()
    .replace(/\b(grlp|garden route|property|properties|rentals?|estate agent|agent|tenant|landlord|buyer|seller)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Initials are kept: "P Dlamini" is how half a phone book is written, and
 * dropping the P would leave a bare surname, which is never a match.
 */
function words(value: string): string[] {
  return nameKey(value).split(' ').filter(Boolean);
}

/**
 * Finds the client a conversation is with.
 *
 * A number that matches is a match. A full name that matches exactly, and only
 * one contact does, is a match. A surname plus a first initial is offered but
 * never taken automatically — there are two Van Wyks on any agency's books.
 * A first name alone is not a match at all.
 */
export function matchContact(args: {
  displayName?: string | null;
  phone?: string | null;
  candidates: ContactCandidate[];
}): ContactMatch | null {
  const { displayName, phone, candidates } = args;

  const wanted = normalisePhone(phone);
  if (wanted) {
    const byPhone = candidates.filter((c) => normalisePhone(c.phone) === wanted);
    if (byPhone.length === 1) {
      const c = byPhone[0]!;
      return {
        contactId: c.id,
        basis: 'phone',
        certain: true,
        reason: `The number matches ${c.firstName} ${c.lastName}`.trim() + '.',
      };
    }
    // Two contacts holding one number is a data problem, not a match.
    if (byPhone.length > 1) return null;
  }

  const shown = words(displayName ?? '');
  if (shown.length < 2) return null;

  const full = shown.join(' ');
  const byFullName = candidates.filter((c) => nameKey(`${c.firstName} ${c.lastName}`) === full);
  if (byFullName.length === 1) {
    const c = byFullName[0]!;
    return {
      contactId: c.id,
      basis: 'full_name',
      certain: true,
      reason: `The name matches ${c.firstName} ${c.lastName} exactly.`,
    };
  }
  if (byFullName.length > 1) return null;

  const surname = shown.at(-1)!;
  const initial = shown[0]![0]!;
  const bySurname = candidates.filter(
    (c) => nameKey(c.lastName) === surname && nameKey(c.firstName).startsWith(initial),
  );
  if (bySurname.length === 1) {
    const c = bySurname[0]!;
    return {
      contactId: c.id,
      basis: 'surname_and_initial',
      certain: false,
      reason: `Probably ${c.firstName} ${c.lastName}, on surname and first initial. Worth confirming.`,
    };
  }

  return null;
}

/**
 * Splits a WhatsApp display name into the fields a client record needs, for
 * when the person is not on the books yet and should be.
 */
export function nameForNewContact(displayName: string): { firstName: string; lastName: string } | null {
  const parts = words(displayName).map((w) => w[0]!.toUpperCase() + w.slice(1));
  if (!parts.length) return null;
  if (parts.length === 1) return { firstName: parts[0]!, lastName: '' };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
}
