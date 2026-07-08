// Sinh sitemap.xml lúc build từ dữ liệu Supabase (properties + news public).
// Chạy trước `vite build` (xem package.json). Fail-soft: nếu không lấy được DB,
// vẫn ghi sitemap với các trang tĩnh để build không vỡ.
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SITE_URL = (process.env.SITE_URL || 'https://diaocthanhphat.com').replace(/\/$/, '');
const OUT = path.join(ROOT, 'public', 'sitemap.xml');

// Đọc .env nếu process.env chưa có (chạy local)
function loadEnv() {
  const env = { ...process.env };
  try {
    const raw = fs.readFileSync(path.join(ROOT, '.env'), 'utf-8');
    for (const line of raw.split('\n')) {
      const i = line.indexOf('=');
      if (i > 0) {
        const k = line.slice(0, i).trim();
        if (!env[k]) env[k] = line.slice(i + 1).trim();
      }
    }
  } catch { /* không có .env → dùng process.env */ }
  return env;
}

const xmlEscape = (s) => String(s).replace(/[<>&'"]/g, (c) =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

function urlEntry(loc, lastmod, changefreq, priority) {
  return `  <url>\n    <loc>${xmlEscape(loc)}</loc>` +
    (lastmod ? `\n    <lastmod>${lastmod.slice(0, 10)}</lastmod>` : '') +
    (changefreq ? `\n    <changefreq>${changefreq}</changefreq>` : '') +
    (priority ? `\n    <priority>${priority}</priority>` : '') +
    `\n  </url>`;
}

const STATIC_PATHS = [
  ['/', 'daily', '1.0'],
  ['/danh-sach', 'daily', '0.9'],
  ['/mua-ban', 'daily', '0.9'],
  ['/cho-thue', 'daily', '0.9'],
  ['/dau-tu', 'weekly', '0.7'],
  ['/ve-chung-toi', 'monthly', '0.5'],
];

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  const urls = STATIC_PATHS.map(([p, cf, pr]) => urlEntry(`${SITE_URL}${p}`, null, cf, pr));

  if (url && key) {
    const sb = createClient(url, key);
    // URL mới chỉ dùng slug (/bat-dong-san/{slug}). Ưu tiên slug thật trong DB;
    // nếu cột slug chưa tồn tại (migration chưa áp) thì select lỗi → fallback
    // select không có slug và dùng id (getPropertyByIdOrSlug resolve UUID được).
    let props = await sb.from('properties').select('id,title,slug,updated_at').eq('is_active', true).limit(5000);
    if (props.error) {
      console.warn('[sitemap] properties.slug chưa có, fallback id:', props.error.message);
      props = await sb.from('properties').select('id,title,updated_at').eq('is_active', true).limit(5000);
    }
    for (const p of props.data ?? []) {
      const seg = (p.slug && p.slug.trim()) || p.id;
      urls.push(urlEntry(`${SITE_URL}/bat-dong-san/${seg}`, p.updated_at, 'weekly', '0.8'));
    }

    const news = await sb.from('news').select('slug,updated_at').eq('is_published', true).limit(5000);
    for (const n of news.data ?? []) {
      if (n.slug) urls.push(urlEntry(`${SITE_URL}/tin-tuc/${n.slug}`, n.updated_at, 'weekly', '0.6'));
    }
    console.log(`[sitemap] ${props.data?.length ?? 0} BĐS + ${news.data?.length ?? 0} tin`);
  } else {
    console.warn('[sitemap] Thiếu VITE_SUPABASE_URL/ANON_KEY → chỉ ghi trang tĩnh');
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join('\n') + `\n</urlset>\n`;
  fs.writeFileSync(OUT, xml, 'utf-8');
  console.log(`[sitemap] Đã ghi ${urls.length} URL → ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => { console.warn('[sitemap] Lỗi, bỏ qua:', e.message); process.exit(0); });
