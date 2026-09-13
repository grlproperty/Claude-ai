import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn.ts';

/* =====================================================================
   Shared building blocks. Everything in the CRM is assembled from these,
   so spacing, focus behaviour and tap targets stay consistent (spec 146).
   ===================================================================== */

type ButtonTone = 'primary' | 'secondary' | 'quiet' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const TONES: Record<ButtonTone, string> = {
  primary:
    'bg-brand text-white border-brand hover:bg-brand-dark active:bg-brand-deep disabled:bg-brand/50',
  secondary:
    'bg-white text-ink border-line hover:bg-paper active:bg-line-soft disabled:text-ink-faint',
  quiet:
    'bg-transparent text-ink-soft border-transparent hover:bg-line-soft hover:text-ink disabled:text-ink-faint',
  danger:
    'bg-white text-stop border-stop/40 hover:bg-stop-wash active:bg-stop-wash disabled:text-ink-faint',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-[0.8125rem] gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-[0.9375rem] gap-2',
};

function buttonClass(tone: ButtonTone, size: ButtonSize, full?: boolean): string {
  return cn(
    'inline-flex items-center justify-center rounded-lg border font-medium transition-colors',
    'disabled:cursor-not-allowed select-none whitespace-nowrap',
    TONES[tone],
    SIZES[size],
    full && 'w-full',
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: ButtonSize;
  full?: boolean;
}

export function Button({ tone = 'secondary', size = 'md', full, className, ...rest }: ButtonProps) {
  return <button className={cn(buttonClass(tone, size, full), className)} {...rest} />;
}

export interface ButtonLinkProps extends React.ComponentProps<typeof Link> {
  tone?: ButtonTone;
  size?: ButtonSize;
  full?: boolean;
}

export function ButtonLink({
  tone = 'secondary',
  size = 'md',
  full,
  className,
  ...rest
}: ButtonLinkProps) {
  return <Link className={cn(buttonClass(tone, size, full), className)} {...rest} />;
}

/**
 * Quick actions that leave the CRM: the dialler, WhatsApp and the staff
 * member's own email client. These are plain links on purpose — the CRM
 * hands the conversation to the device, it does not send anything itself.
 */
export function ExternalActionLink({
  tone = 'secondary',
  size = 'md',
  full,
  className,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  tone?: ButtonTone;
  size?: ButtonSize;
  full?: boolean;
}) {
  return <a className={cn(buttonClass(tone, size, full), className)} {...rest} />;
}

const CONTROL =
  'block w-full rounded-lg border border-line bg-white px-3 text-sm text-ink ' +
  'placeholder:text-ink-faint transition-colors ' +
  'focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 ' +
  'disabled:bg-paper disabled:text-ink-faint aria-[invalid=true]:border-stop';

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, 'h-11', className)} {...rest} />;
}

export function Textarea({
  className,
  rows = 4,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={rows} className={cn(CONTROL, 'py-2.5 leading-relaxed', className)} {...rest} />;
}

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(CONTROL, 'h-11 appearance-none bg-no-repeat pr-9', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%235A5A5A' d='M1 1l5 5 5-5'/%3E%3C/svg%3E\")",
        backgroundPosition: 'right 0.75rem center',
      }}
      {...rest}
    />
  );
}

export function Checkbox({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-[1.125rem] shrink-0 rounded border-line text-brand accent-[#991c1f]',
        'focus:ring-2 focus:ring-brand/25',
        className,
      )}
      {...rest}
    />
  );
}

export function Label({
  className,
  required,
  children,
  ...rest
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn('block text-[0.8125rem] font-medium text-ink', className)} {...rest}>
      {children}
      {required ? <span className="ml-0.5 text-brand">*</span> : null}
    </label>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string[] | string | undefined;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const messages = typeof error === 'string' ? [error] : (error ?? []);
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {hint && messages.length === 0 ? <p className="text-xs text-ink-faint">{hint}</p> : null}
      {messages.map((message) => (
        <p key={message} className="text-xs font-medium text-stop">
          {message}
        </p>
      ))}
    </div>
  );
}

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-line-soft px-4 py-3.5 sm:px-5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'stop' | 'info';

const BADGE_TONES: Record<Tone, string> = {
  neutral: 'bg-paper text-ink-soft border-line',
  brand: 'bg-brand-wash text-brand-dark border-brand-line',
  ok: 'bg-ok-wash text-ok border-ok/25',
  warn: 'bg-warn-wash text-warn border-warn/25',
  stop: 'bg-stop-wash text-stop border-stop/25',
  info: 'bg-info-wash text-info border-info/25',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="mb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-faint">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
