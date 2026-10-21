import type { Metadata } from 'next';
/* Quicksand, served from the site itself rather than from a font CDN, so the
 * pages look right on a school network that blocks outside requests. */
import '@fontsource/quicksand/300.css';
import '@fontsource/quicksand/400.css';
import '@fontsource/quicksand/500.css';
import '@fontsource/quicksand/600.css';
import '@fontsource/quicksand/700.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'SEVEN Physics Lab',
  description:
    'Interactive IB Physics simulations. Every quantity is computed as you watch, '
    + 'from the laws underneath, and nothing is a pre-computed animation.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
