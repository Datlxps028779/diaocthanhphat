import type { Area } from './supabase';
import type { SeoFieldsValue } from '../components/admin/shared/SeoFields';

// Bản nháp form SEO khu vực. Gồm 3 field metadata cũ (giữ nguyên hành vi) và 2 field
// nội dung công khai: `description` (giới thiệu trên /khu-vuc/[slug]) và `admin_note`
// (ghi chú hiển thị công khai trên trang khu vực — KHÔNG phải ghi chú nội bộ).
export type AreaSeoDraft = SeoFieldsValue & {
  description: string;
  admin_note: string;
};

// Field nội dung công khai, tách khỏi metadata để UI gắn nhãn đúng.
export const AREA_PUBLIC_CONTENT_FIELDS = ['description', 'admin_note'] as const;

export function emptyAreaSeoDraft(): AreaSeoDraft {
  return { meta_title: '', meta_description: '', focus_keywords: '', description: '', admin_note: '' };
}

export function areaSeoDraftFromArea(area: Area | undefined): AreaSeoDraft {
  if (!area) return emptyAreaSeoDraft();
  return {
    meta_title: area.meta_title ?? '',
    meta_description: area.meta_description ?? '',
    focus_keywords: area.focus_keywords ?? '',
    description: area.description ?? '',
    admin_note: area.admin_note ?? '',
  };
}

// Chuẩn hoá '' → null để DB không lưu chuỗi rỗng, khớp hành vi save cũ của SeoGeoTab.
function nullable(value: string | null | undefined): string | null {
  return (value ?? '').trim() || null;
}

function sameAsStored(draftValue: string | null | undefined, storedValue: string | null | undefined): boolean {
  return nullable(draftValue) === nullable(storedValue);
}

// Trả về DUY NHẤT những field đã thực sự đổi so với dữ liệu đang có.
// Nhờ vậy lưu không ghi đè field admin không mở, và nút Lưu tắt được khi không có
// gì thay đổi. Không có autosave: hàm này chỉ chạy khi admin bấm Lưu.
export function buildAreaPatch(area: Area | undefined, draft: AreaSeoDraft): Partial<Omit<Area, 'schema_markup'>> {
  const patch: Partial<Omit<Area, 'schema_markup'>> = {};
  if (!area) return patch;
  if (!sameAsStored(draft.meta_title, area.meta_title)) patch.meta_title = nullable(draft.meta_title);
  if (!sameAsStored(draft.meta_description, area.meta_description)) patch.meta_description = nullable(draft.meta_description);
  if (!sameAsStored(draft.focus_keywords, area.focus_keywords)) patch.focus_keywords = nullable(draft.focus_keywords);
  if (!sameAsStored(draft.description, area.description)) patch.description = nullable(draft.description);
  if (!sameAsStored(draft.admin_note, area.admin_note)) patch.admin_note = nullable(draft.admin_note);
  return patch;
}

export function hasAreaChanges(area: Area | undefined, draft: AreaSeoDraft): boolean {
  return Object.keys(buildAreaPatch(area, draft)).length > 0;
}
