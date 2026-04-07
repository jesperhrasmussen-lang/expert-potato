import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nearby Offers',
  description: 'Find the best nearby supermarket offers from the existing offers database.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <div className="app-container">{children}</div>
        </div>
      </body>
    </html>
  );
}

