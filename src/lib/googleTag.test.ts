import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOOGLE_ADS_ID,
  DEFAULT_GOOGLE_ADS_LEAD_CONVERSION,
  parseGoogleAdsConversion,
  parseGoogleDestination,
  resolveGoogleTagConfig,
} from './googleTag';

describe('Google tag configuration', () => {
  it('accepts GA4 and Ads destinations only', () => {
    expect(parseGoogleDestination(' g-abc1234 ')).toBe('G-ABC1234');
    expect(parseGoogleDestination('AW-18379274535')).toBe('AW-18379274535');
    expect(parseGoogleDestination('<script>alert(1)</script>')).toBeNull();
    expect(parseGoogleDestination('UA-123456')).toBeNull();
  });

  it('validates Ads conversion destinations', () => {
    expect(parseGoogleAdsConversion('aw-18379274535/4QdoCJrk_uAcEKfy9btE')).toBe('AW-18379274535/4QdoCJrk_uAcEKfy9btE');
    expect(parseGoogleAdsConversion('AW-123')).toBeNull();
    expect(parseGoogleAdsConversion('AW-123456/label with spaces')).toBeNull();
  });

  it('combines configured settings and environment fallback without duplicates', () => {
    expect(resolveGoogleTagConfig({
      google_analytics_id: 'G-ABC1234',
      google_ads_id: DEFAULT_GOOGLE_ADS_ID,
      google_ads_lead_conversion: DEFAULT_GOOGLE_ADS_LEAD_CONVERSION,
    }, 'G-ABC1234')).toEqual({
      destinations: ['G-ABC1234', DEFAULT_GOOGLE_ADS_ID],
      leadConversion: DEFAULT_GOOGLE_ADS_LEAD_CONVERSION,
    });
  });

  it('keeps Ads tracking disabled when settings are empty or unavailable', () => {
    expect(resolveGoogleTagConfig({})).toEqual({ destinations: [], leadConversion: null });
    expect(resolveGoogleTagConfig({ google_ads_id: '', google_ads_lead_conversion: '' })).toEqual({
      destinations: [],
      leadConversion: null,
    });
  });
});
