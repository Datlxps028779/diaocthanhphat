import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/index.css';
import { serializeJsonLd, buildLocalBusinessJsonLd } from '@/lib/seo';
import { getSiteUrl } from '@/lib/siteUrl';
import { serverGetSiteSettings } from '@/lib/supabase-server';
import { Providers } from './providers';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { AnalyticsConsent } from './_components/AnalyticsConsent';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-inter',
});

const SITE_URL = getSiteUrl();
const SITE_NAME = 'BĐS Bình Dương';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} – Mua Bán Cho Thuê Bất Động Sản Uy Tín`,
    template: `%s | ${SITE_NAME}`,
  },
  description: 'Mua bán, cho thuê bất động sản, đất nền sổ đỏ chính chủ tại Bình Dương và khu vực lân cận. Pháp lý minh bạch, tư vấn tận tâm.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    siteName: SITE_NAME,
    url: SITE_URL,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
  verification: { google: 'SQuZJk44qo5W2grROs-c85eUQteVPZ7bZEB5bjECm8I' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // JSON-LD Organization + WebSite ở mọi trang — giúp Google Knowledge Graph và
  // AI crawler nhận diện thương hiệu + hỗ trợ sitelinks search box. Làm giàu từ
  // site_settings (địa chỉ/điện thoại/email/logo/social) khi có.
  const settings = await serverGetSiteSettings();
  const orgJsonLd = buildLocalBusinessJsonLd(settings);
  const siteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    publisher: { '@id': `${SITE_URL}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/danh-sach?keyword={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <html lang="vi" className={inter.variable}>
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(orgJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(siteJsonLd) }} />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
        <AnalyticsConsent />
      </body>
    </html>
  );
}
