'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { Cookie, Settings2 } from 'lucide-react';
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
  const [showNotice, setShowNotice] = useState(false);
  const loadOptionalAnalytics = mounted && status === 'granted';
  const loadGa = loadOptionalAnalytics && config.destinations.length > 0;

  const chooseConsent = (nextStatus: Exclude<ConsentStatus, 'unset'>) => {
    setConsent(nextStatus);
    setStatus(nextStatus);
    setShowNotice(false);
  };

  const reopenChoices = () => {
    setShowNotice(true);
  };

  useEffect(() => {
    getSiteSettings()
      .then(settings => setConfig(resolveGoogleTagConfig(settings, environmentGaId)))
      .catch(() => setConfig(resolveGoogleTagConfig({}, environmentGaId)));
  }, [environmentGaId]);

  useEffect(() => {
    setMounted(true);
    const current = getConsent();
    setStatus(current);
    setShowNotice(current === 'unset');
    const onChange = () => {
      const nextStatus = getConsent();
      setStatus(nextStatus);
      if (nextStatus === 'unset') setShowNotice(true);
    };
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
      {loadOptionalAnalytics && (
        <Script id="ahrefs-analytics-loader" src="https://analytics.ahrefs.com/analytics.js" data-key="qx938+eyaGeeHH4c8CZ0HA" strategy="afterInteractive" />
      )}
      {loadGa && (
        <Script id="google-tag-loader" src={`https://www.googletagmanager.com/gtag/js?id=${config.destinations[0]}`} strategy="afterInteractive" onLoad={() => setTagReady(true)} />
      )}
      {loadGa && (
        <Script id="google-tag-init" strategy="afterInteractive">
          {`window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments);};gtag('consent','default',{analytics_storage:'granted',ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'});gtag('js',new Date());${config.destinations.map(id => `gtag('config','${id}',{send_page_view:false});`).join('')}`}
        </Script>
      )}

      {mounted && !showNotice && status !== 'unset' && (
        <button
          type="button"
          onClick={reopenChoices}
          className="fixed bottom-4 left-4 z-[70] inline-flex min-h-11 items-center gap-2 rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 shadow-lg transition hover:border-red-200 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
          aria-label="Mở tuỳ chọn cookie"
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Tuỳ chọn cookie</span>
        </button>
      )}

      {mounted && showNotice && (
        <section
          role="region"
          aria-label="Thông báo chính sách Cookie"
          className="fixed bottom-6 left-3 z-[200] w-[calc(100%-1.5rem)] max-w-sm sm:left-6 sm:w-full"
        >
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
            <div className="p-5">
              <div className="mb-3 flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-50 text-orange-600">
                  <Cookie className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="text-base font-bold text-gray-900">Chính sách Cookie</h2>
              </div>
              <p className="mb-4 text-[13px] leading-relaxed text-gray-600">
                Chúng tôi sử dụng cookies để cải thiện trải nghiệm sử dụng dịch vụ. Bạn có thể xem chi tiết trong{' '}
                <Link href="/trang/chinh-sach-bao-mat" className="font-medium text-orange-500 underline underline-offset-2 hover:text-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2">
                  Chính sách cookie
                </Link>
                .
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => chooseConsent('granted')}
                  className="min-h-11 w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-orange-600 hover:to-amber-600 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
                >
                  Tôi đồng ý
                </button>
                <button
                  type="button"
                  onClick={() => chooseConsent('denied')}
                  className="min-h-9 w-full text-xs font-medium text-gray-500 underline underline-offset-2 transition hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
                >
                  Từ chối cookie phân tích
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
