import { createClient } from '@supabase/supabase-js';
import { resolveImageRequest } from '@/lib/imageProxy';

// Ảnh nằm trong bucket private admin-uploads (dùng chung với tài liệu nội bộ), nên
// URL /object/public/... của Supabase trả 400. Route này đọc bằng service_role rồi
// stream lại dưới tên miền site — giữ nguyên link /hinh-anh/... đã lưu trong DB và
// đã chia sẻ ra ngoài. resolveImageRequest là chốt chặn: chỉ ảnh đi qua, ai-docs thì không.
export const runtime = 'nodejs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

type Params = { params: { path?: string[] } };

export async function GET(_req: Request, { params }: Params) {
  const target = resolveImageRequest(params.path);
  if (!target) return new Response('Not found', { status: 404 });
  if (!SUPABASE_URL || !SERVICE_KEY) return new Response('Not configured', { status: 404 });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.storage.from(target.bucket).download(target.path);
  if (error || !data) return new Response('Not found', { status: 404 });
  if (data.type && !data.type.toLowerCase().startsWith('image/')) {
    return new Response('Not found', { status: 404 });
  }

  const copyOnWriteObject = /-optimized-[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp|gif|avif)$/i.test(target.path);
  return new Response(data.stream(), {
    headers: {
      'Content-Type': data.type || 'image/jpeg',
      // Path copy-on-write không đổi bytes nên cache lâu; path legacy từng bị ghi đè
      // chỉ cache ngắn để CDN không giữ phiên bản cũ hàng tháng.
      'Cache-Control': copyOnWriteObject
        ? 'public, max-age=86400, s-maxage=31536000, immutable'
        : 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
