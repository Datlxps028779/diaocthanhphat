import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSlug } from '@/lib/slug';

export interface ResolvedTaxonomy {
  area_id: string | null;
  district_id: string | null;
  property_type_id: string | null;
  city: string;
  district: string | null;
  propertyType: string | null;
  warnings: string[];
}

interface TaxonomyHit {
  id: string;
  name: string;
}

export class TaxonomyLookupUnavailableError extends Error {
  constructor() {
    super('Không thể truy vấn danh mục khu vực/loại bất động sản.');
    this.name = 'TaxonomyLookupUnavailableError';
  }
}

async function lookup(
  admin: SupabaseClient,
  table: 'areas' | 'districts' | 'property_types',
  value: string,
  extraEq?: { column: string; value: string },
): Promise<TaxonomyHit | null> {
  const scoped = (mode: 'slug' | 'name', expected: string) => {
    let query = admin.from(table).select('id, name').eq(mode, expected).limit(1);
    if (extraEq) query = query.eq(extraEq.column, extraEq.value);
    return query.maybeSingle();
  };

  const bySlug = await scoped('slug', buildSlug(value));
  if (bySlug.error) throw new TaxonomyLookupUnavailableError();
  if (bySlug.data?.id && bySlug.data?.name) return bySlug.data as TaxonomyHit;

  // Exact equality: không dùng ilike vì % và _ từ payload là wildcard PostgREST.
  const byName = await scoped('name', value.trim());
  if (byName.error) throw new TaxonomyLookupUnavailableError();
  return byName.data?.id && byName.data?.name ? byName.data as TaxonomyHit : null;
}

export async function resolveTaxonomy(
  admin: SupabaseClient,
  input: { city: string; district?: string | null; propertyType?: string | null },
): Promise<ResolvedTaxonomy> {
  const warnings: string[] = [];
  const [area, propertyType] = await Promise.all([
    lookup(admin, 'areas', input.city),
    input.propertyType ? lookup(admin, 'property_types', input.propertyType) : Promise.resolve(null),
  ]);

  if (!area) warnings.push(`Không tìm thấy tỉnh/thành "${input.city}" — cần gán tay khi duyệt.`);
  if (input.propertyType && !propertyType) {
    warnings.push(`Không tìm thấy loại BĐS "${input.propertyType}" — cần gán tay khi duyệt.`);
  }

  let district: TaxonomyHit | null = null;
  if (input.district) {
    district = area
      ? await lookup(admin, 'districts', input.district, { column: 'area_id', value: area.id })
      : null;
    if (!district) warnings.push(`Không tìm thấy quận/huyện "${input.district}" — cần gán tay khi duyệt.`);
  }

  return {
    area_id: area?.id ?? null,
    district_id: district?.id ?? null,
    property_type_id: propertyType?.id ?? null,
    city: area?.name ?? input.city,
    district: district?.name ?? input.district ?? null,
    propertyType: propertyType?.name ?? input.propertyType ?? null,
    warnings,
  };
}
