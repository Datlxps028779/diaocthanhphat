// Facade đo lường dùng chung — gom mọi event về một chỗ để: (1) đổi/ tắt nhà
// cung cấp không phải sửa rải rác; (2) chuẩn hoá tên event; (3) lọc props về
// đúng kiểu Vercel Analytics cho phép (string|number|boolean, không null/object).
// Dispatch song song tới window.va (Vercel) và window.gtag nếu có mặt — vắng mặt
// (SSR / chưa consent) thì im lặng, không ném lỗi.

export type EventProps = Record<string, unknown>;
type CleanProps = Record<string, string | number | boolean>;

const MAX_STR = 255;

export const FORBIDDEN_TELEMETRY_KEYS = [
  'address',
  'authorization',
  'bearer',
  'cookie',
  'email',
  'full_name',
  'keyword',
  'message',
  'name',
  'note',
  'otp',
  'password',
  'phone',
  'query',
  'session',
  'text',
  'token',
  'url',
  'visitor',
] as const;

const FORBIDDEN_TELEMETRY_KEY_PATTERNS = [
  /(?:^|_)(?:address|authorization|bearer|cookie|email|full[_-]?name|keyword|message|name|note|otp|password|phone|query|session|text|token|url|visitor)(?:$|_)/i,
];

const FORBIDDEN_TELEMETRY_VALUE_PATTERNS = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:^|\D)(?:\+?84|0)\d[\d\s().-]{7,}\d(?:$|\D)/,
  /(?:https?:\/\/|[/?#][^\s]*[=&])/i,
];

function isForbiddenTelemetryKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return FORBIDDEN_TELEMETRY_KEYS.includes(normalized as typeof FORBIDDEN_TELEMETRY_KEYS[number])
    || FORBIDDEN_TELEMETRY_KEY_PATTERNS.some(pattern => pattern.test(normalized));
}

function isForbiddenTelemetryValue(value: string): boolean {
  return FORBIDDEN_TELEMETRY_VALUE_PATTERNS.some(pattern => pattern.test(value));
}

