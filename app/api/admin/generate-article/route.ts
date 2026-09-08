import { NextRequest, NextResponse } from 'next/server';
import { callerClient, requireAdminOrStaff, requireStaffPermission, adminClient } from '@/lib/server/requireAdmin';
import { generateArticle } from '@/lib/server/articleGen';
import { buildSlug } from '@/lib/slug';

// Tạo bài viết bằng AI rồi LƯU NHÁP (is_published=false) vào bảng news. Chạy SERVER-SIDE:
// ANTHROPIC_API_KEY + service_role không bao giờ tới client. Bắt buộc caller là admin.

export const runtime = 'nodejs';
// Bài dài (900-1400 từ) + model thinking chậm → cần nhiều thời gian. Vercel Pro cho tới 300s;
// gói Hobby tự kẹp về trần 60s (không lỗi build) — khi đó phải đổi model nhanh hơn để kịp.
export const maxDuration = 300;

type LocationIds = {
  areaId: string | null;
  districtId: string | null;
  wardId: string | null;
  neighborhoodId: string | null;
};

type LocationNames = LocationIds & {
  area: string | undefined;
  district: string | undefined;
  ward: string | undefined;
  neighborhood: string | undefined;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readLocationId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const id = value.trim();
  return UUID_PATTERN.test(id) ? id : null;
}

async function resolveLocation(token: string, input: {
  areaId: string | null;
  districtId: string | null;
  wardId: string | null;
  neighborhoodId: string | null;
}): Promise<LocationNames> {
  const client = callerClient(token);
  const [areaResult, districtResult, wardResult, neighborhoodResult] = await Promise.all([
    input.areaId
      ? client.from('areas').select('id,name').eq('id', input.areaId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.districtId
      ? client.from('districts').select('id,name,area_id').eq('id', input.districtId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.wardId
      ? client.from('wards').select('id,name,district_id').eq('id', input.wardId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    input.neighborhoodId
      ? client.from('neighborhoods').select('id,name,area_id,district_id,ward_id').eq('id', input.neighborhoodId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (areaResult.error || districtResult.error || wardResult.error || neighborhoodResult.error) {
    throw new Error('Không kiểm tra được phạm vi địa lý.');
  }

  const area = areaResult.data as { id: string; name: string } | null;
  const district = districtResult.data as { id: string; name: string; area_id: string } | null;
  const ward = wardResult.data as { id: string; name: string; district_id: string } | null;
  const neighborhood = neighborhoodResult.data as {
    id: string; name: string; area_id: string | null; district_id: string | null; ward_id: string | null;
  } | null;
  if ((input.areaId && !area) || (input.districtId && !district) || (input.wardId && !ward) || (input.neighborhoodId && !neighborhood)) {
    throw new Error('Phạm vi địa lý không tồn tại.');
  }

  const areaId = area?.id ?? neighborhood?.area_id ?? district?.area_id ?? null;
  const districtId = district?.id ?? neighborhood?.district_id ?? ward?.district_id ?? null;
  const wardId = ward?.id ?? neighborhood?.ward_id ?? null;
  if (areaId && districtId && district?.area_id !== areaId) throw new Error('Quận/huyện không thuộc tỉnh/thành phố đã chọn.');
  if (districtId && wardId && ward?.district_id !== districtId) throw new Error('Phường/xã không thuộc quận/huyện đã chọn.');
  if (neighborhood && neighborhood.area_id && areaId && neighborhood.area_id !== areaId) throw new Error('Khu dân cư không thuộc tỉnh/thành phố đã chọn.');
  if (neighborhood && neighborhood.district_id && districtId && neighborhood.district_id !== districtId) throw new Error('Khu dân cư không thuộc quận/huyện đã chọn.');
  if (neighborhood && neighborhood.ward_id && wardId && neighborhood.ward_id !== wardId) throw new Error('Khu dân cư không thuộc phường/xã đã chọn.');

  return {
    areaId,
    districtId,
    wardId,
    neighborhoodId: neighborhood?.id ?? null,
    area: area?.name,
    district: district?.name,
    ward: ward?.name,
    neighborhood: neighborhood?.name,
  };
}

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
  const team = await requireAdminOrStaff(req);
  if (!team.ok) return NextResponse.json({ error: team.msg }, { status: team.status });

  const body = await req.json().catch(() => null);
  const keyword = typeof body?.keyword === 'string' ? body.keyword.trim().slice(0, 200) : '';
  const rawLocation = {
    areaId: readLocationId(body?.areaId),
    districtId: readLocationId(body?.districtId),
    wardId: readLocationId(body?.wardId),
    neighborhoodId: readLocationId(body?.neighborhoodId),
  };
  const hasInvalidLocationId = ['areaId', 'districtId', 'wardId', 'neighborhoodId'].some(key => {
    const value = body?.[key];
    return value != null && value !== '' && readLocationId(value) === null;
  });
  if (hasInvalidLocationId) {
    return NextResponse.json({ error: 'Phạm vi địa lý không hợp lệ.' }, { status: 400 });
  }
  if (!keyword) return NextResponse.json({ error: 'Vui lòng nhập từ khoá.' }, { status: 400 });

  let location: LocationNames;
  try {
    location = await resolveLocation(team.token, rawLocation);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Phạm vi địa lý không hợp lệ.' }, { status: 400 });
  }

  const auth = await requireStaffPermission(req, 'news', 'create', location);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

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
    article = await generateArticle({
      keyword,
      area: location.area,
      district: location.district,
      ward: location.ward,
      neighborhood: location.neighborhood,
    });
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
      geo_entity: article.geoEntity || null,
      geo_notes: article.geoNotes || null,
      citations: article.citations.length ? article.citations : null,
      image_url: article.imageUrl || null,
      area_id: location.areaId,
      district_id: location.districtId,
      ward_id: location.wardId,
      neighborhood_id: location.neighborhoodId,
    })
    .select('id, slug, title')
    .single();

  if (error) return NextResponse.json({ error: `Lưu nháp lỗi: ${error.message}` }, { status: 500 });
  return NextResponse.json({ id: data.id, slug: data.slug, title: data.title });
}
