import type { Metadata } from 'next';
import '../src/styles.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenPlan 台灣版',
  description: '以甘特圖規劃專案、指派任務，並在個人儀表板掌握進度。',
  icons: { icon: '/assets/icon-192.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-Hant-TW"><body>{children}</body></html>;
}
