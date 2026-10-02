import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { PlayProvider } from '@/components/providers/PlayProvider';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: SITE_TAGLINE,
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <AuthProvider>
          <PlayProvider>
            <Header />
            <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          </PlayProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