export function sanitizeProps(props?: EventProps): CleanProps {
  const out: CleanProps = {};
  if (!props) return out;
  for (const [key, value] of Object.entries(props)) {
    if (isForbiddenTelemetryKey(key)) continue;
    if (typeof value === 'string') {
      if (isForbiddenTelemetryValue(value)) continue;
      out[key] = value.length > MAX_STR ? value.slice(0, MAX_STR) : value;
    } else if (typeof value === 'number') {
      if (Number.isFinite(value)) out[key] = value;
    } else if (typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
}

declare global {
  interface Window {
    va?: (event: 'event', props: { name: string } & CleanProps) => void;
    gtag?: (command: 'event' | 'consent', name: string, props?: CleanProps) => void;
    googleAnalyticsConsentGranted?: boolean;
    googleAdsLeadConversion?: string;
  }
}

export function track(name: AnalyticsEventName, props?: EventProps): void {
  if (!isAnalyticsEventName(name)) return;
  const clean = sanitizeEventProps(name, props);
  const w = globalThis as unknown as Window;
  try {
    w.va?.('event', { name, ...clean });
  } catch { /* nuốt lỗi đo lường — không được ảnh hưởng UX */ }
  if (!w.googleAnalyticsConsentGranted) return;
  try {
    w.gtag?.('event', name, clean);
    if (name === EVENTS.LEAD_SUBMIT && w.googleAdsLeadConversion) {
      w.gtag?.('event', 'conversion', { send_to: w.googleAdsLeadConversion });
    }
  } catch { /* như trên */ }
}

// Tên event chuẩn hoá — dùng hằng để tránh gõ sai lệch giữa các nơi gọi.
export const EVENTS = {
  LEAD_SUBMIT: 'lead_submit',
  CONTACT_OPEN: 'contact_open',
  SEARCH: 'search',
  LISTING_VIEW: 'listing_view',
  LISTING_SAVE: 'listing_save',
  CONTENT_SHARE: 'content_share',
  LISTING_RESULT_CLICK: 'listing_result_click',
  AI_ADVISOR_OPEN: 'ai_advisor_open',
  AI_ADVISOR_SEND: 'ai_advisor_send',
  AI_ADVISOR_SUGGEST: 'ai_advisor_suggest_properties',
  AI_ADVISOR_PROPERTY_CLICK: 'ai_advisor_property_click',
  PHONE_REVEAL: 'phone_reveal',
  ZALO_CLICK: 'zalo_click',
  DISCOVERY_MODULE_VIEW: 'discovery_module_view',
  DISCOVERY_MODULE_CLICK: 'discovery_module_click',
} as const;

export type AnalyticsEventName = typeof EVENTS[keyof typeof EVENTS];
export type MeasurementFunnelStage = 'view' | 'cta' | 'lead' | 'supporting';

export const EVENT_FUNNEL_STAGE: Record<AnalyticsEventName, MeasurementFunnelStage> = {
  [EVENTS.LISTING_VIEW]: 'view',
  [EVENTS.CONTACT_OPEN]: 'cta',
  [EVENTS.PHONE_REVEAL]: 'cta',
  [EVENTS.ZALO_CLICK]: 'cta',
  [EVENTS.LEAD_SUBMIT]: 'lead',
  [EVENTS.SEARCH]: 'supporting',
  [EVENTS.LISTING_SAVE]: 'supporting',
  [EVENTS.CONTENT_SHARE]: 'supporting',
  [EVENTS.LISTING_RESULT_CLICK]: 'supporting',
  [EVENTS.AI_ADVISOR_OPEN]: 'supporting',
  [EVENTS.AI_ADVISOR_SEND]: 'supporting',
  [EVENTS.AI_ADVISOR_SUGGEST]: 'supporting',
  [EVENTS.AI_ADVISOR_PROPERTY_CLICK]: 'supporting',
  [EVENTS.DISCOVERY_MODULE_VIEW]: 'view',
  [EVENTS.DISCOVERY_MODULE_CLICK]: 'cta',
};

export const MEASURED_FUNNEL_EVENTS = [
  EVENTS.LISTING_VIEW,
  EVENTS.CONTACT_OPEN,
  EVENTS.PHONE_REVEAL,
  EVENTS.ZALO_CLICK,
  EVENTS.LEAD_SUBMIT,
] as const;

export const EVENT_DIMENSIONS: Record<AnalyticsEventName, readonly string[]> = {
  [EVENTS.LEAD_SUBMIT]: ['listingId', 'source', 'channel', 'placement', 'hasProperty', 'hasMessage', 'hasBudget', 'hasEstimate', 'callbackTime'],
  [EVENTS.CONTACT_OPEN]: ['listingId', 'source', 'channel', 'placement'],
  [EVENTS.SEARCH]: ['listingType', 'areaId', 'typeId', 'hasKeyword', 'hasArea', 'priceIdx', 'source', 'channel'],
  [EVENTS.LISTING_VIEW]: ['listingId', 'source', 'channel', 'listingType'],
  [EVENTS.LISTING_SAVE]: ['listingId', 'source', 'channel'],
  [EVENTS.CONTENT_SHARE]: ['platform', 'source', 'channel'],
  [EVENTS.LISTING_RESULT_CLICK]: ['source', 'channel', 'placement', 'sort', 'position', 'hasKeyword', 'activeFilterCount', 'policyVersion'],
  [EVENTS.AI_ADVISOR_OPEN]: [],
  [EVENTS.AI_ADVISOR_SEND]: ['hasText', 'requestStaff', 'source', 'channel'],
  [EVENTS.AI_ADVISOR_SUGGEST]: ['count', 'criteriaCount', 'policyVersion', 'source', 'channel'],
  [EVENTS.AI_ADVISOR_PROPERTY_CLICK]: ['position', 'reasonCount', 'policyVersion', 'source', 'channel'],
  [EVENTS.PHONE_REVEAL]: ['listingId', 'source', 'channel', 'recorded'],
  [EVENTS.ZALO_CLICK]: ['listingId', 'source', 'channel'],
  [EVENTS.DISCOVERY_MODULE_VIEW]: ['surface', 'module', 'itemCount', 'source', 'channel'],
  [EVENTS.DISCOVERY_MODULE_CLICK]: ['surface', 'module', 'position', 'itemCount', 'source', 'channel', 'listingType'],
};

export const EVENT_REQUIRED_DIMENSIONS: Partial<Record<AnalyticsEventName, readonly string[]>> = {
  [EVENTS.LEAD_SUBMIT]: ['source'],
  [EVENTS.CONTACT_OPEN]: ['listingId', 'source'],
  [EVENTS.SEARCH]: ['listingType'],
  [EVENTS.LISTING_VIEW]: ['listingId', 'source'],
  [EVENTS.LISTING_SAVE]: ['listingId', 'source'],
  [EVENTS.CONTENT_SHARE]: ['platform', 'source'],
  [EVENTS.LISTING_RESULT_CLICK]: ['source', 'position'],
  [EVENTS.AI_ADVISOR_SEND]: ['hasText'],
  [EVENTS.AI_ADVISOR_SUGGEST]: ['count', 'criteriaCount', 'policyVersion'],
  [EVENTS.AI_ADVISOR_PROPERTY_CLICK]: ['position', 'reasonCount', 'policyVersion'],
  [EVENTS.PHONE_REVEAL]: ['listingId', 'source', 'recorded'],
  [EVENTS.DISCOVERY_MODULE_VIEW]: ['surface', 'module', 'itemCount', 'source'],
  [EVENTS.DISCOVERY_MODULE_CLICK]: ['surface', 'module', 'position', 'itemCount', 'source'],
};

const SAFE_DIMENSION_VALUE_KEYS = new Set([
  'areaId',
  'channel',
  'callbackTime',
  'listingId',
  'listingType',
  'module',
  'placement',
  'platform',
  'policyVersion',
  'sort',
  'source',
  'surface',
  'typeId',
]);
const SAFE_DIMENSION_VALUE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function isAnalyticsEventName(name: string): name is AnalyticsEventName {
  return (Object.values(EVENTS) as string[]).includes(name);
}

function isSafeDimensionValue(key: string, value: string | number | boolean): boolean {
  if (typeof value === 'string') {
    return !SAFE_DIMENSION_VALUE_KEYS.has(key) || SAFE_DIMENSION_VALUE.test(value);
  }
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0;
  return true;
}

export function sanitizeEventProps(name: AnalyticsEventName, props?: EventProps): CleanProps {
  const allowed = EVENT_DIMENSIONS[name];
  const sanitized = sanitizeProps(props);
  return Object.fromEntries(
    Object.entries(sanitized).filter(([key, value]) => allowed.includes(key) && isSafeDimensionValue(key, value)),
  ) as CleanProps;
}
