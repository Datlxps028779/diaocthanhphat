'use client';
import { useEffect, useState } from 'react';
import Script from 'next/script';
import { getConsent, setConsent, CONSENT_EVENT, type ConsentStatus } from '@/lib/consent';
import { getSiteSettings } from '@/lib/api';
import { resolveGoogleTagConfig, type GoogleTagConfig } from '@/lib/googleTag';

interface AnalyticsConsentProps {
  environmentGaId?: string;
}

const EMPTY_CONFIG: GoogleTagConfig = { destinations: [], leadConversion: null };

export function AnalyticsConsent({ environmentGaId }: AnalyticsConsentProps) {
  const [status, setStatus] = useState<ConsentStatus>('unset');
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<GoogleTagConfig>(EMPTY_CONFIG);
  const [tagReady, setTagReady] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const loadGa = mounted && config.destinations.length > 0 && status === 'granted';

  useEffect(() => {
    getSiteSettings()
      .then(settings => setConfig(resolveGoogleTagConfig(settings, environmentGaId)))
      .catch(() => setConfig(resolveGoogleTagConfig({}, environmentGaId)));
  }, [environmentGaId]);

  useEffect(() => {
    setMounted(true);
    const current = getConsent();
    if (current === 'unset') {
      setConsent('granted');
      setStatus('granted');
    } else {
      setStatus(current);
    }
    const onChange = () => setStatus(getConsent());
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  useEffect(() => {
    window.googleAnalyticsConsentGranted = loadGa;
    if (loadGa && config.leadConversion) window.googleAdsLeadConversion = config.leadConversion;
    else delete window.googleAdsLeadConversion;
    if (!loadGa) {
      setTagReady(false);
      window.gtag?.('consent', 'update', {
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });
    }
    return () => {
      window.googleAnalyticsConsentGranted = false;
      delete window.googleAdsLeadConversion;
    };
  }, [config.leadConversion, loadGa]);

  useEffect(() => {
    if (!loadGa) return;
    const notify = () => setCurrentPath(`${window.location.pathname}${window.location.search}`);
    notify();
    window.addEventListener('popstate', notify);
    const { pushState, replaceState } = window.history;
    const emit = (method: typeof pushState) => function (this: History, ...args: Parameters<typeof pushState>) {
      const result = method.apply(this, args);
      window.dispatchEvent(new Event('locationchange'));
      return result;
    };
    window.history.pushState = emit(pushState);
    window.history.replaceState = emit(replaceState);
    window.addEventListener('locationchange', notify);
    return () => {
      window.removeEventListener('popstate', notify);
      window.removeEventListener('locationchange', notify);
      window.history.pushState = pushState;
      window.history.replaceState = replaceState;
    };
  }, [loadGa]);

  useEffect(() => {
    if (!loadGa || !tagReady || !currentPath || typeof window.gtag !== 'function') return;
    window.gtag('event', 'page_view', {
      page_location: `${window.location.origin}${currentPath}`,
      page_path: currentPath,
    });
  }, [loadGa, tagReady, currentPath]);

  return (
    <>
      {loadGa && (
        <Script id="google-tag-loader" src={`https://www.googletagmanager.com/gtag/js?id=${config.destinations[0]}`} strategy="afterInteractive" onLoad={() => setTagReady(true)} />
      )}
      {loadGa && (
        <Script id="google-tag-init" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments);};gtag('consent','default',{analytics_storage:'granted',ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});gtag('js',new Date());${config.destinations.map(id => `gtag('config','${id}',{send_page_view:false});`).join('')}`}
        </Script>
      )}
    </>
  );
}
