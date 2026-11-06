import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { APP_NAME, TAGLINE } from '@/lib/constants';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — In-Browser AI Document & Contract Auditor`,
    template: `%s · ${APP_NAME}`,
  },
  description: TAGLINE,
  applicationName: APP_NAME,
  keywords: [
    'contract analysis',
    'AI document review',
    'WebGPU',
    'Transformers.js',
    'Hugging Face',
    'on-device AI',
    'privacy-first',
    'risk audit',
  ],
  openGraph: {
    title: `${APP_NAME} — In-Browser AI Document & Contract Auditor`,
    description: TAGLINE,
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#020617',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-dvh font-sans text-slate-200 antialiased selection:bg-indigo-500/30">{children}</body>
    </html>
  );
}
