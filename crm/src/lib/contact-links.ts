import { mailtoHref, telHref, whatsappHref } from './phone.ts';

/**
 * Which ways of reaching someone are still open (spec 54, 143).
 *
 * Kept apart from the buttons that render it so the decision can be reasoned
 * about and tested on its own. It answers one question: given the channels
 * this person asked us to stop using, which links should exist at all.
 *
 * This is a convenience, not a control. What actually protects someone who
 * asked not to be contacted is the do-not-contact record and the preflight
 * that reads it; this only stops a link being put under somebody's thumb.
 */
export interface ContactLinks {
  tel: string | null;
  whatsapp: string | null;
  mailto: string | null;
  /** 'all', or the individual channels that were stopped. Empty when none were. */
  stopped: string[];
  stopsEverything: boolean;
}

export function contactLinks(input: {
  mobile?: string | null;
  email?: string | null;
  stoppedChannels?: readonly string[];
}): ContactLinks {
  const stopped = [...new Set(input.stoppedChannels ?? [])];
  const stopsEverything = stopped.includes('all');
  const blocked = (channel: string) => stopsEverything || stopped.includes(channel);

  return {
    tel: blocked('call') ? null : telHref(input.mobile) || null,
    whatsapp: blocked('whatsapp') ? null : whatsappHref(input.mobile) || null,
    mailto: blocked('email') ? null : mailtoHref(input.email) || null,
    stopped,
    stopsEverything,
  };
}

/** The line shown in place of the links that were taken away. */
export function stopNotice(links: ContactLinks): string | null {
  if (links.stopped.length === 0) return null;
  if (links.stopsEverything) return 'Asked us not to contact them';
  return `Asked us not to use: ${links.stopped.join(', ')}`;
}
