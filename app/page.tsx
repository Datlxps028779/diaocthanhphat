import { HomeClient } from './HomeClient';
import { serializeJsonLd } from '@/lib/seo';
import { buildFaqJsonLd } from '@/lib/faq';

// Home revalidate mỗi 30 phút (nội dung động: featured/hot/recent + CMS blocks).
export const revalidate = 1800;

export default function HomePage() {
  return (
    <>
      {/* FAQPage JSON-LD server-render → Google hiện FAQ rich result. Khớp section
          FAQ hiển thị trong LandingPage (cùng nguồn FAQ_ITEMS). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildFaqJsonLd()) }} />
      <HomeClient />
    </>
  );
}
