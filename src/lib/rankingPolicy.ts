export const RANKING_POLICY_VERSION = 'p5-2026-09-03';

export type AdvisorMatchReasonCode =
  | 'location'
  | 'property_type'
  | 'budget'
  | 'near_budget'
  | 'area'
  | 'loan'
  | 'legal'
  | 'keyword';

const ADVISOR_REASON_LABELS: Record<AdvisorMatchReasonCode, string> = {
  location: 'Đúng khu vực',
  property_type: 'Đúng loại BĐS',
  budget: 'Trong ngân sách',
  near_budget: 'Gần ngân sách',
  area: 'Phù hợp diện tích',
  loan: 'Có hỗ trợ vay',
  legal: 'Phù hợp pháp lý',
  keyword: 'Khớp mô tả nhu cầu',
};

const ADVISOR_REASON_ORDER: AdvisorMatchReasonCode[] = [
  'location',
  'property_type',
  'budget',
  'near_budget',
  'area',
  'loan',
  'legal',
  'keyword',
];

export function normalizeAdvisorMatchReasons(value: unknown): AdvisorMatchReasonCode[] {
  const source = Array.isArray(value) ? value : [];
  const found = new Set(
    source.filter((item): item is AdvisorMatchReasonCode =>
      typeof item === 'string' && item in ADVISOR_REASON_LABELS,
    ),
  );

  if (found.has('budget')) found.delete('near_budget');
  return ADVISOR_REASON_ORDER.filter(code => found.has(code));
}

export function advisorMatchReasonLabels(value: unknown): string[] {
  return normalizeAdvisorMatchReasons(value).map(code => ADVISOR_REASON_LABELS[code]);
}

export function countAdvisorIntentCriteria(input: {
  areaId?: string;
  district?: string;
  ward?: string;
  typeId?: string;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  loan?: boolean;
  legal?: string;
  keyword?: string;
}): number {
  return [
    Boolean(input.areaId || input.district || input.ward),
    Boolean(input.typeId),
    input.minPrice != null || input.maxPrice != null,
    input.minArea != null || input.maxArea != null,
    input.loan === true,
    Boolean(input.legal),
    Boolean(input.keyword?.trim()),
  ].filter(Boolean).length;
}
