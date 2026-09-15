import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google';
import './globals.css';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'GRLP Command Centre',
  description: 'AI Executive Administration & Real Estate Operations Assistant for Garden Route Lifestyle Property.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={montserrat.variable}>
      <body>{children}</body>
    </html>
  );
}
