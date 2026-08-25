import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GOOGLE_ANALYTICS_ID,
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

  it('uses only the restored GA4 destination and keeps configured Ads conversion', () => {
    expect(resolveGoogleTagConfig({
      google_analytics_id: 'G-NEW1234',
      google_ads_id: DEFAULT_GOOGLE_ADS_ID,
      google_ads_lead_conversion: DEFAULT_GOOGLE_ADS_LEAD_CONVERSION,
    }, 'G-OTHER1234')).toEqual({
      destinations: [DEFAULT_GOOGLE_ANALYTICS_ID, DEFAULT_GOOGLE_ADS_ID],
      leadConversion: DEFAULT_GOOGLE_ADS_LEAD_CONVERSION,
    });
    expect(DEFAULT_GOOGLE_ANALYTICS_ID).toBe('G-SKF33YNMZZ');
  });

  it('does not load the newer GA4 destination alongside the restored one', () => {
    expect(resolveGoogleTagConfig({ google_analytics_id: 'G-XK14HMKSK9' }).destinations).toEqual([
      'G-SKF33YNMZZ',
    ]);
  });

  it('keeps the new GA4 destination even when settings are empty or unavailable', () => {
    expect(resolveGoogleTagConfig({})).toEqual({ destinations: [DEFAULT_GOOGLE_ANALYTICS_ID], leadConversion: null });
    expect(resolveGoogleTagConfig({ google_ads_id: '', google_ads_lead_conversion: '' })).toEqual({
      destinations: [DEFAULT_GOOGLE_ANALYTICS_ID],
      leadConversion: null,
    });
  });

  it('does not accept a script pasted into the GA setting as a destination', () => {
    expect(resolveGoogleTagConfig({ google_analytics_id: '<script>gtag("config", "G-OLD1234")</script>' })).toEqual({
      destinations: [DEFAULT_GOOGLE_ANALYTICS_ID],
      leadConversion: null,
    });
  });
});
