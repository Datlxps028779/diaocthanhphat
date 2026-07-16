// Đồng ý cookie phân tích (GA4 dùng cookie → cần consent). Vercel Analytics
// cookieless nên KHÔNG bị chặn bởi consent — chỉ GA4 chờ 'granted'. Lưu lựa chọn
// vào localStorage; 'unset' = chưa quyết định → AnalyticsConsent tự grant khi
// user truy cập web (implicit consent theo hành vi), không hiển thị banner.

export type ConsentStatus = 'granted' | 'denied' | 'unset';

export const CONSENT_KEY = 'analytics_consent';
export const CONSENT_EVENT = 'analytics-consent-change';

export function parseConsent(raw: string | null | undefined): ConsentStatus {
  return raw === 'granted' || raw === 'denied' ? raw : 'unset';
}

export function getConsent(): ConsentStatus {
  if (typeof window === 'undefined') return 'unset';
  try {
    return parseConsent(window.localStorage.getItem(CONSENT_KEY));
  } catch {
    return 'unset';
  }
}

export function setConsent(status: 'granted' | 'denied'): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, status);
    window.dispatchEvent(new Event(CONSENT_EVENT));
  } catch {
    // localStorage bị chặn → coi như phiên này chưa đồng ý.
  }
}
