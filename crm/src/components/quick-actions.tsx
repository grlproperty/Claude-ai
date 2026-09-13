import { Icon } from './icons.tsx';
import { ExternalActionLink, ButtonLink } from './ui/primitives.tsx';
import { mailtoHref, telHref, whatsappHref } from '@/lib/phone.ts';
import { cn } from '@/lib/cn.ts';

/**
 * The five things an agent does with a client (spec 6, 89, 143).
 *
 * Call, WhatsApp and Email are ordinary links: they hand the conversation to
 * the phone, to WhatsApp, or to the staff member's own email application.
 * The CRM sends nothing and claims nothing was sent. Log contact and
 * Follow-up are what it actually does — record what happened and decide what
 * happens next.
 */
export function QuickActions({
  mobile,
  email,
  personId,
  propertyId,
  leadId,
  size = 'md',
  canLog = true,
  canTask = true,
  className,
}: {
  mobile?: string | null;
  email?: string | null;
  personId?: string;
  propertyId?: string;
  leadId?: string;
  size?: 'sm' | 'md';
  canLog?: boolean;
  canTask?: boolean;
  className?: string;
}) {
  const tel = telHref(mobile);
  const whatsapp = whatsappHref(mobile);
  const mail = mailtoHref(email);

  const params = new URLSearchParams();
  if (personId) params.set('personId', personId);
  if (propertyId) params.set('propertyId', propertyId);
  if (leadId) params.set('leadId', leadId);
  const query = params.toString() ? `?${params.toString()}` : '';

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {tel ? (
        <ExternalActionLink href={tel} size={size} title="Open your phone's dialler">
          <Icon.phone className="size-4" />
          Call
        </ExternalActionLink>
      ) : null}

      {whatsapp ? (
        <ExternalActionLink
          href={whatsapp}
          size={size}
          target="_blank"
          rel="noopener noreferrer"
          title="Open WhatsApp with this number"
        >
          <Icon.whatsapp className="size-4" />
          WhatsApp
        </ExternalActionLink>
      ) : null}

      {mail ? (
        <ExternalActionLink href={mail} size={size} title="Open your email application">
          <Icon.mail className="size-4" />
          Email
        </ExternalActionLink>
      ) : null}

      {canLog ? (
        <ButtonLink href={`/communications/new${query}`} size={size} tone="primary">
          <Icon.note className="size-4" />
          Log contact
        </ButtonLink>
      ) : null}

      {canTask ? (
        <ButtonLink href={`/tasks/new${query}`} size={size}>
          <Icon.clock className="size-4" />
          Follow-up
        </ButtonLink>
      ) : null}
    </div>
  );
}

/**
 * The note that has to sit beside those buttons, so nobody ever believes the
 * CRM sent something on their behalf.
 */
export function CommunicationNotice() {
  return (
    <p className="text-xs text-ink-faint">
      Call, WhatsApp and Email open the app on your device. The CRM does not send messages —
      record what was said with <strong>Log contact</strong>.
    </p>
  );
}
