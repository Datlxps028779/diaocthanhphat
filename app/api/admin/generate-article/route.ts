import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, adminClient } from '@/lib/server/requireAdmin';
import { generateArticle } from '@/lib/server/articleGen';
import { buildSlug } from '@/lib/slug';

// Tạo bài viết bằng AI rồi LƯU NHÁP (is_published=false) vào bảng news. Chạy SERVER-SIDE:
// ANTHROPIC_API_KEY + service_role không bao giờ tới client. Bắt buộc caller là admin.

export const runtime = 'nodejs';
export const maxDuration = 60; // research-free vẫn cần chỗ cho 1 lần gọi Claude output dài

// Slug duy nhất: buildSlug(title) rồi nối -2/-3... nếu đã tồn tại trong news.
async function uniqueSlug(admin: ReturnType<typeof adminClient>, title: string): Promise<string> {
  const base = buildSlug(title);
  if (!admin) return base;
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const { data } = await admin.from('news').select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const body = await req.json().catch(() => null);
  const keyword = typeof body?.keyword === 'string' ? body.keyword.trim().slice(0, 200) : '';
  const district = typeof body?.district === 'string' ? body.district.trim().slice(0, 100) : '';
  const ward = typeof body?.ward === 'string' ? body.ward.trim().slice(0, 100) : '';
  if (!keyword) return NextResponse.json({ error: 'Vui lòng nhập từ khoá.' }, { status: 400 });

  // Cần service_role để insert bỏ qua RLS (giống pattern users route). Thiếu → 503.
  const admin = adminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY trên server.' },
      { status: 503 },
    );
  }

  let article;
  try {
    article = await generateArticle({ keyword, district: district || undefined, ward: ward || undefined });
  } catch (e) {
    const err = e as { code?: string; message?: string; status?: number };
    console.error('[articleGen] lỗi sinh bài:', err.status ?? '', err.message);
    const status = err.code === 'NO_API_KEY' ? 503 : 502;
    return NextResponse.json({ error: err.message || 'Không sinh được bài viết.' }, { status });
  }

  const slug = await uniqueSlug(admin, article.title);
  const { data, error } = await admin
    .from('news')
    .insert({
      title: article.title,
      slug,
      excerpt: article.excerpt || null,
      content: article.contentHtml,
      category: article.category,
      author: 'Ban biên tập',
      is_published: false, // luôn lưu nháp — user tự duyệt/xuất bản sau
      meta_title: article.metaTitle || null,
      meta_description: article.metaDescription || null,
      focus_keywords: article.keywords.length ? article.keywords.join(', ') : null,
      faq: article.faq.length ? article.faq : null,
      geo_area: article.geoArea || null,
    })
    .select('id, slug, title')
    .single();

  if (error) return NextResponse.json({ error: `Lưu nháp lỗi: ${error.message}` }, { status: 500 });
  return NextResponse.json({ id: data.id, slug: data.slug, title: data.title });
}
