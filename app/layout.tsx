import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'GTM Performance Auditor - Analyze Google Tag Manager Performance',
  description: 'Professional tool for auditing Google Tag Manager performance across multiple URLs. Monitor blocking times, CPU usage, and script execution metrics.',
  keywords: 'GTM, Google Tag Manager, performance, audit, blocking time, CPU, script evaluation',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}