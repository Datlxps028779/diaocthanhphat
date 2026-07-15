import type { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

const SITE_URL = (process.env.SITE_URL || 'https://diaocthanhphat.com').replace(/\/$/, '');

// Sitemap động — Next tự phục vụ tại /sitemap.xml. Fetch server-side bằng anon key.
// Revalidate mỗi giờ để tin mới xuất hiện mà không cần rebuild.
export const revalidate = 3600;

const STATIC: MetadataRoute.Sitemap = [
  { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1.0 },
  { url: `${SITE_URL}/danh-sach`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/mua-ban`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/cho-thue`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/du-an`, changeFrequency: 'weekly', priority: 0.7 },
  { url: `${SITE_URL}/dau-tu`, changeFrequency: 'weekly', priority: 0.7 },
  { url: `${SITE_URL}/khu-vuc`, changeFrequency: 'weekly', priority: 0.6 },
  { url: `${SITE_URL}/dinh-gia`, changeFrequency: 'weekly', priority: 0.6 },
  { url: `${SITE_URL}/so-sanh`, changeFrequency: 'weekly', priority: 0.6 },
  { url: `${SITE_URL}/tin-tuc`, changeFrequency: 'daily', priority: 0.7 },
  { url: `${SITE_URL}/ve-chung-toi`, changeFrequency: 'monthly', priority: 0.5 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return STATIC;

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const entries: MetadataRoute.Sitemap = [...STATIC];

  try {
    // Ưu tiên slug thật; nếu cột chưa tồn tại thì fallback select không slug → dùng id.
    let propRows: Array<{ id: string; slug?: string | null; updated_at?: string | null }> = [];
    const withSlug = await sb.from('properties').select('id,slug,updated_at').eq('is_active', true).limit(5000);
    if (withSlug.error) {
      const noSlug = await sb.from('properties').select('id,updated_at').eq('is_active', true).limit(5000);
      propRows = (noSlug.data ?? []) as typeof propRows;
    } else {
      propRows = (withSlug.data ?? []) as typeof propRows;
    }
    for (const p of propRows) {
      const seg = (p.slug && String(p.slug).trim()) || p.id;
      entries.push({
        url: `${SITE_URL}/bat-dong-san/${seg}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }

    const news = await sb.from('news').select('id,slug,updated_at').eq('is_published', true).limit(5000);
    for (const n of (news.data ?? []) as Array<{ id: string; slug?: string | null; updated_at?: string | null }>) {
      const seg = (n.slug && String(n.slug).trim()) || n.id;
      entries.push({
        url: `${SITE_URL}/tin-tuc/${seg}`,
        lastModified: n.updated_at ? new Date(n.updated_at) : undefined,
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    }
  } catch {
    return STATIC;
  }

  return entries;
}
