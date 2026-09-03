import type { Property } from './supabase';

export const PUBLIC_VERIFICATION_REASON_ORDER = [
  'contact_confirmed',
  'location_info_reviewed',
  'media_reviewed',
  'listing_details_reviewed',
  'document_reference_reviewed',
] as const;

export type PublicVerificationReasonCode = typeof PUBLIC_VERIFICATION_REASON_ORDER[number];

export const PUBLIC_VERIFICATION_REASON_LABELS: Record<PublicVerificationReasonCode, string> = {
  contact_confirmed: 'Đã kiểm tra thông tin liên hệ do người đăng cung cấp',
  location_info_reviewed: 'Đã kiểm tra thông tin vị trí do người đăng cung cấp',
  media_reviewed: 'Đã kiểm tra ảnh hoặc video do người đăng cung cấp',
  listing_details_reviewed: 'Đã kiểm tra thông tin tin đăng do người đăng cung cấp',
  document_reference_reviewed: 'Đã đối chiếu tài liệu tham chiếu được cung cấp',
};

export const PUBLIC_VERIFICATION_REASON_SHORT_LABELS: Record<PublicVerificationReasonCode, string> = {
  contact_confirmed: 'Liên hệ',
  location_info_reviewed: 'Vị trí',
  media_reviewed: 'Ảnh/video',
  listing_details_reviewed: 'Thông tin tin đăng',
  document_reference_reviewed: 'Tài liệu tham chiếu',
};

export interface PublicVerificationSummary {
  verifiedAt: string;
  verifiedUntil: string;
  reasonCodes: PublicVerificationReasonCode[];
}

function isReasonCode(value: unknown): value is PublicVerificationReasonCode {
  return typeof value === 'string' && (PUBLIC_VERIFICATION_REASON_ORDER as readonly string[]).includes(value);
}

function isFutureIso(value: unknown, now: Date): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) && Date.parse(value) > now.getTime();
}

export function normalizePublicVerificationSummary(
  property: Pick<Property, 'is_verified' | 'verification_status' | 'verification_scope_codes' | 'verified_at' | 'verified_until'>,
  now = new Date(),
): PublicVerificationSummary | null {
  if (
    property.is_verified !== true
    || property.verification_status !== 'verified'
    || typeof property.verified_at !== 'string'
    || Number.isNaN(Date.parse(property.verified_at))
    || !isFutureIso(property.verified_until, now)
  ) return null;

  const found = new Set((property.verification_scope_codes ?? []).filter(isReasonCode));
  const reasonCodes = PUBLIC_VERIFICATION_REASON_ORDER.filter(code => found.has(code));
  if (reasonCodes.length === 0) return null;

  return { verifiedAt: property.verified_at, verifiedUntil: property.verified_until, reasonCodes };
}

export function publicVerificationLabel(_reasonCodes: readonly PublicVerificationReasonCode[]): string {
  return 'Hồ sơ đã được kiểm tra';
}

export function publicVerificationReasonLabels(reasonCodes: readonly PublicVerificationReasonCode[]): string[] {
  const found = new Set(reasonCodes);
  return PUBLIC_VERIFICATION_REASON_ORDER.filter(code => found.has(code)).map(code => PUBLIC_VERIFICATION_REASON_LABELS[code]);
}

export function publicVerificationReasonShortLabels(reasonCodes: readonly PublicVerificationReasonCode[]): string[] {
  const found = new Set(reasonCodes);
  return PUBLIC_VERIFICATION_REASON_ORDER.filter(code => found.has(code)).map(code => PUBLIC_VERIFICATION_REASON_SHORT_LABELS[code]);
}

export function formatPublicVerificationDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(value));
}
