import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Din mor er sulten',
  description: 'Find de billigste måltider ud fra aktuelle supermarkedstilbud nær dig.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da">
      <body>
        <div className="app-shell">
          <div className="app-container">
            <header className="site-header">Din mor er sulten</header>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}

