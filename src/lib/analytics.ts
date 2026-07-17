// Facade đo lường dùng chung — gom mọi event về một chỗ để: (1) đổi/ tắt nhà
// cung cấp không phải sửa rải rác; (2) chuẩn hoá tên event; (3) lọc props về
// đúng kiểu Vercel Analytics cho phép (string|number|boolean, không null/object).
// Dispatch song song tới window.va (Vercel) và window.gtag (GA4) nếu có mặt —
// vắng mặt (SSR / chưa consent) thì im lặng, không ném lỗi.

export type EventProps = Record<string, unknown>;
type CleanProps = Record<string, string | number | boolean>;

const MAX_STR = 255;

export function sanitizeProps(props?: EventProps): CleanProps {
  const out: CleanProps = {};
  if (!props) return out;
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === 'string') {
      out[k] = v.length > MAX_STR ? v.slice(0, MAX_STR) : v;
    } else if (typeof v === 'number') {
      if (!Number.isNaN(v)) out[k] = v;
    } else if (typeof v === 'boolean') {
      out[k] = v;
    }
    // undefined / null / object / array → bỏ (Vercel custom event không nhận).
  }
  return out;
}

declare global {
  interface Window {
    va?: (event: 'event', props: { name: string } & CleanProps) => void;
    gtag?: (command: 'event', name: string, props?: CleanProps) => void;
  }
}

export function track(name: string, props?: EventProps): void {
  const clean = sanitizeProps(props);
  const w = globalThis as unknown as Window;
  try {
    w.va?.('event', { name, ...clean });
  } catch { /* nuốt lỗi đo lường — không được ảnh hưởng UX */ }
  try {
    w.gtag?.('event', name, clean);
  } catch { /* như trên */ }
}

// Tên event chuẩn hoá — dùng hằng để tránh gõ sai lệch giữa các nơi gọi.
export const EVENTS = {
  LEAD_SUBMIT: 'lead_submit',
  CONTACT_OPEN: 'contact_open',
  SEARCH: 'search',
  LISTING_VIEW: 'listing_view',
  AI_ADVISOR_OPEN: 'ai_advisor_open',
  AI_ADVISOR_SEND: 'ai_advisor_send',
  AI_ADVISOR_SUGGEST: 'ai_advisor_suggest_properties',
  AI_ADVISOR_PROPERTY_CLICK: 'ai_advisor_property_click',
  PHONE_REVEAL: 'phone_reveal',
  ZALO_CLICK: 'zalo_click',
} as const;
