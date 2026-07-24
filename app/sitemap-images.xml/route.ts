import { createClient } from '@supabase/supabase-js';
import { buildSeoImageGallery } from '@/lib/propertyImages';
import { getSiteUrl } from '@/lib/siteUrl';

export const revalidate = 3600;

const SITE_URL = getSiteUrl();

type SitemapImage = { loc: string; caption: string };
type SitemapEntry = { loc: string; images: SitemapImage[] };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function imageSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map(entry => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
${entry.images.map(image => `    <image:image>
      <image:loc>${escapeXml(image.loc)}</image:loc>
      <image:caption>${escapeXml(image.caption)}</image:caption>
    </image:image>`).join('\n')}
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls}
</urlset>`;
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const entries: SitemapEntry[] = [];

  if (url && key) {
    try {
      const sb = createClient(url, key, { auth: { persistSession: false } });
      const [properties, news] = await Promise.all([
        sb.from('properties').select('id,slug,title,image_url,images').eq('is_active', true).limit(5000),
        sb.from('news').select('id,slug,title,image_url').eq('is_published', true).limit(5000),
      ]);

      for (const p of (properties.data ?? []) as Array<{ id: string; slug?: string | null; title: string; image_url?: string | null; images?: string[] | null }>) {
        const images = buildSeoImageGallery(p.image_url, p.images, { max: 10 });
        if (!images.length) continue;
        const seg = p.slug?.trim() || p.id;
        entries.push({
          loc: `${SITE_URL}/bat-dong-san/${seg}`,
          images: images.map((loc, index) => ({ loc, caption: `${p.title}${index ? ` - ảnh ${index + 1}` : ''}` })),
        });
      }

      for (const a of (news.data ?? []) as Array<{ id: string; slug?: string | null; title: string; image_url?: string | null }>) {
        const images = buildSeoImageGallery(a.image_url, null, { max: 1 });
        if (!images.length) continue;
        const seg = a.slug?.trim() || a.id;
        entries.push({
          loc: `${SITE_URL}/tin-tuc/${seg}`,
          images: images.map(loc => ({ loc, caption: a.title })),
        });
      }
    } catch {
      entries.length = 0;
    }
  }

  return new Response(imageSitemapXml(entries), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
