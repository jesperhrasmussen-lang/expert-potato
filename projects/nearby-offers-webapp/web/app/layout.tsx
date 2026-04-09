import type { Metadata } from 'next';
import Image from 'next/image';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Din mor er sulten',
  description: 'Find det billigste kød fra lokale slagtere og supermarkeder på sekunder.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da">
      <body>
        <div className="app-shell">
          <div className="app-container">
            <header className="site-header">
              <div className="header-row">
                <div className="header-title">
                  <span className="title-line1">Din mor er</span>
                  <span className="title-line2">sulten.</span>
                </div>
                <Image
                  src="/logo.png"
                  alt="Logo"
                  width={64}
                  height={64}
                  className="header-logo"
                />
              </div>
            </header>
            {children}
          </div>
        </div>
        <Analytics />
      </body>
    </html>
  );
}

