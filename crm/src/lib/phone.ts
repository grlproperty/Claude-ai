/**
 * South African telephone numbers (spec 18).
 *
 * 082 543 2681, 0825432681 and +27 82 543 2681 are one number. The same
 * rules are implemented in SQL as app.normalise_za_phone so that a number
 * typed into a form, imported from a spreadsheet, or matched by a duplicate
 * check all agree.
 */

export function normaliseZaPhone(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length === 10 && digits.startsWith('0')) return `+27${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('27')) return `+${digits}`;
  if (digits.length === 9 && !digits.startsWith('0')) return `+27${digits}`;
  return `+${digits}`;
}

/** 082 543 2681 — how a South African reads their own number back. */
export function formatZaPhone(value: string | null | undefined): string {
  const normalised = normaliseZaPhone(value);
  if (!normalised) return '';
  if (normalised.startsWith('+27') && normalised.length === 12) {
    const national = `0${normalised.slice(3)}`;
    return `${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  }
  return normalised;
}

/** Opens the device dialler. The CRM never places the call itself. */
export function telHref(value: string | null | undefined): string | null {
  const normalised = normaliseZaPhone(value);
  return normalised ? `tel:${normalised}` : null;
}

/**
 * Opens WhatsApp with this number. wa.me expects digits only, no plus.
 * Nothing is sent: the staff member types and sends in WhatsApp themselves.
 */
export function whatsappHref(value: string | null | undefined, message?: string): string | null {
  const normalised = normaliseZaPhone(value);
  if (!normalised) return null;
  const digits = normalised.replace(/\D/g, '');
  const query = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${query}`;
}

/** Opens the staff member's own email application. Nothing is sent by the CRM. */
export function mailtoHref(
  email: string | null | undefined,
  options?: { subject?: string; body?: string },
): string | null {
  const address = (email ?? '').trim();
  if (!address) return null;
  const params = new URLSearchParams();
  if (options?.subject) params.set('subject', options.subject);
  if (options?.body) params.set('body', options.body);
  const query = params.toString();
  return `mailto:${address}${query ? `?${query.replace(/\+/g, '%20')}` : ''}`;
}

export function isLikelyEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(trimmed);
}
