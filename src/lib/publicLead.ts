import { isValidVnPhone, normalizeVnPhone } from './phone';

export const PUBLIC_LEAD_SOURCES = [
  'property_detail_form',
  'property_callback',
  'contact_modal',
  'invest_page',
  'about_page',
  'valuation_page',
  'ai_advisor',
] as const;

export type PublicLeadSource = (typeof PUBLIC_LEAD_SOURCES)[number];

export type PublicLeadInput = {
  id?: string;
  full_name: string;
  phone: string;
  area_interest?: string;
  message?: string;
  property_id?: string;
  property_title?: string;
  budget?: string;
  source?: PublicLeadSource;
  follow_up_at?: string;
};

export type PublicLeadInsert = {
  id: string;
  full_name: string;
  phone: string;
  area_interest: string | null;
  message: string | null;
  property_id: string | null;
  source: PublicLeadSource | null;
  budget: string | null;
  follow_up_at: string | null;
};

type ParseResult =
  | { ok: true; input: PublicLeadInput; insert: PublicLeadInsert }
  | { ok: false; errors: string[] };

function optionalText(value: unknown, field: string, maxLength: number, errors: string[]): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    errors.push(`${field} phải là chuỗi.`);
    return undefined;
  }
  const text = value.trim();
  if (text.length > maxLength) errors.push(`${field} quá dài.`);
  return text || undefined;
}

function isPublicLeadSource(value: unknown): value is PublicLeadSource {
  return typeof value === 'string' && (PUBLIC_LEAD_SOURCES as readonly string[]).includes(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parsePublicLeadPayload(value: unknown, generatedId: string): ParseResult {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, errors: ['Body phải là JSON object.'] };
  }

  const body = value as Record<string, unknown>;
  const fullName = optionalText(body.full_name, 'Họ tên', 120, errors);
  const rawPhone = optionalText(body.phone, 'Số điện thoại', 40, errors);
  const areaInterest = optionalText(body.area_interest, 'Khu vực quan tâm', 200, errors);
  const message = optionalText(body.message, 'Lời nhắn', 4000, errors);
  const propertyId = optionalText(body.property_id, 'property_id', 100, errors);
  const propertyTitle = optionalText(body.property_title, 'property_title', 300, errors);
  const budget = optionalText(body.budget, 'Ngân sách', 200, errors);
  const source = body.source === undefined || body.source === null ? undefined : body.source;
  const followUpAt = optionalText(body.follow_up_at, 'follow_up_at', 80, errors);
  const id = optionalText(body.id, 'id', 100, errors) ?? generatedId;

  if (!fullName) errors.push('Thiếu họ tên.');
  if (!rawPhone || !isValidVnPhone(rawPhone)) errors.push('Số điện thoại di động Việt Nam chưa hợp lệ.');
  if (id && !isUuid(id)) errors.push('id không hợp lệ.');
  if (propertyId && !isUuid(propertyId)) errors.push('property_id không hợp lệ.');
  if (source !== undefined && !isPublicLeadSource(source)) errors.push('Nguồn lead không hợp lệ.');
  if (followUpAt !== undefined && Number.isNaN(Date.parse(followUpAt))) errors.push('Thời gian gọi lại không hợp lệ.');
  if (followUpAt !== undefined && source !== 'property_callback') errors.push('Chỉ yêu cầu gọi lại mới được đặt lịch gọi.');

  if (errors.length > 0 || !fullName || !rawPhone || (source !== undefined && !isPublicLeadSource(source))) return { ok: false, errors };
  const validSource = source === undefined ? undefined : source;
  const input: PublicLeadInput = {
    ...(body.id !== undefined ? { id } : {}),
    full_name: fullName,
    phone: rawPhone,
    ...(areaInterest ? { area_interest: areaInterest } : {}),
    ...(message ? { message } : {}),
    ...(propertyId ? { property_id: propertyId } : {}),
    ...(propertyTitle ? { property_title: propertyTitle } : {}),
    ...(budget ? { budget } : {}),
    ...(validSource !== undefined ? { source: validSource } : {}),
    ...(followUpAt ? { follow_up_at: followUpAt } : {}),
  };

  return {
    ok: true,
    input,
    insert: {
      id,
      full_name: fullName,
      phone: normalizeVnPhone(rawPhone),
      area_interest: areaInterest ?? null,
      message: message ?? null,
      property_id: propertyId ?? null,
      source: validSource ?? null,
      budget: budget ?? null,
      follow_up_at: followUpAt ?? null,
    },
  };
}
