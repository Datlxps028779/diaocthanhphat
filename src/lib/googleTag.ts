export interface GoogleTagConfig {
  destinations: string[];
  leadConversion: string | null;
}

const GOOGLE_DESTINATION_RE = /^(?:G-[A-Z0-9]{6,20}|AW-\d{6,20})$/i;
const GOOGLE_ADS_CONVERSION_RE = /^AW-\d{6,20}\/[A-Za-z0-9_-]{3,100}$/i;

export const DEFAULT_GOOGLE_ANALYTICS_ID = 'G-XK14HMKSK9';
export const DEFAULT_GOOGLE_ADS_ID = 'AW-18379274535';
export const DEFAULT_GOOGLE_ADS_LEAD_CONVERSION = 'AW-18379274535/4QdoCJrk_uAcEKfy9btE';

export function parseGoogleDestination(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase() ?? '';
  return GOOGLE_DESTINATION_RE.test(normalized) ? normalized : null;
}

export function parseGoogleAdsConversion(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? '';
  if (!GOOGLE_ADS_CONVERSION_RE.test(normalized)) return null;
  const [account, label] = normalized.split('/');
  return `${account.toUpperCase()}/${label}`;
}

export function resolveGoogleTagConfig(
  settings: Record<string, string>,
  environmentGaId?: string,
): GoogleTagConfig {
  void environmentGaId;
  // ID mới là destination GA4 duy nhất để không vô tình gửi cùng một page view
  // vào ID cũ trong site_settings hoặc vào một ID khác ngoài ý muốn.
  const configuredGaId = DEFAULT_GOOGLE_ANALYTICS_ID;
  const adsId = parseGoogleDestination(settings.google_ads_id);
  const destinations = [configuredGaId, adsId].filter((value): value is string => Boolean(value));

  return {
    destinations: Array.from(new Set(destinations)),
    leadConversion: parseGoogleAdsConversion(settings.google_ads_lead_conversion),
  };
}
