import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient } from '@/lib/server/requireAdmin';
import { requireIngestAuth, resolveIngestUserId } from '@/lib/server/ingestAuth';
import { resolveTaxonomy, TaxonomyLookupUnavailableError } from '@/lib/server/ingestTaxonomy';
import { normalizeListingPayload } from '@/lib/apiIngest';
import { normalizeListingTitle } from '@/lib/listingTitle';
import { buildUniqueSlug } from '@/lib/slug';

export const runtime = 'nodejs';
const MAX_BODY_BYTES = 512 * 1024;
const MAX_SLUG_ATTEMPTS = 5;

async function findExisting(admin: SupabaseClient, externalId: string) {
  const result = await admin
    .from('user_listings')
    .select('id, slug, status')
    .eq('external_id', externalId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

function duplicateResponse(existing: { id: string; slug: string | null; status: string }) {
  return NextResponse.json({
    id: existing.id,
    slug: existing.slug,
    status: existing.status,
    duplicate: true,
  });
}

export async function POST(req: NextRequest) {
  const auth = requireIngestAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Body quá lớn (tối đa 512KB).' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }

  const parsed = normalizeListingPayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ.', details: parsed.errors }, { status: 400 });
  }

  const admin = adminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY trên server.' }, { status: 503 });
  }

  try {
    if (parsed.row.external_id) {
      const existing = await findExisting(admin, parsed.row.external_id);
      if (existing) return duplicateResponse(existing);
    }

    const userId = await resolveIngestUserId(admin);
    if (!userId) {
      return NextResponse.json(
        { error: 'Không xác định được tài khoản chủ tin. Hãy đặt MAKE_API_USER_ID trên server.' },
        { status: 503 },
      );
    }

    const taxonomy = await resolveTaxonomy(admin, {
      city: parsed.row.city,
      district: parsed.row.district,
      propertyType: typeof (body as Record<string, unknown>)?.property_type === 'string'
        ? ((body as Record<string, unknown>).property_type as string)
        : null,
    });
    const title = normalizeListingTitle(parsed.row.title, [taxonomy.city, taxonomy.district ?? '']).value;

    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const { data, error } = await admin
        .from('user_listings')
        .insert({
          ...parsed.row,
          title,
          city: taxonomy.city,
          district: taxonomy.district,
          user_id: userId,
          slug: buildUniqueSlug(title),
          area_id: taxonomy.area_id,
          district_id: taxonomy.district_id,
          property_type_id: taxonomy.property_type_id,
        })
        .select('id, slug, status')
        .single();

      if (!error) {
        return NextResponse.json({
          id: data.id,
          slug: data.slug,
          status: data.status,
          message: 'Tin đã được tạo và đang chờ duyệt. Tin chưa hiển thị công khai.',
          ...(taxonomy.warnings.length ? { warnings: taxonomy.warnings } : {}),
        }, { status: 201 });
      }

      if (error.code === '23505') {
        if (parsed.row.external_id) {
          const existing = await findExisting(admin, parsed.row.external_id);
          if (existing) return duplicateResponse(existing);
        }
        if (attempt < MAX_SLUG_ATTEMPTS - 1) continue;
      }

      console.error('[api/public/listings] insert lỗi:', error.message);
      return NextResponse.json({ error: `Lưu tin lỗi: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ error: 'Không tạo được slug duy nhất cho tin đăng.' }, { status: 500 });
  } catch (error) {
    if (error instanceof TaxonomyLookupUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error('[api/public/listings] dependency lỗi:', error);
    return NextResponse.json({ error: 'Dịch vụ dữ liệu đang tạm thời gián đoạn.' }, { status: 503 });
  }
}
