import type { SVGProps } from 'react';

/**
 * A small hand-drawn icon set. Inline SVG keeps the CRM free of an icon
 * package and keeps the bundle small; every glyph shares one 24px grid and
 * inherits currentColor.
 */

const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

type P = SVGProps<SVGSVGElement>;

export const Icon = {
  dashboard: (p: P) => (
    <svg {...base} {...p}><path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z" /></svg>
  ),
  people: (p: P) => (
    <svg {...base} {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.1 2.7-5.2 6-5.2s6 2.1 6 5.2" /><path d="M16.5 5.5a3 3 0 0 1 0 5.6M18 14.4c2 .7 3.3 2.2 3.3 4.1" /></svg>
  ),
  property: (p: P) => (
    <svg {...base} {...p}><path d="M3.5 10.5 12 4l8.5 6.5" /><path d="M5.5 9.6V20h13V9.6" /><path d="M10 20v-5h4v5" /></svg>
  ),
  sales: (p: P) => (
    <svg {...base} {...p}><path d="M4 18.5 9.5 12l3.6 3.4L20 7" /><path d="M20 11.5V7h-4.5" /></svg>
  ),
  rentals: (p: P) => (
    <svg {...base} {...p}><path d="M4 9.5 12 4l8 5.5V20H4z" /><path d="M9.5 20v-6h5v6" /><path d="M14.5 7.5h3v2" /></svg>
  ),
  leads: (p: P) => (
    <svg {...base} {...p}><path d="M12 3.5 14.3 9l5.7.4-4.4 3.8 1.4 5.6L12 15.8 7 18.8l1.4-5.6L4 9.4 9.7 9z" /></svg>
  ),
  tasks: (p: P) => (
    <svg {...base} {...p}><path d="M4 6.5 6 8.5 9.5 5" /><path d="M4 13.5 6 15.5 9.5 12" /><path d="M13 6.8h7M13 13.8h7M13 19.5h7" /></svg>
  ),
  calendar: (p: P) => (
    <svg {...base} {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3.5V6M16 3.5V6" /></svg>
  ),
  communications: (p: P) => (
    <svg {...base} {...p}><path d="M20.5 12.2c0 3.9-3.8 7-8.5 7a10 10 0 0 1-2.7-.4L4 20.5l1.5-3.7a6.6 6.6 0 0 1-2-4.6c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7z" /></svg>
  ),
  compliance: (p: P) => (
    <svg {...base} {...p}><path d="M12 3.5 19.5 6v6c0 4.2-3 7.3-7.5 8.5C7.5 19.3 4.5 16.2 4.5 12V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></svg>
  ),
  fica: (p: P) => (
    <svg {...base} {...p}><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M5.5 16.5c.5-1.7 1.9-2.6 3.5-2.6s3 .9 3.5 2.6M15 9.5h3.5M15 12.5h3.5" /></svg>
  ),
  import: (p: P) => (
    <svg {...base} {...p}><path d="M12 3.5v11" /><path d="m8 11 4 3.8 4-3.8" /><path d="M4.5 16.5v2A2.5 2.5 0 0 0 7 21h10a2.5 2.5 0 0 0 2.5-2.5v-2" /></svg>
  ),
  commission: (p: P) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M14.5 9.2c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.5.8-2.5 2s1 1.7 2.6 2.1 2.7 1 2.7 2.3-1.1 2-2.7 2c-1.3 0-2.3-.5-2.8-1.5M12 6.3v11.4" /></svg>
  ),
  reports: (p: P) => (
    <svg {...base} {...p}><path d="M4 20h16" /><rect x="5.5" y="11" width="3.5" height="7" rx="1" /><rect x="10.5" y="6.5" width="3.5" height="11.5" rx="1" /><rect x="15.5" y="9" width="3.5" height="9" rx="1" /></svg>
  ),
  settings: (p: P) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="2.8" /><path d="M19.3 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1h-.2a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>
  ),
  search: (p: P) => (
    <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></svg>
  ),
  plus: (p: P) => <svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>,
  menu: (p: P) => <svg {...base} {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
  close: (p: P) => <svg {...base} {...p}><path d="m6 6 12 12M18 6 6 18" /></svg>,
  bell: (p: P) => (
    <svg {...base} {...p}><path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5" /><path d="M13.7 19a2 2 0 0 1-3.4 0" /></svg>
  ),
  phone: (p: P) => (
    <svg {...base} {...p}><path d="M21 16.9v2.5a1.7 1.7 0 0 1-1.9 1.7 17 17 0 0 1-7.4-2.6 16.6 16.6 0 0 1-5.1-5.1A17 17 0 0 1 4 6a1.7 1.7 0 0 1 1.7-1.9h2.5a1.7 1.7 0 0 1 1.7 1.5c.1.8.3 1.7.6 2.5a1.7 1.7 0 0 1-.4 1.8l-1 1a13.6 13.6 0 0 0 5 5l1-1a1.7 1.7 0 0 1 1.8-.4c.8.3 1.7.5 2.5.6a1.7 1.7 0 0 1 1.6 1.8z" /></svg>
  ),
  whatsapp: (p: P) => (
    <svg {...base} {...p}><path d="M20.5 11.7A8.4 8.4 0 0 1 7.9 19l-4.4 1.2 1.2-4.3a8.4 8.4 0 1 1 15.8-4.2z" /><path d="M9 9.3c.3 1 .8 1.9 1.5 2.6.7.7 1.6 1.2 2.5 1.5l.9-1a.8.8 0 0 1 .9-.2l1.5.6c.3.1.5.4.5.8-.1 1.1-1 1.7-2 1.6a8.4 8.4 0 0 1-7-7c-.1-1 .5-1.9 1.6-2 .4 0 .7.2.8.5l.6 1.5a.8.8 0 0 1-.2.9z" /></svg>
  ),
  mail: (p: P) => (
    <svg {...base} {...p}><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>
  ),
  note: (p: P) => (
    <svg {...base} {...p}><path d="M5 4.5h9.5L19 9v10.5H5z" /><path d="M14 4.5V9h5M8 13h8M8 16.3h5" /></svg>
  ),
  clock: (p: P) => (
    <svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.2V12l3 1.8" /></svg>
  ),
  merge: (p: P) => (
    <svg {...base} {...p}><path d="M7 20V9a4 4 0 0 1 4-4h2" /><path d="m10.5 7.5 2.8-2.8L10.5 2" /><path d="M17 20v-5a4 4 0 0 0-4-4h-1" /></svg>
  ),
  warning: (p: P) => (
    <svg {...base} {...p}><path d="M12 4.5 21 19H3z" /><path d="M12 10v4M12 16.6v.1" /></svg>
  ),
  check: (p: P) => <svg {...base} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>,
  chevronRight: (p: P) => <svg {...base} {...p}><path d="m9.5 5.5 6.5 6.5-6.5 6.5" /></svg>,
  star: (p: P) => (
    <svg {...base} {...p}><path d="M12 3.5 14.3 9l5.7.4-4.4 3.8 1.4 5.6L12 15.8 7 18.8l1.4-5.6L4 9.4 9.7 9z" /></svg>
  ),
  document: (p: P) => (
    <svg {...base} {...p}><path d="M6 3.5h8L18.5 8v12.5H6z" /><path d="M14 3.5V8h4.5" /></svg>
  ),
  building: (p: P) => (
    <svg {...base} {...p}><rect x="4" y="4" width="9" height="16" rx="1" /><path d="M13 9h7v11h-7" /><path d="M7 8h3M7 11.5h3M7 15h3M16 12.5h1.5M16 16h1.5" /></svg>
  ),
};

export type IconName = keyof typeof Icon;
