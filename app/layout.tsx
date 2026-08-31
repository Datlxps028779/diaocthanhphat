import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';
import '@/index.css';
import { serializeJsonLd, buildLocalBusinessJsonLd, DEFAULT_OG_IMAGE } from '@/lib/seo';
import { getSiteUrl } from '@/lib/siteUrl';
import { serverGetSiteSettings } from '@/lib/supabase-server';
import { Providers } from './providers';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { AnalyticsConsent } from './_components/AnalyticsConsent';
import { SITE_IDENTITY } from '@/lib/siteIdentity';

// Roboto để khớp phong cách chodat.vn. Next 14 chỉ chấp nhận các weight rời của
// Roboto (100/300/400/500/700/900) — KHÔNG có 600, nên tailwind.config map
// font-semibold → 500 để luôn dùng nét thật, tránh browser làm dày giả khiến chữ
// Việt có dấu bị nhoè.
const roboto = Roboto({
  subsets: ['latin', 'vietnamese'],
  weight: ['300', '400', '500', '700', '900'],
  display: 'swap',
  variable: '--font-roboto',
});

const SITE_URL = getSiteUrl();
const SITE_NAME = SITE_IDENTITY.name;

export async function generateMetadata(): Promise<Metadata> {
  // Favicon động: ưu tiên URL admin cấu hình (favicon_url / site_favicon_url),
  // fallback file tĩnh app/icon.svg. Cho phép admin đổi icon không cần deploy.
  const settings = await serverGetSiteSettings();
  const fav = (settings.favicon_url || settings.site_favicon_url || '').trim();
  // Ảnh OG mặc định cho toàn site: ưu tiên admin cấu hình, rồi logo, cuối cùng
  // ảnh fallback. Thiếu thẻ này thì mọi trang share ra FB/Zalo đều hiện thẻ trắng.
  const ogImage = (settings.og_image || settings.site_logo_url || '').trim() || DEFAULT_OG_IMAGE;

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${SITE_NAME} – Mua Bán Cho Thuê Bất Động Sản Uy Tín`,
      template: `%s | ${SITE_NAME}`,
    },
    description: 'Mua bán, cho thuê bất động sản, đất nền sổ đỏ chính chủ tại Bình Dương và khu vực lân cận. Pháp lý minh bạch, tư vấn tận tâm.',
    alternates: { canonical: '/' },
    icons: fav ? { icon: [{ url: fav }] } : { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }] },
    openGraph: {
      type: 'website',
      locale: 'vi_VN',
      siteName: SITE_NAME,
      url: SITE_URL,
      images: [{ url: ogImage, width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: { card: 'summary_large_image', images: [ogImage] },
    robots: { index: true, follow: true },
    verification: { google: 'SQuZJk44qo5W2grROs-c85eUQteVPZ7bZEB5bjECm8I' },
  };
}

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
      target: `${SITE_URL}/mua-ban?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <html lang="vi" className={roboto.variable}>
      <head>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(orgJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(siteJsonLd) }} />
      </head>
      <body>
        <Providers initialSettings={settings}>{children}</Providers>
        <Analytics />
        <SpeedInsights />
        <AnalyticsConsent environmentGaId={process.env.NEXT_PUBLIC_GA_ID} />
      </body>
    </html>
  );
}
