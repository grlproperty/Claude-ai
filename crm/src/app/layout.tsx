import type { Metadata, Viewport } from 'next';
import { Montserrat } from 'next/font/google';
import './globals.css';

const montserrat = Montserrat({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-montserrat',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: {
    default: 'GRLP CRM',
    template: '%s · GRLP CRM',
  },
  description: 'Garden Route Lifestyle Property — internal CRM. Find your way home.',
  // A private internal system should never be indexed.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#991c1f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={montserrat.variable}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
